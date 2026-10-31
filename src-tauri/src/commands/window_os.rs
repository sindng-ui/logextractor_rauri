use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, WebviewWindow};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WindowState {
    pub width: u32,
    pub height: u32,
    pub x: Option<i32>,
    pub y: Option<i32>,
    #[serde(rename = "isMaximized")]
    pub is_maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            width: 1400,
            height: 900,
            x: None,
            y: None,
            is_maximized: false,
        }
    }
}

pub fn get_window_state_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let _ = fs::create_dir_all(&dir);
    dir.join("window-state.json")
}

pub fn load_window_state(app: &AppHandle) -> WindowState {
    let path = get_window_state_path(app);
    if path.exists() {
        if let Ok(data) = fs::read_to_string(&path) {
            if let Ok(state) = serde_json::from_str::<WindowState>(&data) {
                return state;
            }
        }
    }
    WindowState::default()
}

pub fn save_window_state(app: &AppHandle, win: &WebviewWindow) {
    let is_maximized = win.is_maximized().unwrap_or(false);
    let size = win
        .outer_size()
        .unwrap_or(tauri::PhysicalSize::new(1400, 900));
    let pos = win.outer_position().ok();

    let state = WindowState {
        width: size.width.max(650),
        height: size.height.max(600),
        x: pos.map(|p| p.x),
        y: pos.map(|p| p.y),
        is_maximized,
    };

    let path = get_window_state_path(app);
    if let Ok(json_str) = serde_json::to_string(&state) {
        let _ = fs::write(path, json_str);
    }
}

#[tauri::command]
pub async fn copy_to_clipboard(text: String) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || {
        let mut clipboard =
            arboard::Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;
        clipboard
            .set_text(text)
            .map_err(|e| format!("Clipboard set_text failed: {}", e))?;
        Ok(json!({ "status": "success" }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn open_external(target: String) -> Result<Value, String> {
    let res = tokio::task::spawn_blocking(move || open::that(&target))
        .await
        .map_err(|e| e.to_string())?;

    match res {
        Ok(_) => Ok(json!({ "status": "success" })),
        Err(e) => Ok(json!({ "status": "error", "error": e.to_string() })),
    }
}

#[tauri::command]
pub async fn get_app_path(_app: AppHandle) -> Result<String, String> {
    if cfg!(debug_assertions) {
        // In dev mode, return workspace root directory
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        if let Some(parent) = manifest_dir.parent() {
            return Ok(parent.to_string_lossy().to_string());
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            return Ok(dir.to_string_lossy().to_string());
        }
    }
    Ok(".".to_string())
}

#[tauri::command]
pub async fn toggle_fullscreen(
    window: WebviewWindow,
    flag: Option<bool>,
) -> Result<bool, String> {
    let next = match flag {
        Some(b) => b,
        None => !window.is_fullscreen().unwrap_or(false),
    };
    window
        .set_fullscreen(next)
        .map_err(|e| format!("Failed to set fullscreen: {}", e))?;
    Ok(window.is_fullscreen().unwrap_or(next))
}

#[tauri::command]
pub async fn set_zoom_factor(window: WebviewWindow, factor: f64) -> Result<(), String> {
    let clamped = factor.clamp(0.3, 5.0);
    window
        .set_zoom(clamped)
        .map_err(|e| format!("Failed to set zoom: {}", e))
}

#[tauri::command]
pub async fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn window_toggle_maximize(window: WebviewWindow) -> Result<bool, String> {
    let is_max = window.is_maximized().unwrap_or(false);
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())?;
    } else {
        window.maximize().map_err(|e| e.to_string())?;
    }
    Ok(!is_max)
}

#[tauri::command]
pub async fn window_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}
