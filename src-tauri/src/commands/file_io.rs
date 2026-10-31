use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{ipc::Response, AppHandle, Emitter};

struct PooledFile {
    file: File,
    last_used: Instant,
}

static FILE_POOL: OnceLock<Mutex<HashMap<String, PooledFile>>> = OnceLock::new();
static ACTIVE_STREAMS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn get_file_pool() -> &'static Mutex<HashMap<String, PooledFile>> {
    FILE_POOL.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_active_streams() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    ACTIVE_STREAMS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Evicts handles idle for more than 15 seconds (mirrors Electron's 15s handle pooling)
fn evict_expired_handles(pool: &mut HashMap<String, PooledFile>) {
    let now = Instant::now();
    pool.retain(|_, entry| now.duration_since(entry.last_used) < Duration::from_secs(15));
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

/// Zero-Copy binary segment reader using `tauri::ipc::Response` and 15-second file handle pooling
#[tauri::command]
pub async fn read_file_segment(path: String, start: u64, end: u64) -> Result<Response, String> {
    if end <= start {
        return Ok(Response::new(Vec::<u8>::new()));
    }
    let length = (end - start) as usize;

    tokio::task::spawn_blocking(move || {
        let mut pool = get_file_pool()
            .lock()
            .map_err(|e| format!("Mutex poisoned: {}", e))?;

        evict_expired_handles(&mut pool);

        if !pool.contains_key(&path) {
            let file = File::open(&path)
                .map_err(|e| format!("Failed to open file {}: {}", path, e))?;
            pool.insert(
                path.clone(),
                PooledFile {
                    file,
                    last_used: Instant::now(),
                },
            );
        }

        let entry = pool.get_mut(&path).unwrap();
        entry.last_used = Instant::now();

        if let Err(e) = entry.file.seek(SeekFrom::Start(start)) {
            pool.remove(&path);
            return Err(format!("Failed to seek in {}: {}", path, e));
        }

        let mut buffer = vec![0u8; length];
        let mut total_read = 0usize;
        while total_read < length {
            match entry.file.read(&mut buffer[total_read..]) {
                Ok(0) => break,
                Ok(n) => total_read += n,
                Err(e) => {
                    pool.remove(&path);
                    return Err(format!("Failed to read segment from {}: {}", path, e));
                }
            }
        }
        buffer.truncate(total_read);
        Ok(Response::new(buffer))
    })
    .await
    .map_err(|e| format!("Join error in read_file_segment: {}", e))?
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
