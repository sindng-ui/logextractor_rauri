use super::stream_engine::LogBatchEmitter;
use serde_json::json;
use serialport::{DataBits, FlowControl, Parity, SerialPort, StopBits};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

struct ActiveSerialSession {
    port_path: String,
    writer: Arc<Mutex<Box<dyn SerialPort>>>,
    emitter: LogBatchEmitter,
    intentional_stop: Arc<AtomicBool>,
}

static SERIAL_SESSION: OnceLock<Mutex<Option<ActiveSerialSession>>> = OnceLock::new();

fn get_serial_session() -> &'static Mutex<Option<ActiveSerialSession>> {
    SERIAL_SESSION.get_or_init(|| Mutex::new(None))
}

pub(crate) fn special_key_bytes(key: &str) -> Option<&'static [u8]> {
    match key {
        "ctrl_p" => Some(&[0x10]),
        "ctrl_c" | "ctrl+c" => Some(&[0x03]),
        "ctrl_p_thrice" => Some(&[0x10, 0x10, 0x10]),
        "ctrl+z" => Some(&[0x1A]),
        "ctrl+d" => Some(&[0x04]),
        _ => None,
    }
}

fn close_existing_serial_session() {
    let prev = {
        get_serial_session().lock().ok().and_then(|mut g| g.take())
    };
    if let Some(sess) = prev {
        sess.intentional_stop.store(true, Ordering::Release);
        sess.emitter.flush_and_close();
    }
}

#[tauri::command]
pub async fn serial_connect(
    app: AppHandle,
    port: String,
    baud_rate: Option<u32>,
    save_to_file: Option<bool>,
    debug: Option<bool>,
) -> Result<(), String> {
    let target_port = port.trim().to_string();
    if target_port.is_empty() {
        let _ = app.emit(
            "tauri-serial-error",
            json!({ "message": "Serial port is required." }),
        );
        return Ok(());
    }

    let baud = baud_rate.unwrap_or(115200);
    close_existing_serial_session();

    let open_port = target_port.clone();
    let opened = tokio::task::spawn_blocking(move || {
        serialport::new(&open_port, baud)
            .data_bits(DataBits::Eight)
            .parity(Parity::None)
            .stop_bits(StopBits::One)
            .flow_control(FlowControl::None)
            .timeout(Duration::from_millis(50))
            .open()
    })
    .await
    .map_err(|e| e.to_string())?;

    let mut reader = match opened {
        Ok(p) => p,
        Err(e) => {
            let _ = app.emit(
                "tauri-serial-error",
                json!({ "message": format!("Failed to open port {}: {}", target_port, e) }),
            );
            return Ok(());
        }
    };

    let writer = match reader.try_clone() {
        Ok(w) => w,
        Err(e) => {
            let _ = app.emit(
                "tauri-serial-error",
                json!({ "message": format!("Failed to clone serial port {}: {}", target_port, e) }),
            );
            return Ok(());
        }
    };

    let emitter = LogBatchEmitter::new(
        app.clone(),
        "serial",
        save_to_file.unwrap_or(false),
        debug.unwrap_or(false),
    );
    emitter.debug_log(&format!("Serial port {} opened at {} baud", target_port, baud));

    let writer_arc = Arc::new(Mutex::new(writer));
    let intentional_stop = Arc::new(AtomicBool::new(false));

    if let Ok(mut guard) = get_serial_session().lock() {
        *guard = Some(ActiveSerialSession {
            port_path: target_port.clone(),
            writer: Arc::clone(&writer_arc),
            emitter: emitter.clone(),
            intentional_stop: Arc::clone(&intentional_stop),
        });
    }

    let _ = app.emit(
        "tauri-serial-status",
        json!({
            "status": "connected",
            "message": format!("Connected to {} ({})", target_port, baud)
        }),
    );

    let read_stop = Arc::clone(&intentional_stop);
    let read_emitter = emitter;
    let read_writer_ref = Arc::clone(&writer_arc);
    let read_port_name = target_port;
    let read_app = app;

    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        while !read_stop.load(Ordering::Acquire) {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    read_emitter.push_bytes(&buf[..n]);
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => continue,
                Err(e) => {
                    if !read_stop.load(Ordering::Acquire) {
                        let _ = read_app.emit(
                            "tauri-serial-error",
                            json!({ "message": format!("Serial port {} error: {}", read_port_name, e) }),
                        );
                    }
                    break;
                }
            }
        }

        read_emitter.flush_and_close();
        if !read_stop.load(Ordering::Acquire) {
            let _ = read_app.emit(
                "tauri-serial-error",
                json!({ "message": format!("Serial port {} disconnected unexpectedly.", read_port_name) }),
            );
        }
        let _ = read_app.emit(
            "tauri-serial-status",
            json!({
                "status": "disconnected",
                "message": format!("Disconnected from {}", read_port_name)
            }),
        );

        if let Ok(mut guard) = get_serial_session().lock() {
            if let Some(ref cur) = *guard {
                if Arc::ptr_eq(&cur.writer, &read_writer_ref) {
                    *guard = None;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn serial_write(data: String) -> Result<(), String> {
    let sess = {
        let guard = get_serial_session().lock().map_err(|e| e.to_string())?;
        guard.as_ref().map(|s| (Arc::clone(&s.writer), s.emitter.clone()))
    };
    if let Some((writer_arc, emitter)) = sess {
        emitter.resume();
        let bytes = data.into_bytes();
        tokio::task::spawn_blocking(move || {
            if let Ok(mut w) = writer_arc.lock() {
                let _ = w.write_all(&bytes);
                let _ = w.flush();
            }
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn serial_special_key(key: String) -> Result<(), String> {
    let sess = {
        let guard = get_serial_session().lock().map_err(|e| e.to_string())?;
        guard.as_ref().map(|s| Arc::clone(&s.writer))
    };
    if let Some(writer_arc) = sess {
        tokio::task::spawn_blocking(move || {
            if let Some(bytes) = special_key_bytes(&key) {
                if let Ok(mut w) = writer_arc.lock() {
                    let _ = w.write_all(bytes);
                    let _ = w.flush();
                }
            } else if key == "break" {
                if let Ok(w) = writer_arc.lock() {
                    let _ = w.set_break();
                }
                std::thread::sleep(Duration::from_millis(200));
                if let Ok(w) = writer_arc.lock() {
                    let _ = w.clear_break();
                }
            }
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn serial_disconnect(app: AppHandle) -> Result<(), String> {
    let port_name = {
        get_serial_session()
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|s| s.port_path.clone()))
    };
    close_existing_serial_session();
    if let Some(p) = port_name {
        let _ = app.emit(
            "tauri-serial-status",
            json!({ "status": "disconnected", "message": format!("Disconnected from {}", p) }),
        );
    }
    Ok(())
}

pub fn shutdown_serial_session() {
    close_existing_serial_session();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_serial_special_keys_identically_to_electron_oracle() {
        assert_eq!(special_key_bytes("ctrl_p"), Some(&[0x10u8][..]));
        assert_eq!(special_key_bytes("ctrl_c"), Some(&[0x03u8][..]));
        assert_eq!(special_key_bytes("ctrl+c"), Some(&[0x03u8][..]));
        assert_eq!(
            special_key_bytes("ctrl_p_thrice"),
            Some(&[0x10u8, 0x10u8, 0x10u8][..])
        );
        assert_eq!(special_key_bytes("ctrl+z"), Some(&[0x1Au8][..]));
        assert_eq!(special_key_bytes("ctrl+d"), Some(&[0x04u8][..]));
        assert_eq!(special_key_bytes("break"), None);
    }
}
