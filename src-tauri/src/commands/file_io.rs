use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{ipc::Response, AppHandle, Emitter};

const MAX_POOLED_HANDLES_PER_PATH: usize = 16;

struct PooledFile {
    file: File,
    last_used: Instant,
}

static FILE_POOL: OnceLock<Mutex<HashMap<String, Vec<PooledFile>>>> = OnceLock::new();
static ACTIVE_STREAMS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn get_file_pool() -> &'static Mutex<HashMap<String, Vec<PooledFile>>> {
    FILE_POOL.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_active_streams() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    ACTIVE_STREAMS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Evicts handles idle for more than 15 seconds (mirrors Electron's 15s handle pooling)
fn evict_expired_handles(pool: &mut HashMap<String, Vec<PooledFile>>) {
    let now = Instant::now();
    pool.retain(|_, entries| {
        entries.retain(|entry| now.duration_since(entry.last_used) < Duration::from_secs(15));
        !entries.is_empty()
    });
}

fn pop_pooled_file(path: &str) -> Result<File, String> {
    if let Ok(mut pool) = get_file_pool().lock() {
        evict_expired_handles(&mut pool);
        if let Some(entries) = pool.get_mut(path) {
            if let Some(entry) = entries.pop() {
                if entries.is_empty() {
                    pool.remove(path);
                }
                return Ok(entry.file);
            }
        }
    }
    File::open(path).map_err(|e| format!("Failed to open file {}: {}", path, e))
}

fn return_pooled_file(path: String, file: File) {
    if let Ok(mut pool) = get_file_pool().lock() {
        let entries = pool.entry(path).or_default();
        if entries.len() < MAX_POOLED_HANDLES_PER_PATH {
            entries.push(PooledFile {
                file,
                last_used: Instant::now(),
            });
        }
    }
}

pub(crate) fn with_pooled_file<F, R>(path: &str, f: F) -> Result<R, String>
where
    F: FnOnce(&mut File) -> Result<R, String>,
{
    let mut file = pop_pooled_file(path)?;
    let res = f(&mut file)?;
    return_pooled_file(path.to_string(), file);
    Ok(res)
}

pub fn read_segment_bytes(path: String, start: u64, end: u64) -> Result<Vec<u8>, String> {
    if end <= start {
        return Ok(Vec::new());
    }

    let mut file = pop_pooled_file(&path)?;
    let file_len = file
        .metadata()
        .map(|m| m.len())
        .map_err(|e| format!("Failed to stat {}: {}", path, e))?;
    let actual_end = end.min(file_len);
    if actual_end <= start {
        return_pooled_file(path, file);
        return Ok(Vec::new());
    }

    let length = (actual_end - start) as usize;
    if let Err(e) = file.seek(SeekFrom::Start(start)) {
        return Err(format!("Failed to seek in {}: {}", path, e));
    }

    let mut buffer = vec![0u8; length];
    let mut total_read = 0usize;
    while total_read < length {
        match file.read(&mut buffer[total_read..]) {
            Ok(0) => break,
            Ok(n) => total_read += n,
            Err(e) => {
                return Err(format!("Failed to read segment from {}: {}", path, e));
            }
        }
    }
    buffer.truncate(total_read);
    return_pooled_file(path, file);
    Ok(buffer)
}

pub fn read_segments_batch_bytes(path: String, ranges: Vec<(u64, u64)>) -> Result<Vec<u8>, String> {
    if ranges.is_empty() {
        return Ok(Vec::new());
    }

    let mut file = pop_pooled_file(&path)?;
    let file_len = file
        .metadata()
        .map(|m| m.len())
        .map_err(|e| format!("Failed to stat {}: {}", path, e))?;

    let mut total_bytes_hint: usize = ranges.len() * 4;
    for &(start, end) in &ranges {
        let actual_end = end.min(file_len);
        if actual_end > start {
            total_bytes_hint = total_bytes_hint.saturating_add((actual_end - start) as usize);
        }
    }

    let mut packed = Vec::with_capacity(total_bytes_hint.min(32 * 1024 * 1024));
    for &(start, end) in &ranges {
        let actual_end = end.min(file_len);
        if actual_end <= start {
            packed.extend_from_slice(&0u32.to_le_bytes());
            continue;
        }
        let len = (actual_end - start) as usize;
        if let Err(e) = file.seek(SeekFrom::Start(start)) {
            return Err(format!("Failed to seek in {}: {}", path, e));
        }

        let len_pos = packed.len();
        packed.extend_from_slice(&0u32.to_le_bytes());
        let data_start = packed.len();
        packed.resize(data_start + len, 0);

        let mut total_read = 0usize;
        while total_read < len {
            match file.read(&mut packed[data_start + total_read..data_start + len]) {
                Ok(0) => break,
                Ok(n) => total_read += n,
                Err(e) => {
                    return Err(format!("Failed to batch read segment from {}: {}", path, e));
                }
            }
        }
        packed.truncate(data_start + total_read);
        let len_bytes = (total_read as u32).to_le_bytes();
        packed[len_pos..len_pos + 4].copy_from_slice(&len_bytes);
    }

    return_pooled_file(path, file);
    Ok(packed)
}

#[tauri::command]
pub async fn read_file(file_path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&file_path)
        .await
        .map_err(|e| format!("Failed to read file {}: {}", file_path, e))
}

#[tauri::command]
pub async fn get_file_size(file_path: String) -> Result<u64, String> {
    let meta = tokio::fs::metadata(&file_path)
        .await
        .map_err(|e| format!("Failed to stat file {}: {}", file_path, e))?;
    Ok(meta.len())
}

/// Zero-Copy binary segment reader using `tauri::ipc::Response` and lock-free pooled handles
#[tauri::command]
pub async fn read_file_segment(path: String, start: u64, end: u64) -> Result<Response, String> {
    if end <= start {
        return Ok(Response::new(Vec::<u8>::new()));
    }

    let bytes = tokio::task::spawn_blocking(move || read_segment_bytes(path, start, end))
        .await
        .map_err(|e| format!("Join error in read_file_segment: {}", e))??;

    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn read_file_segments_batch(
    path: String,
    ranges: Vec<(u64, u64)>,
) -> Result<Response, String> {
    let packed = tokio::task::spawn_blocking(move || read_segments_batch_bytes(path, ranges))
        .await
        .map_err(|e| format!("Join error in read_file_segments_batch: {}", e))??;

    Ok(Response::new(packed))
}

#[tauri::command]
pub async fn stream_read_file(
    app: AppHandle,
    file_path: String,
    request_id: String,
    start: Option<u64>,
) -> Result<Value, String> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut streams = get_active_streams()
            .lock()
            .map_err(|e| e.to_string())?;
        if let Some(prev) = streams.insert(request_id.clone(), cancel_flag.clone()) {
            prev.store(true, Ordering::SeqCst);
        }
    }

    let req_id_clone = request_id.clone();
    tokio::task::spawn_blocking(move || {
        let mut file = match File::open(&file_path) {
            Ok(f) => f,
            Err(e) => {
                let _ = app.emit(
                    "file-stream-error",
                    json!({ "error": e.to_string(), "requestId": req_id_clone }),
                );
                return;
            }
        };

        if let Some(s) = start {
            if s > 0 {
                let _ = file.seek(SeekFrom::Start(s));
            }
        }

        let mut buf = vec![0u8; 256 * 1024]; // 256KB highWaterMark matching Electron
        loop {
            if cancel_flag.load(Ordering::SeqCst) {
                break;
            }
            match file.read(&mut buf) {
                Ok(0) => {
                    let _ = app.emit(
                        "file-stream-complete",
                        json!({ "requestId": req_id_clone }),
                    );
                    break;
                }
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit(
                        "file-chunk",
                        json!({ "chunk": chunk, "requestId": req_id_clone }),
                    );
                }
                Err(e) => {
                    let _ = app.emit(
                        "file-stream-error",
                        json!({ "error": e.to_string(), "requestId": req_id_clone }),
                    );
                    break;
                }
            }
        }

        if let Ok(mut streams) = get_active_streams().lock() {
            streams.remove(&req_id_clone);
        }
    });

    Ok(json!({ "status": "started", "requestId": request_id }))
}

#[tauri::command]
pub async fn cancel_stream(request_id: String) -> Result<Value, String> {
    let mut streams = get_active_streams()
        .lock()
        .map_err(|e| e.to_string())?;
    if let Some(flag) = streams.remove(&request_id) {
        flag.store(true, Ordering::SeqCst);
        return Ok(json!({ "status": "cancelled", "requestId": request_id }));
    }
    Ok(json!({ "status": "not_found", "requestId": request_id }))
}

#[tauri::command]
pub async fn save_file(content: String) -> Result<Value, String> {
    let handle = rfd::AsyncFileDialog::new()
        .add_filter("Log Files", &["log", "txt"])
        .save_file()
        .await;

    let Some(file_handle) = handle else {
        return Ok(json!({ "status": "canceled" }));
    };

    let path_str = file_handle.path().to_string_lossy().to_string();
    tokio::fs::write(file_handle.path(), content.as_bytes())
        .await
        .map_err(|e| format!("Failed to save file: {}", e))?;

    Ok(json!({ "status": "success", "filePath": path_str }))
}

#[tauri::command]
pub async fn save_binary_file(
    data: Vec<u8>,
    default_name: Option<String>,
    filter_name: Option<String>,
    extensions: Option<Vec<String>>,
) -> Result<Value, String> {
    let mut dialog = rfd::AsyncFileDialog::new();
    if let Some(name) = default_name {
        if !name.is_empty() {
            dialog = dialog.set_file_name(&name);
        }
    }
    if let (Some(fname), Some(exts)) = (filter_name, extensions) {
        let ext_refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
        if !ext_refs.is_empty() {
            dialog = dialog.add_filter(&fname, &ext_refs);
        }
    }

    let handle = dialog.save_file().await;
    let Some(file_handle) = handle else {
        return Ok(json!({ "status": "canceled" }));
    };

    let path_str = file_handle.path().to_string_lossy().to_string();
    tokio::fs::write(file_handle.path(), &data)
        .await
        .map_err(|e| format!("Failed to save binary file: {}", e))?;

    Ok(json!({ "status": "success", "filePath": path_str }))
}

#[tauri::command]
pub async fn save_file_direct(data: Vec<u8>, file_path: String) -> Result<Value, String> {
    match tokio::fs::write(&file_path, &data).await {
        Ok(_) => Ok(json!({ "status": "success", "filePath": file_path })),
        Err(e) => Ok(json!({ "status": "error", "error": e.to_string() })),
    }
}

#[tauri::command]
pub async fn append_file_direct(data: Vec<u8>, file_path: String) -> Result<Value, String> {
    let res = tokio::task::spawn_blocking(move || {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)?;
        file.write_all(&data)?;
        Ok::<String, std::io::Error>(file_path)
    })
    .await
    .map_err(|e| e.to_string())?;

    match res {
        Ok(fp) => Ok(json!({ "status": "success", "filePath": fp })),
        Err(e) => Ok(json!({ "status": "error", "error": e.to_string() })),
    }
}

#[tauri::command]
pub async fn select_log_file() -> Result<Option<String>, String> {
    let handle = rfd::AsyncFileDialog::new()
        .add_filter("Log Files", &["log", "txt", "out", "dump", "*"])
        .pick_file()
        .await;
    Ok(handle.map(|h| h.path().to_string_lossy().to_string()))
}
