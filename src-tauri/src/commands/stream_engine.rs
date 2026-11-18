use serde_json::{json, Value};
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

static SERVER_CHILD: OnceLock<Mutex<Option<Child>>> = OnceLock::new();
static SCROLL_STREAM_ACTIVE: OnceLock<Arc<AtomicBool>> = OnceLock::new();

fn get_server_child_mutex() -> &'static Mutex<Option<Child>> {
    SERVER_CHILD.get_or_init(|| Mutex::new(None))
}

fn get_scroll_stream_flag() -> &'static Arc<AtomicBool> {
    SCROLL_STREAM_ACTIVE.get_or_init(|| Arc::new(AtomicBool::new(false)))
}

#[cfg(target_os = "windows")]
pub(crate) fn apply_no_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn apply_no_window(_cmd: &mut Command) {}

/// Preserves incomplete trailing multi-byte UTF-8 sequences across chunk boundaries
/// identically to Node's `StringDecoder('utf8')`.
pub(crate) fn decode_utf8_streaming(pending: &mut Vec<u8>, chunk: &[u8]) -> String {
    pending.extend_from_slice(chunk);
    if pending.is_empty() {
        return String::new();
    }

    match std::str::from_utf8(pending) {
        Ok(valid) => {
            let out = valid.to_string();
            pending.clear();
            out
        }
        Err(e) => {
            let valid_up_to = e.valid_up_to();
            if e.error_len().is_none() {
                // Incomplete trailing UTF-8 char sequence; keep trailing bytes for next chunk
                let out = String::from_utf8_lossy(&pending[..valid_up_to]).to_string();
                let rem = pending[valid_up_to..].to_vec();
                *pending = rem;
                out
            } else {
                // Genuine invalid byte sequence; emit lossily up to invalid bytes + skip invalid length
                let bad_len = e.error_len().unwrap_or(1);
                let consume = (valid_up_to + bad_len).min(pending.len());
                let out = String::from_utf8_lossy(&pending[..consume]).to_string();
                let rem = pending[consume..].to_vec();
                *pending = rem;
                // Recursively decode remaining valid bytes if any
                if !pending.is_empty() {
                    let rest = decode_utf8_streaming(pending, &[]);
                    return out + &rest;
                }
                out
            }
        }
    }
}

enum BatchEvent {
    Data(Vec<u8>),
    Clear,
    Debug(String),
    FlushAndStop,
}

#[derive(Clone)]
pub(crate) struct LogBatchEmitter {
    tx: mpsc::UnboundedSender<BatchEvent>,
    ignore_logs: Arc<AtomicBool>,
}

impl LogBatchEmitter {
    pub fn new(
        app: AppHandle,
        prefix: &str,
        save_to_file: bool,
        debug_mode: bool,
    ) -> Self {
        let (tx, mut rx) = mpsc::unbounded_channel::<BatchEvent>();
        let ignore_logs = Arc::new(AtomicBool::new(false));

        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);

        let log_dir = std::env::current_dir().unwrap_or_else(|_| std::env::temp_dir());
        let mut save_file: Option<File> = if save_to_file {
            let p = log_dir.join(format!("{}_{}.txt", prefix, ts));
            if let Ok(f) = OpenOptions::new().create(true).append(true).open(&p) {
                let _ = app.emit("tauri-log-data", format!("[System] Saving logs to file: {}\n", p.display()));
                Some(f)
            } else {
                None
            }
        } else {
            None
        };

        let mut debug_file: Option<File> = if debug_mode {
            let p = log_dir.join(format!("tizen_debug_{}_{}.log", prefix, ts));
            OpenOptions::new().create(true).append(true).open(&p).ok()
        } else {
            None
        };

        tauri::async_runtime::spawn(async move {
            let mut utf8_pending: Vec<u8> = Vec::new();
            let mut text_buffer = String::new();
            let flush_timer = tokio::time::sleep(Duration::from_millis(20));
            tokio::pin!(flush_timer);
            let mut timer_active = false;

            loop {
                tokio::select! {
                    maybe_evt = rx.recv() => {
                        match maybe_evt {
                            Some(BatchEvent::Data(bytes)) => {
                                if let Some(ref mut f) = save_file {
                                    let _ = f.write_all(&bytes);
                                }
                                let s = decode_utf8_streaming(&mut utf8_pending, &bytes);
                                if !s.is_empty() {
                                    text_buffer.push_str(&s);
                                    if text_buffer.len() >= 256 * 1024 {
                                        let _ = app.emit("tauri-log-data", std::mem::take(&mut text_buffer));
                                        timer_active = false;
                                    } else if !timer_active {
                                        flush_timer.as_mut().reset(tokio::time::Instant::now() + Duration::from_millis(20));
                                        timer_active = true;
                                    }
                                }
                            }
                            Some(BatchEvent::Clear) => {
                                utf8_pending.clear();
                                text_buffer.clear();
                                timer_active = false;
                            }
                            Some(BatchEvent::Debug(line)) => {
                                if let Some(ref mut df) = debug_file {
                                    let now_ms = SystemTime::now()
                                        .duration_since(UNIX_EPOCH)
                                        .map(|d| d.as_millis())
                                        .unwrap_or(0);
                                    let _ = writeln!(df, "[{}] {}", now_ms, line);
                                }
                            }
                            Some(BatchEvent::FlushAndStop) | None => {
                                if !utf8_pending.is_empty() {
                                    text_buffer.push_str(&String::from_utf8_lossy(&utf8_pending));
                                    utf8_pending.clear();
                                }
                                if !text_buffer.is_empty() {
                                    let _ = app.emit("tauri-log-data", std::mem::take(&mut text_buffer));
                                }
                                break;
                            }
                        }
                    }
                    _ = &mut flush_timer, if timer_active => {
                        if !text_buffer.is_empty() {
                            let _ = app.emit("tauri-log-data", std::mem::take(&mut text_buffer));
                        }
                        timer_active = false;
                    }
                }
            }
        });

        Self { tx, ignore_logs }
    }

    pub fn push_bytes(&self, bytes: &[u8]) {
        if bytes.is_empty() || self.ignore_logs.load(Ordering::Acquire) {
            return;
        }
        let _ = self.tx.send(BatchEvent::Data(bytes.to_vec()));
    }

    pub fn debug_log(&self, line: &str) {
        let _ = self.tx.send(BatchEvent::Debug(line.to_string()));
    }

    pub fn clear(&self) {
        self.ignore_logs.store(true, Ordering::Release);
        let _ = self.tx.send(BatchEvent::Clear);
    }

    pub fn resume(&self) {
        self.ignore_logs.store(false, Ordering::Release);
    }

    pub fn flush_and_close(&self) {
        let _ = self.tx.send(BatchEvent::FlushAndStop);
    }
}

/// Spawns `node server/index.cjs` only if needed for non-native standalone usage.
pub fn spawn_backend_server(app_root: &Path) {
    let server_script = app_root.join("server").join("index.cjs");
    if !server_script.exists() {
        return;
    }

    if let Ok(mut guard) = get_server_child_mutex().lock() {
        if guard.is_some() {
            return;
        }

        let mut cmd = Command::new("node");
        cmd.arg(&server_script).current_dir(app_root);
        apply_no_window(&mut cmd);

        if let Ok(child) = cmd.spawn() {
            *guard = Some(child);
        }
    }
}

pub fn stop_backend_server() {
    if let Ok(mut guard) = get_server_child_mutex().lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }
}

pub(crate) fn parse_sdb_devices_stdout(stdout: &str) -> Vec<Value> {
    let mut devices = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.starts_with("List of devices")
            || trimmed.starts_with('*')
            || trimmed.contains("Active code page")
        {
            continue;
        }
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if !parts.is_empty() {
            let id = parts[0];
            let dev_type = if parts.len() > 1 { parts[1] } else { "unknown" };
            if id.contains('.') || id.len() > 5 {
                devices.push(json!({ "id": id, "type": dev_type }));
            }
        }
    }
    devices
}

#[tauri::command]
pub async fn native_list_serial_ports() -> Result<Value, String> {
    tokio::task::spawn_blocking(|| {
        let ports = serialport::available_ports().map_err(|e| e.to_string())?;
        let list: Vec<Value> = ports
            .into_iter()
            .map(|p| {
                let manufacturer = match p.port_type {
                    serialport::SerialPortType::UsbPort(info) => info.manufacturer,
                    _ => None,
                };
                json!({
                    "path": p.port_name,
                    "manufacturer": manufacturer
                })
            })
            .collect();
        Ok(json!(list))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn native_list_sdb_devices(sdb_path: Option<String>) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || {
        let custom_bin = sdb_path
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let run_devices = |bin: &str| -> Option<Vec<Value>> {
            let mut cmd = Command::new(bin);
            cmd.arg("devices");
            apply_no_window(&mut cmd);
            let out = cmd.output().ok()?;
            if !out.status.success() {
                return None;
            }
            let stdout = String::from_utf8_lossy(&out.stdout);
            Some(parse_sdb_devices_stdout(&stdout))
        };

        // If user specified custom sdbPath, try it first; otherwise try system `sdb`
        if let Some(ref custom) = custom_bin {
            if let Some(devs) = run_devices(custom) {
                return Ok(json!(devs));
            }
        }
        if let Some(devs) = run_devices("sdb") {
            return Ok(json!(devs));
        }
        Ok(json!([]))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn native_start_scroll_stream(
    app: AppHandle,
    interval: Option<u64>,
) -> Result<(), String> {
    let flag = get_scroll_stream_flag().clone();
    flag.store(false, Ordering::SeqCst);
    tokio::time::sleep(Duration::from_millis(20)).await;
    flag.store(true, Ordering::SeqCst);

    let tick_ms = interval.unwrap_or(100).max(10);
    tokio::spawn(async move {
        let levels = ["INFO", "DEBUG", "WARN", "ERROR"];
        let mut counter = 0usize;
        while flag.load(Ordering::SeqCst) {
            counter += 1;
            let level = levels[counter % levels.len()];
            let line = format!(
                "2026-11-01T00:00:{:02}.{:03}Z [{}] [TestScroll] Automated log line #{} - Verify smooth scrolling and tailing behavior.\n",
                (counter / 10) % 60,
                (counter * 100) % 1000,
                level,
                counter
            );
            let _ = app.emit("tauri-log-data", line);
            tokio::time::sleep(Duration::from_millis(tick_ms)).await;
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn native_stop_scroll_stream() -> Result<(), String> {
    get_scroll_stream_flag().store(false, Ordering::SeqCst);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_streaming_preserves_split_multibyte_sequences() {
        let mut pending = Vec::new();
        let text = "로그 테스트 🚀 완료";
        let bytes = text.as_bytes();
        // Split right inside a 3-byte Hangul and 4-byte emoji sequence
        let p1 = decode_utf8_streaming(&mut pending, &bytes[..4]);
        let p2 = decode_utf8_streaming(&mut pending, &bytes[4..12]);
        let p3 = decode_utf8_streaming(&mut pending, &bytes[12..]);
        assert!(pending.is_empty());
        assert_eq!(format!("{}{}{}", p1, p2, p3), text);
    }

    #[test]
    fn parses_sdb_devices_output_accurately() {
        let sample = "\
List of devices attached
* daemon not running; starting now at tcp:26099
192.168.250.250:26101\tdevice\tTM1
emulator-26101          offline
short
";
        let parsed = parse_sdb_devices_stdout(sample);
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0]["id"], "192.168.250.250:26101");
        assert_eq!(parsed[0]["type"], "device");
        assert_eq!(parsed[1]["id"], "emulator-26101");
        assert_eq!(parsed[1]["type"], "offline");
    }
}
