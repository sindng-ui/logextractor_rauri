use wasm_bindgen::prelude::*;
use aho_corasick::{AhoCorasick, AhoCorasickBuilder, MatchKind};

#[wasm_bindgen]
pub struct FilterEngine {
    ac: Option<AhoCorasick>,
    case_sensitive: bool,
    shared_buffer: Vec<u8>,
}

#[wasm_bindgen]
impl FilterEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(case_sensitive: bool) -> Self {
        FilterEngine {
            ac: None,
            case_sensitive,
            shared_buffer: Vec::with_capacity(1024 * 1024), // 1MB 초기 버퍼
        }
    }

    pub fn get_buffer_ptr(&self) -> *const u8 {
        self.shared_buffer.as_ptr()
    }

    pub fn reserve_buffer(&mut self, size: usize) {
        if self.shared_buffer.capacity() < size {
            self.shared_buffer.reserve(size - self.shared_buffer.len());
        }
        unsafe { self.shared_buffer.set_len(size); }
    }

    pub fn update_keywords(&mut self, keywords: JsValue) -> Result<(), JsValue> {
        let raw_keywords: Vec<String> = serde_wasm_bindgen::from_value(keywords)?;
        
        let processed_keywords: Vec<String> = raw_keywords.into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .map(|s| if self.case_sensitive { s } else { s.to_lowercase() })
            .collect();

        if processed_keywords.is_empty() {
            self.ac = None;
            return Ok(());
        }

        // ✅ Lazy DFA 스타일 최적화 (aho-corasick 1.0 기본은 NFA이나, 내부적으로 DFA를 하이브리드로 사용)
        // 빌더 설정을 명시적으로 하여 검색 속도를 극대화합니다.
        let ac = AhoCorasickBuilder::new()
            .match_kind(MatchKind::LeftmostFirst)
            .prefilter(true)       // SIMD 가속기 등 사용
            .build(&processed_keywords)
            .map_err(|e| JsValue::from_str(&format!("AC build error: {}", e)))?;

        self.ac = Some(ac);
        Ok(())
    }

    /// ✅ Zero-copy Match: 메모리 복사 없이 버퍼 직접 참조
    pub fn check_match_ptr(&self, len: usize) -> bool {
        let ac = match &self.ac {
            Some(ac) => ac,
            None => return true,
        };

        let data = &self.shared_buffer[..len];
        
        if self.case_sensitive {
            ac.find(data).is_some()
        } else {
            // 소문자 변환이 필요한 경우 이 부분에서만 복사 발생 (DFA의 한계)
            // 대규모 로그에서는 애초에 키워드와 로그를 소문자화해두는 것이 유리합니다.
            let target = String::from_utf8_lossy(data).to_lowercase();
            ac.find(target.as_bytes()).is_some()
        }
    }

    pub fn check_match(&self, text: &str) -> bool {
        let ac = match &self.ac {
            Some(ac) => ac,
            None => return true,
        };

        if self.case_sensitive {
            ac.find(text.as_bytes()).is_some()
        } else {
            ac.find(text.to_lowercase().as_bytes()).is_some()
        }
    }
}
