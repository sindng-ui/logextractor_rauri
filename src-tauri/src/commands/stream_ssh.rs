use super::stream_engine::LogBatchEmitter;
use async_trait::async_trait;
use russh::client::{self, KeyboardInteractiveAuthResponse};
use russh::ChannelMsg;
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot};

struct ActiveSshSession {
    write_tx: mpsc::UnboundedSender<Vec<u8>>,
    stop_tx: StdMutex<Option<oneshot::Sender<()>>>,
    auth_tx: StdMutex<Option<oneshot::Sender<String>>>,
    emitter: LogBatchEmitter,
    intentional_stop: Arc<AtomicBool>,
}

static SSH_SESSION: OnceLock<StdMutex<Option<Arc<ActiveSshSession>>>> = OnceLock::new();

fn get_ssh_session() -> &'static StdMutex<Option<Arc<ActiveSshSession>>> {
    SSH_SESSION.get_or_init(|| StdMutex::new(None))
}

struct SshClientHandler;

#[async_trait]
impl client::Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

fn close_existing_ssh_session() {
    let existing = {
        get_ssh_session().lock().ok().and_then(|mut g| g.take())
    };
    if let Some(sess) = existing {
        sess.intentional_stop.store(true, Ordering::Release);
        sess.emitter.flush_and_close();
        if let Ok(mut tx) = sess.stop_tx.lock() {
            if let Some(stop) = tx.take() {
                let _ = stop.send(());
            }
        }
        if let Ok(mut auth) = sess.auth_tx.lock() {
            let _ = auth.take();
        }
    }
}

fn format_ssh_connect_error(host: &str, port: u16, err_msg: &str) -> String {
    let lower = err_msg.to_lowercase();
    if lower.contains("refused") {
        format!("Connection Refused! Is SSH running on {}:{}?", host, port)
    } else if lower.contains("timed out") || lower.contains("timeout") {
        format!("Connection Timed Out! Host {} is unreachable.", host)
    } else if lower.contains("dns")
        || lower.contains("lookup")
        || lower.contains("resolve")
        || lower.contains("no such host")
        || lower.contains("not found")
    {
        format!("Host Not Found! Check the IP/Hostname: {}", host)
    } else {
        format!("Connection Failed: {}", err_msg)
    }
}

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    host: String,
    port: Option<u16>,
    username: String,
    password: String,
    debug: Option<bool>,
    save_to_file: Option<bool>,
) -> Result<(), String> {
    let target_host = host.trim().to_string();
    if target_host.is_empty() {
        let _ = app.emit(
            "tauri-ssh-error",
            json!({ "message": "SSH Host IP is required." }),
        );
        return Ok(());
    }
    let target_port = port.unwrap_or(22);
    let target_user = if username.trim().is_empty() {
        "root".to_string()
    } else {
        username.trim().to_string()
    };

    close_existing_ssh_session();

    let (write_tx, mut write_rx) = mpsc::unbounded_channel::<Vec<u8>>();
    let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
    let intentional_stop = Arc::new(AtomicBool::new(false));
    let emitter = LogBatchEmitter::new(
        app.clone(),
        "ssh",
        save_to_file.unwrap_or(false),
        debug.unwrap_or(false),
    );
    emitter.debug_log(&format!(
        "Initiating SSH connection to {}@{}:{}",
        target_user, target_host, target_port
    ));

    let session_arc = Arc::new(ActiveSshSession {
        write_tx,
        stop_tx: StdMutex::new(Some(stop_tx)),
        auth_tx: StdMutex::new(None),
        emitter: emitter.clone(),
        intentional_stop: Arc::clone(&intentional_stop),
    });

    if let Ok(mut guard) = get_ssh_session().lock() {
        *guard = Some(Arc::clone(&session_arc));
    }

    let config = Arc::new(client::Config {
        inactivity_timeout: None,
        keepalive_interval: Some(Duration::from_secs(10)),
        keepalive_max: 3,
        ..Default::default()
    });

    let connect_res = tokio::time::timeout(
        Duration::from_secs(20),
        client::connect(config, (target_host.as_str(), target_port), SshClientHandler),
    )
    .await;

    let mut handle = match connect_res {
        Ok(Ok(h)) => h,
        Ok(Err(e)) => {
            close_existing_ssh_session();
            let msg = format_ssh_connect_error(&target_host, target_port, &e.to_string());
            let _ = app.emit("tauri-ssh-error", json!({ "message": msg }));
            return Ok(());
        }
        Err(_) => {
            close_existing_ssh_session();
            let msg = format!("Connection Timed Out! Host {} is unreachable.", target_host);
            let _ = app.emit("tauri-ssh-error", json!({ "message": msg, "code": "ETIMEDOUT" }));
            return Ok(());
        }
    };

    let mut authed = matches!(
        handle.authenticate_password(&target_user, &password).await,
        Ok(true)
    );

    if !authed {
        if let Ok(mut kb_res) = handle
            .authenticate_keyboard_interactive_start(&target_user, None)
            .await
        {
            for _ in 0..4 {
                match kb_res {
                    KeyboardInteractiveAuthResponse::Success => {
                        authed = true;
                        break;
                    }
                    KeyboardInteractiveAuthResponse::Failure => break,
                    KeyboardInteractiveAuthResponse::InfoRequest { prompts, .. } => {
                        if prompts.is_empty() {
                            match handle.authenticate_keyboard_interactive_respond(Vec::new()).await {
                                Ok(next) => kb_res = next,
                                Err(_) => break,
                            }
                            continue;
                        }
                        let responses = if !password.is_empty() {
                            vec![password.clone(); prompts.len()]
                        } else {
                            let (atx, arx) = oneshot::channel::<String>();
                            if let Ok(mut g) = session_arc.auth_tx.lock() {
                                *g = Some(atx);
                            }
                            let first = &prompts[0];
                            let _ = app.emit(
                                "tauri-ssh-auth-request",
                                json!({
                                    "prompt": if first.prompt.is_empty() { "Password: ".to_string() } else { first.prompt.clone() },
                                    "echo": first.echo
                                }),
                            );
                            match tokio::time::timeout(Duration::from_secs(60), arx).await {
                                Ok(Ok(user_input)) => vec![user_input],
                                _ => break,
                            }
                        };
                        match handle.authenticate_keyboard_interactive_respond(responses).await {
                            Ok(next) => kb_res = next,
                            Err(_) => break,
                        }
                    }
                }
            }
        }
    }

    if !authed {
        close_existing_ssh_session();
        let _ = app.emit(
            "tauri-ssh-error",
            json!({
                "message": "Authentication Failed! Please check your username and password.",
                "level": "client-authentication"
            }),
        );
        return Ok(());
    }

    let mut channel = match handle.channel_open_session().await {
        Ok(ch) => ch,
        Err(e) => {
            close_existing_ssh_session();
            let _ = app.emit(
                "tauri-ssh-error",
                json!({ "message": format!("Failed to open shell: {}", e) }),
            );
            return Ok(());
        }
    };

    let _ = channel
        .request_pty(true, "xterm-256color", 120, 40, 0, 0, &[])
        .await;

    if let Err(e) = channel.request_shell(true).await {
        close_existing_ssh_session();
        let _ = app.emit(
            "tauri-ssh-error",
            json!({ "message": format!("Failed to start shell: {}", e) }),
        );
        return Ok(());
    }

    let _ = app.emit(
        "tauri-ssh-status",
        json!({
            "status": "connected",
            "message": format!("Connected to {}", target_host)
        }),
    );

    let bg_session = Arc::clone(&session_arc);
    let bg_app = app;
    let bg_stop = intentional_stop;
    let bg_emitter = emitter;

    tauri::async_runtime::spawn(async move {
        let _keep_handle = handle;
        loop {
            tokio::select! {
                _ = &mut stop_rx => {
                    let _ = channel.close().await;
                    break;
                }
                maybe_write = write_rx.recv() => {
                    match maybe_write {
                        Some(bytes) => {
                            if channel.data(&bytes[..]).await.is_err() {
                                break;
                            }
                        }
                        None => break,
                    }
                }
                maybe_msg = channel.wait() => {
                    match maybe_msg {
                        Some(ChannelMsg::Data { ref data }) => {
                            bg_emitter.push_bytes(data);
                        }
                        Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                            bg_emitter.push_bytes(data);
                        }
                        Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }

        bg_emitter.flush_and_close();
        if !bg_stop.load(Ordering::Acquire) {
            let _ = bg_app.emit(
                "tauri-ssh-error",
                json!({ "message": "SSH Connection lost unexpectedly." }),
            );
        }
        let _ = bg_app.emit(
            "tauri-ssh-status",
            json!({ "status": "disconnected", "message": "Connection closed" }),
        );

        if let Ok(mut guard) = get_ssh_session().lock() {
            if let Some(ref cur) = *guard {
                if Arc::ptr_eq(cur, &bg_session) {
                    *guard = None;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn ssh_write(data: String) -> Result<(), String> {
    let sess = {
        get_ssh_session().lock().ok().and_then(|g| g.clone())
    };
    if let Some(s) = sess {
        s.emitter.resume();
        let _ = s.write_tx.send(data.into_bytes());
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_auth_response(response: String) -> Result<(), String> {
    let sess = {
        get_ssh_session().lock().ok().and_then(|g| g.clone())
    };
    if let Some(s) = sess {
        if let Ok(mut g) = s.auth_tx.lock() {
            if let Some(tx) = g.take() {
                let _ = tx.send(response);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_clear() -> Result<(), String> {
    if let Ok(guard) = get_ssh_session().lock() {
        if let Some(ref sess) = *guard {
            sess.emitter.clear();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_disconnect(app: AppHandle) -> Result<(), String> {
    close_existing_ssh_session();
    let _ = app.emit(
        "tauri-ssh-status",
        json!({ "status": "disconnected", "message": "Connection closed" }),
    );
    Ok(())
}

pub fn shutdown_ssh_session() {
    close_existing_ssh_session();
}
