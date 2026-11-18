use serde::Deserialize;

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RustFilterRule {
    pub quick_filter: Option<String>,
    pub happy_combos_case_sensitive: Option<bool>,
    pub block_list_case_sensitive: Option<bool>,
    pub excludes: Option<Vec<String>>,
    pub include_groups: Option<Vec<Vec<String>>>,
}

#[derive(Clone)]
pub struct AsciiPattern {
    lower: Vec<u8>,
    upper: Vec<u8>,
    bad_char_shift: [u8; 256],
    last_l: u8,
    last_u: u8,
}

impl AsciiPattern {
    pub fn compile(term: &str, case_sensitive: bool) -> Self {
        let raw = term.as_bytes();
        let len = raw.len();
        let mut lower = Vec::with_capacity(len);
        let mut upper = Vec::with_capacity(len);

        for &b in raw {
            if !case_sensitive && b.is_ascii_uppercase() {
                lower.push(b + 32);
                upper.push(b);
            } else if !case_sensitive && b.is_ascii_lowercase() {
                lower.push(b);
                upper.push(b - 32);
            } else {
                lower.push(b);
                upper.push(b);
            }
        }

        let shift_default = len.max(1).min(255) as u8;
        let mut bad_char_shift = [shift_default; 256];
        for k in 0..len.saturating_sub(1) {
            let shift = (len - 1 - k).min(255) as u8;
            bad_char_shift[lower[k] as usize] = shift;
            bad_char_shift[upper[k] as usize] = shift;
        }

        Self {
            last_l: if len > 0 { lower[len - 1] } else { 0 },
            last_u: if len > 0 { upper[len - 1] } else { 0 },
            lower,
            upper,
            bad_char_shift,
        }
    }

    #[inline]
    pub fn matches(&self, buf: &[u8]) -> bool {
        let n_len = self.lower.len();
        if n_len == 0 {
            return true;
        }
        if buf.len() < n_len {
            return false;
        }

        let last_l = self.last_l;
        let last_u = self.last_u;
        if n_len == 1 {
            return buf.iter().any(|&b| b == last_l || b == last_u);
        }

        let n_minus_1 = n_len - 1;
        let mut p = n_minus_1;
        while p < buf.len() {
            let lb = buf[p];
            if lb == last_l || lb == last_u {
                let cand = &buf[p - n_minus_1..p];
                let mut ok = true;
                for k in 0..n_minus_1 {
                    let cb = cand[k];
                    if cb != self.lower[k] && cb != self.upper[k] {
                        ok = false;
                        break;
                    }
                }
                if ok {
                    return true;
                }
            }
            p += self.bad_char_shift[lb as usize] as usize;
        }
        false
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum QuickMode {
    None,
    Error,
    Exception,
}

#[derive(Clone)]
pub struct CompiledRule {
    is_empty: bool,
    quick_mode: QuickMode,
    happy_case: bool,
    block_case: bool,
    excludes: Vec<String>,
    include_groups: Vec<Vec<String>>,
    can_use_ascii_bytes: bool,
    quick_error_pats: Vec<AsciiPattern>,
    quick_exc_pat: AsciiPattern,
    exclude_pats: Vec<AsciiPattern>,
    include_byte_groups: Vec<Vec<AsciiPattern>>,
}

impl CompiledRule {
    pub fn from_payload(rule: &RustFilterRule) -> Self {
        let happy_case = rule.happy_combos_case_sensitive.unwrap_or(false);
        let block_case = rule.block_list_case_sensitive.unwrap_or(false);
        let quick_mode = match rule.quick_filter.as_deref() {
            Some("error") => QuickMode::Error,
            Some("exception") => QuickMode::Exception,
            _ => QuickMode::None,
        };

        let mut excludes = Vec::new();
        if let Some(raw_ex) = &rule.excludes {
            for e in raw_ex {
                let t = e.trim();
                if !t.is_empty() {
                    excludes.push(if block_case { t.to_string() } else { t.to_lowercase() });
                }
            }
        }

        let mut include_groups = Vec::new();
        if let Some(raw_groups) = &rule.include_groups {
            for g in raw_groups {
                let mut grp = Vec::new();
                for term in g {
                    let t = term.trim();
                    if !t.is_empty() {
                        grp.push(if happy_case { t.to_string() } else { t.to_lowercase() });
                    }
                }
                if !grp.is_empty() {
                    include_groups.push(grp);
                }
            }
        }

        let is_empty =
            include_groups.is_empty() && excludes.is_empty() && quick_mode == QuickMode::None;

        let can_use_ascii_bytes = excludes.iter().all(|s| s.is_ascii())
            && include_groups
                .iter()
                .all(|g| g.iter().all(|s| s.is_ascii()));

        let exclude_pats = if can_use_ascii_bytes {
            excludes
                .iter()
                .map(|t| AsciiPattern::compile(t, block_case))
                .collect()
        } else {
            Vec::new()
        };

        let include_byte_groups = if can_use_ascii_bytes {
            include_groups
                .iter()
                .map(|g| {
                    g.iter()
                        .map(|t| AsciiPattern::compile(t, happy_case))
                        .collect()
                })
                .collect()
        } else {
            Vec::new()
        };

        Self {
            is_empty,
            quick_mode,
            happy_case,
            block_case,
            excludes,
            include_groups,
            can_use_ascii_bytes,
            quick_error_pats: vec![
                AsciiPattern::compile(" e/", false),
                AsciiPattern::compile("error", false),
                AsciiPattern::compile("fail", false),
                AsciiPattern::compile("fatal", false),
            ],
            quick_exc_pat: AsciiPattern::compile("exception", false),
            exclude_pats,
            include_byte_groups,
        }
    }

    #[inline]
    pub fn match_line_bytes(
        &self,
        line_bytes: &[u8],
        chunk_has_ansi: bool,
        scratch: &mut Vec<u8>,
    ) -> bool {
        if self.is_empty {
            return true;
        }

        let has_ansi = chunk_has_ansi && line_bytes.contains(&0x1Bu8);
        let clean_bytes: &[u8] = if has_ansi {
            strip_ansi_bytes(line_bytes, scratch);
            scratch.as_slice()
        } else {
            line_bytes
        };

        if self.can_use_ascii_bytes {
            match self.quick_mode {
                QuickMode::Error => {
                    if !self.quick_error_pats.iter().any(|p| p.matches(clean_bytes)) {
                        return false;
                    }
                }
                QuickMode::Exception => {
                    if !self.quick_exc_pat.matches(clean_bytes) {
                        return false;
                    }
                }
                QuickMode::None => {}
            }

            for pat in &self.exclude_pats {
                if pat.matches(clean_bytes) {
                    return false;
                }
            }

            if self.include_byte_groups.is_empty() {
                return true;
            }

            for grp in &self.include_byte_groups {
                if grp.iter().all(|p| p.matches(clean_bytes)) {
                    return true;
                }
            }
            return false;
        }

        let text = String::from_utf8_lossy(clean_bytes);
        let line_ref = text.as_ref();
        let mut lower_cached: Option<String> = None;

        match self.quick_mode {
            QuickMode::Error => {
                let lower = lower_cached.get_or_insert_with(|| line_ref.to_lowercase());
                if !lower.contains(" e/")
                    && !lower.contains("error")
                    && !lower.contains("fail")
                    && !lower.contains("fatal")
                {
                    return false;
                }
            }
            QuickMode::Exception => {
                let lower = lower_cached.get_or_insert_with(|| line_ref.to_lowercase());
                if !lower.contains("exception") {
                    return false;
                }
            }
            QuickMode::None => {}
        }

        if !self.excludes.is_empty() {
            let target = if self.block_case {
                line_ref
            } else {
                lower_cached
                    .get_or_insert_with(|| line_ref.to_lowercase())
                    .as_str()
            };
            for ex in &self.excludes {
                if target.contains(ex.as_str()) {
                    return false;
                }
            }
        }

        if self.include_groups.is_empty() {
            return true;
        }

        let target = if self.happy_case {
            line_ref
        } else {
            lower_cached
                .get_or_insert_with(|| line_ref.to_lowercase())
                .as_str()
        };
        self.include_groups
            .iter()
            .any(|g| g.iter().all(|term| target.contains(term.as_str())))
    }
}

/// Strips `/\x1B\[[0-9;]*[a-zA-Z]/g` byte-for-byte
pub fn strip_ansi_bytes(input: &[u8], out: &mut Vec<u8>) {
    out.clear();
    let len = input.len();
    let mut i = 0;
    while i < len {
        if input[i] == 0x1B && i + 1 < len && input[i + 1] == b'[' {
            let mut j = i + 2;
            while j < len && (input[j].is_ascii_digit() || input[j] == b';') {
                j += 1;
            }
            if j < len && input[j].is_ascii_alphabetic() {
                i = j + 1;
                continue;
            }
        }
        out.push(input[i]);
        i += 1;
    }
}
