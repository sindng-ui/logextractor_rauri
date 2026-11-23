use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

const GITHUB_LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/sindng-ui/logextractor_rauri/releases/latest";
const GITHUB_RELEASES_LIST_URL: &str =
    "https://api.github.com/repos/sindng-ui/logextractor_rauri/releases?per_page=5";
const UPDATE_TEMP_DIR_NAME: &str = "HappyToolUpdate";

static UPDATE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static UPDATE_CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

struct UpdateInProgressGuard;

impl Drop for UpdateInProgressGuard {
    fn drop(&mut self) {
        UPDATE_IN_PROGRESS.store(false, Ordering::SeqCst);
        UPDATE_CANCEL_FLAG.store(false, Ordering::SeqCst);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SemVer {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
    pub pre: Vec<String>,
}

impl SemVer {
    pub fn parse(raw: &str) -> Option<Self> {
        let trimmed = raw.trim();
        let without_v = trimmed
            .strip_prefix('v')
            .or_else(|| trimmed.strip_prefix('V'))
            .unwrap_or(trimmed);
        let without_build = without_v.split('+').next().unwrap_or(without_v);
        let mut parts = without_build.splitn(2, '-');
        let core = parts.next()?.trim();
        let pre_str = parts.next();

        let nums: Vec<&str> = core.split('.').collect();
        if nums.is_empty() || nums.len() > 3 {
            return None;
        }
        let major = nums[0].parse::<u64>().ok()?;
        let minor = if nums.len() > 1 {
            nums[1].parse::<u64>().ok()?
        } else {
            0
        };
        let patch = if nums.len() > 2 {
            nums[2].parse::<u64>().ok()?
        } else {
            0
        };

        let pre = match pre_str {
            Some(s) if !s.trim().is_empty() => {
                s.split('.').map(|id| id.trim().to_string()).collect()
            }
            _ => Vec::new(),
        };

        Some(Self {
            major,
            minor,
            patch,
            pre,
        })
    }

    pub fn is_newer_than(&self, other: &Self) -> bool {
        if (self.major, self.minor, self.patch) != (other.major, other.minor, other.patch) {
            return (self.major, self.minor, self.patch) > (other.major, other.minor, other.patch);
        }
        match (self.pre.is_empty(), other.pre.is_empty()) {
            // Stable release > prerelease for same major.minor.patch
            (true, false) => true,
            (false, true) => false,
            (true, true) => false,
            (false, false) => compare_prerelease(&self.pre, &other.pre) == std::cmp::Ordering::Greater,
        }
    }
}

fn compare_prerelease(a: &[String], b: &[String]) -> std::cmp::Ordering {
    for (left, right) in a.iter().zip(b.iter()) {
        let ord = match (left.parse::<u64>(), right.parse::<u64>()) {
            (Ok(ln), Ok(rn)) => ln.cmp(&rn),
            (Ok(_), Err(_)) => std::cmp::Ordering::Less,
            (Err(_), Ok(_)) => std::cmp::Ordering::Greater,
            (Err(_), Err(_)) => left.cmp(right),
        };
        if ord != std::cmp::Ordering::Equal {
            return ord;
        }
    }
    a.len().cmp(&b.len())
}

pub fn is_newer_version(latest: &str, current: &str) -> bool {
    match (SemVer::parse(latest), SemVer::parse(current)) {
        (Some(l), Some(c)) => l.is_newer_than(&c),
        _ => false,
    }
}

#[derive(Debug, Deserialize, Clone)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Debug, Deserialize, Clone)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    draft: Option<bool>,
    prerelease: Option<bool>,
    #[serde(default)]
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub status: String, // "available" | "up_to_date" | "not_modified"
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub release_name: Option<String>,
    pub release_notes: Option<String>,
    pub published_at: Option<String>,
    pub html_url: Option<String>,
    pub download_url: Option<String>,
    pub asset_name: Option<String>,
    pub asset_size: Option<u64>,
    pub etag: Option<String>,
    pub is_dev_mode: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: f64,
    pub speed_bps: f64,
    pub stage: String, // "downloading" | "installing"
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInstallResult {
    pub status: String, // "installing" | "dev_downloaded" | "cancelled"
    pub installer_path: Option<String>,
    pub message: Option<String>,
}

fn select_windows_installer_asset(assets: &[GitHubAsset]) -> Option<&GitHubAsset> {
    let valid_assets: Vec<&GitHubAsset> = assets
        .iter()
        .filter(|a| is_allowed_github_url(&a.browser_download_url))
        .collect();

    // 1. Prefer NSIS setup .exe (e.g., HappyTool Tauri_2.2.3_x64-setup.exe)
    if let Some(asset) = valid_assets.iter().copied().find(|a| {
        let lower = a.name.to_lowercase();
        lower.ends_with(".exe") && lower.contains("setup")
    }) {
        return Some(asset);
    }

    // 2. Fallback to any Windows .exe
    if let Some(asset) = valid_assets
        .iter()
        .copied()
        .find(|a| a.name.to_lowercase().ends_with(".exe"))
    {
        return Some(asset);
    }

    // 3. Fallback to Windows .msi
    valid_assets
        .iter()
        .copied()
        .find(|a| a.name.to_lowercase().ends_with(".msi"))
}

fn is_allowed_github_url(url: &str) -> bool {
    let lower = url.trim().to_lowercase();
    lower.starts_with("https://github.com/")
        || lower.starts_with("https://api.github.com/")
        || lower.starts_with("https://objects.githubusercontent.com/")
        || lower.starts_with("https://release-assets.githubusercontent.com/")
}

fn sanitize_asset_filename(name: &str) -> String {
    let base = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("HappyTool-Update-Setup.exe");
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ') {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "HappyTool-Update-Setup.exe".to_string()
    } else {
        cleaned
    }
}

fn build_http_client(current_version: &str, timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!("HappyTool-Tauri/{}", current_version))
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("Failed to initialize HTTP client: {}", e))
}

async fn fetch_latest_release(
    client: &reqwest::Client,
    etag: Option<&str>,
) -> Result<(Option<GitHubRelease>, Option<String>, bool), String> {
    let mut req = client
        .get(GITHUB_LATEST_RELEASE_URL)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");

    if let Some(tag) = etag.filter(|s| !s.trim().is_empty()) {
        req = req.header("If-None-Match", tag);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("Network error while checking updates: {}", e))?;

    if resp.status() == reqwest::StatusCode::NOT_MODIFIED {
        return Ok((None, etag.map(|s| s.to_string()), true));
    }

    let resp_etag = resp
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        // Fallback: check /releases list in case no release is marked 'latest' or repo has prereleases
        let list_resp = client
            .get(GITHUB_RELEASES_LIST_URL)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .map_err(|e| format!("Network error while listing releases: {}", e))?;

        if list_resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok((None, None, false));
        }
        if !list_resp.status().is_success() {
            return Err(format_github_http_error(&list_resp));
        }

        let releases: Vec<GitHubRelease> = list_resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse GitHub releases JSON: {}", e))?;

        let best = releases
            .into_iter()
            .filter(|r| !r.draft.unwrap_or(false) && !r.prerelease.unwrap_or(false))
            .max_by(|a, b| compare_release_tags(&a.tag_name, &b.tag_name));

        return Ok((best, None, false));
    }

    if !resp.status().is_success() {
        return Err(format_github_http_error(&resp));
    }

    let release: GitHubRelease = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub release JSON: {}", e))?;

    if release.draft.unwrap_or(false) {
        return Ok((None, resp_etag, false));
    }

    Ok((Some(release), resp_etag, false))
}

fn compare_release_tags(a: &str, b: &str) -> std::cmp::Ordering {
    if is_newer_version(a, b) {
        std::cmp::Ordering::Greater
    } else if is_newer_version(b, a) {
        std::cmp::Ordering::Less
    } else {
        std::cmp::Ordering::Equal
    }
}

fn format_github_http_error(resp: &reqwest::Response) -> String {
    let status = resp.status();
    let remaining = resp
        .headers()
        .get("x-ratelimit-remaining")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if (status == reqwest::StatusCode::FORBIDDEN
        || status == reqwest::StatusCode::TOO_MANY_REQUESTS)
        && remaining == "0"
    {
        return "GitHub API rate limit exceeded. Please try again later.".to_string();
    }
    format!("GitHub API returned HTTP {}", status.as_u16())
}

fn update_temp_dir() -> PathBuf {
    std::env::temp_dir().join(UPDATE_TEMP_DIR_NAME)
}

pub fn cleanup_old_updates() {
    let dir = update_temp_dir();
    if dir.exists() {
        let _ = fs::remove_dir_all(&dir);
    }
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn check_app_update(
    app: AppHandle,
    etag: Option<String>,
) -> Result<UpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();
    let client = build_http_client(&current_version, 15)?;
    let is_dev_mode = cfg!(debug_assertions);

    let (release_opt, next_etag, not_modified) =
        fetch_latest_release(&client, etag.as_deref()).await?;

    if not_modified {
        return Ok(UpdateCheckResult {
            status: "not_modified".to_string(),
            has_update: false,
            current_version,
            latest_version: None,
            release_name: None,
            release_notes: None,
            published_at: None,
            html_url: None,
            download_url: None,
            asset_name: None,
            asset_size: None,
            etag: next_etag,
            is_dev_mode,
        });
    }

    let Some(release) = release_opt else {
        return Ok(UpdateCheckResult {
            status: "up_to_date".to_string(),
            has_update: false,
            current_version,
            latest_version: None,
            release_name: None,
            release_notes: None,
            published_at: None,
            html_url: None,
            download_url: None,
            asset_name: None,
            asset_size: None,
            etag: next_etag,
            is_dev_mode,
        });
    };

    let latest_clean = release
        .tag_name
        .trim()
        .trim_start_matches(['v', 'V'])
        .to_string();
    let has_update = is_newer_version(&release.tag_name, &current_version);
    let selected_asset = select_windows_installer_asset(&release.assets);

    Ok(UpdateCheckResult {
        status: if has_update {
            "available".to_string()
        } else {
            "up_to_date".to_string()
        },
        has_update,
        current_version,
        latest_version: Some(latest_clean),
        release_name: release.name,
        release_notes: release.body,
        published_at: release.published_at,
        html_url: Some(release.html_url),
        download_url: selected_asset.map(|a| a.browser_download_url.clone()),
        asset_name: selected_asset.map(|a| a.name.clone()),
        asset_size: selected_asset.map(|a| a.size),
        etag: next_etag,
        is_dev_mode,
    })
}

#[tauri::command]
pub async fn cancel_app_update() -> Result<(), String> {
    UPDATE_CANCEL_FLAG.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn download_and_install_update(
    app: AppHandle,
    download_url: String,
    asset_name: String,
    expected_size: Option<u64>,
) -> Result<UpdateInstallResult, String> {
    if !is_allowed_github_url(&download_url) {
        return Err("Blocked untrusted update download URL.".to_string());
    }

    if UPDATE_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("An update is already in progress.".to_string());
    }
    UPDATE_CANCEL_FLAG.store(false, Ordering::SeqCst);
    let _guard = UpdateInProgressGuard;

    let current_version = app.package_info().version.to_string();
    let client = build_http_client(&current_version, 600)?;

    let temp_dir = update_temp_dir();
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to prepare update directory: {}", e))?;

    let safe_name = sanitize_asset_filename(&asset_name);
    let installer_path = temp_dir.join(&safe_name);
    let partial_path = temp_dir.join(format!("{}.part", safe_name));

    let mut response = client
        .get(&download_url)
        .header("Accept", "application/octet-stream")
        .send()
        .await
        .map_err(|e| format!("Failed to start update download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download update asset (HTTP {})",
            response.status().as_u16()
        ));
    }

    let total_bytes = response.content_length().or(expected_size);
    let mut file = tokio::fs::File::create(&partial_path)
        .await
        .map_err(|e| format!("Failed to create temporary installer file: {}", e))?;

    let mut downloaded_bytes: u64 = 0;
    let started_at = Instant::now();
    let mut last_emit = Instant::now() - Duration::from_millis(200);

    let _ = app.emit(
        "update-download-progress",
        UpdateDownloadProgress {
            downloaded_bytes: 0,
            total_bytes,
            percent: 0.0,
            speed_bps: 0.0,
            stage: "downloading".to_string(),
        },
    );

    loop {
        if UPDATE_CANCEL_FLAG.load(Ordering::SeqCst) {
            drop(file);
            let _ = tokio::fs::remove_file(&partial_path).await;
            return Ok(UpdateInstallResult {
                status: "cancelled".to_string(),
                installer_path: None,
                message: Some("Update download cancelled.".to_string()),
            });
        }

        let chunk_opt = response
            .chunk()
            .await
            .map_err(|e| format!("Download interrupted: {}", e))?;

        let Some(chunk) = chunk_opt else {
            break;
        };

        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write update chunk: {}", e))?;
        downloaded_bytes += chunk.len() as u64;

        if last_emit.elapsed() >= Duration::from_millis(80) {
            let elapsed_secs = started_at.elapsed().as_secs_f64().max(0.001);
            let speed_bps = downloaded_bytes as f64 / elapsed_secs;
            let percent = match total_bytes {
                Some(total) if total > 0 => ((downloaded_bytes as f64 / total as f64) * 100.0).min(99.9),
                _ => 0.0,
            };
            let _ = app.emit(
                "update-download-progress",
                UpdateDownloadProgress {
                    downloaded_bytes,
                    total_bytes,
                    percent,
                    speed_bps,
                    stage: "downloading".to_string(),
                },
            );
            last_emit = Instant::now();
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush downloaded installer: {}", e))?;
    drop(file);

    if downloaded_bytes == 0 {
        let _ = tokio::fs::remove_file(&partial_path).await;
        return Err("Downloaded update file is empty.".to_string());
    }

    if let Some(expected) = expected_size.filter(|&s| s > 0) {
        if downloaded_bytes != expected {
            let _ = tokio::fs::remove_file(&partial_path).await;
            return Err(format!(
                "Downloaded file size mismatch ({} / {} bytes).",
                downloaded_bytes, expected
            ));
        }
    }

    tokio::fs::rename(&partial_path, &installer_path)
        .await
        .map_err(|e| format!("Failed to finalize downloaded installer: {}", e))?;

    let elapsed_secs = started_at.elapsed().as_secs_f64().max(0.001);
    let _ = app.emit(
        "update-download-progress",
        UpdateDownloadProgress {
            downloaded_bytes,
            total_bytes: Some(downloaded_bytes),
            percent: 100.0,
            speed_bps: downloaded_bytes as f64 / elapsed_secs,
            stage: "installing".to_string(),
        },
    );

    if cfg!(debug_assertions) {
        let path_str = installer_path.to_string_lossy().to_string();
        return Ok(UpdateInstallResult {
            status: "dev_downloaded".to_string(),
            installer_path: Some(path_str.clone()),
            message: Some(format!(
                "Dev build guard: installer downloaded to {}",
                path_str
            )),
        });
    }

    launch_windows_installer_and_exit(&app, &installer_path)?;

    Ok(UpdateInstallResult {
        status: "installing".to_string(),
        installer_path: Some(installer_path.to_string_lossy().to_string()),
        message: Some("Installing update and restarting HappyTool...".to_string()),
    })
}

#[cfg(target_os = "windows")]
fn launch_windows_installer_and_exit(app: &AppHandle, installer_path: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Stdio;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Failed to resolve current executable path: {}", e))?;
    let current_pid = std::process::id();

    let installer_str = installer_path.to_string_lossy().to_string();
    let exe_str = current_exe.to_string_lossy().to_string();
    let is_msi = installer_str.to_lowercase().ends_with(".msi");

    let script_path = update_temp_dir().join("apply_update.ps1");
    let escaped_installer = installer_str.replace('\'', "''");
    let escaped_exe = exe_str.replace('\'', "''");

    let ps_script = if is_msi {
        format!(
            r#"$ErrorActionPreference = 'SilentlyContinue'
$pidToWait = {pid}
for ($i = 0; $i -lt 80; $i++) {{
    if (-not (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue)) {{ break }}
    Start-Sleep -Milliseconds 250
}}
Start-Process -FilePath 'msiexec.exe' -ArgumentList '/i','{installer}','/passive','/norestart' -Wait
if (Test-Path '{exe}') {{
    Start-Process -FilePath '{exe}'
}}
"#,
            pid = current_pid,
            installer = escaped_installer,
            exe = escaped_exe,
        )
    } else {
        // Tauri v2 NSIS supports /P (passive progress), /UPDATE (in-place), /R (auto-relaunch installed binary)
        format!(
            r#"$ErrorActionPreference = 'SilentlyContinue'
$pidToWait = {pid}
for ($i = 0; $i -lt 80; $i++) {{
    if (-not (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue)) {{ break }}
    Start-Sleep -Milliseconds 250
}}
Start-Process -FilePath '{installer}' -ArgumentList '/P','/UPDATE','/R'
"#,
            pid = current_pid,
            installer = escaped_installer,
        )
    };

    fs::write(&script_path, ps_script)
        .map_err(|e| format!("Failed to write update helper script: {}", e))?;

    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        &script_path.to_string_lossy(),
    ]);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW);
    cmd.spawn()
        .map_err(|e| format!("Failed to launch installer process: {}", e))?;

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(180)).await;
        app_handle.exit(0);
    });

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn launch_windows_installer_and_exit(app: &AppHandle, installer_path: &Path) -> Result<(), String> {
    let target = installer_path.to_string_lossy().to_string();
    open::that(&target).map_err(|e| format!("Failed to open update installer: {}", e))?;
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(180)).await;
        app_handle.exit(0);
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_compares_semver_variants() {
        assert!(is_newer_version("v2.2.3", "2.2.2"));
        assert!(is_newer_version("2.3.0", "v2.2.9"));
        assert!(is_newer_version("3.0.0", "2.99.99"));
        assert!(!is_newer_version("v2.2.2", "2.2.2"));
        assert!(!is_newer_version("v2.2.1", "2.2.2"));
        assert!(is_newer_version("v2.2.3", "v2.2.3-beta.1"));
        assert!(!is_newer_version("v2.2.3-beta.1", "v2.2.3"));
        assert!(is_newer_version("v2.2.3-beta.2", "v2.2.3-beta.1"));
        assert!(!is_newer_version("invalid", "2.2.2"));
    }

    #[test]
    fn selects_nsis_setup_exe_before_generic_exe_and_msi() {
        let assets = vec![
            GitHubAsset {
                name: "HappyTool Tauri_2.2.3_x64_en-US.msi".to_string(),
                browser_download_url: "https://github.com/sindng-ui/logextractor_rauri/releases/download/v2.2.3/app.msi".to_string(),
                size: 100,
            },
            GitHubAsset {
                name: "HappyTool Tauri_2.2.3_x64-setup.exe".to_string(),
                browser_download_url: "https://github.com/sindng-ui/logextractor_rauri/releases/download/v2.2.3/setup.exe".to_string(),
                size: 200,
            },
        ];

        let selected = select_windows_installer_asset(&assets).unwrap();
        assert_eq!(selected.name, "HappyTool Tauri_2.2.3_x64-setup.exe");
    }

    #[test]
    fn falls_back_to_msi_and_rejects_untrusted_urls() {
        let assets = vec![
            GitHubAsset {
                name: "evil-setup.exe".to_string(),
                browser_download_url: "http://evil.example.com/setup.exe".to_string(),
                size: 100,
            },
            GitHubAsset {
                name: "HappyTool.msi".to_string(),
                browser_download_url: "https://github.com/sindng-ui/logextractor_rauri/releases/download/v2.2.3/HappyTool.msi".to_string(),
                size: 300,
            },
        ];

        let selected = select_windows_installer_asset(&assets).unwrap();
        assert_eq!(selected.name, "HappyTool.msi");
        assert!(!is_allowed_github_url("http://github.com/test"));
        assert!(is_allowed_github_url("https://objects.githubusercontent.com/abc"));
    }

    #[test]
    fn sanitizes_asset_filenames() {
        assert_eq!(
            sanitize_asset_filename("../../bad/path/HappyTool_2.2.3-setup.exe"),
            "HappyTool_2.2.3-setup.exe"
        );
    }
}
