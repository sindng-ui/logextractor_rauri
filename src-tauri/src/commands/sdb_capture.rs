use super::stream_engine::parse_sdb_devices_stdout;
use super::stream_sdb::{
    build_sdb_target_args, is_ipv4_target, resolve_sdb_bin, run_sdb_command_with_timeout,
};
use serde_json::json;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::ipc::Response;

const MAX_CAPTURE_BYTES: usize = 32 * 1024 * 1024;
const CAPTURED_MARKER: &str = "HT_CAPTURED:";
const ERROR_MARKER: &str = "HT_CAPTURE_ERR:";

/// Detects MIME type from raw image magic bytes.
pub(crate) fn detect_image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() >= 8 && bytes[0..8] == [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A] {
        return Some("image/png");
    }
    if bytes.len() >= 3 && bytes[0..3] == [0xFF, 0xD8, 0xFF] {
        return Some("image/jpeg");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if bytes.len() >= 2 && &bytes[0..2] == b"BM" {
        return Some("image/bmp");
    }
    None
}

/// Extracts the captured remote file path from the shell capture stdout.
pub(crate) fn parse_captured_remote_path(stdout: &str) -> Option<String> {
    for line in stdout.lines().rev() {
        let trimmed = line.trim();
        if let Some(path) = trimmed.strip_prefix(CAPTURED_MARKER) {
            let p = path.trim();
            if !p.is_empty() && p.starts_with('/') {
                return Some(p.to_string());
            }
        }
    }
    None
}

/// Extracts a human-readable error message from the shell capture stdout/stderr.
pub(crate) fn parse_capture_error(stdout: &str, stderr: &str) -> String {
    for line in stdout.lines().rev() {
        let trimmed = line.trim();
        if let Some(msg) = trimmed.strip_prefix(ERROR_MARKER) {
            let m = msg.trim();
            if !m.is_empty() {
                return m.to_string();
            }
        }
    }
    let err = stderr.trim();
    if !err.is_empty() {
        return err.to_string();
    }
    let out = stdout.trim();
    if !out.is_empty() {
        return out.to_string();
    }
    "Screen capture failed on device.".to_string()
}

/// Builds a single POSIX-sh script that runs `enlightenment_info -dump_screen` (1st priority)
/// or an optional custom command, locates the dumped image file cleanly, and prints `HT_CAPTURED:<path>`.
pub(crate) fn build_capture_shell_script(remote_dir: &str, custom_command: Option<&str>) -> String {
    let out_file = format!("{}/snap.png", remote_dir);
    let custom = custom_command.map(|s| s.trim()).filter(|s| !s.is_empty());

    let helper_fns = format!(
        r#"D="{dir}"; OUT="{out}"; MARK="$D/.mark"; FOUND=""; LOG="";
rm -rf "$D" && mkdir -p "$D" && touch "$MARK";
find_img() {{
  for f in "$D"/*.png "$D"/*.jpg "$D"/*.jpeg "$D"/*.bmp "$D"/*.webp; do
    if [ -s "$f" ]; then FOUND="$f"; return 0; fi
  done
  if [ -n "$LOG" ]; then
    p=$(printf '%s\n' "$LOG" | grep -oE '/[^[:space:]"'"'"']+\.(png|jpg|jpeg|bmp|webp)' | tail -n 1)
    if [ -n "$p" ] && [ -s "$p" ]; then
      cp "$p" "$OUT" 2>/dev/null
      case "$p" in /tmp/*) rm -f "$p" 2>/dev/null ;; esac
      if [ -s "$OUT" ]; then FOUND="$OUT"; return 0; fi
    fi
  fi
  for f in $(ls -t /tmp/*screen*.png /tmp/*dump*.png /tmp/*.png /tmp/*.jpg /tmp/*.bmp 2>/dev/null | head -n 5); do
    if [ -s "$f" ] && [ "$f" -nt "$MARK" ]; then
      cp "$f" "$OUT" 2>/dev/null && rm -f "$f" 2>/dev/null
      if [ -s "$OUT" ]; then FOUND="$OUT"; return 0; fi
    fi
  done
  return 1
}};"#,
        dir = remote_dir,
        out = out_file
    );

    if let Some(cmd_template) = custom {
        let resolved_cmd = cmd_template
            .replace("{out}", &out_file)
            .replace("{dir}", remote_dir);
        return format!(
            r#"{helpers}
LOG=$(cd "$D" && {cmd} 2>&1);
find_img;
if [ -n "$FOUND" ] && [ -s "$FOUND" ]; then echo "{ok}$FOUND"; else echo "{err}${{LOG:-Custom capture command produced no image}}"; exit 1; fi"#,
            helpers = helper_fns,
            cmd = resolved_cmd,
            ok = CAPTURED_MARKER,
            err = ERROR_MARKER
        );
    }

    format!(
        r#"{helpers}
if command -v enlightenment_info >/dev/null 2>&1; then
  LOG=$(cd "$D" && enlightenment_info -dump_screen 2>&1);
  find_img || {{ LOG=$(cd "$D" && enlightenment_info -dump_screen "$D" 2>&1); find_img; }} || {{ LOG=$(cd "$D" && enlightenment_info -dump_screen "$OUT" 2>&1); find_img; }};
fi;
if [ -z "$FOUND" ] && command -v scrot >/dev/null 2>&1; then
  LOG=$(scrot "$OUT" 2>&1); find_img;
fi;
if [ -z "$FOUND" ] && command -v screencap >/dev/null 2>&1; then
  LOG=$(screencap -p "$OUT" 2>&1); find_img;
fi;
if [ -z "$FOUND" ] && command -v screenshot >/dev/null 2>&1; then
  LOG=$(screenshot "$OUT" 2>&1); find_img;
fi;
if [ -n "$FOUND" ] && [ -s "$FOUND" ]; then
  echo "{ok}$FOUND";
else
  echo "{err}${{LOG:-enlightenment_info -dump_screen did not produce an image}}";
  exit 1;
fi"#,
        helpers = helper_fns,
        ok = CAPTURED_MARKER,
        err = ERROR_MARKER
    )
}

/// Packs `[meta_len: u32 LE][meta_json][image_bytes]` into a single Zero-Copy binary frame.
pub(crate) fn pack_capture_binary_response(
    device_id: &str,
    mime: &str,
    image_bytes: &[u8],
) -> Vec<u8> {
    let meta_json = json!({
        "deviceId": device_id,
        "mime": mime,
    })
    .to_string();
    let meta_bytes = meta_json.as_bytes();
    let mut payload = Vec::with_capacity(4 + meta_bytes.len() + image_bytes.len());
    payload.extend_from_slice(&(meta_bytes.len() as u32).to_le_bytes());
    payload.extend_from_slice(meta_bytes);
    payload.extend_from_slice(image_bytes);
    payload
}

async fn verify_target_ready(bin: &str, target: Option<&str>) -> Result<(), String> {
    let mut args = build_sdb_target_args(target);
    args.extend(["shell".to_string(), "echo".to_string(), "READY".to_string()]);
    match run_sdb_command_with_timeout(bin, &args, 5).await {
        Ok((code, stdout, _)) if code == 0 && stdout.contains("READY") => Ok(()),
        Ok((code, stdout, stderr)) => {
            let msg = if !stderr.trim().is_empty() {
                stderr.trim().to_string()
            } else if !stdout.trim().is_empty() {
                stdout.trim().to_string()
            } else {
                format!("Device check failed (exit code {})", code)
            };
            Err(msg)
        }
        Err(e) if e.starts_with("TIMEOUT:") => {
            Err("SDB device check timed out (5s). Is the device connected?".to_string())
        }
        Err(e) => Err(e),
    }
}

async fn connect_remote_ip(bin: &str, ip: &str) -> Result<String, String> {
    let trimmed = ip.trim().to_string();
    let _ = run_sdb_command_with_timeout(bin, &["disconnect".to_string(), trimmed.clone()], 4).await;
    match run_sdb_command_with_timeout(bin, &["connect".to_string(), trimmed.clone()], 8).await {
        Ok((_, out, err)) => {
            let combined = format!("{}\n{}", out, err);
            let lower = combined.to_lowercase();
            if lower.contains("connected to") || lower.contains("already connected") {
                let root_args = vec![
                    "-s".to_string(),
                    trimmed.clone(),
                    "root".to_string(),
                    "on".to_string(),
                ];
                let _ = run_sdb_command_with_timeout(bin, &root_args, 4).await;
                tokio::time::sleep(Duration::from_millis(350)).await;
                Ok(trimmed)
            } else {
                Err(format!(
                    "Failed to connect SDB to {}: {}",
                    trimmed,
                    combined.trim()
                ))
            }
        }
        Err(e) if e.starts_with("TIMEOUT:") => {
            Err(format!("SDB connect timed out (8s) for {}", trimmed))
        }
        Err(e) => Err(e),
    }
}

/// Resolves an active SDB target without disturbing existing log streaming sessions.
async fn ensure_sdb_target(
    bin: &str,
    device_id: Option<&str>,
    auto_connect_ip: Option<&str>,
) -> Result<String, String> {
    let explicit = device_id
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("auto-detect"));

    if let Some(target) = explicit {
        if verify_target_ready(bin, Some(target)).await.is_ok() {
            return Ok(target.to_string());
        }
        // Try auto-reconnect if target is an IPv4 address
        if let Some(ip) = is_ipv4_target(Some(target)) {
            let connected = connect_remote_ip(bin, &ip).await?;
            verify_target_ready(bin, Some(&connected)).await?;
            return Ok(connected);
        }
        return Err(format!(
            "SDB device '{}' is not reachable. Check USB/network connection.",
            target
        ));
    }

    // Auto-detect from `sdb devices`
    let (code, stdout, stderr) =
        run_sdb_command_with_timeout(bin, &["devices".to_string()], 5).await?;
    if code == 0 {
        let devices = parse_sdb_devices_stdout(&stdout);
        for dev in &devices {
            let dev_type = dev.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let dev_id = dev.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if dev_type.eq_ignore_ascii_case("device") && !dev_id.is_empty() {
                if verify_target_ready(bin, Some(dev_id)).await.is_ok() {
                    return Ok(dev_id.to_string());
                }
            }
        }
    } else if !stderr.trim().is_empty() {
        return Err(format!("sdb devices failed: {}", stderr.trim()));
    }

    // Fallback: auto-connect saved Remote IP if provided
    if let Some(ip) = is_ipv4_target(auto_connect_ip) {
        let connected = connect_remote_ip(bin, &ip).await?;
        verify_target_ready(bin, Some(&connected)).await?;
        return Ok(connected);
    }

    Err("No connected SDB device found. Plug in USB or enter a Device IP in the SDB menu.".to_string())
}

fn is_permission_error(msg: &str) -> bool {
    let lower = msg.to_lowercase();
    lower.contains("permission denied")
        || lower.contains("operation not permitted")
        || lower.contains("root")
        || lower.contains("denied")
}

#[tauri::command]
pub async fn sdb_capture_screen(
    device_id: Option<String>,
    sdb_path: Option<String>,
    custom_command: Option<String>,
    auto_connect_ip: Option<String>,
) -> Result<Response, String> {
    let bin = resolve_sdb_bin(sdb_path.as_deref());
    let resolved_target =
        ensure_sdb_target(&bin, device_id.as_deref(), auto_connect_ip.as_deref()).await?;

    let ts_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let remote_dir = format!("/tmp/ht_snap_{}", ts_ms);
    let script = build_capture_shell_script(&remote_dir, custom_command.as_deref());

    let run_capture = |target: String, bin_str: String, sh_script: String| async move {
        let mut args = build_sdb_target_args(Some(&target));
        args.push("shell".to_string());
        args.push(sh_script);
        run_sdb_command_with_timeout(&bin_str, &args, 15).await
    };

    let mut capture_res = run_capture(resolved_target.clone(), bin.clone(), script.clone()).await;

    // Retry once with `sdb root on` ONLY if capture failed with permission error
    if let Ok((code, ref stdout, ref stderr)) = capture_res {
        if code != 0 || parse_captured_remote_path(stdout).is_none() {
            let err_msg = parse_capture_error(stdout, stderr);
            if is_permission_error(&err_msg) {
                let mut root_args = build_sdb_target_args(Some(&resolved_target));
                root_args.extend(["root".to_string(), "on".to_string()]);
                let _ = run_sdb_command_with_timeout(&bin, &root_args, 4).await;
                tokio::time::sleep(Duration::from_millis(350)).await;
                capture_res = run_capture(resolved_target.clone(), bin.clone(), script.clone()).await;
            }
        }
    }

    let remote_file = match capture_res {
        Ok((code, stdout, stderr)) => {
            if let Some(path) = parse_captured_remote_path(&stdout) {
                path
            } else {
                let err_msg = parse_capture_error(&stdout, &stderr);
                return Err(format!(
                    "Device capture failed (code {}): {}",
                    code, err_msg
                ));
            }
        }
        Err(e) if e.starts_with("TIMEOUT:") => {
            return Err("Device screen capture timed out (15s).".to_string());
        }
        Err(e) => return Err(e),
    };

    // Pull image to local temp file
    let local_tmp = std::env::temp_dir().join(format!("ht_snap_{}.img", ts_ms));
    let local_tmp_str = local_tmp.to_string_lossy().to_string();

    let mut pull_args = build_sdb_target_args(Some(&resolved_target));
    pull_args.extend(["pull".to_string(), remote_file.clone(), local_tmp_str]);

    let pull_res = run_sdb_command_with_timeout(&bin, &pull_args, 15).await;

    // Clean up remote temp directory asynchronously (fire-and-forget)
    let cleanup_bin = bin.clone();
    let cleanup_target = resolved_target.clone();
    let cleanup_dir = remote_dir.clone();
    tauri::async_runtime::spawn(async move {
        let mut rm_args = build_sdb_target_args(Some(&cleanup_target));
        rm_args.extend(["shell".to_string(), format!("rm -rf \"{}\"", cleanup_dir)]);
        let _ = run_sdb_command_with_timeout(&cleanup_bin, &rm_args, 4).await;
    });

    match pull_res {
        Ok((code, stdout, stderr)) if code == 0 => {
            let _ = (stdout, stderr);
        }
        Ok((code, stdout, stderr)) => {
            let _ = tokio::fs::remove_file(&local_tmp).await;
            let detail = if !stderr.trim().is_empty() {
                stderr.trim().to_string()
            } else {
                stdout.trim().to_string()
            };
            return Err(format!("Failed to pull screenshot (code {}): {}", code, detail));
        }
        Err(e) => {
            let _ = tokio::fs::remove_file(&local_tmp).await;
            return Err(format!("Failed to pull screenshot: {}", e));
        }
    }

    let bytes = tokio::fs::read(&local_tmp)
        .await
        .map_err(|e| format!("Failed to read pulled screenshot: {}", e))?;
    let _ = tokio::fs::remove_file(&local_tmp).await;

    if bytes.is_empty() {
        return Err("Captured screenshot file is empty.".to_string());
    }
    if bytes.len() > MAX_CAPTURE_BYTES {
        return Err("Captured screenshot exceeds 32MB safety limit.".to_string());
    }

    let mime = detect_image_mime(&bytes).ok_or_else(|| {
        "Captured file is not a valid PNG/JPEG/WebP/BMP image.".to_string()
    })?;

    Ok(Response::new(pack_capture_binary_response(
        &resolved_target,
        mime,
        &bytes,
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_valid_image_magic_headers() {
        assert_eq!(
            detect_image_mime(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00]),
            Some("image/png")
        );
        assert_eq!(detect_image_mime(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(
            detect_image_mime(b"RIFF\x10\x00\x00\x00WEBPextra"),
            Some("image/webp")
        );
        assert_eq!(detect_image_mime(b"BM\x00\x00"), Some("image/bmp"));
        assert_eq!(detect_image_mime(b"not an image"), None);
    }

    #[test]
    fn parses_captured_remote_path_and_error_markers() {
        let out = "Dump screen ok\nHT_CAPTURED:/tmp/ht_snap_123/dump_screen_0.png\n";
        assert_eq!(
            parse_captured_remote_path(out),
            Some("/tmp/ht_snap_123/dump_screen_0.png".to_string())
        );
        assert_eq!(parse_captured_remote_path("no marker here"), None);

        let err_out = "something\nHT_CAPTURE_ERR:Permission denied\n";
        assert_eq!(parse_capture_error(err_out, ""), "Permission denied");
        assert_eq!(parse_capture_error("", "stderr details"), "stderr details");
    }

    #[test]
    fn builds_default_and_custom_capture_scripts() {
        let default_script = build_capture_shell_script("/tmp/ht_snap_1", None);
        assert!(default_script.contains("enlightenment_info -dump_screen"));
        assert!(default_script.contains("HT_CAPTURED:"));

        let custom_script =
            build_capture_shell_script("/tmp/ht_snap_2", Some("my_cap --out {out}"));
        assert!(custom_script.contains("my_cap --out /tmp/ht_snap_2/snap.png"));
        assert!(!custom_script.contains("enlightenment_info -dump_screen"));
    }

    #[test]
    fn packs_zero_copy_binary_response_correctly() {
        let img = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        let packed = pack_capture_binary_response("192.168.250.250:26101", "image/png", &img);
        let meta_len = u32::from_le_bytes([packed[0], packed[1], packed[2], packed[3]]) as usize;
        let meta_str = std::str::from_utf8(&packed[4..4 + meta_len]).unwrap();
        assert!(meta_str.contains("192.168.250.250:26101"));
        assert!(meta_str.contains("image/png"));
        assert_eq!(&packed[4 + meta_len..], &img);
    }
}
