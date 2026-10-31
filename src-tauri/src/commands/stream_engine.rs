use serde_json::{json, Value};
use std::path::Path;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

static SERVER_CHILD: OnceLock<Mutex<Option<Child>>> = OnceLock::new();
static SCROLL_STREAM_ACTIVE: OnceLock<Arc<AtomicBool>> = OnceLock::new();

fn get_server_child_mutex() -> &'static Mutex<Option<Child>> {
    SERVER_CHILD.get_or_init(|| Mutex::new(None))
}

fn get_scroll_stream_flag() -> &'static Arc<AtomicBool> {
    SCROLL_STREAM_ACTIVE.get_or_init(|| Arc::new(AtomicBool::new(false)))
}

/// Spawns `node server/index.cjs` in the background so port 3003 Socket.IO server
/// (SDB, SSH, Serial, 20ms Log Batching) works identically to Electron.
pub fn spawn_backend_server(app_root: &Path) {
    let server_script = app_root.join("server").join("index.cjs");
    if !server_script.exists() {
        return;
    }

    if let Ok(mut guard) = get_server_child_mutex().lock() {
        if guard.is_some() {
            return;
        }

        #[cfg(target_os = "windows")]
        let child_res = {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            Command::new("node")
                .arg(&server_script)
                .current_dir(app_root)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
        };

        #[cfg(not(target_os = "windows"))]
        let child_res = Command::new("node")
            .arg(&server_script)
            .current_dir(app_root)
            .spawn();

        if let Ok(child) = child_res {
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
        let bin = sdb_path
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "sdb".to_string());

        #[cfg(target_os = "windows")]
        let output = {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            Command::new(&bin)
                .arg("devices")
                .creation_flags(CREATE_NO_WINDOW)
                .output()
        };

        #[cfg(not(target_os = "windows"))]
        let output = Command::new(&bin).arg("devices").output();

        let Ok(out) = output else {
            return Ok(json!([]));
        };

        let stdout = String::from_utf8_lossy(&out.stdout);
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
        Ok(json!(devices))
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
