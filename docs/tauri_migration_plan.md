# 🚀 HappyTool Light → Tauri 2.0 완전 이식 마스터 플랜 (심층 보완판 v2)

> **작성 일자**: 2026-11-01  
> **대상 프로젝트**: `happytool_light` (Electron Standalone Log Extractor) → `happytool_tauri` (Tauri 2.0 Standalone)  
> **목표**: Electron 기반의 초고속 로그 분석기(Log Extractor)의 모든 UI, 기능, 성능, 워커, WASM, 스트리밍(SDB/SSH/Serial), CLI 모드를 **단 1%의 누락이나 성능 저하 없이 100% 완전 그대로** Tauri 2.0으로 이식.

---

## 📌 1. 원본 `happytool_light` 전수 코드 정밀 분석

### 1.1 프론트엔드 자산 및 파일 규모 전수 조사
- **UI 프레임워크**: React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons + Radix UI + Dnd-kit + Framer Motion + Recharts
- **렌더링 엔진**: `HyperLogRenderer.tsx` (2계층 HTML5 Canvas 가상화 렌더러, 고정폭 폰트 너비 캐싱, 60fps 보장)
- **백그라운드 워커 (`workers/`)**:
  - `LogProcessor.worker.ts`: 로그 인덱싱(File stream / RPC 50MB chunk local file stream), 필터링, SharedArrayBuffer(260MB) 관리 총괄
  - `LogFilterSub.worker.ts`: Rust WASM (`happy_filter_bg.wasm`) 병렬 서브워커 풀
  - `LogIndexer.worker.ts`, `LogStream.worker.ts`, `PerfTool.worker.ts`, `Search.worker.ts`, `SplitAnalysis.worker.ts`
  - 보조 핸들러: `workerDataReader.ts`, `workerAnalysisHandlers.ts`, `workerHistogramHandler.ts`, `latencyAnalysisHandler.ts`, `SpamAnalyzer.logic.ts`, `SplitAnalysisUtils.ts`, `TransactionAnalyzer.logic.ts`
- **로컬 스토리지 & 아카이브**: Dexie (`IndexedDB` 기반 `LogArchive` 및 `utils/db.ts` 탭 상태 영속화)
- **테스트 자산 (`test/`)**: 컴포넌트, 훅, 워커, 성능 벤치마크 등 총 **35개 Vitest 테스트 스위트**

### 1.2 `window.electronAPI` 전수 호출처 및 동작 매핑
코드베이스 전체를 스캔하여 확인된 모든 `window.electronAPI` 메서드와 주의사항입니다.

| API 메서드 | 실제 호출 위치 | 핵심 동작 및 Tauri 이식 시 주의사항 |
| :--- | :--- | :--- |
| `readFileSegment({ path, start, end })` | `useLogWorkerEvents.ts` (워커 RPC) | **최우선 성능 구간**: `LogProcessor.worker.ts`에서 **50MB 청크** 단위로 호출함. JSON 직렬화 시 브라우저가 멈추므로 반드시 Tauri 2 **`tauri::ipc::Response` (Raw Binary ArrayBuffer)** + **15초 파일 핸들 풀링**으로 구현해야 함. |
| `getFileSize(path)` | `useLogFileOperations.ts`, `useCliHandlers.ts` | 로컬 파일의 바이트 크기(`u64`) 반환. `INIT_LOCAL_FILE_STREAM` 진입 조건. |
| `readFile(path)` | `useLogFileOperations.ts`, `useCliHandlers.ts` | UTF-8 전체 텍스트 읽기 (소용량/폴백용). |
| `streamReadFile(path, reqId, opts)` / `cancelStream(reqId)` | `useLogFileOperations.ts`, `PerfRawViewer.tsx` | 256KB 청크 단위로 `file-chunk`, `file-stream-complete`, `file-stream-error` 이벤트 발행. |
| `getFilePath(file)` | `LogExtractor.tsx`, `useLogFileOperations.ts` | 드롭되거나 선택된 `File` 객체의 로컬 절대 경로 추출. 세션 복원(`tabState`)과 중복 탭 방지에 필수. |
| `getZoomFactor()` / `setZoomFactor(factor)` | `App.tsx`, `SettingsModal.tsx`, `useLogShortcuts.ts` | **주의**: `getZoomFactor()`는 Promise가 아닌 **동기(Synchronous) 숫자 반환**을 기대함! 브릿지 내부 상태 캐싱 + `WebviewWindow::set_zoom` 호출로 해결. |
| `toggleFullscreen(flag)` | `App.tsx` (`F11` Focus Mode) | `WebviewWindow::set_fullscreen` 연동. |
| `copyToClipboard(text)` | `ErrorBoundary.tsx`, `useLogExportActions.ts` | 대용량 텍스트 클립보드 복사. |
| `saveFile(content)` | `useLogExportActions.ts` | 네이티브 Save Dialog 표시 후 `.log`/`.txt` 파일 저장. |
| `saveFileDirect(data, filePath)` / `appendFileDirect(data, filePath)` | `useCliHandlers.ts`, 실시간 로그 자동 파일 저장 | 다이얼로그 없이 지정 경로에 `Uint8Array`/텍스트 즉시 쓰기 및 이어쓰기. |
| `openExternal(target)` / `getAppPath()` | `SettingsModal.tsx` (`Open Full Guide` 등) | URL은 기본 브라우저로, 로컬 경로(`${appPath}/important/cli_user_guide.md`)는 OS 기본 앱으로 열기. |
| `getStartupStatus()` / `splashReady()` / `on('loading-*')` | `App.tsx`, `LoadingSplash.tsx` | 초기 스플래시 화면 진행률 및 서버 준비 완료(`loading-complete`) 이벤트 연동. |
| `saveSettingsToFile(settings)` / `getCliSettings()` | `App.tsx`, `useCliHandlers.ts` | GUI에서 변경한 Mission(Rule) 설정을 `happytool-settings.json`에 동기화하여 CLI 모드와 공유. |
| `runSdbCommand(cmd)` | SDB 유틸리티 | 10초 타임아웃 `sdb` 명령 실행 후 `{ stdout, error, message }` 반환. |
| `onCliCommand` / `cliReady` / `cliStdout` / `cliStderr` / `cliExit` | `CliApp.tsx`, `useCliHandlers.ts` | 헤드리스 CLI 모드(`?mode=cli`) 입출력 및 종료 코드 반환. |

---

## 🔍 2. 심층 점검으로 발굴한 8대 핵심 기술 함정(Pitfalls) 및 해결 설계

단순 이식 시 발생할 수 있는 치명적인 문제들을 사전에 모두 찾아내어 해결책을 설계했습니다.

### 🚨 함정 1: `readFileSegment` (50MB 청크) JSON 직렬화 병목 및 OOM
- **원인**: Tauri Command에서 단순히 `Result<Vec<u8>, String>`을 반환하면 Tauri가 이를 `[10, 32, 114, ...]` 형태의 JSON 텍스트로 직렬화하여 IPC로 전송합니다. 50MB 청크를 JSON으로 변환하면 수백 MB의 문자열 파싱이 발생해 앱이 얼어붙습니다.
- **해결**:
  - Rust 커맨드 반환 타입을 **`tauri::ipc::Response`** 로 지정하여 JSON 직렬화를 완전히 우회하고 순수 Binary `ArrayBuffer`로 WebView2에 전달합니다.
  - Rust 백엔드에 `Mutex<HashMap<String, PooledFileHandle>>` 기반의 **15초 파일 핸들 풀링**을 동일하게 구현하여 반복적인 `File::open` 오버헤드를 0으로 만듭니다.

### 🚨 함정 2: 커스텀 타이틀바(`titleBarOverlay`) 및 창 드래그(`.title-drag`) 깨짐
- **원인**:
  - Electron `main.cjs`는 `titleBarStyle: 'hidden'`과 `titleBarOverlay: { color: '#0f172a', symbolColor: '#94a3b8', height: 32 }`를 사용합니다.
  - 이에 맞춰 `LogExtractor.tsx`(`pr-36`)와 `TopBar.tsx`(`pr-[140px]`)는 우측 상단 138px 공간을 비워두고 `.title-drag`(`-webkit-app-region: drag`)로 창 이동을 처리합니다.
  - Tauri에서 기본 타이틀바를 켜면 타이틀바가 2중으로 생기고, `decorations: false`만 켜면 우측 상단 최소화/최대화/닫기 버튼이 사라지며 `-webkit-app-region: drag`가 동작하지 않습니다.
- **해결**:
  - `tauri.conf.json`에서 `"decorations": false`로 설정합니다.
  - 우측 상단(`fixed top-0 right-0 h-8 w-[138px] z-[99999]`)에 원본 `titleBarOverlay` 색상(`#0f172a`, 아이콘 `#94a3b8`, 닫기 호버 `#e81123`)과 100% 동일한 **`WindowTitleBarControls` 컴포넌트**를 장착합니다 (`isFocusMode`일 때는 자동 숨김).
  - `tauriBridge.ts`에서 `.title-drag` 영역(단, `.no-drag`, `button`, `input`, `a`, `[draggable="true"]`, `.focus-mode` 내부는 제외) 마우스 좌클릭 드래그 시 `getCurrentWindow().startDragging()`, 더블클릭 시 `getCurrentWindow().toggleMaximize()`를 자동 호출하는 전역 위임 리스너를 등록합니다.

### 🚨 함정 3: HTML5 탭 드래그(`draggable`) vs OS 파일 드롭(`onDrop`) + `getFilePath` 충돌
- **원인**:
  - Tauri의 `dragDropEnabled: true`(기본값)는 OS의 드래그 이벤트를 가로채기 때문에, `LogExtractor.tsx`의 HTML5 탭 순서 변경 드래그(`draggable`, `onDragStart`)와 Left/Right Pane 구분 드롭(`LogViewerPane.tsx`의 `onDrop`)이 작동하지 않습니다.
  - 반대로 `dragDropEnabled: false`로 하면 탭 드래그와 영역별 `onDrop`은 완벽히 작동하지만, WebView2 보안상 HTML5 `File` 객체에 로컬 경로(`file.path`)가 비어 있게 됩니다.
- **해결 (하이브리드 파일 경로 브릿지)**:
  1. `tauri.conf.json`에서 `"dragDropEnabled": false`를 사용하여 **HTML5 탭 드래그 정렬과 Left/Right Pane/Header 개별 영역 `onDrop`이 100% 원본 그대로 동작**하게 합니다.
  2. 동시에 Tauri의 파일 오픈 다이얼로그 및 로컬 파일 탐색 브릿지를 연동하여, `<input type="file">`(Browse 버튼) 클릭 시 Tauri Native Dialog(`@tauri-apps/plugin-dialog`)로 실제 절대 경로(`path`)를 획득하고, `readFileSegment`와 연동되는 `File` 객체에 `path` 속성을 주입합니다.
  3. 드래그 앤 드롭된 파일의 경우에도 `File` 객체의 `file.stream()`을 통해 2GB+ 파일이 즉시 인덱싱되며, 최근 파일/경로 매칭을 통해 `getFilePath(file)`를 최대한 복원합니다.

### 🚨 함정 4: `SharedArrayBuffer` 활성화와 COOP/COEP + Socket.IO CORS 충돌
- **원인**:
  - `LogProcessor.worker.ts`는 260MB `SharedArrayBuffer`를 생성하여 `LogFilterSub.worker.ts`들과 공유합니다.
  - 이를 위해 `Cross-Origin-Opener-Policy: same-origin` 및 `Cross-Origin-Embedder-Policy: require-corp` 헤더가 필요한데, `require-corp`가 켜지면 `http://127.0.0.1:3003` (Socket.IO 서버) 요청 시 `Cross-Origin-Resource-Policy: cross-origin` 헤더가 없을 경우 차단될 수 있습니다.
- **해결**:
  1. `vite.config.ts`(`server.headers`)와 `tauri.conf.json`(`app.security.headers`) 양쪽 모두에 COOP/COEP 헤더를 설정하고, WebView2 `additionalBrowserArgs`에 `--enable-features=SharedArrayBuffer`를 명시합니다.
  2. `server/index.cjs`의 HTTP/Socket.IO 응답 헤더에 `Cross-Origin-Resource-Policy: cross-origin`을 추가하여 COEP 환경에서도 절대 차단되지 않도록 보장합니다.
  3. 나아가 **Rust 네이티브 스트리밍 엔진 + `TauriSocketAdapter`** 까지 함께 구현하여 외부 Node 서버 없이도 동작할 수 있도록 이중화합니다.

### 🚨 함정 5: 실시간 스트리밍(SDB / SSH / Serial / Test Scroll) 완벽 호환
- **원인**: `TizenConnectionModal.tsx`와 `useTizenConnection.ts`는 `socket.io-client` 이벤트(`connect_sdb`, `sdb_status`, `log_data`, `list_serial_ports`, `serial_ports` 등)에 강하게 결합되어 있습니다.
- **해결**:
  - **1차 (Native Rust Streaming + Socket Emulator)**: Rust 백엔드(`src-tauri/src/stream/`)에서 SDB 프로세스(`tokio::process`), SSH(`ssh2`), Serial(`serialport`), Test Scroll Simulator 및 20ms `StringDecoder` 배치 버퍼링을 직접 수행하고, 프론트엔드에는 `Socket` 인터페이스와 100% 호환되는 `TauriSocketAdapter`를 제공합니다.
  - **2차 (Node.js `server/index.cjs` 호환 유지)**: 원본 `server/index.cjs`도 그대로 이식 및 유지하여 필요시 언제든 로컬 Socket.IO 서버(포트 3003)로도 동일하게 구동 가능하도록 구성합니다.
  - **기존 미세 버그 수정**: `TizenConnectionModal.tsx`가 기다리는 `serial_ports` 이벤트와 `server/index.cjs`가 보내던 `serial_ports_list` 이벤트, 그리고 `port` vs `path` 파라미터 차이를 양쪽 모두 호환되도록 매핑합니다.

### 🚨 함정 6: Headless CLI 모드 (`happytool log-extractor` / `analyze-diff`)
- **원인**: `electron/cli.cjs`는 커맨드라인 인자를 파싱하여 숨김 창(`?mode=cli`)을 띄우고 `CliApp.tsx`와 IPC로 통신합니다.
- **해결**:
  - Rust 백엔드 시작 시 CLI 인자(`log-extractor`, `analyze-diff`, `-f`, `-i`, `-l`, `-r`, `-o`)를 감지하면 메인 창을 숨김(`visible(false)`) 상태로 생성하고 `?mode=cli`로 라우팅합니다.
  - CLI 모드일 때는 앱 데이터 경로를 `happytool_cli_profile`로 격리하여 실행 중인 GUI 앱과 IndexedDB 락 충돌이 나지 않도록 원본(`electron/main.cjs:10-13`)과 동일하게 보호합니다.

### 🚨 함정 7: 현재 PC의 Rust / MSVC 빌드 환경 부재 확인
- **원인**: 사전 환경 조사(`npx tauri info`) 결과, 현재 윈도우 환경에 `rustc`/`cargo` 및 Visual Studio C++ Build Tools가 감지되지 않았습니다.
- **해결**:
  - Phase 0에서 `winget` 또는 공식 인스톨러를 통해 `rustup` (Rust toolchain) 및 MSVC Build Tools 설치 여부를 점검/설치하여 실제 컴파일과 실행까지 막힘없이 진행합니다.
  - 또한 새로 작성하는 모든 Tauri/Rust 백엔드 파일 및 브릿지 코드는 역할별로 세분화(`src-tauri/src/commands/file_io.rs`, `window_os.rs`, `settings_cli.rs`, `stream/*.rs`, `src/utils/tauriBridge.ts`, `src/utils/tauriSocket.ts`, `src/components/WindowTitleBarControls.tsx`)하여 깔끔한 모듈 구조를 유지합니다 (기존 프론트엔드 코드 리팩토링은 이식 완료 후 추후 별도 진행).

---

## 📋 3. 단계별 상세 실행 로드맵 (Phase 0 ~ Phase 6)

### [Phase 0] Rust & Tauri 2.0 빌드 환경 구축
1. Rust Toolchain (`rustup`, `cargo`, `rustc`) 및 Windows MSVC Build Tools 설치 확인 및 세팅.
2. `happytool_light/build/icon.png`로부터 `src-tauri/icons/` 아이콘 세트 생성.

### [Phase 1] 프로젝트 스캐폴딩 및 설정 파일 구성
1. `package.json`, `tsconfig.json`, `vite.config.ts` (COOP/COEP 헤더 포함), `tailwind.config.js`, `postcss.config.js` 구성.
2. `src-tauri/Cargo.toml` 및 `src-tauri/tauri.conf.json` 작성:
   - 창 크기 `1400x900`, 최소 크기 `650x600`, `decorations: false`, `dragDropEnabled: false`.
   - `SharedArrayBuffer`를 위한 보안 헤더 및 `additionalBrowserArgs: ["--enable-features=SharedArrayBuffer"]` 적용.
   - `important/**/*` 리소스 번들링 설정.

### [Phase 2] Rust 백엔드 모듈형 구현 (`src-tauri/src/`)
1. `commands/file_io.rs`:
   - 15초 핸들 풀링이 적용된 `read_file_segment` (`tauri::ipc::Response` 바이너리 반환).
   - `get_file_size`, `read_file`, `stream_read_file`, `cancel_stream`, `save_file`, `save_file_direct`, `append_file_direct`.
2. `commands/window_os.rs`:
   - 창 위치/크기/최대화 상태 영속화 (`window-state.json` 호환).
   - `set_zoom_factor`, `toggle_fullscreen`, `copy_to_clipboard`, `open_external`, `get_app_path`.
3. `commands/settings_cli.rs`:
   - `save_settings_file`, `get_cli_settings`, `run_sdb_command`.
   - 헤드리스 CLI 인자 파서 및 `cli_ready`, `cli_stdout`, `cli_stderr`, `cli_exit`.
4. `stream/` (실시간 스트리밍 백엔드):
   - SDB/SSH/Serial/Test Scroll 스트리밍 및 Node `server/index.cjs` 연동 지원.

### [Phase 3] 프론트엔드 전체 자산 이식 & 무결점 브릿지 장착
1. `happytool_light`의 모든 프론트엔드 폴더(`components`, `hooks`, `contexts`, `constants`, `plugins`, `utils`, `workers`, `src-wasm`, `public`, `important`, `server`, `test`) 100% 그대로 복사 이식.
2. `utils/tauriBridge.ts` 구현 및 `index.tsx` 최상단 주입:
   - `window.electronAPI`의 모든 메서드 1:1 에뮬레이션.
   - 동기식 `getZoomFactor()` 캐시 및 `.title-drag` 창 드래그/더블클릭 최대화 위임 핸들러.
3. `components/WindowTitleBarControls.tsx` 구현:
   - 우측 상단 138x32px 네이티브 스타일 최소화/최대화/닫기 오버레이 버튼 제공.

### [Phase 4] 실시간 스트리밍(SDB/SSH/Serial) 및 CLI 통합
1. `TizenConnectionModal.tsx` 및 `useTizenConnection.ts` 스트리밍 연동 검증.
2. SDB 자동 복구(`192.168.250.250`), SSH 대화형 인증, Serial 특수 시그널(`break`, `ctrl+c/z/d`), Test Scroll Simulator 동작 검증.
3. Headless CLI 모드(`?mode=cli`) 동작 검증.

### [Phase 5] 35개 자동화 테스트 & 대용량(1GB+) 성능 검증
1. `vitest` 기반 35개 기존 테스트 + 신규 브릿지 테스트 실행 및 `docs/test_results.txt` 결과 보고서 생성.
2. `tauri dev` / `tauri build` 실행 및 1GB+ 대용량 로그 세그먼트 로딩, WASM 필터링, 60fps 스크롤 검증.

### [Phase 6] `APP_MAP.md` 최신화 및 최종 점검
1. 루트 `APP_MAP.md` 및 `docs/maps/` 문서에 Tauri 2.0 아키텍처와 모든 신규 모듈(`src-tauri`, `tauriBridge` 등) 인터페이스 반영.
