use super::log_matcher::{CompiledRule, RustFilterRule};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::UNIX_EPOCH;
use tauri::ipc::Response;

const INDEX_CACHE_MAX_FILES: usize = 4;
const FILTER_CACHE_MAX_ENTRIES: usize = 16;
const MAX_CACHED_MATCHES: usize = 5_000_000;
const INDEX_CHUNK_BYTES: usize = 4 * 1024 * 1024;
const FILTER_CHUNK_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone)]
struct CachedIndex {
    path: String,
    file_len: u64,
    modified_ns: u128,
    offsets: Arc<Vec<u64>>,
}

#[derive(Clone)]
struct CachedFilter {
    path: String,
    file_len: u64,
    modified_ns: u128,
    snapshot_key: String,
    matches: Arc<Vec<u32>>,
}

static INDEX_CACHE: OnceLock<Mutex<Vec<CachedIndex>>> = OnceLock::new();
static FILTER_CACHE: OnceLock<Mutex<Vec<CachedFilter>>> = OnceLock::new();

fn get_index_cache() -> &'static Mutex<Vec<CachedIndex>> {
    INDEX_CACHE.get_or_init(|| Mutex::new(Vec::with_capacity(INDEX_CACHE_MAX_FILES)))
}

fn get_filter_cache() -> &'static Mutex<Vec<CachedFilter>> {
    FILTER_CACHE.get_or_init(|| Mutex::new(Vec::with_capacity(FILTER_CACHE_MAX_ENTRIES)))
}

fn stat_file_identity(path: &str) -> Result<(u64, u128), String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("Failed to stat {}: {}", path, e))?;
    let file_len = meta.len();
    let modified_ns = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    Ok((file_len, modified_ns))
}

/// SWAR 8-byte parallel newline scanner matching `chunk.indexOf(10)` byte-for-byte
#[inline]
fn scan_newlines_swar(buf: &[u8], base_offset: u64, out: &mut Vec<u64>) {
    const LF_BROADCAST: u64 = 0x0A0A_0A0A_0A0A_0A0A;
    const LO_BITS: u64 = 0x0101_0101_0101_0101;
    const HI_BITS: u64 = 0x8080_8080_8080_8080;

    let mut i = 0usize;
    let len = buf.len();
    while i + 8 <= len {
        let word = u64::from_le_bytes([
            buf[i],
            buf[i + 1],
            buf[i + 2],
            buf[i + 3],
            buf[i + 4],
            buf[i + 5],
            buf[i + 6],
            buf[i + 7],
        ]);
        let xored = word ^ LF_BROADCAST;
        let has_zero = xored.wrapping_sub(LO_BITS) & !xored & HI_BITS;
        if has_zero != 0 {
            for lane in 0..8 {
                if buf[i + lane] == b'\n' {
                    out.push(base_offset + (i + lane) as u64 + 1);
                }
            }
        }
        i += 8;
    }
    while i < len {
        if buf[i] == b'\n' {
            out.push(base_offset + i as u64 + 1);
        }
        i += 1;
    }
}

fn index_range(path: &str, start: u64, end: u64) -> Result<Vec<u64>, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open {}: {}", path, e))?;
    file.seek(SeekFrom::Start(start))
        .map_err(|e| format!("Failed to seek {}: {}", path, e))?;

    let span = end.saturating_sub(start) as usize;
    let mut offsets = Vec::with_capacity(span / 96 + 64);
    let mut buf = vec![0u8; INDEX_CHUNK_BYTES.min(span.max(1))];
    let mut cursor = start;

    while cursor < end {
        let to_read = buf.len().min((end - cursor) as usize);
        let n = file
            .read(&mut buf[..to_read])
            .map_err(|e| format!("Failed reading {}: {}", path, e))?;
        if n == 0 {
            break;
        }
        scan_newlines_swar(&buf[..n], cursor, &mut offsets);
        cursor += n as u64;
    }
    Ok(offsets)
}

pub fn get_or_index_file(path: &str) -> Result<(u64, u128, Arc<Vec<u64>>), String> {
    let (file_len, modified_ns) = stat_file_identity(path)?;

    if let Ok(cache) = get_index_cache().lock() {
        if let Some(hit) = cache
            .iter()
            .find(|c| c.path == path && c.file_len == file_len && c.modified_ns == modified_ns)
        {
            return Ok((file_len, modified_ns, Arc::clone(&hit.offsets)));
        }
    }

    let offsets: Vec<u64> = if file_len == 0 {
        vec![0u64]
    } else if file_len < 4 * 1024 * 1024 {
        let mut out = Vec::with_capacity((file_len as usize) / 96 + 16);
        out.push(0u64);
        let part = index_range(path, 0, file_len)?;
        out.extend_from_slice(&part);
        out
    } else {
        let threads = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            .clamp(1, 12);
        let chunk_span = (file_len + threads as u64 - 1) / threads as u64;
        let parts: Vec<Result<Vec<u64>, String>> = std::thread::scope(|s| {
            let mut handles = Vec::with_capacity(threads);
            for t in 0..threads {
                let s_off = t as u64 * chunk_span;
                if s_off >= file_len {
                    break;
                }
                let e_off = ((t as u64 + 1) * chunk_span).min(file_len);
                handles.push(s.spawn(move || index_range(path, s_off, e_off)));
            }
            handles.into_iter().map(|h| h.join().unwrap()).collect()
        });

        let mut total_hits = 1usize;
        let mut unwrapped = Vec::with_capacity(parts.len());
        for p in parts {
            let v = p?;
            total_hits += v.len();
            unwrapped.push(v);
        }

        let mut merged = Vec::with_capacity(total_hits);
        merged.push(0u64);
        for v in unwrapped {
            merged.extend_from_slice(&v);
        }
        merged
    };

    let arc_offsets = Arc::new(offsets);
    if let Ok(mut cache) = get_index_cache().lock() {
        cache.retain(|c| c.path != path);
        if cache.len() >= INDEX_CACHE_MAX_FILES {
            cache.remove(0);
        }
        cache.push(CachedIndex {
            path: path.to_string(),
            file_len,
            modified_ns,
            offsets: Arc::clone(&arc_offsets),
        });
    }

    Ok((file_len, modified_ns, arc_offsets))
}

#[tauri::command]
pub async fn index_log_file(path: String) -> Result<Response, String> {
    let bytes = tokio::task::spawn_blocking(move || {
        let (_len, _mod_ns, offsets) = get_or_index_file(&path)?;
        let mut out = Vec::with_capacity(offsets.len() * 8);
        for &off in offsets.iter() {
            out.extend_from_slice(&off.to_le_bytes());
        }
        Ok::<Vec<u8>, String>(out)
    })
    .await
    .map_err(|e| format!("Join error in index_log_file: {}", e))??;

    Ok(Response::new(bytes))
}

#[inline]
fn line_slice_from_offsets<'a>(
    buf: &'a [u8],
    chunk_base: u64,
    line_start: u64,
    next_line_start: u64,
) -> &'a [u8] {
    let rel_start = (line_start - chunk_base) as usize;
    let mut rel_end = (next_line_start - chunk_base) as usize;
    if rel_end > buf.len() {
        rel_end = buf.len();
    }
    if rel_end > rel_start && buf[rel_end - 1] == b'\n' {
        rel_end -= 1;
    }
    if rel_end > rel_start && buf[rel_end - 1] == b'\r' {
        rel_end -= 1;
    }
    if rel_start <= rel_end {
        &buf[rel_start..rel_end]
    } else {
        &[]
    }
}

fn scan_full_line_range(
    path: &str,
    offsets: &[u64],
    file_len: u64,
    start_line: usize,
    end_line: usize,
    compiled: &CompiledRule,
) -> Result<Vec<u32>, String> {
    if start_line >= end_line {
        return Ok(Vec::new());
    }

    let mut file = File::open(path).map_err(|e| format!("Failed to open {}: {}", path, e))?;
    let mut matches = Vec::new();
    let mut buf = Vec::with_capacity(FILTER_CHUNK_BYTES);
    let mut ansi_scratch = Vec::with_capacity(512);
    let total_offsets = offsets.len();

    let mut batch_start = start_line;
    while batch_start < end_line {
        let base_byte = offsets[batch_start];
        let mut batch_end = batch_start + 1;
        while batch_end < end_line {
            let next_end_byte = if batch_end + 1 < total_offsets {
                offsets[batch_end + 1]
            } else {
                file_len
            };
            if next_end_byte.saturating_sub(base_byte) > FILTER_CHUNK_BYTES as u64 {
                break;
            }
            batch_end += 1;
        }

        let end_byte = if batch_end < total_offsets {
            offsets[batch_end]
        } else {
            file_len
        };
        let span = end_byte.saturating_sub(base_byte) as usize;

        if span > 0 {
            buf.resize(span, 0);
            file.seek(SeekFrom::Start(base_byte))
                .map_err(|e| format!("Seek failed in {}: {}", path, e))?;
            let mut total_read = 0usize;
            while total_read < span {
                match file.read(&mut buf[total_read..span]) {
                    Ok(0) => break,
                    Ok(n) => total_read += n,
                    Err(e) => return Err(format!("Read failed in {}: {}", path, e)),
                }
            }
            buf.truncate(total_read);

            let chunk_has_ansi = buf.contains(&0x1Bu8);
            for idx in batch_start..batch_end {
                let ls = offsets[idx];
                if ls >= file_len {
                    break;
                }
                let next_ls = if idx + 1 < total_offsets {
                    offsets[idx + 1]
                } else {
                    file_len
                };
                let slice = line_slice_from_offsets(&buf, base_byte, ls, next_ls);
                if compiled.match_line_bytes(slice, chunk_has_ansi, &mut ansi_scratch) {
                    matches.push(idx as u32);
                }
            }
        }
        batch_start = batch_end;
    }

    Ok(matches)
}

fn scan_candidates(
    path: &str,
    offsets: &[u64],
    file_len: u64,
    candidates: &[u32],
    compiled: &CompiledRule,
) -> Result<Vec<u32>, String> {
    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    let total_offsets = offsets.len();
    let max_gap = 32 * 1024u64;
    let max_window = 4 * 1024 * 1024u64;

    let mut file = File::open(path).map_err(|e| format!("Failed to open {}: {}", path, e))?;
    let mut matches = Vec::new();
    let mut buf = Vec::with_capacity(256 * 1024);
    let mut ansi_scratch = Vec::with_capacity(512);

    let mut i = 0usize;
    while i < candidates.len() {
        let first_idx = candidates[i] as usize;
        if first_idx >= total_offsets {
            i += 1;
            continue;
        }
        let win_start = offsets[first_idx];
        let mut win_end = if first_idx + 1 < total_offsets {
            offsets[first_idx + 1]
        } else {
            file_len
        };
        let mut j = i + 1;
        while j < candidates.len() {
            let idx = candidates[j] as usize;
            if idx >= total_offsets {
                break;
            }
            let ls = offsets[idx];
            let le = if idx + 1 < total_offsets {
                offsets[idx + 1]
            } else {
                file_len
            };
            if ls.saturating_sub(win_end) <= max_gap && le.saturating_sub(win_start) <= max_window
            {
                if le > win_end {
                    win_end = le;
                }
                j += 1;
            } else {
                break;
            }
        }

        let span = win_end.saturating_sub(win_start) as usize;
        if span > 0 {
            buf.resize(span, 0);
            file.seek(SeekFrom::Start(win_start))
                .map_err(|e| format!("Seek failed in {}: {}", path, e))?;
            let mut total_read = 0usize;
            while total_read < span {
                match file.read(&mut buf[total_read..span]) {
                    Ok(0) => break,
                    Ok(n) => total_read += n,
                    Err(e) => return Err(format!("Read failed in {}: {}", path, e)),
                }
            }
            buf.truncate(total_read);

            let chunk_has_ansi = buf.contains(&0x1Bu8);
            for &raw_idx in &candidates[i..j] {
                let idx = raw_idx as usize;
                let ls = offsets[idx];
                if ls >= file_len {
                    continue;
                }
                let next_ls = if idx + 1 < total_offsets {
                    offsets[idx + 1]
                } else {
                    file_len
                };
                let slice = line_slice_from_offsets(&buf, win_start, ls, next_ls);
                if compiled.match_line_bytes(slice, chunk_has_ansi, &mut ansi_scratch) {
                    matches.push(raw_idx);
                }
            }
        }

        i = j;
    }

    Ok(matches)
}

pub fn filter_log_file_sync(
    path: String,
    rule: RustFilterRule,
    snapshot_key: String,
    parent_key: Option<String>,
) -> Result<Vec<u32>, String> {
    let (file_len, modified_ns, offsets) = get_or_index_file(&path)?;

    if let Ok(cache) = get_filter_cache().lock() {
        if let Some(hit) = cache.iter().find(|e| {
            e.path == path
                && e.file_len == file_len
                && e.modified_ns == modified_ns
                && e.snapshot_key == snapshot_key
        }) {
            return Ok(hit.matches.as_ref().clone());
        }
    }

    let parent_candidates: Option<Arc<Vec<u32>>> = if let Some(pk) = &parent_key {
        get_filter_cache().lock().ok().and_then(|cache| {
            cache
                .iter()
                .find(|e| {
                    e.path == path
                        && e.file_len == file_len
                        && e.modified_ns == modified_ns
                        && &e.snapshot_key == pk
                })
                .map(|e| Arc::clone(&e.matches))
        })
    } else {
        None
    };

    let compiled = CompiledRule::from_payload(&rule);

    let result_matches: Vec<u32> = if let Some(candidates) = parent_candidates {
        if candidates.len() > 8192 {
            let threads = std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(4)
                .clamp(1, 8);
            let slice_len = (candidates.len() + threads - 1) / threads;
            let parts: Vec<Result<Vec<u32>, String>> = std::thread::scope(|s| {
                let mut handles = Vec::new();
                for chunk in candidates.chunks(slice_len) {
                    let p = &path;
                    let offs = offsets.as_ref();
                    let comp = &compiled;
                    handles.push(s.spawn(move || scan_candidates(p, offs, file_len, chunk, comp)));
                }
                handles.into_iter().map(|h| h.join().unwrap()).collect()
            });
            let mut merged = Vec::new();
            for p in parts {
                merged.extend_from_slice(&p?);
            }
            merged
        } else {
            scan_candidates(&path, offsets.as_ref(), file_len, &candidates, &compiled)?
        }
    } else {
        let total_lines = offsets.len();
        if total_lines == 0 {
            Vec::new()
        } else if file_len < 4 * 1024 * 1024 {
            scan_full_line_range(&path, offsets.as_ref(), file_len, 0, total_lines, &compiled)?
        } else {
            let threads = std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(4)
                .clamp(1, 12);
            let lines_per_thread = (total_lines + threads - 1) / threads;
            let parts: Vec<Result<Vec<u32>, String>> = std::thread::scope(|s| {
                let mut handles = Vec::new();
                let mut start = 0usize;
                while start < total_lines {
                    let end = (start + lines_per_thread).min(total_lines);
                    let p = &path;
                    let offs = offsets.as_ref();
                    let comp = &compiled;
                    handles.push(s.spawn(move || {
                        scan_full_line_range(p, offs, file_len, start, end, comp)
                    }));
                    start = end;
                }
                handles.into_iter().map(|h| h.join().unwrap()).collect()
            });
            let mut total_count = 0usize;
            let mut unwrapped = Vec::with_capacity(parts.len());
            for p in parts {
                let v = p?;
                total_count += v.len();
                unwrapped.push(v);
            }
            let mut merged = Vec::with_capacity(total_count);
            for v in unwrapped {
                merged.extend_from_slice(&v);
            }
            merged
        }
    };

    if result_matches.len() <= MAX_CACHED_MATCHES {
        if let Ok(mut cache) = get_filter_cache().lock() {
            cache.retain(|e| {
                !(e.path == path
                    && e.file_len == file_len
                    && e.modified_ns == modified_ns
                    && e.snapshot_key == snapshot_key)
            });
            if cache.len() >= FILTER_CACHE_MAX_ENTRIES {
                cache.remove(0);
            }
            cache.push(CachedFilter {
                path,
                file_len,
                modified_ns,
                snapshot_key,
                matches: Arc::new(result_matches.clone()),
            });
        }
    }

    Ok(result_matches)
}

#[tauri::command]
pub async fn filter_log_file(
    path: String,
    rule: RustFilterRule,
    snapshot_key: String,
    parent_key: Option<String>,
) -> Result<Response, String> {
    let bytes = tokio::task::spawn_blocking(move || {
        let matches = filter_log_file_sync(path, rule, snapshot_key, parent_key)?;
        let mut out = Vec::with_capacity(matches.len() * 4);
        for &m in &matches {
            out.extend_from_slice(&m.to_le_bytes());
        }
        Ok::<Vec<u8>, String>(out)
    })
    .await
    .map_err(|e| format!("Join error in filter_log_file: {}", e))??;

    Ok(Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn swar_matches_exact_newline_positions() {
        let text = b"0123456\nabc\ndefghijk\n\r\nlast line";
        let mut offsets = vec![0u64];
        scan_newlines_swar(text, 0, &mut offsets);

        let mut expected = vec![0u64];
        for (i, &b) in text.iter().enumerate() {
            if b == b'\n' {
                expected.push((i + 1) as u64);
            }
        }
        assert_eq!(offsets, expected);
    }

    #[test]
    fn native_filter_matches_ascii_utf8_ansi_and_incremental_parent() {
        let mut tmp = std::env::temp_dir();
        tmp.push(format!("happytool_log_engine_test_{}.log", std::process::id()));
        let path_str = tmp.to_string_lossy().to_string();

        let data = concat!(
            "03-03 I InputMethod: Vibrator ignored\r\n",
            "\x1b[31m03-03 E/InputMethod: Vibrator started for process 5678\x1b[0m\r\n",
            "03-03 I InputMethod: 한글 started for process 9999\r\n",
            "03-03 D InputMethod: Vibrator started blocked_tag\r\n",
            "03-03 D Bluetooth: unrelated noise\r\n",
        );
        std::fs::write(&tmp, data.as_bytes()).expect("write temp file");

        let r1 = RustFilterRule {
            quick_filter: Some("none".into()),
            happy_combos_case_sensitive: Some(false),
            block_list_case_sensitive: Some(false),
            excludes: Some(vec!["blocked_tag".into()]),
            include_groups: Some(vec![vec!["input".into()]]),
        };
        let m1 = filter_log_file_sync(path_str.clone(), r1, "k1".into(), None).unwrap();
        assert_eq!(m1, vec![0, 1, 2]);

        let r2 = RustFilterRule {
            quick_filter: Some("error".into()),
            happy_combos_case_sensitive: Some(false),
            block_list_case_sensitive: Some(false),
            excludes: Some(vec!["blocked_tag".into()]),
            include_groups: Some(vec![vec!["input".into(), "process".into()]]),
        };
        let m2 = filter_log_file_sync(path_str.clone(), r2, "k2".into(), Some("k1".into())).unwrap();
        assert_eq!(m2, vec![1]);

        let r3 = RustFilterRule {
            quick_filter: Some("none".into()),
            happy_combos_case_sensitive: Some(false),
            block_list_case_sensitive: Some(false),
            excludes: Some(vec![]),
            include_groups: Some(vec![vec!["한글".into(), "process".into()]]),
        };
        let m3 = filter_log_file_sync(path_str.clone(), r3, "k3".into(), Some("k1".into())).unwrap();
        assert_eq!(m3, vec![2]);

        let _ = std::fs::remove_file(&tmp);
    }
}
