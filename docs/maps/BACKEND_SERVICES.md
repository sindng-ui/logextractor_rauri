# ⚙️ Backend & Tauri Services Map (`BACKEND_SERVICES.md`)

## 1. Tauri 2.0 Rust Native Core (`src-tauri/`)
| File | Key Responsibilities & Interfaces |
| :--- | :--- |
| `src-tauri/src/main.rs` | Binary entry point invoking `happytool_tauri_lib::run()`. |
| `src-tauri/src/lib.rs` | Application setup, CLI argument parser (`parse_cli_args` for `log-extractor` / `analyze-diff`), window state restore/save hooks, background Socket.IO server spawner, and Tauri invoke handler registration. |
| `src-tauri/src/commands/file_io.rs` | `read_file(file_path)`, `get_file_size(file_path)`, `read_file_segment(path, start, end) -> tauri::ipc::Response` (15-second `FILE_POOL` handle pooling + Zero-Copy binary response), `stream_read_file(file_path, request_id, start)`, `cancel_stream(request_id)`, `save_file(content)` (`rfd` dialog), `save_binary_file(data, default_name, filter_name, extensions)` (`rfd` binary save dialog returning exact `filePath`), `save_file_direct(data, file_path)`, `append_file_direct(data, file_path)`, `select_log_file()`. |
| `src-tauri/src/commands/window_os.rs` | `load_window_state`, `save_window_state` (`window-state.json` with minimized/off-screen `-32000` guard & monitor bounds fallback), `copy_to_clipboard(text)` (`arboard`), `open_external(target)` (`open`), `get_app_path()`, `toggle_fullscreen(flag)`, `set_zoom_factor(factor)` (`WebviewWindow::set_zoom`), `window_minimize()`, `window_toggle_maximize()`, `window_close()`. |
| `src-tauri/src/commands/settings_cli.rs` | `get_startup_status()`, `splash_ready()`, `save_settings_file(settings)`, `get_cli_settings()`, `run_sdb_command(cmd)` (`CREATE_NO_WINDOW`), `cli_ready()`, `cli_stdout(msg)`, `cli_stderr(msg)`, `cli_exit(code)`. |
| `src-tauri/src/commands/stream_engine.rs` | `spawn_backend_server(app_root)`, `stop_backend_server()`, `native_list_serial_ports()`, `native_list_sdb_devices(sdb_path)`, `native_start_scroll_stream(interval)`, `native_stop_scroll_stream()`. |
| `src-tauri/src/commands/sdb_capture.rs` | `sdb_capture_screen(device_id, sdb_path, custom_command, auto_connect_ip) -> tauri::ipc::Response` (Auto SDB target detect/IP recovery, `enlightenment_info -dump_screen` 1st-priority capture + fallbacks, `sdb pull`, Zero-Copy `[meta_len][meta_json][image_bytes]` binary frame, immediate remote/local temp cleanup without disrupting live SDB log streams). |
| `src-tauri/src/commands/updater.rs` | `get_app_version()`, `check_app_update(etag)`, `download_and_install_update(download_url, asset_name, expected_size)`, `cancel_app_update()`, `cleanup_old_updates()`. Queries GitHub Releases (`sindng-ui/logextractor_rauri`) with SemVer comparison & ETag support, streams `.exe`/`.msi` installer with 80ms-throttled `update-download-progress` events, and runs detached Windows NSIS installer (`/P /UPDATE /R` for passive progress + in-place update + auto-relaunch) or MSI `/passive` (`cfg!(debug_assertions)` dev-mode guard included). |
| `src-tauri/tauri.conf.json` | Tauri 2 configuration: `1400x900` frameless window (`decorations: false`, `dragDropEnabled: false`), COOP/COEP/CORP security headers, and `--enable-features=SharedArrayBuffer` browser args. |

## 2. Frontend Tauri Bridge Layer (`utils/`)
| File | Key Responsibilities & Interfaces |
| :--- | :--- |
| `utils/tauriBridge.ts` | `initTauriBridge()`, `createTauriElectronAPI()`, `registerTauriFilePath(file, filePath)`, `isTauriEnvironment()`. Emulates `window.electronAPI` methods (including `checkAppUpdate`, `downloadAndInstallUpdate`, `cancelAppUpdate`, `onUpdateDownloadProgress`) over Tauri IPC, caches `currentZoomFactor` synchronously, and delegates `.title-drag` mouse events to `getCurrentWindow().startDragging()` and `window_toggle_maximize`. |
| `utils/tauriSocket.ts` | `createLogStreamSocket(url)`, `HybridTauriSocket`. Connects to port `3003` Socket.IO server with automatic fallback to Rust native streaming commands and normalizes `serial_ports_list` -> `serial_ports`. |

## 3. Lightweight Socket.IO Server (`server/`)
| File | Key Responsibilities |
| :--- | :--- |
| `server/index.cjs` | Port `3003` Socket.IO server with `Cross-Origin-Resource-Policy: cross-origin` headers, 20ms `StringDecoder` log batching (`handleLogData` / `flushLogs`), SDB connection & `192.168.250.250` auto-recovery (`connect_sdb`, `sdb_write`, `sdb_clear`, `list_sdb_devices`, `connect_sdb_remote`), SSH shell streaming (`connect_ssh`, `ssh_write`, `ssh_clear`, `ssh_auth_response`), and Test Scroll simulator (`start_scroll_stream`, `stop_scroll_stream`). |
| `server/services/serialService.cjs` | Native `serialport` manager for UART/Serial live log streaming and special signals (`break`, `ctrl+c`, `ctrl+z`, `ctrl+d`). |
