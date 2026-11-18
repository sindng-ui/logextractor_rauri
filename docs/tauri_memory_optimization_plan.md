# Tauri 대용량 로그 메모리 최적화 구현 계획서

## 1. 배경 및 진단 결과 (현재 코드 기반)

작업 관리자 실측(1GB 파일 로드 기준: Electron `538.1MB` vs Tauri+WebView2 `541.5MB`, 로드 전후 WebView2 `+158.4MB` 증가)을 코드와 대조한 결과, 다음 4가지가 실제 RAM 점유의 핵심 원인입니다.

1. **워커 시작 시 `80MB` `indexSharedBuffer` 즉시 할당 + 빈 필터 시 물리 RAM 커밋**
   - `workers/LogProcessor.worker.ts` 최상단에서 `MAX_LINES = 20_000_000` (`4바이트 × 2,000만 = 80MB`) 크기의 `SharedArrayBuffer`/`ArrayBuffer`를 무조건 할당합니다.
   - 파일 오픈 직후 `0..lineCount-1`을 루프로 채워 넣으면서(`filteredIndicesBuffer[i] = i`), 필터가 없는 상태에서도 최대 `80MB` 가상 메모리가 실제 물리 Working Set으로 커밋됩니다.
   - 반면 UI(`components/LogViewer/HyperLogRenderer.tsx`)가 `sharedBuffers.filteredIndices`를 직접 읽는 경로는 `isStreamMode && sharedBuffers.logBuffer`일 때뿐입니다.

2. **로컬 파일 모드에서 `lineOffsets` 이중 보관 (Rust + JS)**
   - Rust `log_engine::INDEX_CACHE`가 이미 `Arc<Vec<u64>>`를 보유하고 있는데, `index_log_file`이 이를 `offsets.len() * 8` 바이트(~40–80MB)로 직렬화해 WebView2 워커의 `lineOffsets: BigInt64Array`에도 동일하게 복제 보유합니다.
   - JS 워커에서 `lineOffsets`가 주되게 쓰이는 곳은 뷰포트 렌더링(~50줄 읽기)과 검색·분석 요청입니다.

3. **필터 결과 캐시 이중 보관 및 Rust 캐시 보관 한도**
   - `FILTER_CACHE` (Rust, 최대 16개 × 최대 500만 줄)와 `FilterCacheStore` (JS, `rawMatchedIndices`)가 대용량 필터 결과를 양쪽 메모리에 중복 보관합니다.
   - `INDEX_CACHE_MAX_FILES = 4`로 인해 탭을 닫거나 파일을 바꿔도 이전 파일 인덱스 3개까지 RAM에 남습니다.

4. **앱 시작 시 `node server/index.cjs` 무조건 실행**
   - `src-tauri/src/lib.rs`의 `setup()`에서 `stream_engine::spawn_backend_server(&app_root)`를 즉시 호출하여, 로컬 `.log` 파일만 볼 때도 백그라운드 Node.js Socket.IO 서버 프로세스가 상주합니다. (실제 `127.0.0.1:3003` 클라이언트는 `components/TizenConnectionModal.tsx` 및 `utils/tauriSocket.ts` 경로에서만 사용)

---

## 2. 최적화 설계 (Phase 1~3 적용, Phase 4 `node` 지연 실행은 사용자 결정으로 제외)

### Phase 1. Virtual Identity Mode + `indexSharedBuffer` 지연 할당 (`workers/`)
- **대상 파일**:
  - `workers/LogProcessor.worker.ts`
  - `workers/workerBookmarkHandlers.ts`
  - `workers/workerDataReader.ts`
  - `workers/workerHistogramHandler.ts`
  - `workers/latencyAnalysisHandler.ts`
- **설계 내용**:
  - `indexSharedBuffer` / `filteredIndicesBuffer` (`80MB`)를 모듈 최상단에서 즉시 생성하지 않고, `allocateStreamBuffers()` 내부(실제 `initStream` 진입 시)로 이동합니다.
  - 파일 모드(`!isStreamMode`)에서 필터가 비어 있을 때(오픈 직후 또는 Empty rule bypass) `0..totalLines-1` 배열을 채우지 않고 **Identity View 상태**(`isIdentityView = true`, `identityTotalLines = lineCount`, `filteredIndices = null`)로 표현합니다.
    - 논리 길이: `getFilteredCount()` -> `isIdentityView ? identityTotalLines : (filteredIndices?.length ?? 0)`
    - 원본 인덱스 매핑: `getOriginalIndex(visualIdx)` -> `isIdentityView ? visualIdx : filteredIndices![visualIdx]`
  - 북마크(`BookmarkManager`)는 Identity 상태에서 `originalIdx === visualIdx`이므로 `0(K log K)` 정렬 리스트를 그대로 반환하고, 필터 적용 중 북마크 추가/삭제 시에만 `Int32Array`를 갱신합니다.
  - 실제 필터 매치가 발생하면(`hasNativeEngine`), Rust가 반환한 `Int32Array` 뷰(`매치 수 × 4바이트`만 사용)를 `filteredIndices`로 직접 연결합니다.
- **기대 절감**: 파일 오픈 직후 WebView2 `filteredIndicesBuffer` 커밋 **~80MB → 0MB**.

### Phase 2. 네이티브 로컬 파일 Zero-Offset 모드 + 지연 하이드레이션 (`src-tauri/`, `workers/`, `utils/`, `hooks/`)
- **대상 파일**:
  - `src-tauri/src/commands/log_engine.rs` (신규 읽기/메타 커맨드)
  - `src-tauri/src/commands/log_reader.rs` (파일 크기 관리: 900줄 미만 유지를 위해 읽기·하이라이트 전용 모듈 분리)
  - `src-tauri/src/lib.rs` & `src-tauri/src/commands/mod.rs`
  - `utils/tauriBridge.ts` & `hooks/useLogWorkerEvents.ts`
  - `workers/LogProcessor.worker.ts` & `workers/workerDataReader.ts` & `workers/workerHistogramHandler.ts`
- **설계 내용**:
  - **파일 오픈 (`index_log_file_meta`)**:
    - Rust `get_or_index_file(&path)`로 멀티스레드 SWAR 인덱싱 후 `INDEX_CACHE`에만 `Arc<Vec<u64>>`를 보관하고, JS 워커로는 **`{ totalLines, fileSize }` (16바이트)** 만 반환합니다.
    - JS 워커는 `hasNativeEngine`일 때 `lineOffsets = null`, `localTotalLines = totalLines` 상태로 유지합니다.
  - **화면 렌더링 & 단일/주변 줄 조회 (`read_local_lines_by_indices`)**:
    - `workerDataReader`의 `getLines`, `getRawLines`, `getSurroundingLines`, `getLinesByIndices` 및 `getSingleLineContent`가 `isLocalFileMode && hasNativeEngine`일 때 `readLocalLinesByIndices(path, indices, stripAnsi)`를 호출합니다.
    - Rust는 `INDEX_CACHE`에서 바이트 범위를 조회하고 `FILE_POOL`(핸들 풀링)로 해당 줄들(~50~200줄)만 읽어 `[count][len0][bytes0]...` 단일 바이너리 `Response`로 반환합니다.
  - **검색 (`find_highlight_native`)**:
    - `FIND_HIGHLIGHT`를 Rust 네이티브 멀티청크/단일 스캔으로 처리해 JS `lineOffsets` 없이 즉시 점프합니다.
  - **고급 분석/전체 텍스트 지연 하이드레이션 (`ensureLocalOffsetsLoaded`)**:
    - 사용자가 실제로 히스토그램(`REQUEST_HISTOGRAM`), 성능 히트맵(`GET_PERFORMANCE_HEATMAP`), 트랜잭션 분석(`ANALYZE_TRANSACTION`), 전체 복사(`GET_FULL_TEXT`)를 열 때만 `INDEX_CACHE`에 이미 올라가 있는 오프셋을 1회 lazy fetch합니다. (기존 분석 코드 100% 호환 + 평소엔 0MB)
- **기대 절감**: 파일 오픈 직후 WebView2 `lineOffsets` **~40–80MB → 0MB**, IPC 80MB 복사 시간까지 단축.

### Phase 3. Rust/JS 이중 캐시 정리 및 탭 종료 시 즉시 해제 (`log_engine.rs`, `LogProcessor.worker.ts`, `utils/incrementalFilter.ts`)
- **대상 파일**:
  - `src-tauri/src/commands/log_engine.rs`
  - `workers/LogProcessor.worker.ts`
  - `utils/incrementalFilter.ts`
- **설계 내용**:
  - **Rust `INDEX_CACHE` / `FILTER_CACHE` 명시적 Evict 커맨드 추가 (`evict_log_cache`)**:
    - 워커가 다른 파일로 전환하거나 탭이 닫힐 때 기존 `localFilePath`의 Rust 인덱스/필터 캐시를 즉시 해제합니다.
    - `INDEX_CACHE_MAX_FILES`는 Split View(좌/우 2창) 대응을 위해 `4 → 2`로 축소하고, `FILTER_CACHE`는 전체 바이트 예산 상한(예: `MAX_FILTER_CACHE_BYTES = 128MB`) 내 LRU 유지로 조정합니다.
  - **JS `FilterCacheStore` 경량화 (`hasNativeEngine`)**:
    - 네이티브 엔진 모드에서는 Rust `FILTER_CACHE`가 이미 `Vec<u32>` 후보를 보관하므로, JS `FilterCacheStore`가 중복으로 `rawMatchedIndices`를 쌓아두지 않고 **메타데이터(`snapshot` + `matchCount` + `key`)만 보관**해 `findBestParent` 증분 계획 수립에만 사용합니다. (단, 0건 매치 0ms 반환 플래그는 유지)
- **기대 절감**: 필터링 사용 중 대용량 `Int32Array` 중복 점유 제거 및 탭 전환 후 유령 메모리 즉시 회수.

### Phase 4. `node server/index.cjs` 지연 실행 (`lib.rs`, `stream_engine.rs`, `TizenConnectionModal.tsx`, `tauriSocket.ts`)
- **대상 파일**:
  - `src-tauri/src/lib.rs`
  - `src-tauri/src/commands/stream_engine.rs`
  - `utils/tauriBridge.ts` & `utils/tauriSocket.ts` & `components/TizenConnectionModal.tsx`
- **설계 내용**:
  - `lib.rs::setup`에서 무조건 `spawn_backend_server`를 호출하던 코드를 제거합니다.
  - Rust 커맨드 `ensure_backend_server`를 추가해 Tizen/SDB/SSH/Serial 연결 화면이나 실시간 소켓 연결이 실제로 열릴 때만 1회 lazy spawn합니다. (로컬 로그 뷰어만 사용할 땐 `node` 프로세스 미실행)
- **기대 절감**: 로컬 파일 전용 사용 시 `node` 프로세스 상주 메모리 및 부팅 부하 제거.

---

## 3. 예상 효과 및 파일 크기/리팩토링 체크

- **예상 메모리 변화 (1GB 파일 1개 오픈 직후, 추산)**:
  - `WebView2` 증가분: 기존 `+158.4MB` → **약 `+10~20MB` 수준** (가상 인덱스 + 네이티브 오프셋 보관)
  - Rust 백엔드: `node` 프로세스 지연 실행 + 캐시 바이트 예산 관리로 대기/단일 파일 구간 대폭 절감
- **파일 길이 제약 (900줄 기준)**:
  - Rust 읽기 커맨드들은 `log_engine.rs`에 뭉치지 않고 신규 파일 `src-tauri/src/commands/log_reader.rs`로 분리해 두 파일 모두 900줄 미만으로 유지합니다.
  - `workers/LogProcessor.worker.ts` (현재 1,322줄)는 900줄 초과 상태이므로, 이번 작업 시 Identity View & Native Line Reader 어댑터 로직을 신규 유틸(`workers/workerIndexView.ts` 등)로 분리해 크기 증가를 막고 점진적으로 줄입니다.

---

## 4. 검증 계획

1. `cargo check --manifest-path src-tauri/Cargo.toml` 및 `cargo test --manifest-path src-tauri/Cargo.toml` (SWAR 인덱서, `read_local_lines_by_indices`, `find_highlight_native`, 필터 캐시/evict 단위 테스트).
2. `npx vitest run` (기존 워커/필터/지속성 테스트 회귀 검증 + `workerIndexView` 단위 테스트 추가).
3. `npm run build` 및 `npm run tauri:build` 후 1GB 로그 파일로 실측:
   - 실행 직후 / 1GB 로드 직후 / 1·2·3번째 단어 필터링 시 작업 관리자 메모리 비교 및 속도 회귀 0 확인.
   - 북마크 토글, 전체 복사, 히스토그램/히트맵, Find Highlight, Tizen 실시간 스트림 fallback 동작 확인.
4. `important/APP_MAP.md` 및 `docs/` 테스트 결과 문서 업데이트.
