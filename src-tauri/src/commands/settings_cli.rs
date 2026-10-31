use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Deserialize, Clone)]
pub struct StartupState {
    pub progress: u32,
    pub message: String,
    pub logs: Vec<String>,
    #[serde(rename = "isComplete")]
    pub is_complete: bool,
}

static STARTUP_STATE: OnceLock<Mutex<StartupState>> = OnceLock::new();
static CLI_PAYLOAD: OnceLock<Mutex<Option<Value>>> = OnceLock::new();

pub fn get_startup_mutex() -> &'static Mutex<StartupState> {
    STARTUP_STATE.get_or_init(|| {
        Mutex::new(StartupState {
            progress: 100,
            message: "Ready!".to_string(),
            logs: vec![
                "Initializing Tauri Rust Core...".to_string(),
                "Server started on port 3003".to_string(),
            ],
            is_complete: true,
        })
    })
}

pub fn set_cli_payload(payload: Option<Value>) {
    let lock = CLI_PAYLOAD.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = lock.lock() {
        *guard = payload;
    }
}

fn get_settings_file_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let _ = fs::create_dir_all(&dir);
    dir.join("happytool-settings.json")
}

#[tauri::command]
pub async fn get_startup_status() -> Result<StartupState, String> {
    let guard = get_startup_mutex().lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
pub async fn splash_ready(app: AppHandle) -> Result<(), String> {
    let state = {
        let guard = get_startup_mutex().lock().map_err(|e| e.to_string())?;
        guard.clone()
    };

    let _ = app.emit(
        "loading-progress",
        json!({
            "progress": state.progress,
            "message": state.message
        }),
    );
    for log in &state.logs {
        let _ = app.emit("loading-log", log);
    }
    if state.is_complete {
        let _ = app.emit("loading-complete", ());
    }
    Ok(())
}

#[tauri::command]
pub async fn save_settings_file(app: AppHandle, settings: Value) -> Result<Value, String> {
    let path = get_settings_file_path(&app);
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| format!("Failed to save settings file: {}", e))?;
    Ok(json!({ "status": "success" }))
}

#[tauri::command]
pub async fn get_cli_settings(app: AppHandle) -> Result<Option<Value>, String> {
    let path = get_settings_file_path(&app);
    if !path.exists() {
        return Ok(None);
    }
    match tokio::fs::read_to_string(&path).await {
        Ok(data) => {
            let parsed = serde_json::from_str::<Value>(&data).ok();
            Ok(parsed)
        }
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn run_sdb_command(cmd: String) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        let mut command = {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let mut c = Command::new("cmd");
            c.args(["/C", &cmd]);
            c.creation_flags(CREATE_NO_WINDOW);
            c
        };

        #[cfg(not(target_os = "windows"))]
        let mut command = {
            let mut c = Command::new("sh");
            c.args(["-c", &cmd]);
            c
        };

        match command.output() {
            Ok(output) => {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    Ok(json!({ "stdout": stdout }))
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    let msg = if !stderr.is_empty() { stderr } else { stdout };
                    Ok(json!({ "error": true, "message": msg }))
                }
            }
            Err(e) => Ok(json!({ "error": true, "message": e.to_string() })),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cli_ready(app: AppHandle) -> Result<(), String> {
    if let Some(lock) = CLI_PAYLOAD.get() {
        if let Ok(guard) = lock.lock() {
            if let Some(payload) = guard.clone() {
                let _ = app.emit("cli-command", payload.clone());
                let _ = app.emit("cli-run-command", payload);
                return Ok(());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn cli_stdout(msg: String) -> Result<(), String> {
    print!("{}\n", msg);
    let _ = std::io::stdout().flush();
    Ok(())
}

#[tauri::command]
pub async fn cli_stderr(msg: String) -> Result<(), String> {
    eprint!("{}\n", msg);
    let _ = std::io::stderr().flush();
    Ok(())
}

#[tauri::command]
pub async fn cli_exit(app: AppHandle, code: Option<i32>) -> Result<(), String> {
    app.exit(code.unwrap_or(0));
    Ok(())
}
