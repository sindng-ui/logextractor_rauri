use super::file_io;
use super::log_engine::{get_cached_filter_matches, get_or_index_file, line_slice_from_offsets};
use super::log_matcher::{strip_ansi_bytes, AsciiPattern};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use tauri::ipc::Response;

const READER_MAX_GAP_BYTES: u64 = 64 * 1024;
const READER_MAX_WINDOW_BYTES: u64 = 4 * 1024 * 1024;

#[inline]
fn line_bounds(offsets: &[u64], file_len: u64, idx: usize) -> Option<(u64, u64)> {
    if idx >= offsets.len() {
        return None;
    }
    let start = offsets[idx];
    if start > file_len {
        return None;
    }
    let end = if idx + 1 < offsets.len() {
        offsets[idx + 1].min(file_len)
    } else {
        file_len
    };
    Some((start, end))
}

#[inline]
fn slice_matches_keyword(
    slice: &[u8],
    ascii_pat: Option<&AsciiPattern>,
    needle_utf8: &str,
    case_sensitive: bool,
) -> bool {
    if let Some(pat) = ascii_pat {
        return pat.matches(slice);
    }
    let text = String::from_utf8_lossy(slice);
    if case_sensitive {
        text.contains(needle_utf8)
    } else {
        text.to_lowercase().contains(needle_utf8)
    }
}

pub fn read_lines_packed_sync(
    path: &str,
    indices: &[u32],
    strip_ansi: bool,
) -> Result<Vec<u8>, String> {
    let (file_len, _mod_ns, offsets) = get_or_index_file(path)?;

    let mut valid_req = Vec::with_capacity(indices.len());
    let mut sorted_unique = Vec::with_capacity(indices.len());
    for &idx in indices {
        if line_bounds(offsets.as_ref(), file_len, idx as usize).is_some() {
            valid_req.push(idx);
            sorted_unique.push(idx);
        }
    }

    if valid_req.is_empty() {
        return Ok(0u32.to_le_bytes().to_vec());
    }

    sorted_unique.sort_unstable();
    sorted_unique.dedup();

    let mut decoded_map: HashMap<u32, Vec<u8>> = HashMap::with_capacity(sorted_unique.len());

    file_io::with_pooled_file(path, |file| {
        let mut buf = Vec::with_capacity(256 * 1024);
        let mut ansi_scratch = Vec::with_capacity(512);
        let mut i = 0usize;

        while i < sorted_unique.len() {
            let (win_start, mut win_end) =
                line_bounds(offsets.as_ref(), file_len, sorted_unique[i] as usize).unwrap();
            let mut j = i + 1;

            while j < sorted_unique.len() {
                let (ls, le) =
                    line_bounds(offsets.as_ref(), file_len, sorted_unique[j] as usize).unwrap();
                if ls.saturating_sub(win_end) <= READER_MAX_GAP_BYTES
                    && le.saturating_sub(win_start) <= READER_MAX_WINDOW_BYTES
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

                let window_has_ansi = strip_ansi && buf.contains(&0x1Bu8);
                for &idx in &sorted_unique[i..j] {
                    let (ls, le) = line_bounds(offsets.as_ref(), file_len, idx as usize).unwrap();
                    let raw = line_slice_from_offsets(&buf, win_start, ls, le);
                    let final_bytes = if window_has_ansi && raw.contains(&0x1Bu8) {
                        strip_ansi_bytes(raw, &mut ansi_scratch);
                        ansi_scratch.clone()
                    } else {
                        raw.to_vec()
                    };
                    decoded_map.insert(idx, final_bytes);
                }
            }

            i = j;
        }
        Ok(())
    })?;

    let approx_bytes = 4 + valid_req.len() * 128;
    let mut out = Vec::with_capacity(approx_bytes);
    out.extend_from_slice(&(valid_req.len() as u32).to_le_bytes());

    for idx in valid_req {
        let bytes = decoded_map.get(&idx).map(|v| v.as_slice()).unwrap_or(&[]);
        out.extend_from_slice(&idx.to_le_bytes());
        out.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
        out.extend_from_slice(bytes);
    }

    Ok(out)
}

#[tauri::command]
pub async fn read_local_lines_by_indices(
    path: String,
    indices: Vec<u32>,
    strip_ansi: bool,
) -> Result<Response, String> {
    let bytes = tokio::task::spawn_blocking(move || {
        read_lines_packed_sync(&path, &indices, strip_ansi)
    })
    .await
    .map_err(|e| format!("Join error in read_local_lines_by_indices: {}", e))??;

    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn read_local_line_range(
    path: String,
    start_line: u32,
    count: u32,
    strip_ansi: bool,
) -> Result<Response, String> {
    let bytes = tokio::task::spawn_blocking(move || {
        let end_line = start_line.saturating_add(count);
        let indices: Vec<u32> = (start_line..end_line).collect();
        read_lines_packed_sync(&path, &indices, strip_ansi)
    })
    .await
    .map_err(|e| format!("Join error in read_local_line_range: {}", e))??;

    Ok(Response::new(bytes))
}

fn merge_sorted_unique_u32(a: &[u32], b: &[u32]) -> Vec<u32> {
    let mut out = Vec::with_capacity(a.len() + b.len());
    let (mut i, mut j) = (0usize, 0usize);
    while i < a.len() && j < b.len() {
        if a[i] < b[j] {
            out.push(a[i]);
            i += 1;
        } else if b[j] < a[i] {
            out.push(b[j]);
            j += 1;
        } else {
            out.push(a[i]);
            i += 1;
            j += 1;
        }
    }
    if i < a.len() {
        out.extend_from_slice(&a[i..]);
    }
    if j < b.len() {
        out.extend_from_slice(&b[j..]);
    }
    out
}

pub fn find_highlight_native_sync(
    path: &str,
    filter_key: Option<&str>,
    bookmarks: Option<&[u32]>,
    keyword: &str,
    start_visual_idx: i64,
    direction: &str,
    case_sensitive: bool,
) -> Result<Value, String> {
    let (file_len, modified_ns, offsets) = get_or_index_file(path)?;

    let merged_owned: Option<Vec<u32>>;
    let cached_arc;
    let candidates: Option<&[u32]> = if let Some(key) = filter_key {
        let Some(found) = get_cached_filter_matches(path, file_len, modified_ns, key) else {
            return Ok(json!({ "supported": false }));
        };
        cached_arc = found;
        if let Some(bm) = bookmarks {
            if bm.is_empty() {
                Some(cached_arc.as_ref().as_slice())
            } else {
                let mut sorted_bm = bm.to_vec();
                sorted_bm.sort_unstable();
                sorted_bm.dedup();
                merged_owned = Some(merge_sorted_unique_u32(cached_arc.as_ref(), &sorted_bm));
                merged_owned.as_deref()
            }
        } else {
            Some(cached_arc.as_ref().as_slice())
        }
    } else {
        None
    };

    if keyword.is_empty() {
        return Ok(json!({ "supported": true, "foundIndex": -1, "originalLineNum": -1 }));
    }

    let total_visual = match candidates {
        Some(c) => c.len(),
        None => offsets.len(),
    };
    if total_visual == 0 {
        return Ok(json!({ "supported": true, "foundIndex": -1, "originalLineNum": -1 }));
    }

    let is_prev = direction == "prev";
    let start_pos: i64 = if is_prev {
        (start_visual_idx - 1).min((total_visual as i64) - 1)
    } else {
        (start_visual_idx + 1).max(0)
    };
    if start_pos < 0 || start_pos >= total_visual as i64 {
        return Ok(json!({ "supported": true, "foundIndex": -1, "originalLineNum": -1 }));
    }

    let ascii_pat = if keyword.is_ascii() {
        Some(AsciiPattern::compile(keyword, case_sensitive))
    } else {
        None
    };
    let needle_utf8 = if ascii_pat.is_some() || case_sensitive {
        keyword.to_string()
    } else {
        keyword.to_lowercase()
    };

    let mut found: Option<(usize, u32)> = None;

    file_io::with_pooled_file(path, |file| {
        let mut buf = Vec::with_capacity(256 * 1024);

        let visual_to_orig = |v: usize| -> u32 {
            match candidates {
                Some(c) => c[v],
                None => v as u32,
            }
        };

        if !is_prev {
            let mut v = start_pos as usize;
            while v < total_visual {
                let first_orig = visual_to_orig(v) as usize;
                let Some((win_start, mut win_end)) = line_bounds(offsets.as_ref(), file_len, first_orig) else {
                    v += 1;
                    continue;
                };
                let mut end_v = v + 1;
                while end_v < total_visual {
                    let orig = visual_to_orig(end_v) as usize;
                    let Some((ls, le)) = line_bounds(offsets.as_ref(), file_len, orig) else {
                        break;
                    };
                    if ls.saturating_sub(win_end) <= READER_MAX_GAP_BYTES
                        && le.saturating_sub(win_start) <= READER_MAX_WINDOW_BYTES
                    {
                        if le > win_end {
                            win_end = le;
                        }
                        end_v += 1;
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

                    for cur_v in v..end_v {
                        let orig = visual_to_orig(cur_v) as usize;
                        if let Some((ls, le)) = line_bounds(offsets.as_ref(), file_len, orig) {
                            let slice = line_slice_from_offsets(&buf, win_start, ls, le);
                            if slice_matches_keyword(
                                slice,
                                ascii_pat.as_ref(),
                                &needle_utf8,
                                case_sensitive,
                            ) {
                                found = Some((cur_v, orig as u32));
                                return Ok(());
                            }
                        }
                    }
                }
                v = end_v;
            }
        } else {
            let mut end_v = (start_pos as usize) + 1;
            while end_v > 0 {
                let last_orig = visual_to_orig(end_v - 1) as usize;
                let Some((mut win_start, win_end)) = line_bounds(offsets.as_ref(), file_len, last_orig) else {
                    end_v -= 1;
                    continue;
                };
                let mut start_v = end_v - 1;
                while start_v > 0 {
                    let orig = visual_to_orig(start_v - 1) as usize;
                    let Some((ls, le)) = line_bounds(offsets.as_ref(), file_len, orig) else {
                        break;
                    };
                    if win_start.saturating_sub(le) <= READER_MAX_GAP_BYTES
                        && win_end.saturating_sub(ls) <= READER_MAX_WINDOW_BYTES
                    {
                        if ls < win_start {
                            win_start = ls;
                        }
                        start_v -= 1;
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

                    for cur_v in (start_v..end_v).rev() {
                        let orig = visual_to_orig(cur_v) as usize;
                        if let Some((ls, le)) = line_bounds(offsets.as_ref(), file_len, orig) {
                            let slice = line_slice_from_offsets(&buf, win_start, ls, le);
                            if slice_matches_keyword(
                                slice,
                                ascii_pat.as_ref(),
                                &needle_utf8,
                                case_sensitive,
                            ) {
                                found = Some((cur_v, orig as u32));
                                return Ok(());
                            }
                        }
                    }
                }
                end_v = start_v;
            }
        }

        Ok(())
    })?;

    match found {
        Some((visual_idx, orig_idx)) => Ok(json!({
            "supported": true,
            "foundIndex": visual_idx,
            "originalLineNum": orig_idx + 1
        })),
        None => Ok(json!({
            "supported": true,
            "foundIndex": -1,
            "originalLineNum": -1
        })),
    }
}

#[tauri::command]
pub async fn find_highlight_native(
    path: String,
    filter_key: Option<String>,
    bookmarks: Option<Vec<u32>>,
    keyword: String,
    start_visual_idx: i64,
    direction: String,
    case_sensitive: bool,
) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || {
        find_highlight_native_sync(
            &path,
            filter_key.as_deref(),
            bookmarks.as_deref(),
            &keyword,
            start_visual_idx,
            &direction,
            case_sensitive,
        )
    })
    .await
    .map_err(|e| format!("Join error in find_highlight_native: {}", e))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::log_engine::filter_log_file_sync;
    use crate::commands::log_matcher::RustFilterRule;

    fn unpack_lines(raw: &[u8]) -> Vec<(u32, String)> {
        assert!(raw.len() >= 4);
        let count = u32::from_le_bytes([raw[0], raw[1], raw[2], raw[3]]) as usize;
        let mut cursor = 4usize;
        let mut out = Vec::with_capacity(count);
        for _ in 0..count {
            let idx = u32::from_le_bytes([
                raw[cursor],
                raw[cursor + 1],
                raw[cursor + 2],
                raw[cursor + 3],
            ]);
            let len = u32::from_le_bytes([
                raw[cursor + 4],
                raw[cursor + 5],
                raw[cursor + 6],
                raw[cursor + 7],
            ]) as usize;
            cursor += 8;
            let text = String::from_utf8_lossy(&raw[cursor..cursor + len]).to_string();
            cursor += len;
            out.push((idx, text));
        }
        out
    }

    #[test]
    fn packed_lines_reads_and_strips_ansi_accurately() {
        let mut tmp = std::env::temp_dir();
        tmp.push(format!("happytool_log_reader_test_{}.log", std::process::id()));
        let path_str = tmp.to_string_lossy().to_string();

        let data = "\x1b[31m01-01 E/Tag: alpha\x1b[0m\r\n01-01 I/Tag: beta\n01-01 D/Tag: gamma 한글";
        std::fs::write(&tmp, data.as_bytes()).expect("write temp file");

        let packed_stripped = read_lines_packed_sync(&path_str, &[2, 0, 2, 99], true).unwrap();
        let rows = unpack_lines(&packed_stripped);
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0], (2, "01-01 D/Tag: gamma 한글".to_string()));
        assert_eq!(rows[1], (0, "01-01 E/Tag: alpha".to_string()));
        assert_eq!(rows[2], (2, "01-01 D/Tag: gamma 한글".to_string()));

        let packed_raw = read_lines_packed_sync(&path_str, &[0], false).unwrap();
        let raw_rows = unpack_lines(&packed_raw);
        assert_eq!(raw_rows[0].1, "\x1b[31m01-01 E/Tag: alpha\x1b[0m");

        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn find_highlight_works_for_identity_and_filtered_prev_next() {
        let mut tmp = std::env::temp_dir();
        tmp.push(format!("happytool_log_find_test_{}.log", std::process::id()));
        let path_str = tmp.to_string_lossy().to_string();

        let data = "line0 apple\nline1 banana\nline2 apple pie\nline3 cherry apple\n";
        std::fs::write(&tmp, data.as_bytes()).expect("write temp file");

        let r_next =
            find_highlight_native_sync(&path_str, None, None, "APPLE", 0, "next", false).unwrap();
        assert_eq!(r_next["supported"], true);
        assert_eq!(r_next["foundIndex"], 2);
        assert_eq!(r_next["originalLineNum"], 3);

        let r_prev =
            find_highlight_native_sync(&path_str, None, None, "APPLE", 3, "prev", false).unwrap();
        assert_eq!(r_prev["foundIndex"], 2);
        assert_eq!(r_prev["originalLineNum"], 3);

        let rule = RustFilterRule {
            quick_filter: Some("none".into()),
            happy_combos_case_sensitive: Some(false),
            block_list_case_sensitive: Some(false),
            excludes: Some(vec![]),
            include_groups: Some(vec![vec!["apple".into()]]),
        };
        let _ = filter_log_file_sync(path_str.clone(), rule, "fk1".into(), None).unwrap();
        let f_next = find_highlight_native_sync(
            &path_str,
            Some("fk1"),
            Some(&[1]),
            "banana",
            0,
            "next",
            false,
        )
        .unwrap();
        assert_eq!(f_next["supported"], true);
        assert_eq!(f_next["foundIndex"], 1);
        assert_eq!(f_next["originalLineNum"], 2);

        let _ = std::fs::remove_file(&tmp);
    }
}
