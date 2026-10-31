# Perf Tool 상세 명세 (Antigravity 용)

이 문서는 HappyTool의 성능 분석 핵심 도구인 **Perf Tool**과 **Log Extractor의 성능 분석 기능**에 대한 기술적 로직, 명세 및 주의사항을 담고 있습니다.

---

## 🚀 1. Overview

HappyTool은 로그 데이터를 기반으로 시스템의 동작 시간과 병목 구간을 시각화하기 위해 두 가지 형태의 성능 분석 도구를 제공합니다.

1.  **Log Extractor - Analyze Performance**: 현재 열려있는 로그 뷰어의 필터링된 데이터를 실시간으로 차트화합니다.
2.  **Perf Tool**: 별도의 독립된 파일이나 대용량 로그 전체를 대상으로 PIDDiscovery(자동 PID 찾기) 및 심층 성능 분석을 수행합니다.

**v1.2.0 Refactor**: 거대했던 `PerfDashboard` 구조를 **컴포넌트 중심의 모듈형 아키텍처**로 완전히 재설계했습니다. 핵심 로직을 Hook으로 분리하고, 캔버스 렌더링과 레이아웃을 독립된 컴포넌트로 격리하여 유지보수성과 성능을 극대화했습니다.

---

## 🛠️ 2. 아키텍처 및 로직

v1.2.0부터는 관심사 분리(Separation of Concerns)를 위해 다음과 같은 구조를 따릅니다.

### 2.1 컴포넌트 구조
*   **`PerfDashboard`**: 대시보드의 전체 오케스트레이션을 담당하는 메인 컨테이너. (500라인 이하 최적화)
*   **`PerfChartLayout`**: TID 사이드바, 타임 축, 플레임 차트 캔버스 영역의 레이아웃을 구성. (`flex-row` 기반 중첩 방지)
*   **`PerfFlameGraph`**: Canvas API를 사용한 고속 플레임 차트 렌더링. 픽셀 그리드 최적화 및 세그먼트 텍스트 드로잉 담당.
*   **`PerfTopBar` / `PerfDashboardHeaderBar`**: 스코어카드, 검색, 필터, 뷰 모드 전환 등 제어부 담당.
*   **`PerfSegmentDetail`**: 선택된 세그먼트의 상세 소스 정보 및 실행 컨텍스트 시각화.
*   **`PerfMinimap`**: 전체 범위를 한눈에 보고 빠르게 탐색할 수 있는 미니맵 UI.

### 2.2 핵심 Hook
*   **`usePerfDashboardState`**: 검색, 필터링, 선택 상태, 줌 데이터 등 대시보드의 비즈니스 로직 중앙 집중화.
*   **`usePerfFlameData`**: 캔버스에 그릴 세그먼트의 데이터 가공, 정렬, 레인(Lane) 배정 로직 수행.
*   **`usePerfZoomLogic`**: 휠/드래그를 통한 정밀 줌 및 팬(Pan) 애니메이션 제어.

### 2.3 시각화 명세
*   **Segment Naming Algorithm**: 세그먼트 내부에 `FileName: FunctionName(Line)` 형식을 최우선으로 표시하여 소스코드 연동성을 강화했습니다.
*   **Premium Visuals**: 현대적인 둥근 모서리(`roundRect`) 디자인과 가독성을 고려한 배경색(`bg-slate-900/95`) 및 백드롭 블러 처리를 적용했습니다.
*   **Safety Highlight**: 검색어 매칭 시 또는 선택 시 흰색 보더 및 선명도 조절로 명확한 시각적 피드백을 제공합니다.

---

## 🎯 3. 데이터 추출 및 분석 기술

*   **PID/TID 추출**: `extractLogIds` 유틸리티를 사용하여 로그 본문의 숫자가 오탐되는 것을 방지하기 위해 **소스 파일명 좌측 영역**에서만 식별자를 추출하는 엄격한 로직을 적용합니다.
*   **Source Metadata**: `extractSourceMetadata`를 통해 로그에서 파일명과 함수명을 분리하여 세그먼트의 `fileName`, `functionName` 필드에 저장합니다.
*   **Web Worker 기반 분석**: 모든 분석 연산은 `PerfTool.worker.ts`에서 수행되어 메인 스레드의 프리징을 방지합니다.

---

## 📝 4. 유지보수 주의사항 (Antigravity AI 필독)

### 4.1 레이아웃 일관성
*   TID 사이드바는 `sticky`와 배경색을 활용하여 차트 내용과 겹쳐도 글자가 식별 가능해야 합니다.
*   시간 눈금은 상단에 고정되어야 하며, `overflow-visible`을 통해 레이블이 잘리지 않도록 유지해야 합니다.

### 4.2 성능 및 가독성
*   **Canvas Culling**: 화면 밖 데이터는 렌더링에서 제외합니다.
*   **Inactive Control**: `isActive` Prop을 통해 컴포넌트가 가려진 경우 렌더링 루프를 완전히 중단하여 자원을 절약해야 합니다.
*   **Text Clipping**: 세그먼트 폭이 좁은 경우 텍스트를 생략하거나 생략 기호(...)를 사용하여 UI가 깨지지 않게 관리합니다.

---

**업데이트 일자**: 2026-02-27  
**상태**: v1.2.0 컴포넌트 모듈화 및 UI 정밀화 완수  
