# HappyTool 성능 최적화 연대기 (Performance History) 🚀🐧💎

형님! 우리 HappyTool이 어떻게 "쫀득한 성능"을 갖추게 되었는지, 그 치열했던 최적화의 기록입니다. 이 문서는 중요 폴더(`important/`)에 보관되어 미래의 성능 개선을 위한 나침반 역할을 할 것입니다.

---

## 📅 [2026.01.30] 성능 전체 감사 (Performance Audit) 🔍
앱 초기 버전의 병목 지점을 최초로 진단하고 개선 방향을 수립한 시점입니다.
- **주요 진단**:
    - 실시간 스트리밍 시 메모리 누수 및 초당 수십 번의 과도한 리렌더링 감지.
    - Worker-Main 스레드 간 문자열 기반의 무거운 통신 오버헤드 확인.
    - `localStorage` 동기 쓰기로 인한 UI 미세 프리징 발견.
- **성과**: 모든 최적화 작업의 로드맵이 된 [PERFORMANCE_AUDIT_2026.md](../PERFORMANCE_AUDIT_2026.md) 작성.

## 📅 [2026.02.10] WASM & 병렬 엔진 도입 (Multi-Core Filtering) 🦀
JS의 한계를 넘어서기 위해 Rust 기반의 WASM 엔진과 멀티 워커 시스템을 구축했습니다.
- **기술 스택**: Rust + WASM (`happy_filter.wasm`), Worker Pool (4~8개Sub-workers).
- **최적화 내용**:
    - **100만 행 필터링 0.5초 이내** 달성 (WASM 모드).
    - 멀티코어를 활용한 청크 단위 분할 필터링으로 CPU 자원 극대화.
- **효과**: 대규모 로그 검색 시 UI 멈춤 현상(Jank) 완전히 제거.

## 📅 [2026.02.16] 하이퍼 캔버스 렌더링 (Hyper-Canvas) 🎨
수백만 줄의 로그를 60fps로 부드럽게 보여주기 위한 렌더링 혁신을 단행했습니다.
- **주요 기법**:
    - **Dual-Layer Canvas**: 배경(정적)과 텍스트(동적) 레이어를 분리하여 드로우 콜 최적화.
    - **Monospaced Cache**: 폰트 너비 계산 비용을 0으로 만듦.
    - **Virtual Scrolling (Virtuoso)**: 화면에 보이는 영역만 캔버스에 즉시 드로잉.
- **효과**: "쫀득한 스크롤(Chewy-Scrolling)" 지수 Max 도달.

## 📅 [2026.02.25] 바이너리 인덱싱 & 일괄 I/O (I/O Optimization) 📂
1GB가 넘는 대용량 파일도 1초 만에 열 수 있도록 입출력 구조를 개편했습니다.
- **최적화 내용**:
    - **Binary Indexing**: `Uint8Array` 상태에서 네이티브 `indexOf`로 뉴라인 파싱 (JS 대비 10배 빠름).
    - **Batch Read Strategy**: 한 줄씩 읽던 방식을 거대 Blob 일괄 읽기 후 `TextDecoder`로 변환하는 방식으로 변경 (I/O 오버헤드 99% 제거).
    - **BigInt64Array**: 4GB 이상 파일도 안전하게 주소 지정 가능.

## 📅 [2026.03.02] 메모리 다이어트 1단계: 바이너리 저장소 (Binary-First) 💎
로그 데이터를 메모리에서 가장 효율적으로 다루기 위한 "바이너리 저장소" 체제로 전환했습니다.
- **최적화 내용**:
    - **바이너리 저장소 이식**: 로그 원문을 `string[]` 대신 단일 대형 `Uint8Array`에 보관하여 문자열 객체 오버헤드 제거.
    - **SharedArrayBuffer 활용**: 메인과 워커가 데이터를 복사 없이 즉시 공유(Zero-copy)하는 기반 마련.
    - **GC 부하 소탕**: 수십만 개의 문자열 객체 생성을 막아 가비지 컬렉터의 간섭 최소화.
- **효과**: **RAM 사용량 최대 50% 절감** 및 대용량 데이터 처리 기초 체력 확보.

## 📅 [2026.03.02] 메모리 다이어트 2단계: WASM 스트리밍 필터 (WASM Streaming Filter) ⚡
스트리밍 환경에서도 최고 속도의 필터링을 유지하기 위해 WASM 엔진을 스트리밍 데이터에 직접 연결했습니다.
- **최적화 내용**:
    - **바이너리 직접 필터링**: `Blob` 생성 없이 `SharedArrayBuffer`의 바이너리 데이터를 WASM 엔진이 직접 스캔.
    - **Zero-copy 스트리밍**: 네트워크나 파일에서 들어오는 청크를 메모리 복사 없이 즉시 인덱싱 및 필터링.
    - **워커 렌더링 최적화**: 필터링 결과를 SharedArrayBuffer로 공유하여 메인 스레드 부하를 최소화.
- **효과**: 10MB 이상의 로그 스트리밍 시에도 **UI 응답성 0.1s 이하 유지** 및 필터 변경 시 즉각 반응 달성.

## 📅 [2026.11.19] v2.0.0 퀀텀 점프: Tauri Native Rust SWAR/BMH 엔진 & Zero-Offset 메모리 다이어트 🦀⚡
Electron 시대의 JS Blob/SubWorker 구조를 완전히 대체하여, 1GB+ 대용량 파일 오픈·초기 필터링 속도 및 RAM 점유율을 세대 교체 수준으로 끌어올린 **v2.0.0 메이저 엔진 혁신**입니다.

- **실패 교훈 (반드시 경계할 안티패턴)**:
  - 초기 로컬 파일 IPC 방식(`INIT_LOCAL_FILE_STREAM` + 50MB 청크 RPC `readFileSegment`)은 1GB 로그를 Worker ↔ Main ↔ Tauri `invoke` ↔ Rust로 매번 왕복 전송하여, 필터 단어 추가마다 **단어당 ~5초 지연**(모수 축소 효과 상실) 및 파일 오픈 지연을 유발함.
- **엔진 전면 교체 (`src-tauri/src/commands/log_engine.rs`, `log_matcher.rs`, `log_reader.rs`)**:
  - **SWAR 8-Byte 병렬 개행 인덱서 (`index_log_file_meta`)**: 최대 12개 OS 스레드(`std::thread::scope`)가 4MB 고정 버퍼로 `u64::from_le_bytes` + `0x0A0A...` 비트 마스크 스캔을 수행하고 Rust `INDEX_CACHE`에만 보관. JS로는 `{ totalLines, fileSize }` 메타데이터(16바이트)만 반환.
  - **100% Rust 내부 멀티코어 BMH 필터링 (`filter_log_file`)**: WebView/JS로 1GB 바이트가 전혀 넘어가지 않으며, 순수 ASCII 키워드는 UTF-8 디코딩/힙 할당 없이 256-entry Boyer-Moore-Horspool 바이트 점프 스캔 + 청크 단위 `ESC(0x1B)` ANSI Fast-Path 적용. 매칭된 `u32` 줄 번호만 `tauri::ipc::Response` 단일 바이너리로 반환.
  - **증분 후보 병합 스캔 (`scan_candidates`, `FILTER_CACHE`)**: `parent_key` 기반 32KB gap / 4MB window coalescing으로 2·3번째 단어 추가 시 즉시 반응.
  - **Lock-free 핸들 풀 & 배치 리더 (`file_io.rs`, `log_reader.rs`)**: 경로당 최대 16개 파일 핸들 풀링 + `read_local_lines_by_indices` / `read_local_line_range` / `find_highlight_native` + `GET_PERFORMANCE_HEATMAP` 1회 배치 읽기로 초기 화면 렌더 및 스크롤/검색 최적화.
- **메모리 다이어트 Phase 1~3 (`workerIndexView.ts`, `LogWorkerRegistry.ts`)**:
  - **Lazy SAB**: 파일 모드에서 `80MB` `indexSharedBuffer` Eager 할당 제거 (`allocateStreamBuffers` 내부 지연 이동).
  - **Virtual Identity View (`0MB`)**: 필터 미적용 시 `0..N-1` 배열 커밋 제거.
  - **JS `lineOffsets` & 중복 캐시 제거**: JS 워커에서 `40–80MB` 오프셋 배열 보유 제거(히스토그램/전체복사 등 희소 분석 패널 오픈 시에만 `ensureLocalOffsetsLoaded` 지연 로드), >10만 매치 필터 캐시 JS 중복 보관 생략, `evict_log_cache`로 탭 종료/전환 시 즉시 회수, `INDEX_CACHE_MAX_FILES=2` / `FILTER_CACHE` 128MB·8-entry LRU 상한 적용.
- **작업 관리자 실측 비교 (Windows Release 기준, 1GB 로그파일)**:
  - **빈 앱 실행**: Electron `254.3MB` → v2.0.0 Tauri **`189.4MB`** (`WebView2 181.6MB` + `Rust 7.8MB`)
  - **1GB 로드 후**: Electron `538.1MB` (`+283.8MB`) / 최적화 전 Tauri `541.5MB` (`WebView2 +158.5MB`) → v2.0.0 Tauri **`293.2MB`** (`WebView2 176.9MB [증가 0MB]` + `Rust 116.3MB`, CPU `0%`)
  - **1단어 필터링 후**: Electron `659.2MB` → v2.0.0 Tauri **`305.9MB`** (`WebView2 182.1MB` + `Rust 123.8MB`, CPU `0%`)

---

## 🔮 향후 과제 (Next Mission)
1. **메모리 다이어트 3단계 (RAM Capping & IndexedDB)**: 2GB 이상의 초거대 로그 대응을 위한 RAM 점유율 상한제 도입 (보류 중).
2. **OffscreenCanvas 도입**: 렌더링 자체를 워커로 넘겨 메인 UI 스레드 점유율 0% 도전.
3. **Pure-WASM 영역 확대**: 모든 복잡한 데이터 파싱 로직을 WASM 내부에서 완결.

---
**형님! 성능은 양보할 수 없는 우리의 자존심입니다! 🐧🚀🥊**
