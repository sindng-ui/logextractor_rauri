pub mod commands;

use commands::{
    file_io, log_engine, log_reader, sdb_capture, settings_cli, stream_engine, stream_sdb,
    stream_serial, stream_ssh, window_os,
};
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{Manager, WindowEvent};

fn parse_cli_args() -> Option<Value> {
    if let Ok(payload_str) = std::env::var("HAPPYTOOL_CLI_PAYLOAD") {
        if let Ok(val) = serde_json::from_str::<Value>(&payload_str) {
            return Some(val);
        }
    }

    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        return None;
    }

    let subcmd = args[1].as_str();
    if subcmd != "log-extractor" && subcmd != "analyze-diff" {
        return None;
    }

    let mut filter_name = String::new();
    let mut input_path = String::new();
    let mut left_path = String::new();
    let mut right_path = String::new();
    let mut output_path: Option<String> = None;

    let mut i = 2;
    while i < args.len() {
        match args[i].as_str() {
            "-f" | "--filter" if i + 1 < args.len() => {
                filter_name = args[i + 1].clone();
                i += 2;
            }
            "-i" | "--input" if i + 1 < args.len() => {
                input_path = args[i + 1].clone();
                i += 2;
            }
            "-l" | "--left" if i + 1 < args.len() => {
                left_path = args[i + 1].clone();
                i += 2;
            }
            "-r" | "--right" if i + 1 < args.len() => {
                right_path = args[i + 1].clone();
                i += 2;
            }
            "-o" | "--output" if i + 1 < args.len() => {
                output_path = Some(args[i + 1].clone());
                i += 2;
            }
            _ => {
                i += 1;
            }
        }
    }

    let cwd = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .to_string_lossy()
        .to_string();

    if subcmd == "log-extractor" {
        Some(json!({
            "command": "log-extractor",
            "payload": {
                "filterName": filter_name,
                "inputPath": input_path,
                "outputPath": output_path,
                "cwd": cwd
            }
        }))
    } else {
        Some(json!({
            "command": "analyze-diff",
            "payload": {
                "filterName": filter_name,
                "leftPath": left_path,
                "rightPath": right_path,
                "outputPath": output_path,
                "cwd": cwd
            }
        }))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cli_payload = parse_cli_args();
    let is_cli_mode = cli_payload.is_some()
        || std::env::var("HAPPYTOOL_CLI_MODE").ok().as_deref() == Some("1");
    settings_cli::set_cli_payload(cli_payload);

    tauri::Builder::default()
        .setup(move |app| {
            let app_handle = app.handle().clone();

            if let Some(main_win) = app.get_webview_window("main") {
                if is_cli_mode {
                    let _ = main_win.hide();
                    let _ = main_win.eval("if (!window.location.search.includes('mode=cli')) { window.location.search = '?mode=cli'; }");
                } else {
                    let state = window_os::load_window_state(&app_handle);
                    let _ = main_win.set_size(tauri::PhysicalSize::new(state.width, state.height));
                    if let (Some(x), Some(y)) = (state.x, state.y) {
                        let _ = main_win.set_position(tauri::PhysicalPosition::new(x, y));
                    }
                    if state.is_maximized {
                        let _ = main_win.maximize();
                    }
                }

                let win_clone = main_win.clone();
                let handle_clone = app_handle.clone();
                main_win.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { .. } => {
                        if !is_cli_mode {
                            window_os::save_window_state(&handle_clone, &win_clone);
                        }
                        stream_sdb::shutdown_sdb_session();
                        stream_serial::shutdown_serial_session();
                        stream_ssh::shutdown_ssh_session();
                        stream_engine::stop_backend_server();
                    }
                    WindowEvent::Destroyed => {
                        stream_sdb::shutdown_sdb_session();
                        stream_serial::shutdown_serial_session();
                        stream_ssh::shutdown_ssh_session();
                        stream_engine::stop_backend_server();
                    }
                    _ => {}
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            file_io::read_file,
            file_io::get_file_size,
            file_io::read_file_segment,
            file_io::read_file_segments_batch,
            file_io::stream_read_file,
            file_io::cancel_stream,
            file_io::save_file,
            file_io::save_binary_file,
            file_io::save_file_direct,
            file_io::append_file_direct,
            file_io::select_log_file,
            log_engine::index_log_file,
            log_engine::index_log_file_meta,
            log_engine::evict_log_cache,
            log_engine::filter_log_file,
            log_reader::read_local_lines_by_indices,
            log_reader::read_local_line_range,
            log_reader::find_highlight_native,
            window_os::copy_to_clipboard,
            window_os::copy_image_to_clipboard,
            window_os::read_image_from_clipboard,
            window_os::open_external,
            window_os::get_app_path,
            window_os::toggle_fullscreen,
            window_os::set_zoom_factor,
            window_os::window_minimize,
            window_os::window_toggle_maximize,
            window_os::window_close,
            settings_cli::get_startup_status,
            settings_cli::splash_ready,
            settings_cli::save_settings_file,
            settings_cli::get_cli_settings,
            settings_cli::run_sdb_command,
            settings_cli::cli_ready,
            settings_cli::cli_stdout,
            settings_cli::cli_stderr,
            settings_cli::cli_exit,
            stream_engine::native_list_serial_ports,
            stream_engine::native_list_sdb_devices,
            stream_engine::native_start_scroll_stream,
            stream_engine::native_stop_scroll_stream,
            stream_sdb::sdb_connect,
            stream_sdb::sdb_write,
            stream_sdb::sdb_clear,
            stream_sdb::sdb_disconnect,
            stream_sdb::sdb_connect_remote,
            sdb_capture::sdb_capture_screen,
            stream_serial::serial_connect,
            stream_serial::serial_write,
            stream_serial::serial_special_key,
            stream_serial::serial_disconnect,
            stream_ssh::ssh_connect,
            stream_ssh::ssh_write,
            stream_ssh::ssh_auth_response,
            stream_ssh::ssh_clear,
            stream_ssh::ssh_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HappyTool Tauri application");
}
