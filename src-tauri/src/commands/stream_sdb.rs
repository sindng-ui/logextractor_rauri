use super::stream_engine::LogBatchEmitter;
use serde_json::json;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, ChildStdin, Command as TokioCommand};
use tokio::sync::Mutex as AsyncMutex;

struct ActiveSdbSession {
    child: Arc<AsyncMutex<Child>>,
    stdin: Arc<AsyncMutex<Option<ChildStdin>>>,
    emitter: LogBatchEmitter,
    intentional_stop: Arc<AtomicBool>,
}

static SDB_SESSION: OnceLock<StdMutex<Option<ActiveSdbSession>>> = OnceLock::new();

fn get_sdb_session() -> &'static StdMutex<Option<ActiveSdbSession>> {
    SDB_SESSION.get_or_init(|| StdMutex::new(None))
}

#[cfg(target_os = "windows")]
fn apply_no_window_tokio(cmd: &mut TokioCommand) {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn apply_no_window_tokio(_cmd: &mut TokioCommand) {}

pub(crate) fn resolve_sdb_bin(sdb_path: Option<&str>) -> String {
    sdb_path
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("sdb")
        .to_string()
}

pub(crate) fn build_sdb_target_args(device_id: Option<&str>) -> Vec<String> {
    if let Some(id) = device_id {
        let trimmed = id.trim();
        if !trimmed.is_empty() && !trimmed.eq_ignore_ascii_case("auto-detect") {
            return vec!["-s".to_string(), trimmed.to_string()];
        }
    }
    Vec::new()
}

pub(crate) fn is_ipv4_target(device_id: Option<&str>) -> Option<String> {
    let id = device_id?.trim();
    let host = id.split(':').next().unwrap_or("");
    let octets: Vec<&str> = host.split('.').collect();
    if octets.len() == 4 && octets.iter().all(|o| !o.is_empty() && o.parse::<u8>().is_ok()) {
        Some(id.to_string())
    } else {
        None
    }
}

fn format_spawn_error(bin: &str, err: &std::io::Error) -> String {
    if err.kind() == std::io::ErrorKind::NotFound {
        format!("SDB command not found. Cannot find '{}'. Please check the SDB Path or your system PATH.", bin)
    } else {
        format!("Failed to run '{}': {}", bin, err)
    }
}

pub(crate) async fn run_sdb_command_with_timeout(
    bin: &str,
    args: &[String],
    timeout_secs: u64,
) -> Result<(i32, String, String), String> {
    let mut cmd = TokioCommand::new(bin);
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    apply_no_window_tokio(&mut cmd);

    let child = cmd.spawn().map_err(|e| format_spawn_error(bin, &e))?;
    match tokio::time::timeout(Duration::from_secs(timeout_secs), child.wait_with_output()).await {
        Ok(Ok(out)) => {
            let code = out.status.code().unwrap_or(-1);
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            Ok((code, stdout, stderr))
        }
        Ok(Err(e)) => Err(format!("SDB command error: {}", e)),
        Err(_) => Err(format!("TIMEOUT:{}", timeout_secs)),
    }
}

async fn stop_existing_sdb_session() {
    let existing = {
        get_sdb_session().lock().ok().and_then(|mut g| g.take())
    };
    if let Some(sess) = existing {
        sess.intentional_stop.store(true, Ordering::Release);
        sess.emitter.flush_and_close();
        let mut guard = sess.child.lock().await;
        let _ = guard.kill().await;
    }
}

#[tauri::command]
pub async fn sdb_connect(
    app: AppHandle,
    device_id: Option<String>,
    debug: Option<bool>,
    save_to_file: Option<bool>,
    sdb_path: Option<String>,
) -> Result<(), String> {
    stop_existing_sdb_session().await;

    let bin = resolve_sdb_bin(sdb_path.as_deref());
    let target_args = build_sdb_target_args(device_id.as_deref());
    let mut check_args = target_args.clone();
    check_args.extend(["shell".to_string(), "echo".to_string(), "READY".to_string()]);

    let mut verify_ok = false;
    let mut has_retried = false;

    loop {
        match run_sdb_command_with_timeout(&bin, &check_args, 5).await {
            Ok((code, stdout, _stderr)) if code == 0 && stdout.contains("READY") => {
                verify_ok = true;
                break;
            }
            Ok((code, stdout, stderr)) => {
                let err_str = if !stderr.trim().is_empty() {
                    stderr.trim().to_string()
                } else {
                    stdout.trim().to_string()
                };

                if !has_retried && err_str.to_lowercase().contains("target not found") {
                    has_retried = true;
                    let target_to_recover = is_ipv4_target(device_id.as_deref())
                        .unwrap_or_else(|| "192.168.250.250".to_string());

                    let _ = app.emit(
                        "tauri-sdb-status",
                        json!({
                            "status": "reconnecting",
                            "message": format!("Target lost. Reconnecting to {}...", target_to_recover)
                        }),
                    );

                    let dis_args = vec!["disconnect".to_string(), target_to_recover.clone()];
                    let _ = run_sdb_command_with_timeout(&bin, &dis_args, 5).await;

                    let con_args = vec!["connect".to_string(), target_to_recover.clone()];
                    match run_sdb_command_with_timeout(&bin, &con_args, 10).await {
                        Ok((_, con_out, con_err)) => {
                            let combined = format!("{}\n{}", con_out, con_err);
                            let lower = combined.to_lowercase();
                            if lower.contains("connected to") || lower.contains("already connected") {
                                let root_args = vec![
                                    "-s".to_string(),
                                    target_to_recover.clone(),
                                    "root".to_string(),
                                    "on".to_string(),
                                ];
                                let _ = run_sdb_command_with_timeout(&bin, &root_args, 5).await;
                                tokio::time::sleep(Duration::from_millis(500)).await;
                                continue;
                            } else {
                                let _ = app.emit(
                                    "tauri-sdb-error",
                                    json!({
                                        "message": format!("SDB Auto-Recovery Failed for {}.\nOutput: {}", target_to_recover, combined.trim()),
                                    }),
                                );
                                break;
                            }
                        }
                        Err(e) => {
                            let _ = app.emit(
                                "tauri-sdb-error",
                                json!({ "message": format!("SDB Auto-Recovery timed out for {}: {}", target_to_recover, e) }),
                            );
                            break;
                        }
                    }
                }

                let msg = if err_str.is_empty() {
                    format!("Device verification failed (Code {})", code)
                } else {
                    format!("Connection Failed: {}", err_str)
                };
                let _ = app.emit("tauri-sdb-error", json!({ "message": msg, "code": code }));
                break;
            }
            Err(e) if e.starts_with("TIMEOUT:") => {
                let _ = app.emit(
                    "tauri-sdb-error",
                    json!({
                        "message": "Device verification timed out (5s). Is the device connected and responsive?",
                        "code": "TIMEOUT"
                    }),
                );
                break;
            }
            Err(e) => {
                let _ = app.emit("tauri-sdb-error", json!({ "message": e }));
                break;
            }
        }
    }

    if !verify_ok {
        return Ok(());
    }

    let mut shell_args = target_args;
    shell_args.push("shell".to_string());

    let mut cmd = TokioCommand::new(&bin);
    cmd.args(&shell_args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_no_window_tokio(&mut cmd);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit(
                "tauri-sdb-error",
                json!({ "message": format_spawn_error(&bin, &e) }),
            );
            return Ok(());
        }
    };

    let emitter = LogBatchEmitter::new(
        app.clone(),
        "sdb",
        save_to_file.unwrap_or(false),
        debug.unwrap_or(false),
    );
    let device_label = device_id
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("Auto");
    emitter.debug_log(&format!("SDB session connected ({})", device_label));

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdin = Arc::new(AsyncMutex::new(child.stdin.take()));
    let child_arc = Arc::new(AsyncMutex::new(child));
    let intentional_stop = Arc::new(AtomicBool::new(false));

    if let Ok(mut guard) = get_sdb_session().lock() {
        *guard = Some(ActiveSdbSession {
            child: Arc::clone(&child_arc),
            stdin,
            emitter: emitter.clone(),
            intentional_stop: Arc::clone(&intentional_stop),
        });
    }

    let _ = app.emit(
        "tauri-sdb-status",
        json!({
            "status": "connected",
            "message": format!("Connected to SDB ({})", device_label)
        }),
    );

    if let Some(mut out) = stdout {
        let em = emitter.clone();
        tauri::async_runtime::spawn(async move {
            let mut buf = [0u8; 8192];
            while let Ok(n) = out.read(&mut buf).await {
                if n == 0 {
                    break;
                }
                em.push_bytes(&buf[..n]);
            }
        });
    }

    if let Some(mut err_stream) = stderr {
        let em = emitter.clone();
        tauri::async_runtime::spawn(async move {
            let mut buf = [0u8; 4096];
            while let Ok(n) = err_stream.read(&mut buf).await {
                if n == 0 {
                    break;
                }
                em.push_bytes(&buf[..n]);
            }
        });
    }

    let wait_child = Arc::clone(&child_arc);
    let wait_stop = Arc::clone(&intentional_stop);
    let wait_emitter = emitter;
    let wait_app = app;
    tauri::async_runtime::spawn(async move {
        let status = {
            let mut guard = wait_child.lock().await;
            guard.wait().await
        };
        wait_emitter.flush_and_close();
        let code = status.ok().and_then(|s| s.code()).unwrap_or(-1);
        if !wait_stop.load(Ordering::Acquire) {
            let _ = wait_app.emit(
                "tauri-sdb-error",
                json!({
                    "message": format!("SDB session ended unexpectedly (Exit Code {}). Device might have been disconnected.", code)
                }),
            );
        }
        let _ = wait_app.emit(
            "tauri-sdb-status",
            json!({
                "status": "disconnected",
                "message": format!("SDB process exited (code {})", code)
            }),
        );
        if let Ok(mut guard) = get_sdb_session().lock() {
            if let Some(ref cur) = *guard {
                if Arc::ptr_eq(&cur.child, &wait_child) {
                    *guard = None;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn sdb_write(data: String) -> Result<(), String> {
    let sess = {
        let guard = get_sdb_session().lock().map_err(|e| e.to_string())?;
        guard.as_ref().map(|s| (Arc::clone(&s.stdin), s.emitter.clone()))
    };
    if let Some((stdin_arc, emitter)) = sess {
        emitter.resume();
        let mut stdin_guard = stdin_arc.lock().await;
        if let Some(ref mut stdin) = *stdin_guard {
            stdin.write_all(data.as_bytes()).await.map_err(|e| e.to_string())?;
            let _ = stdin.flush().await;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn sdb_clear() -> Result<(), String> {
    if let Ok(guard) = get_sdb_session().lock() {
        if let Some(ref sess) = *guard {
            sess.emitter.clear();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn sdb_disconnect(app: AppHandle) -> Result<(), String> {
    stop_existing_sdb_session().await;
    let _ = app.emit(
        "tauri-sdb-status",
        json!({ "status": "disconnected", "message": "Disconnected by user" }),
    );
    Ok(())
}

#[tauri::command]
pub async fn sdb_connect_remote(
    app: AppHandle,
    ip: String,
    sdb_path: Option<String>,
) -> Result<(), String> {
    let trimmed = ip.trim().to_string();
    if trimmed.is_empty() {
        let _ = app.emit(
            "tauri-sdb-remote-result",
            json!({ "success": false, "error": "IP address is required" }),
        );
        return Ok(());
    }

    let bin = resolve_sdb_bin(sdb_path.as_deref());
    let _ = run_sdb_command_with_timeout(&bin, &["disconnect".to_string(), trimmed.clone()], 5).await;

    match run_sdb_command_with_timeout(&bin, &["connect".to_string(), trimmed.clone()], 10).await {
        Ok((code, out, err)) if code == 0 => {
            let _ = out;
            let _ = err;
            let _ = run_sdb_command_with_timeout(&bin, &["root".to_string(), "on".to_string()], 5).await;
            let _ = app.emit(
                "tauri-sdb-remote-result",
                json!({ "success": true, "message": "Connected and Rooted" }),
            );
        }
        Ok((code, out, err)) => {
            let _ = app.emit(
                "tauri-sdb-remote-result",
                json!({
                    "success": false,
                    "error": format!("Connect failed with code {} ({})", code, format!("{}{}", out, err).trim())
                }),
            );
        }
        Err(e) => {
            let _ = app.emit(
                "tauri-sdb-remote-result",
                json!({ "success": false, "error": e }),
            );
        }
    }
    Ok(())
}

pub fn shutdown_sdb_session() {
    if let Ok(mut guard) = get_sdb_session().lock() {
        if let Some(sess) = guard.take() {
            sess.intentional_stop.store(true, Ordering::Release);
            sess.emitter.flush_and_close();
            if let Ok(mut child_guard) = sess.child.try_lock() {
                let _ = child_guard.start_kill();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_target_args_correctly_for_auto_and_explicit_device() {
        assert_eq!(build_sdb_target_args(None), Vec::<String>::new());
        assert_eq!(build_sdb_target_args(Some("")), Vec::<String>::new());
        assert_eq!(build_sdb_target_args(Some("auto-detect")), Vec::<String>::new());
        assert_eq!(
            build_sdb_target_args(Some("  192.168.250.250:26101  ")),
            vec!["-s".to_string(), "192.168.250.250:26101".to_string()]
        );
    }

    #[test]
    fn recognizes_ipv4_targets_for_recovery() {
        assert_eq!(
            is_ipv4_target(Some("192.168.1.50:26101")),
            Some("192.168.1.50:26101".to_string())
        );
        assert_eq!(is_ipv4_target(Some("emulator-26101")), None);
        assert_eq!(is_ipv4_target(None), None);
    }
}
