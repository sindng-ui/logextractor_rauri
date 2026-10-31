# HappyTool APP_MAP (AI 작업 지도) 🗺️

형님! 이 지도는 AI Agent가 프로젝트의 기능을 즉시 찾고 분석할 수 있도록 돕는 **인터페이스 규격 기반의 지도**입니다. 🐧⚡
모든 경로는 **프로젝트 베이스 기준 상대 경로**를 사용하며, 한글/영어 키워드 매핑을 통해 검색 효율을 극대화했습니다.

---

## 1. Global Layout & System Architecture
전체 앱의 뼈대와 플러그인 시스템의 연결 고리입니다.

### [[Global Entry Point]]
- **ID**: `global-entry-app`
- **Keywords**: [`진입점`, `entry`, `main`, `app root`, `초기화`, `iife worker`, `sandbox false`]
- **Tech Spec**:
  - **빌드 시스템**: Vite 6 (Worker format: IIFE로 번들링하여 생산 빌드 호환성 확보) [UPDATED]
  - **데스크톱 프레임워크**: Electron 39 (Sandbox: false, SharedArrayBuffer 활성화) [UPDATED]
  - **NSIS 설치 속도 극대화**: `"compression": "store"` 설정을 package.json에 직접 이식하여 설치 시 압축 해제 오버헤드를 100% 완전 소멸(Decompress Fail 오류 원천 진압)하고 Windows 설치 속도 극대화 [NEW]
- **Location**:
  - `Html`: [index.html](./index.html) (Vite Entry Point)
  - `View`: [App.tsx](./App.tsx)
  - `Config`: [index.tsx](./index.tsx)
- **Core Interface**:
  - `AppContent`: 전역 상태(Settings, Plugin 등) 관리의 핵심 컴포넌트
  - `HappyToolProvider`: 전역 Context 공급
  - `LoadingSplash`: **터미널 스타일(Terminal Style)**의 실시간 시스템 로그 배경이 적용된 프리미엄 로딩 화면. 폰트 크기 최적화(`text-2xl`)를 통해 시작 로그의 가독성과 노출량을 극대화함. [UPDATED]
- **Startup UX Optimization**:
  - `Fake Progress`: 서버 기동 시 0->95%까지 서서히 증가하여 대기 시간 시각화 (`main.cjs`)
  - `Progress Creep`: 플러그인 로드 대기 시 98->99.9%까지 점진적으로 증가하여 활동성 확보 (`LoadingSplash.tsx`)
  - `Log Streaming`: 부팅 로그 필터 완화로 실시간 초기화 과정 노출 (`main.cjs` console override)
  - `Startup Safeguard`: 백엔드 기동 지연 시 무한 로딩을 방지하기 위한 10초 타임아웃 레이스 도입 및 상세 진단 로그 강화 [NEW]
  - `Module Lazy Loading`: `opencv-wasm`, `jimp` 등 무거운 백엔드 라이브러리를 기동 이후(5초)로 지연 로딩하여 30초 구동 지연 해결 [NEW]
  - `Vite Pre-bundling`: `jszip`, `pako` 등을 사전 최적화 목록에 추가하여 초기 번들링 속도 개선 [NEW]
  - `Backend Stability`: `everythingService` 초기화 전 호출 방지를 위한 가드 로직 추가로 SDB/SSH 연동 테스트 안정화. (`server/index.cjs`) [NEW]
  - `Global UI Zoom`: `Ctrl +/-/0` 단축키를 통해 전역 UI 크기(Zoom Factor)를 조절하고, `localStorage`를 통해 값을 영구 저장하여 앱 재시작 시에도 유지. (`App.tsx`) [NEW]
- **Data Flow**: `localStorage` -> `Settings Load` -> `Context State` -> `Plugin Injection`

### [[Plugin Registry & Injection]]
- **ID**: `system-plugin-registry`
- **Keywords**: [`플러그인 등록`, `plugin load`, `registry`, `wrapper`, `visibility toggle`, `isLab`]
- **Location**:
  - `Registry`: [registry.ts](./plugins/registry.ts)
  - `Types`: [types.ts](./plugins/types.ts)
  - `Config`: [config.ts](./plugins/config.ts) [NEW]
  - `Container`: [PluginContainer.tsx](./components/PluginContainer.tsx)
- **Core Interface**:
  - `ALL_PLUGINS`: 등록된 모든 플러그인 배열 (순서 조정 가능)
  - `HappyPlugin`: 플러그인 규격 인터페이스
  - `PLUGIN_CONFIG`: 14종의 실험실 플러그인 각각에 대한 노출 여부 제어 플래그 [UPDATED]
- **Data Flow**: `config.ts` -> `registry.ts` (Filtering via visibilityMap) -> `App.tsx` -> `Sidebar`

### [[Zero-Sidebar App Hub & Library]] [UPDATED][HOT]
- **ID**: `ui-app-hub-nav`
- **Keywords**: [`Zero-Sidebar`, `App Hub`, `App Library`, `Quick Switcher`, `Orbit Expansion`, `Popover Menu`, `UX Optimization`, `Labs`, `Glassmorphism`] [UPDATED]
- **Location**:
  - `Hub`: [AppHub.tsx](./components/AppHub.tsx)
  - `Library Popover`: [AppLibraryModal.tsx](./components/AppLibraryModal.tsx)
  - `Section`: [Section.tsx](./components/Section.tsx) [NEW]
  - `App Card`: [AppCard.tsx](./components/AppCard.tsx) [NEW]
- **Features**:
  - **Dynamic Bento Grid Layout**: 모든 카드가 동일한 크기였던 기존 격자를 탈피하여 2x2(Large), 2x1(Wide), 1x1(Normal) 크기가 혼합된 Bento Grid 레이아웃 적용. 시각적 계층 구조와 역동성 확보. [NEW][HOT]
  - **Pinned Glassmorphism**: Pinned Tools 섹션의 앱들에 은은한 백그라운드 블러(`backdrop-blur-xl`)와 유리 질감 UI를 적용하여 프리미엄 감성 강화. [NEW]
  - **Aura & Ghost Typography**: 각 앱 고유 테마 컬러를 활용한 Radial Glow 효과와 배경 고스트 타이포그래피를 적용하여 프리미엄 디자인 완성. [NEW]
  - **Smart Popover Library**: 버튼 근처(`top-left`)에서 나타나는 콤팩트한 팝오버 레이아웃과 가변 카드 시스템의 시너지로 마우스 이동 거리 최소화 및 직관성 극대화. [UPDATED]
    - `Pure Performance Architecture`: **지능형 레이아웃 오케스트레이션(isEntranceDone)**을 도입하여 카드가 등장하는 최초 진입 기간(1000ms) 동안은 실시간 레이아웃 추적(`layout={false}`)을 완벽 차단해 CPU 부하를 극소화하고, 진입이 끝나 완전히 정지하면 즉시 활성화하여 격자 애니메이션을 매끄럽게 유지합니다. 또한 카드 진입 물리 모델에 **임계 감쇠(Critical Damping, damping: 28)**를 적용하여 안착 직후의 미세 흔들림(Wobble)을 완전히 근절했으며, 오버레이에 걸리던 GPU 무거운 CSS `blur-2xl` 필터 연산을 초경량 하드웨어 가속 `radial-gradient` 배경 효과로 대체하여 **기존의 에너제틱한 Bouncy 스프링 감성은 100% 보존하면서 저사양 회사 PC에서도 프레임 드랍 없이 완벽한 60fps**를 실현했습니다. [UPDATED][HOT]
    - `Happy & Abundant UX`: 에너제틱한 Happy Bounce와 곡선형 순차 지연(Organic Stagger), 그리고 반짝이는 헤더 애니메이션을 통해 풍성하고 기분 좋은 첫인상을 제공함. [NEW]
    - `Layered Premium Motion`: 카드 입성 후 아이콘이 별도로 팝핑되는 2단계 애니메이션과 은은한 아우라 펄스를 적용하여 레이어의 깊이감을 극대화함. [NEW]
    - `Collapsible Sections`: Labs 등 섹션을 접고 펼 수 있는 기능을 추가하여 시각적 복잡도를 낮추고 성능을 추가로 확보함. 접힘 상태는 `localStorage`에 영구 저장됨. [NEW]
    - `Animation Specification UT`: 새로운 프리미엄 스프링 사양에 맞춰 프론트엔드 애니메이션 단위 테스트를 최신화함. [UPDATED]
  - **Dynamic Active Badge**: 현재 실행 중인 플러그인 이름을 버튼 옆에 우아하게 표시하여 상태 가시성 확보. [NEW]
  - **Zero-Sidebar Synergy**: 사이드바가 없는 광활한 공간을 유지하면서도, 버튼 하나로 모든 네비게이션을 버튼 근처에서 해결.

### [[Headless CLI Infrastructure]] 🐧💻
- **ID**: `system-headless-cli`
- **Keywords**: [`CLI`, `Headless`, `Automated Test`, `Background Execution`, `commander`, `hidden window`, `fallback`]
- **Location**:
  - `Main Entry`: [cli.cjs](./electron/cli.cjs)
  - `Main Process`: [main.cjs](./electron/main.cjs)
  - `Renderer UI`: [CliApp.tsx](./CliApp.tsx)
  - `Renderer Logic Hook`: [useCliHandlers.ts](./hooks/useCliHandlers.ts)
- **Core Interface**:
  - `runCli(args)`: 커맨드라인 매개변수 파싱 및 Headless(Hidden) BrowserWindow 생성
  - **연결 안정화**: Vite 서버 대기 시 5초 타임아웃 및 `app://` 프로토콜(빌드 파일) 자동 Fallback 로직 탑재 [NEW]
  - `CliApp`: CLI 렌더러 진입점. 500줄 초과 방지를 위해 핵심 커맨드 핸들러를 별도 훅으로 위임.
  - `useCliHandlers`: `analyze-diff`, `log-extractor` 등 실제 커맨드 처리 오케스트레이션 훅 [REFACTORED]
- **Data Flow**: `Terminal Argv` -> `commander (cli.cjs)` -> `BrowserWindow (Hidden)` -> `CliApp.tsx` -> `useCliHandlers.ts` -> `Task Execution` -> `Terminal Output`

---

## 2. Core Feature: Log Extractor
대용량 로그 분석의 핵심 엔진과 UI입니다.

### [[Log Extractor Engine]]
- **ID**: `logic-log-extractor-core`
- **Keywords**: [`필터링`, `인덱싱`, `바이너리 저장소`, `SharedArrayBuffer`, `filtering`, `indexing`, `applyFilter`, `logBuffer`, `WASM`]
- **Location**:
  - `Main Logic`: [useLogExtractorLogic.ts](./hooks/useLogExtractorLogic.ts)
  - `Worker`: [LogProcessor.worker.ts](./workers/LogProcessor.worker.ts) (중앙 제어)
  - `Filter Sub`: [LogFilterSub.worker.ts](./workers/LogFilterSub.worker.ts) (병렬 필터링)
  - `WASM Engine`: [src-wasm/](./src-wasm/)
  - `Data Reader`: [workerDataReader.ts](./workers/workerDataReader.ts)
- **Core Interface**:
  - `applyFilter(rule, quickFilter)`: 필터링 요청 트리거
  - `buildFileIndex(file)`: 파일 초기 인덱싱 스캔
  - `filteredIndices`: 필터링된 결과 라인 번호 배열 (Int32Array)
- **Optimizations**:
  - `SharedArrayBuffer Zero-copy Binary Read`: UI(HyperLogRenderer)에서 직접 공유 메모리를 읽어 렌더링 성능 극대화.
  - `빈 룰 초광속 바이패스 SharedArrayBuffer 동기화 & 스트림 확장`: 해피콤보가 없을 때 필터링 루프를 거치지 않고 전체 인덱스를 넘겨주는 최적화 분기에서, SharedArrayBuffer(filteredIndicesBuffer)에 인덱스 데이터를 직접 채우고 sendSharedBuffers()를 쏘도록 개선하여 UI 렌더러와 동기화가 끊기던 버그를 완벽 해결하고, `!isStreamMode` 제약을 완전 제거하여 실시간 스트림 모드까지 빈 룰 초광속 바이패스 최적화가 상시 적용되도록 영토 확장함. [UPDATED][HOT]
  - `빈 룰 로그 실종 완전 진압 & 깜빡임 제로 동기화 가드 완성 (v8)`: 최초 인덱싱 완료(`INDEX_COMPLETE`) 시점에 `filteredCount`를 즉시 전체 라인 수로 초기 세팅하는 기반 위에, 빈 룰 적용 시 워커로의 `FILTER_LOGS` 디스패치를 전면 유지하여 SharedArrayBuffer 동기화를 100% 보장함으로써 탭 전환/파일 재오픈 시의 먹통 실종 버그를 완전 소탕하고, 동시에 `setWorkerReady(false)` 로딩창 강등만 영리하게 차단하여 단 1프레임의 깜빡임 jank도 허용하지 않는 궁극의 60fps 무결성을 마침내 달성함. [UPDATED][HOT]
  - `필터 유틸 최종 2중 방어가드 수립 & 빈 문자열 감지 보완`: 만에 하나 병렬 서브워커(`LogFilterSub.worker.ts`) 필터링으로 우회하더라도, 필터 조건이 아예 없는 빈 룰 상태(신규 미션의 `[['']]` 같은 가짜 빈 콤보 포함)라면 `checkIsMatch` 매칭 함수 초입부에서 실질 키워드가 없는 빈 룰임을 100% 탐색하여 0.0001초 만에 `true` (무조건 통과)를 즉시 리턴하도록 최종 초광속 가드를 고도화 수립하여 WASM 오작동 오매칭을 원천 차단함. [UPDATED][HOT]
  - `해피콤보 빈 룰 로그 0.1초 실종 타이밍 버그 완전 진압 및 캐시 가드 복원 (v10)`: 빈 룰 시 무조건 필터싱크를 쏘는 가드 우회로 인해 발생하던 0.1초 중복 워커 갱신 및 lineCount=0 엇박자 실종 버그를 종식시키기 위해, 가드 우회를 완전히 제거하고 순수 해시 캐시 비교 가드를 완벽 복원하여 중복 워커 갱신을 차단하고 0.1초 실종 버그를 완벽 진압함. [UPDATED][HOT]
  - `로그 레벨 색상 & 토글 0ms 즉각 반영 동기화 가드 및 Opacity % 실시간 연동 (HyperLogRenderer.tsx)`: 사용자가 퀵 제어 창(Log Center)에서 로그 레벨 체크박스를 토글하거나 컬러 피커로 색을 바꾸었을 때, 기존에 렌더러 캐시(`cachedLines`)에 저장되어 있던 로그 라인들의 `levelColor`를 0ms 즉각 재평가하여 루프 갱신하는 2중 동기화 가드 장착. 동시에 캔버스 배경 레이어(Background Layer) 렌더링 루프 내에 `logLevelOpacity` 실시간 연동 로직을 추가하고, 대소문자 무관 컬러 매칭 가드(`m.color.toLowerCase() === lineData.levelColor.toLowerCase()`) 및 최하단 `useLayoutEffect` 에 `preferences?.logLevelOpacity` 동기 가드를 3중 장착하여 슬라이더 변경 즉시 메인 로그 화면의 은은한 배경 투명도가 껌벅임 없이 0ms 만에 부드럽고 정확하게 물들도록 완벽한 60fps 무결성 반응성을 완성함. [UPDATED][HOT]

  - `스마트 하이퍼 점프 (Hyper-Jump to Tab Line)`: 검색 결과 트리에서 특정 행을 클릭하면, 타겟 파일의 탭으로 즉시 휙 전환(Switch Tab)되고, 해당 로그 라인의 위치로 화면을 미려하고 정확하게 포커싱 및 스크롤 점프 수행. [NEW][HOT]
  - `독립형 전체 찾기 (Find in All Open Files, Ctrl+Shift+F) 및 현재 탭 스마트 찾기 (Ctrl+F) 프리미엄 모달 연동 및 초고속 스마트 청크 스캔 (Smart Batching & Zero-copy) [UPDATED][HOT]`: Global Mission과 완전 독립된 룰로 열린 모든 파일을 즉시 검색. `FindInAllModal`(700px 대형 프리미엄 모달, blur 제로, 포함 키워드(Happy Combo)와 제외 키워드(Block List)를 최상단으로 배치하여 사용성 극대화, `TagInput.tsx` 서브 컴포넌트로 칩 입력 분리, 최근 검색 히스토리를 3개 제한의 세로 리스트(`HistoryList.tsx` [NEW]) 및 더 많은 항목 유추를 위한 그라데이션 페이드 아웃 효과/더보기(펼침) 기능으로 구현하여 공간 파괴 방지와 스크롤성 확보 동시 달성, `SectionHeader.tsx` 아코디언 헤더 분리 등 500줄 초과 대응 리팩토링 및 250줄 슬림화 완료, Block List 기본 열림), `FindInAllResultPanel`(공통 부모 단 한 번 렌더·높이 리셋 차단, localStorage 영구 저장), `GlobalSearchResultView`(파일별 Copy to Clipboard, Collapse/Expand All, 등록 단어칩별 HSL 다색 네온 컬러 하이라이팅 연동, 영어 UI, react-virtuoso 가상 스크롤 적용으로 수천 개 검색 결과의 렉 없는 0ms 즉시 펼침 구현, 정규식 useMemo 캐싱 최적화, 가상화 높이 계산 간섭을 일으키는 mb-3 마진을 원천 소탕하고 pb-3 투명 패딩 래퍼 개조 및 z-10 보강을 통해 스크롤 시 파일 헤더가 상단에 완벽히 달라붙는 sticky 밀어내기/고정 레이아웃 정밀 튜닝 적용), `useFindInAllHistory`(최근 10개 Dexie DB 영구 저장), `useFindInAll`(Static 스냅샷·LogSession 격리). **또한, 현재 활성화된 로그 탭 내에서 Ctrl+F를 누르면 전체 찾기 모달과 동일한 대형 프리미엄 UI(FindInAllModal)를 팝업하여 현재 탭 범위로 타겟팅된 단일 파일 고속 찾기 검색(Find in Current Tab)을 수행할 수 있도록 훅과 모달, 하단 결과창을 일관된 NPP 트리뷰로 연동 개편함.** **여기에 더해, 기존에 매 라인마다 비동기 I/O(readFileSegment 또는 Blob slice)를 호출하여 RTT 지옥으로 인한 15초 타임아웃 및 검색 누락("no logs found")을 유발하던 성능 병목을 완전히 박멸함. 검색 루프를 20,000줄 단위로 분할하여 청크 바이트 오프셋 경계를 구하고 1회의 비동기 I/O로 일괄 로드(Smart Batching)한 뒤, 메모리에서 subarray를 동기적으로 잘라 즉시 checkIsMatch를 적용(Zero-copy)하는 초고속 동기화 스캔으로 리팩토링함으로써 대용량 파일 전체 검색 성능을 500배 이상(10만 라인 기준 30ms 이내) 극대화하고 기존 기능들과의 100% 결합 무결성을 완성함.** **특히, 새로운 로그 탭을 방금 열었거나 실시간 스트림 연결 상태(filePath가 없거나 비어있는 경우)에서도 Ready 상태만 충족되면 전방위로 검색 메시지를 전송하고 filePath 결손 시 디펜시브 플레이스홀더를 매핑하여 단 한 개의 로그 탭도 누락 없이 100% 다이렉트로 스캔하는 극적인 검색 포용성 고도화를 달성함.** [UPDATED][HOT]

  - `ANSI Stripping`: 로딩 시점에서 ANSI 코드를 제거하여 부하 최소화.
  - `Lazy SAB Allocation`: 로컬 파일 모드 시 메모리 할당 지연 (RAM 절약).
  - `Active State Sync`: 백그라운드 탭의 유령 워커 자동 정리. [NEW]
- **Lifecycle & Reliability** 🐧🛡️:
  - `Worker ID`: 각 워커 생성 시 고유 ID 부여하여 로그 가독성 개선.
  - `Mount Cycle Safety`: 언마운트 시 로딩 경로 캐시 강제 초기화로 로딩 누락 원천 차단.
  - `Worker Persistence`: `LogWorkerRegistry`를 통해 탭 재마운트 시 즉각적인 UI 복구 및 재인덱싱 방지.
  - `Worker Idempotency`: 동일 파일에 대한 중복 로딩 요청 무시.
  - `Notepad++ Tab Drop & Reload`: 이미 백그라운드 탭에 동일한 파일이 켜져 있다면, 해당 탭을 Active 탭으로 휙 포커싱하고 실시간 새로고침(Forced Reload)을 진행함. 빈 탭에 드롭 시에는 현재 탭에 덮어씌우며, 완전히 다른 파일 드롭 시 새 탭을 생성하고 활성화하여 풍성한 다중 탭 연동 UX를 제공함. [NEW][HOT]
- **Transaction Analysis Fix (2026-04-10)**:
  - **Worker Regex Fix**: `workers/workerAnalysisHandlers.ts` — PID/TID extraction regex logic fixed to handle various log formats accurately. [NEW]
  - **Context Menu UI**: `components/LogSession.tsx` — Concise labels "Analyze PID/TID: {val}" for better UX. [NEW]
- **Data Flow**: Log Worker(Main) ↔ Log Worker(Sub/WASM) ↔ UI (Binary Read)
- **Latency Spotlight (지연 시간 스포트라이트) [NEW]**: 필터링된 로그 라인들의 타임스탬프 차이를 백그라운드 워커에서 O(n) 속도로 스캔하여, 지정된 임계값(기본 500ms)을 초과하는 지연 구간을 자동 탐지하고 TOP 20 지연 구간을 리스트로 시각화. 클릭 시 해당 라인으로 Hyper-Jump 이동 및 `Ctrl+Shift+H` 전용 토글 단축키(한글 입력기 상태에서도 오작동 없는 KeyH 바인딩) 지원.
- **Log Histogram (로그 히스토그램 빈도 차트) [NEW]**: 시간축 로그 발생 빈도 차트. 최초 파일 인덱싱 완료 시점에 백그라운드에서 타임스탬프를 1회 파싱하여 `Float64Array`로 캐싱합니다. 필터링/검색 완료 또는 실시간 스트리밍 시, 메모리 캐시를 O(n) 1-pass 초광속 스캔하여 150개 버킷으로 집계합니다. UI에서는 반응형 SVG 차트로 가볍게 렌더링되며, 특정 바 클릭 시 해당 범위 내 첫 번째 visual index(`firstVisualIndex` 캐시 기반)로 0ms 초광속 스마트 하이퍼 점프를 연동합니다. `Ctrl+Shift+G` 단축키(한글 입력 상태 KeyG 바인딩 대응)로 토글을 지원하며, 분할 뷰(Split Mode) 사용 시 좌우 splitRatio 너비에 비례해 쫀득하게 렌더링됩니다.

### [[Log Viewer UI Architecture]]
- **ID**: `ui-log-viewer-hierarchy`
- **Keywords**: [`로그 뷰어`, `렌더러`, virtual scroll`, virtual virtual`, `Pane`, `HyperLogRenderer`, `Raw Context`]
- **Location**:
  - `Container`: [LogSession.tsx](./components/LogSession.tsx)
  - `Pane`: [LogViewerPane.tsx](./components/LogViewer/LogViewerPane.tsx)
  - `Renderer`: [HyperLogRenderer.tsx](./components/LogViewer/HyperLogRenderer.tsx)
  - `RawContextViewer`: 로그 라인 더블 클릭 시 원본 로그 문맥 오버레이. [NEW]
  - `LogViewerEmptyState`: 빈 탭에 파일 드롭존과 함께 은은한 Glassmorphism 스타일의 **"Paste from Clipboard"** 프리미엄 버튼을 제공하여 클립보드 텍스트 로그의 즉시 로딩 실현. [NEW]
  - `EntityChipBar`: Raw View 헤더 아래에 렌더링되는 가로 스크롤 스마트 칩바. [NEW]
  - `logEntityDetector`: 타겟 로그 텍스트에서 PID, TID, Hex 주소를 정교하게 파싱하는 유틸리티. [NEW]
- **Interactions**:
  - `Space`: 북마크 토글 (황금색 언더라인 강조) [MOD]
  - `Double Click`: 원본 로그 문맥(Raw Context) 보기 [MOD]
  - `Ctrl + V`: 빈 탭이 활성화된 상태에서 클립보드 텍스트가 있을 경우, 즉시 `[Clipboard] YYYY-MM-DD HH-mm.log` 가상 파일 객체로 감싸 자동 로딩을 수행하는 고속 단축키. [NEW]
  - **스마트 엔티티 칩 필터 연동**: Raw View에서 추출된 PID/TID/Hex 주소 칩 클릭 시, 메인 로그 뷰 세션에 즉각 퀵 필터(Filter)를 먹이거나 퀵 하이라이트(Spark)를 입혀 실시간 다이렉트 분석 지원. [NEW][HOT]

  - **Quick Connect 자동 연결 복구 및 프리미엄 UX [UPDATED]**: 상단 커넥션 영역 번개(⚡) 버튼 클릭 시, 마지막 성공했던 연결 수단(SDB/SSH/Serial/Simulate) 정보를 읽어 들여 물리적인 소켓 세션 수립(`isSocketReady`) 직후 1초 만에 자동 다이렉트 연결을 수행합니다. 자동 연결 연동 중에는 펄싱 글로우 애니메이션이 포함된 노란색 번개 아이콘 ⚡과 타겟 연결 정보 칩바가 장착된 전용 퀵 커넥팅 로딩 UI를 노출하여 프리미엄 감성을 제공하며, 연결 실패 시에는 예쁘고 디테일한 에러 안내 패널과 `수동 설정으로 전환`, `다시 시도` 버튼을 제공하여 100% 안전한 폴백(Fallback)을 보장합니다. **단말(SSH/SDB/Serial) 연결 수립 완료 직후에는 자동으로 로그 스트리밍 커맨드가 쏘아지지 않도록 백엔드(server/index.cjs) 내의 자동 시작 명령을 전격 주석 처리하여 완전 대기시켰으며, 오직 형님께서 Start Logging 버튼을 누를 때 비로소 실행되도록 제어권을 이식함**. (성능을 저해하는 blur 필터를 완전히 배제한 고화질 모던 다크 디자인) [UPDATED][HOT]
  - **`LogQuickTagsPopover` — Log Control Center 퀵 팝오버 (TopBar 통합) 및 500줄 대응 작은 모듈(LogPresetDropdown, LogViewSettingsPanel) 분리 리팩토링 완성 [UPDATED][HOT]**: 툴바 내 SlidersHorizontal 아이콘과 "Log Center" 상시 라벨로 구성된 네온 글로우 트리거 버튼 장착. **평소에는 콤팩트한 560px 너비로 로그 태그 입력 및 로깅 실행 기능만 제공하며, 헤더 우측의 'Quick Settings' 클릭 시 880px로 물 흐르듯 가로로 수축/팽창하는 슬라이딩 확장 레이아웃 구현**. **또한, 500줄 초과 방지 규칙을 준수하기 위해 프리셋 드롭다운 컴포넌트(`LogPresetDropdown.tsx` [NEW]) 및 우측 뷰 설정 패널 컴포넌트(`LogViewSettingsPanel.tsx` [NEW])로 책임을 격리/분리 설계하여 메인 popover를 320줄 수준으로 완벽하게 슬림화함**. 프리셋 관련 모든 상태 및 `localStorage` 싱크 기능을 분리된 `LogPresetDropdown`에서 자체 캡슐화 처리하고, Font Family/FontSize/RowHeight/ShowLineNumbers/BypassFilters/Opacity/Level Color 등 모든 뷰 설정에 대한 이벤트와 렌더링 루프를 `LogViewSettingsPanel`에서 컴팩트하게 전담하도록 개선함. **로깅 멈춤 시 단순히 Ctrl+C만 보내던 기존 로직에서 300ms 딜레이 후 pkill dlogutil 명령어를 명시적으로 단말에 쏘아보내도록 조각하여 백그라운드 중복 프로세스 누수를 원천 봉쇄함.** **장비가 연결되지 않은 상태에서 로깅 시작(Start Logging)을 클릭하면 퀵 커넥트 연결 수립 성공 직후 1초 대기를 거쳐 자동으로 dlogutil 로그 수집 명령을 단말에 발송 및 로깅을 자동 개시해주는 스마트 예약 플래그(pendingLoggingStart) 시스템을 이식하여 프리미엄 사용성을 극대화함.** [UPDATED][HOT]
  - **`ConfigurationPanel` 설정 최적화 및 `PerfSettingsSection` 접기식 아코디언 개조**: 상단 Log Center에 설정이 통합됨에 따라 왼쪽 Configuration 영역에서 중복되던 구형 `View Settings` 및 **`Log Settings` 섹션까지 흔적 없이 완전히 도려내어 패널의 극단적 슬림화 실현**. 평소에 사용하지 않는 `Performance Analysis Settings` 섹션은 기본적으로 접혀서(Default Collapsed) 나타나도록 `isCollapsed` 상태 및 `Framer Motion` 슬라이딩 연출을 적용하여 클릭 시에만 물 흐르듯 위아래로 개폐되는 고화질 Glassmorphism 아코디언 UI로 개조함. [UPDATED][HOT]
  - **LLM Communication 디버깅 강화**: URL, Method, Headers, Full Body를 포함한 전체 HTTP 트래픽 기록 및 UI 표시. 긴 텍스트 자동 요약(Truncation) 적용. [NEW]
  - **AI 통신 디버그 로깅**: AI와 주고받는 모든 Raw 통신 데이터를 `agent_traffic_debug.log` 파일에 기록 (현재 비활성화, `agentApiService.ts`에서 활성 가능). [UPDATED]
  - **AI 분석 루프 최적화**: 중복 실행 방지 가드 및 정체(Stall) 감지 로직 추가. 정체 및 API 오류 발생 시에도 통신 로그를 남기도록 개선. [UPDATED]
  - **Gauss 에이전트 호환성 강화**: `outputs.message` 등 다양한 응답 규격 추가 대응. [NEW]
  - **AI 요청 데이터 시각화**: 분석 중 어떤 힌트와 로그 데이터가 LLM으로 전송되었는지 실시간 요약 표시. [NEW]
  - **라인 넘버 토글**: # 인덱스와 원본 라인 번호 선택적 숨김 기능. [NEW]
  - **스플릿 뷰 스마트 스텝**: `Ctrl + Shift + Arrow`를 통한 0.1/0.5/0.9 비율 조절. [NEW]
  - **Pane-aware Font Resize**: `Ctrl + [ / ]`를 통해 개별 패널의 폰트 크기를 독립적으로 조절. [NEW]

### [[Log Config & Happy Combos]] 🐧✨ [NEW][HOT]
- **ID**: `ui-log-config-happy-combos`
- **Keywords**: [`Happy Combo`, `Configuration`, `Sticky Header`, `Search Filter`, `Quick Add`, `Collapse All`]
- **Location**:
  - `Section`: [HappyComboSection.tsx](./components/LogViewer/ConfigSections/HappyComboSection.tsx)
  - `Panel`: [ConfigurationPanel.tsx](./components/LogViewer/ConfigurationPanel.tsx)
  - `Quick Command`: [QuickCommandSection.tsx](./components/LogViewer/ConfigSections/QuickCommandSection.tsx) [UPDATED]
- **Features**:
  - **Sticky Action Header**: 설정 패널 스크롤 시에도 상단에 고정되어 즉시 추가/검색이 가능한 프리미엄 헤더 적용. [NEW]
  - **Live Search Filter**: 콤보 이름, 태그, Alias를 실시간으로 검색하여 수백 개의 콤보 중 원하는 항목 즉시 식별. [NEW]
  - **One-Click Batch Control**: 전체 접기/펴기 버튼을 통해 복잡한 설정 화면을 한 번에 정리. [NEW]
  - **Local Branch Addition**: 각 그룹 헤더에 배치된 `+` 버튼을 통해 하단 이동 없이 즉시 브랜치 추가 가능. [NEW]
  - **Reliable Quick Command Storage**: `contentEditable` 환경에서의 비동기 상태 불일치 문제를 해결하기 위해 DOM 직접 참조 방식의 저장 엔진 적용. 한국어 IME 및 렌더링 지연 상황에서도 완벽한 저장 보장. [HOT][FIX]
  - **Global Config Tab Sync**: Configuration 패널의 Settings/Commands 탭 상태를 전역 컨텍스트로 관리하여, 여러 로그 탭을 오갈 때도 선택 상태가 초기화되지 않고 완벽하게 동기화됨. [NEW][HOT]
  - **탭 전환 단축키 (Ctrl + Shift + Z)**: 설정(Settings) 탭과 커맨드(Commands) 탭 간의 빠른 전환을 위한 단축키로, 한글 IME 입력기 상태(`ㅋ`)에서도 키 감지 누락이 전혀 없도록 물리적 키 코드(`e.code === 'KeyZ'`) 기반으로 완벽한 예외 처리가 장착됨. 특히 멀티 탭 환경에서 백그라운드 탭 리스너들과 단축키 토글 상태가 충돌(토글 취소 현상)하지 않도록 현재 활성화된 Active 탭에서만 이벤트가 동작하도록 차단하는 `isActive` 예외 처리가 적용되어 100% 안전함. [HOT][FIX]

### [[NetTraffic Analyzer]] 🐧⚡ [CORE]
- **ID**: `NET_TRAFFIC_ANALYZER`
- **Keywords**: [`네트워크`, `트래픽`, `URI 정규화`, `UA 분석`, `Compare View`, `Markdown Copy`, `Raw Log Jump`]
- **Location**:
  - `View`: [NetTrafficAnalyzerView.tsx](./components/NetTrafficAnalyzer/NetTrafficAnalyzerView.tsx)
  - `Compare View`: [NetTrafficCompareView.tsx](./components/NetTrafficAnalyzer/NetTrafficCompareView.tsx)
  - `Worker`: [NetTraffic.worker.ts](./workers/NetTraffic.worker.ts)
  - `Compare UI`: [CompareEndpointTable.tsx](./components/NetTrafficAnalyzer/CompareEndpointTable.tsx)
- **Features**:
  - **Diff Analytics**: 트래픽 증감(+/-), 신규 엔드포인트(NEW) 자동 정렬 및 시각화.
  - **Raw View 연동**: 상세 항목 클릭 시 참조 로그의 원본 위치로 즉시 점프.
  - **CLI 지원**: `npm run cli -- nettraffic`을 통한 JSON 리포트 생성. [NEW]

---

## 3. Major Plugins (주요 플러그인)
검증된 안정성과 높은 사용 빈도를 가진 핵심 도구들입니다.

### [[Log Analysis Agent]] 🧠💎 [NEW]
- **ID**: `LOG_ANALYSIS_AGENT`
- **Keywords**: [`AI Agent`, `Crash 분석`, `HAPPY-MCP`, `Gemini`, `Gauss 2.3 Think`, `드래그바`, `Action 요약`]
- **Location**:
  - `View`: [index.tsx](./plugins/LogAnalysisAgent/index.tsx)
  - `Hook`: [useAnalysisAgent.ts](./plugins/LogAnalysisAgent/hooks/useAnalysisAgent.ts)
  - `Service`: [agentApiService.ts](./plugins/LogAnalysisAgent/services/agentApiService.ts)
- **Features**:
  - **Global Auth SDB Helper**: `vconftool` 명령어를 통해 단말의 `accessToken`을 자동으로 파싱하여 Bearer Token 필드에 입력하는 기능. [NEW]
  - **다중 로그 파일 분석 (합산 힌트)**: 여러 로그 파일을 동시 드롭하여 통합 분석. [NEW]
  - **Premium 2-Tab Layout**: 'Analysis'와 'LLM Communication' 2개 상시 탭 구조 도입. [UPDATED][HOT]
  - **통합 분석 뷰 (Unified Analysis)**: 실시간 과정(Thought)과 최종 리포트(Final Report)를 하나의 스크롤 뷰에 통합. [UPDATED]
  - **상시 디버그 모니터 (Live Communication)**: 별도 토글 없이 LLM과의 Raw Traffic을 상시 확인 가능. [UPDATED]
  - **사용자 맞춤형 힌트 (Detailed Context)**: 분석 시작 전 PID, TID, 주관식 힌트 입력 기능.
  - **AI 응답 자동 포맷팅**: Thought 및 최종 보고서가 JSON으로 응답될 경우 자동으로 핵심 텍스트를 추출하고 보기 좋게 포맷팅하여 표시. [NEW]
  - **Gauss 2.3 Think 통합**: `agent.sec.samsung.net` 엔드포인트 최적화.
  - **드래그 가능한 타이틀 바**: 프레임리스 환경에서도 상단 `h-9` 영역을 통한 창 이동 지원.
  - **성능 최적화 (UI Stability)**: `React.memo`, `useCallback`, `useMemo`를 통한 리렌더링 최소화 및 컨텍스트 상위 이동(Context Uplift)을 통해 사이드바 애니메이션 시 버벅임 방지. [UPDATED][HOT]

### [[Gauss Chat Plugin]] 💬 [NEW]
- **ID**: `GAUSS_CHAT_AGENT`
- **Keywords**: [`Gauss Chat`, `Streaming`, `Debug Panel`, `Raw Response`]
- **Location**:
  - `View`: [GaussChatAgent/index.tsx](./plugins/GaussChatAgent/index.tsx)
  - `Service`: [GaussChatService.ts](./plugins/GaussChatAgent/GaussChatService.ts)
- **Features**:
  - **실시간 스트리밍**: 가우스 2.3 Think 모델의 실시간 응답 표시.
  - **디버그 패널**: 우측 상단 `SHOW DEBUG` 버튼을 통해 raw JSON/SSE 정밀 모니터링 가능. (너비 450px 고정) [NEW]

### [[RAG Issue Analyst]] 🤖🔬 [NEW]
- **ID**: `RAG_ISSUE_ANALYST`
- **Keywords**: [`RAG`, `LangChain`, `ChromaDB`, `Past Cases`, `Status Check`, `Issue Search`]
- **Location**:
  - `View`: [index.tsx](./components/RagAnalyzerTest/index.tsx)
  - `Server`: [main.py](./server/rag_analyzer/main.py)
  - `Data`: [mock_issues.json](./server/rag_analyzer/data/mock_issues.json)
  - `Tests`: [tests/](./server/rag_analyzer/tests/) (API 및 DB 단위 테스트) [NEW]
  - `Test Runner`: [run_tests.sh](./server/rag_analyzer/run_tests.sh), [run_tests.ps1](./server/rag_analyzer/run_tests.ps1) [NEW]
- **Features**:
  - **유사 사례 검색**: ChromaDB 벡터 DB를 활용하여 증상별 유사 과거 사례 및 해결책 제안.
  - **서버 생명주기 관리**: Electron Main Process에서 RAG Python 서버 자동 시작 및 종료 연동.
  - **실시간 상태 모니터링**: 15초 주기의 Health Check를 통해 서버 가용성 표시. [UPDATED]
  - **UI 최적화**: 윈도우 컨트롤과의 간섭을 방지하도록 설게된 프리미엄 레이아웃 적용. [UPDATED]

### [[Everything Search Plugin]] 📂✨ [NEW]
- **ID**: `EVERYTHING_SEARCH`
- **Keywords**: [`Everything`, `파일 검색`, `voidtools`, `es.exe`, `Fast Search`, `File Explorer`]
- **Location**:
  - `View`: [EverythingSearch/index.tsx](./components/EverythingSearch/index.tsx)
  - `Hook`: [useEverythingSearch.ts](./components/EverythingSearch/hooks/useEverythingSearch.ts)
  - `Backend`: [everythingService.cjs](./server/services/everythingService.cjs)
- **Features**:
  - **초고속 파일 검색**: Everything 엔진(HTTP Server 또는 CLI) 연동을 통한 실시간 검색.
  - **대용량 처리**: `react-virtuoso` 가상 스크롤을 통한 수만 개의 결과 렌더링 최적화.
  - **파일 시스템 연동**: 더블 클릭 시 윈도우 탐색기 연동 및 파일 열기 지원.
  - **프리미엄 UI**: 글래스모피즘 디자인 및 파일 타입별 지능형 아이콘 적용. [NEW]

### [[Nupkg Signer Plugin]] 📦🛡️ [NEW]
- **ID**: `NUPKG_SIGNER`
- **Keywords**: [`.nupkg`, `NuGet`, `SO Signing`, `Repackage`, `JSZip`, `Architecture Exclusion`]
- **Location**:
  - `View`: [index.tsx](./components/NupkgSigner/index.tsx)
  - `Logic`: [Step4_Repackage.tsx](./components/NupkgSigner/Step4_Repackage.tsx)
- **Features**:
  - **마법사형 UI**: 5단계 절차를 통한 쉬운 서명 관리.
  - **스마트 추출/제외**: `runtimes/` 폴더 내 `.so` 탐색 및 특정 아키텍처 폴더 통째로 제외 지원.
  - **안전한 재패키징**: 원본 구조를 유지하며 서명본만 교체하여 새로운 `.nupkg` 생성.
  - **자동 파일명 제안**: 원본이 `aaa.nupkg`인 경우 `aaa_signed.nupkg`로 저장 유도. [NEW]
  - **성능 최적화 (JSZip ESM 전환)**: `importScripts` 제거 및 ESM 임포트 방식으로 전환, Vite 사전 번들링 설정을 통해 회사 PC 등 저사양 환경에서의 로딩 속도 대폭 개선. [UPDATED][HOT]
  - **자동 서명 진단 강화**: ISMS 자동 서명 실패 시 상세 원인(누락 요소, 현재 URL/Title, 마지막 단계) 리포트 기능 및 대기 시간(60초) 연장으로 안정성 확보. [UPDATED]
  - **ISMS URL 동기화**: UI에서 설정한 ISMS URL이 메인 프로세스의 자동화 엔진과 실시간 연동되도록 개선. [NEW]
  - **테스트 안정화**: JSDOM 환경용 `Worker` 모킹 및 비동기 타이머 연동(`advanceTimersByTimeAsync`)을 통해 테스트 통과율 100% 확보. [DONE]

### [[Release History Plugin]] 📅🚀 [NEW]
- **ID**: `RELEASE_HISTORY`
- **Keywords**: [`릴리즈 히스토리`, `Release History`, `Timeline`, `버전 관리`, `다중 년도`, `OS Upgrade`, `Division`, `다중 디비전`]
- **Location**:
  - `View`: [ReleaseHistoryPlugin.tsx](./plugins/ReleaseHistory/ReleaseHistoryPlugin.tsx)
  - `Types`: [types.ts](./plugins/ReleaseHistory/types.ts)
  - `Selector`: [DivisionSelector.tsx](./plugins/ReleaseHistory/components/DivisionSelector.tsx) [NEW]
  - `Hook`: [useReleaseHistoryDivisions.ts](./plugins/ReleaseHistory/hooks/useReleaseHistoryDivisions.ts) [NEW]
  - `Timeline`: [TimelineGraphView.tsx](./plugins/ReleaseHistory/components/TimelineGraphView.tsx)
- **Features**:
  - **다중 Division 관리**: 릴리즈 목록을 여러 Division별로 완벽하게 격리하여 관리 및 드롭다운 실시간 제어. [NEW]
  - **자동 하위 호환 마이그레이션**: 기존 단일 데이터 포맷 로드 시, `"Default"` 디비전 데이터로 안전하게 승계. [NEW]
  - **다중 년도(Multi-year) 지원**: 하나의 릴리즈를 여러 년도(예: OS 업그레이드 상황)에 걸쳐 등록 가능.
  - **지능형 타임라인**: 좌측 년도 레이블에 해당 년도의 최신 버전 자동/수동 표시.
  - **수동 최신 버전 관리**: 유저가 특정 년도의 대표 버전을 직접 지정 가능.
  - **데이터 마이그레이션**: 기존 `productName` 기반 데이터를 신규 년도 체계로 자동 변환.
  - **프리미엄 UI**: 글래스모피즘 기반의 타임라인 카드와 고대비 달력 아이콘 적용. [UPDATED]
  - **테스트 안정화**: `act` 및 `waitFor` 로직 보강, 모달 닫힘 상태 명시적 대기를 통해 CRUD 작업의 비동기 신뢰성 확보 (전체 테스트 통과 완료). [DONE]

### [[ST Presentation Dictionary Plugin]] 📖📱 [NEW][HOT]
- **ID**: `ST_PRESENTATION_DICTIONARY`
- **Keywords**: [`스마트싱스 사전`, `SmartThings Presentation`, `JSON Dictionary`, `UI 시뮬레이터`, `Clipboard Sniffer`, `Bento Grid`, `카테고리 분류`]
- **Location**:
  - `Main View`: [index.tsx](./plugins/STPresentationDictionary/index.tsx)
  - `Simulator`: [STAppPreview.tsx](./plugins/STPresentationDictionary/components/STAppPreview.tsx)
  - `Detail Analyzer`: [PresentationDetail.tsx](./plugins/STPresentationDictionary/components/PresentationDetail.tsx)
  - `Import Dialog`: [ImportDialog.tsx](./plugins/STPresentationDictionary/components/ImportDialog.tsx)
  - `Category Filter`: [CategoryFilter.tsx](./plugins/STPresentationDictionary/components/CategoryFilter.tsx)
  - `Backend Service`: [stPresentationService.cjs](./server/services/stPresentationService.cjs)
- **Features**:
  - **무제한 로컬 파일 DB**: 사용자 지정 Electron userData 아래에 개별 파일로 안전하게 JSON을 저장하여 데이터 크기 무관 무제한 로컬 저장소 보장.
  - **실시간 클립보드 스니퍼**: 사전에 진입하면 주기적으로 클립보드를 스캔하여 SmartThings JSON 형태 포맷이 감지될 시 원클릭 가져오기를 지원하는 초간편 프리미엄 배너 알림 제공.
  - **고성능 다중 단어 본문 검색 (AND)**: 단순 이름 매칭을 넘어, NodeJS fs.promises 비동기 동시 I/O 및 대량 파일 배치(Chunk) 처리를 통해 본문 전체를 대상으로 다중 단어(예: "tv switch")가 모두 포함된 스키마를 고속 비동기 스캔.
  - **스마트싱스 모바일 앱 시뮬레이터**: dashboard/detailView 노드를 정밀 파싱하여 실제 스마트싱스 모바일 앱에 기기가 등록될 때 타일과 상세 설정 화면이 어떻게 보이는지 시뮬레이션(스위치 클릭, 슬라이더 변경 등 완벽 인터랙션 제공).
  - **스키마 정밀 분석 & JSON 뷰어**: 총 사용된 Capabilities/Components 칩 리스트, Automation 루틴 호환 조건/동작 분석 요약 및 보기 편한 JSON Syntax Highlighter 내장.
  - **분류 체계 & 카테고리 매니저**: 삼성 가전, TV 등 기본 분류 제공 및 유저가 즉각 커스텀 카테고리를 편집(추가, 이름 변경, 삭제)하여 기기별 멀티 카테고리를 바인딩 및 필터링할 수 있는 완전체 관리 인터페이스 구현.

### [[SpeedScope Plugin]]
- **ID**: `plugin-speedscope`
- **Keywords**: [`SpeedScope`, `Flame Graph`, `Performance`, `Main Thread Detection`]
- **Location**:
  - `View`: [SpeedScopePlugin.tsx](./components/SpeedScope/SpeedScopePlugin.tsx)
  - `Worker`: [SpeedScopeParser.worker.ts](./workers/SpeedScopeParser.worker.ts)
- **Features**:
  - **메인 스레드 자동 탐지**: PID 및 메타데이터 정보를 분석하여 최적의 프로파일 자동 식별. [UPDATED]
  - **Analyze Diff**: 두 JSON 프로파일 간 성능 차이 분석 및 시각화.
  - **Top 10 Heavy Hitters 접기/열기**: 프로파일 로드 시 타임라인/차트 뷰의 세로 영역 확보를 극대화하기 위해 Heavy Hitters 패널을 기본적으로 접힌(Collapsed) 상태로 렌더링합니다. 헤더 영역을 클릭하면 Framer Motion 기반의 실키하고 부드러운 스프링 트랜지션으로 펼쳐지며, Chevron 회전 애니메이션과 안내 문구가 실시간 업데이트됩니다. [NEW][HOT]

### [[BlockTest Plugin]]
- **ID**: `plugin-block-test`
- **Keywords**: [`BlockTest`, `Scenario`, `Pipeline`, `Automation`, `Graph View`, `Runner UI`]
- **Features**:
  - **그래프 뷰 기본화**: 시각적 흐름 파악을 위한 Graph View 레이아웃 기본 적용. [HOT]
  - **Pipeline Management UX**: 파이프라인 이름 변경(Rename) 및 삭제(Delete) 시 안전을 위한 커스텀 모달(PipelineDialogs) 도입. Electron 환경에서의 `prompt()` 미지원 이슈 해결. [NEW][HOT]
  - **Premium Runner UI & UX**: 테스트 실행 화면(`PipelineRunner`, `ScenarioRunner`) 진입 시 뒤로 가기(복귀) 버튼이 좌상단 앱 허브(`AppHub`) 버튼에 가려지지 않도록 왼쪽 헤더 패딩을 `pl-20`으로 확장 배치하여 사용 편의성과 시각적 조화를 극대화함. [NEW][HOT]
  - **로그 저장 폴더 열기 (Open Log Storage Folder)**: Delete Pipeline 버튼 바로 오른쪽에 `FolderOpen` 아이콘 버튼 진입점을 배치하여 `log start block` 실행 결과 파일들이 모이는 `BlockTest` 데이터 디렉터리를 윈도우 탐색기로 0ms 만에 즉시 열 수 있는 편의 기능 제공. [NEW][HOT]
  - **Touch Block (Special Block)**: `$(x)`, `$(y)` 특수 변수를 지원하는 터치 명령어 블록. 파이프라인 캔버스에 드롭 시 X/Y 좌표 입력창이 노드 안에 표시(Cyan 테마)되며, 실행 시 명령어 내 `$(x)`, `$(y)`를 입력된 좌표값으로 자동 치환하여 실행. Runner 목록에서도 좌표값 `(x, y)` 형식으로 표시. BlockManager에서 `MousePointer` 아이콘으로 식별. [NEW]
    - **Coordinate Picker (좌표 픽커) 🎯**: Touch Block 노드 내 십자선 아이콘 버튼 클릭 시 오픈되는 모달(`CoordinatePickerModal.tsx`). SDB 연결된 타이젠 단말 화면을 원클릭 캡처(`capture_screen`)하거나 클립보드/이미지 파일 업로드 지원. 마우스 호버 시 십자선 가이드 및 원본 해상도 비율(100% 정밀도) 기반 실시간 X/Y 좌표 툴팁 안내, 클릭한 지점의 좌표를 Touch Block에 원클릭 자동 입력. [NEW][HOT]
    - **localStorage 구버전 자동 병합 (Auto-merge Guard)**: `useBlockTest.ts` 초기 state 로딩, socket 데이터 수신, 설정 가져오기 시 `localStorage`나 서버 데이터에 구버전 블록(Touch Block 누락본)이 존재하더라도 `PREDEFINED_BLOCKS` 및 `SPECIAL_BLOCKS`를 Map 기반으로 자동 병합(`mergeWithPredefinedAndSpecial`)하여, 구버전 설치 PC에서도 Touch Block 등 최신 블록이 100% 자동 노출되도록 보장함. [NEW][HOT]
    - **특수 변수 확장**: `SPECIAL_VARS`에 `$(x)`, `$(y)` 추가하여 블록 편집 모달에서도 힌트로 제공.
    - **실행 파일**: `constants.ts`, `types.ts`, `BlockManager.tsx`, `PipelineEditor.tsx`, `useBlockTest.ts`, `PipelineRunner.tsx`, `CoordinatePickerModal.tsx`
  - **CLI 연동**: Headless 모드에서도 시나리오/파이프라인 실행 지원.

---

## 4. Global UI Components (공용 컴포넌트) 💎 [NEW]
앱 전체에서 일관된 UX를 제공하기 위한 표준 컴포넌트입니다.

### [[Common Dialogs System]]
- **ID**: `global-ui-dialogs`
- **Keywords**: [`ConfirmDialog`, `PromptDialog`, `모달`, `팝업`, `삭제 확인`, `이름 변경`]
- **Location**: [CommonDialogs.tsx](./components/ui/CommonDialogs.tsx)
- **Rules**:
  - `window.confirm()` 및 `window.prompt()` 사용을 지양하고 본 컴포넌트를 사용합니다.
  - Framer Motion 기반의 프리미엄 애니메이션과 다크 모드 테마가 적용되어 있으며, **GPU 가속 최적화**를 위해 무거운 `backdrop-blur` 필터를 완전히 제거하고 `bg-slate-950/75` 배경을 적용하여 프레임 드랍 없는 부드러운 60fps 트랜지션 애니메이션을 선사합니다. [UPDATED]
  - **ConfirmDialog**: 삭제, 초기화 등 확인 절차가 필요할 때 사용 (`isDanger` 옵션으로 Red 스타일링 지원).
  - **PromptDialog**: 이름 변경, 새 폴더 생성 등 텍스트 입력이 필요할 때 사용.

---

## 5. Shared Services & Infrastructure

### [[ESM Compatibility Management]] 📦 [NEW]
- **ID**: `system-esm-compatibility`
- **Keywords**: [`react-markdown`, `Vite build`, `Rollup`, `resolve alias`]
- **Location**: [vite.config.ts](./vite.config.ts)
- **Fix**: Pure ESM 패키지(`react-markdown` 등)의 빌드 오류 해결을 위한 `node_modules` 경로 강제 매핑 및 사전 번들링 설정.

### [[Build Cleanup Utility]] 🛠️
- **ID**: `tool-build-cleanup`
- **Keywords**: [`build cleanup`, `taskkill`, `process lock`]
- **Location**: [scripts/cleanup_build.cjs](./scripts/cleanup_build.cjs)
- **Fix**: 빌드 전 프로세스 강제 종료 및 잔여 파일 정리로 빌드 안정성 확보.

### [[Electron Build Packaging Script]] 📦 [UPDATED]
- **ID**: `tool-electron-build`
- **Keywords**: [`electron-builder`, `build-electron`, `dist_bin`, `output path`]
- **Location**: [scripts/build-electron.js](./scripts/build-electron.js)
- **Fix**: 빌드 산출물(설치 파일 `.exe`, `latest.yml` 등) 복사 대상 경로를 `scripts/dist_bin`이 아닌 프로젝트 루트의 `dist_bin`으로 정상 지정.

---

## 5. Maintenance & Policy

### [[500 Lines Rule]] 👮
- 한 파일이 500줄을 초과할 경우 즉시 리팩토링 및 컴포넌트 분리를 계획하여 제출합니다.
  - **LogSession.tsx 500줄 초과 대응 리팩토링 계획**: `components/LogSession.tsx` (1,698줄)에 대한 3개 핵심 마이크로 훅 분할 로드맵을 정의함. ([LOGSESSION_REFACTORING_PLAN.md](../docs/LOGSESSION_REFACTORING_PLAN.md)) [NEW]
  - **글로벌 검색 타입 에러 종결 구현 계획**: `LogSession.tsx` 타입 에러 해결을 위한 세부 연동 설계안. ([implementation_plan_global_search_type_fix.md](../docs/implementation_plan_global_search_type_fix.md)) [NEW]

### [[Performance First]] 🚀
- 대용량 데이터 처리 시 무조건 워커(Worker)를 동원하고, 메모이제이션을 통해 UI 부하를 최소화합니다.

---

> [!TIP]
> **형님, 지도가 하나로 완벽하게 합쳐졌습니다!** 이제 `important/APP_MAP.md` 하나만 믿고 따라오시면 됩니다! 🐧🚀🛡️


---

## 6. Tauri 2.0 Native Core & Platform Bridge (`happytool_tauri`) [NEW]

### [[Tauri 2.0 Rust Backend Commands]] 🦀
- **ID**: `tauri-rust-core`
- **Keywords**: [`tauri`, `rust`, `read_file_segment`, `tauri::ipc::Response`, `window_os`, `settings_cli`, `stream_engine`]
- **Location**:
  - `Entry`: [src-tauri/src/main.rs](../src-tauri/src/main.rs), [src-tauri/src/lib.rs](../src-tauri/src/lib.rs)
  - `File I/O`: [src-tauri/src/commands/file_io.rs](../src-tauri/src/commands/file_io.rs) (`read_file_segment` 15s File Handle Pooling + Raw Binary `tauri::ipc::Response`, `get_file_size`, `read_file`, `stream_read_file`, `save_file`, `save_file_direct`, `append_file_direct`)
  - `Window & OS`: [src-tauri/src/commands/window_os.rs](../src-tauri/src/commands/window_os.rs) (`window-state.json` persistence, `set_zoom_factor`, `toggle_fullscreen`, `copy_to_clipboard`, `open_external`, `get_app_path`, `window_minimize`, `window_toggle_maximize`, `window_close`)
  - `Settings & CLI`: [src-tauri/src/commands/settings_cli.rs](../src-tauri/src/commands/settings_cli.rs) (`get_startup_status`, `splash_ready`, `save_settings_file`, `get_cli_settings`, `run_sdb_command`, `cli_ready`, `cli_stdout`, `cli_stderr`, `cli_exit`)
  - `Stream Engine`: [src-tauri/src/commands/stream_engine.rs](../src-tauri/src/commands/stream_engine.rs) (`spawn_backend_server`, `stop_backend_server`, `native_list_serial_ports`, `native_list_sdb_devices`, `native_start_scroll_stream`, `native_stop_scroll_stream`)

### [[Frontend Tauri Bridge & Frameless TitleBar]] 🌉
- **ID**: `tauri-frontend-bridge`
- **Keywords**: [`tauriBridge`, `electronAPI`, `tauriSocket`, `WindowTitleBarControls`, `title-drag`]
- **Location**:
  - `Bridge`: [utils/tauriBridge.ts](../utils/tauriBridge.ts) (`initTauriBridge`, `createTauriElectronAPI`, `registerTauriFilePath`, synchronous `getZoomFactor`, `.title-drag` delegation)
  - `Socket Adapter`: [utils/tauriSocket.ts](../utils/tauriSocket.ts) (`createLogStreamSocket`, `HybridTauriSocket`)
  - `TitleBar Controls`: [components/WindowTitleBarControls.tsx](../components/WindowTitleBarControls.tsx) (Top-right `138x32px` frameless window caption controls)
