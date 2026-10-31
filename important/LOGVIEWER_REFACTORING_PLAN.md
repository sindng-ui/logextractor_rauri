# LogViewerPane.tsx 리팩토링 및 플러그인 영향도 분석

본 문서는 `REFACTORING_GUIDE.md`의 원칙에 따라 현재 약 970줄에 달하는 `LogViewerPane.tsx`를 어떻게 안전하고 효율적으로 리팩토링할 것인지에 대한 구체적인 계획과, 이 작업이 **플러그인 시스템에 미치는 영향**을 정리한 문서입니다.

---

## 🛠️ 1. LogViewerPane 리팩토링 계획 (TDD & SRP 기반)

### 목표: UI와 순수 비즈니스 로직(스크롤, 키보드 제어, 데이터 패칭)의 완벽한 분리

**단계 1: 타입 및 인터페이스 외곽 분리 (`types/LogViewer.ts`)**
- `LogViewerPaneProps` 및 `LogViewerHandle`을 별도 파일로 추출하여 상단 공간을 확보하고 재사용성을 높입니다.

**단계 2: 비즈니스 로직을 다수의 Custom Hooks로 분할**
거대한 하나의 파일에 묶여있던 로직들을 목적에 맞게 스마트하게 나눕니다.
- `useLogViewerScroll`: 자동 스크롤(Smart Auto-Scroll), 페이징, `atBottom` 상태, 휠 동기화(`onSyncScroll`) 등 스크롤 관련 로직 전담.
- `useLogViewerDataSync`: `loadMoreItems`, `cachedLines`, Virtuoso의 `onScrollRequest` 연동 등 데이터 로딩/캐싱 로직 전담.
- `useLogViewerKeyboard`: 단축키(Ctrl+C, Ctrl+B, Home/End, 화살표 등) 제어 로직 방어.
- `useLogViewerSelection`: Shift/Ctrl 클릭을 통한 라인 다중 선택, Drag, 마우스 이벤트 전담.

**단계 3: 서브 UI 컴포넌트 추출 (Sub-components)**
- `TopBar` (Toolbar): 파일 드랍, 복사, 저장, 북마크, 분석 버튼 모음을 `LogViewerToolbar.tsx`로 분리.
- `EmptyState`: 파일이 로드되지 않았을 때의 Drop Zone UI를 별도 컴포넌트로 분리.
- `PerfDashboardContainer`: 성능 분석(`BarChart3`) 활성화 시 나타나는 대시보드 마운트 로직 분리.

**단계 4: TDD 기반 검증**
- `useLogViewerScroll`의 바닥 감지 로직이나, `useLogViewerDataSync`의 데이터 캐싱 로직에 대해 unit test를 선행 작성하여 분리 시 side-effect가 발생하지 않음을 증명합니다.

---

## 🧩 2. 플러그인(Plugins)에 미치는 영향 분석

`LogViewerPane`은 앱의 메인 뷰어이자 텍스트가 렌더링되는 코어 컴포넌트입니다. 따라서 이곳을 리팩토링할 때, 컴포넌트와 직간접적으로 엮여있는 플러그인들이 영향을 받을 수 있습니다.

### 1) 영향을 받는 플러그인 및 도구들

*   **Transaction Analyzer (TransactionDrawer)**
*   **Log Archive (Save Selection)**
*   **Bookmarks Modal & GoToLine Modal**
*   **PerfTool (Raw Context Viewer)**

### 2) 플러그인 내 어떤 부분이 영향을 받는가? (Impact Points)

#### 🅰️ 텍스트 다중 선택 및 네이티브 드래그 (DOM & Window Selection)
- **영향받는 기능**: Log Archive의 `Save Selection` (드래그한 부분 로그 저장) 기능 및 `ContextMenu` 우클릭 저장 로직.
- **원인**: `LogViewerPane`의 `handleLineMouseDown` 및 `handleLineMouseEnter` 로직(Alt키 조합 등)이 `useLogViewerSelection` 훅으로 분리되면서, 리액트 이벤트의 브라우저 기본 동작(`e.preventDefault()`) 방어 로직의 타이밍이 달라질 경우 텍스트 선택이 풀리거나 드래그가 끊길 위협이 있습니다.
- **안전 대책**: 텍스트 네이티브 선택 영역(`window.getSelection()`)과 커스텀 라인 선택(`selectedIndices`)을 구분하는 기존의 엄격한 Alt/Ctrl 마우스 이벤트를 완벽히 그대로 Hook으로 이관하고 검증해야 합니다.

#### 🅱️ Active Line Index 및 Offset 동기화
- **영향받는 기능**: Transaction Analyzer에서 특정 로그 라인의 ID를 추출할 때, 또는 Bookmark 플러그인에서 라인 위치를 점프할 때.
- **원인**: `absoluteOffset`(청크/세그먼트 단위 가상화)과 `activeLineIndex` 간의 맵핑을 통해 현재 화면에 로드된 로그 데이터를 외부(LogContext)에 알립니다. 스크롤 훅 분리 시 ഈ `scrollToIndex`나 `scrollBy`의 타이밍이 미세하게 어긋나면 플러그인들이 엉뚱한 로그 데이터를 가리킬 위험이 생깁니다.
- **안전 대책**: `LogViewerHandle` 인터페이스의 `scrollToIndex` 및 `getScrollTop` 동작을 분해 후에도 `forwardRef`를 통해 100% 동일하게 노출함으로써 플러그인단의 의존성을 완벽히 보호해야 합니다.

#### 🅲️ 마우스 우클릭 (ContextMenu) 브릿지
- **영향받는 기능**: 플러그인들이 등록한 외부 액션 (예: '트랜잭션 분석하기') 메뉴 표출.
- **원인**: `onContextMenu` 이벤트 버블링 처리. 리팩토링 중에 컨테이너 레이어가 추가되거나 분리되면서 브라우저 네이티브 이벤트 캡처링 단계가 어긋날 수 있습니다. 
- **안전 대책**: 최상위 래퍼 컴포넌트에서만 `onContextMenu`를 위임받아 처리하도록 투명하게 통과시키는 구조를 유지해야 합니다. 
