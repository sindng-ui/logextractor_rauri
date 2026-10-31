# Log Extractor 상세 명세 (Antigravity 용)

이 문서는 미래의 구글 Antigravity AI가 HappyTool의 핵심 기능인 **Log Extractor**를 정확하게 이해하고 유지보수/확장할 수 있도록 돕기 위해 작성되었습니다.

---

## 🚀 Mission (Rule) & Configuration

Log Extractor의 모든 동작은 **Mission(또는 Rule)**이라는 설정 단위로 관리됩니다. `Ctrl + \`` 단축키를 통해 설정 패널을 여닫을 수 있습니다.

### 1. Configuration 주요 항목
- **Happy Combo (해피 콤보)**: 
    - **OR of ANDs** 로직을 사용합니다.
    - 각 그룹(Group) 내의 단어들은 모두 포함되어야 하며(**AND**), 그룹 간에는 하나라도 만족하면(**OR**) 로그가 표시됩니다.
    - 예: `[word1, word2]` (1번 그룹) OR `[word3]` (2번 그룹)
- **Family Combo (패밀리 콤보)**: 
    - 시작(Start), 끝(End), 중간(Middle/Branch) 태그를 이용한 계층적 필터링입니다.
- **Block List (블록 리스트)**: 
    - 특정 단어가 포함된 로그를 제외합니다.
- **Color Highlight (컬러 하이라이트)**: 
    - 특정 키워드에 대해 수동으로 색상을 지정합니다.
- **Log Settings (로그 설정)**: 
    - 실시간 로깅에 대한 Log Command, Log Tag 등을 설정합니다. 
    - `showRawLogLines` (비표준 로그 강제 표시 여부)를 설정합니다.

---

## 🎨 자동 색상 지정 (Auto-Highlight) 스펙

콤보에 단어를 추가하고 별도의 색상을 지정하지 않으면, 시스템이 **고정된 색상**을 자동으로 할당합니다.

- **로직**: `stringToColor` 유틸리티를 사용합니다. 단어의 문자열 해시값을 기반으로 **HSL 컬러**를 생성합니다.
    - **Saturation**: 70-100% (선명도 유지)
    - **Lightness**: 50-60% (텍스트 가독성을 위해 중간 명도 유지)
- **우선순위**: 사용자가 직접 지정한 Color Highlight가 자동 색상보다 우선합니다.
- **대소문자 구분**: 설정의 `caseSensitive` 옵션에 따라 키워드 매칭 및 색상 칠하기 로직이 연동됩니다.

---

## 🖋️ 폰트 및 렌더링

- **폰트 지원**: `Consolas`, `JetBrains Mono`, `Monospace` 등 고정폭 폰트를 지원합니다.
- **성능 최적화**: 고정폭 폰트의 경우, 첫 렌더링 시 글자 너비를 측정하여 캐싱합니다. 이후 모든 렌더링 시 `O(1)` 속도로 텍스트 위치를 계산합니다.

---

## ⚡ 초고속 성능 (Performance)

1GB 이상의 대용량 로그도 끊김 없이 처리하기 위한 기술적 장치들입니다.

- **Segmentation (세그멘테이션)**: 브라우저의 Canvas/DOM 높이 제한을 넘기 위해 `MAX_SEGMENT_SIZE`(약 135만 줄) 단위로 페이징 처리를 합니다.
- **캔버스 아키텍처 (HyperLogRenderer)**: 
    - **Layer 1 (Background)**: 선택 영역, 북마크, 키워드 배경 등을 렌더링합니다.
    - **Layer 2 (Text)**: 실제 로그 텍스트와 하이라이트 오버레이를 렌더링합니다.
    - 60fps의 부드러운 스크롤을 보장합니다.
- **Web Worker**: 인덱싱, 필터링, 검색 등 무거운 작업은 백그라운드 워커에서 처리하여 UI 스레드를 차단하지 않습니다.
- **WASM 가속**: 단순한 OR 필터링의 경우 Rust로 작성된 WebAssembly 엔진을 사용하여 처리 속도를 극대화합니다.
- **Inactive Resource Guard**: `isActive` 상태가 아닐 때(탭 전환 등) 캔버스 드로잉 및 고부하 자원 사용을 자동으로 일시 중지하여 효율적인 멀티태스킹을 지원합니다.

---

## 📡 SDB/SSH 실시간 로깅

- **실시간 스트리밍**: SDB(Tizen) 또는 SSH를 통한 실시간 로그 수집을 지원합니다.
- **Burst Logging 대응**: 초당 수만 줄의 로그가 쏟아지는 상황에서도 UI가 얼지 않도록 **Chunk 단위 버퍼링 및 배치 처리** 로직이 구현되어 있습니다.
- **로그 버퍼 클리어**: `Ctrl + Shift + X`를 통해 프론트엔드의 화면과 서버 측의 로그 버퍼를 동시에 비울 수 있습니다.

---

## 🔍 Find & Focus

- **Find (fint)**: 현재 열려있는 세그먼트 내에서 빠른 텍스트 검색을 지원합니다.
- **Focus 모드**: 
    - 글로벌 설정에서 활성화 시, 로그 열람에 집중할 수 있도록 `TopBar` 등 UI 요소를 자동으로 숨깁니다.
    - 마우스 이동이나 특정 단축키 입력 시 UI가 다시 나타납니다.
    - `isSearchFocused` 상태일 때는 단축키 오동작을 방지하기 위해 일반적인 핫키가 차단됩니다.

---

## 🖇️ 북마크 (Bookmarks)

- **토글**: `Space` 키로 현재 줄에 북마크를 설정/해제합니다.
- **이동**: `F3` (이전 북마크), `F4` (다음 북마크)로 빠르게 점프합니다.
- **북마크 보기**: `Ctrl + B`로 전체 북마크 리스트를 확인하고 관리할 수 있습니다.

---

## 🖱️ 드래그 및 상호작용 (Selection)

HyperLogRenderer 위에 투명한 **Interaction Layer**를 두어 복잡한 선택 로직을 구현했습니다.

- **기본 드래그**: 여러 줄을 선택하여 범위를 지정합니다.
- **Shift / Ctrl / Alt 드래그**:
    - **Shift + Click**: 범위 선택 (Anchor 기준).
    - **Ctrl + Click**: 개별 라인 다중 선택 (Toggle).
    - **Alt + Drag**: 커스텀 선택 로직을 우회하여 **브라우저 네이티브 텍스트 선택**을 수행합니다. (특정 단어만 긁을 때 유용)
- **Ctrl + C**: 선택된 라인들을 클립보드에 복사합니다. (마지막 줄 개행 제거 등 최적화 포함)
- **Copy as Confluence Table**: 현재 필터링된 모든 로그를 Confluence Markdown 테이블 형식으로 복사합니다. 
    - 툴바의 **Table** 아이콘 버튼을 통해 실행합니다.
    - 타임스탬프 추출 및 줄 간 시간 차이(Time Diff) 계산 결과가 포함됩니다.
    - 5만 줄 이상의 대량 로그 처리 시 사용자에게 알림을 제공합니다.
- **Save to Archive**: 선택 영역 위에서 마우스 우클릭 -> `Save Selection to Archive`를 선택하면 해당 구간만 로그 아카이브에 영구 저장됩니다.
- **시간 차 계산 (Time Difference)**: 
    - 두 줄 이상을 선택하면, 선택된 구간의 **첫 줄과 끝 줄 사이의 시간 차이**를 화면 하단에 표시합니다.
    - `HH:mm:ss.mss` 형태부터 커널 타임 `[seconds.micros]`까지 다양한 포맷을 자동 인식합니다.
- **트랜잭션 ID 추출 (Transaction ID Extraction)**:
    - 선택된 로그에서 트랜잭션 ID를 추출합니다.
    - 추출된 트랜잭션 ID를 기반으로 다른 패널에서 해당 트랜잭션의 로그를 찾습니다.
- 로그 우클릭시 context menu
    - Save Selection to Archive
    - Analyze Transaction
    
---

## 📊 Analyze Performance (Flame Map)

로그 데이터를 기반으로 한 성능 분석 및 시각화 기능에 대한 상세 명세는 다음 문서를 참조하십시오.

- **[perf_tool_specification.md](./perf_tool_specification.md)**: Perf Tool 및 Log Extractor 공통 성능 분석 로직 명세

주요 요약:
- **Step (Group)**: 동일 `alias` 그룹의 시작-끝 분석.
- **Combo (Interval)**: 연속된 매칭 로그 간의 간격 분석.
- **Flame Dashboard**: 분석 결과를 시각화하고 Bottleneck을 식별.
- **Analyze Transaction (트랜잭션 분석)**: 선택된 로그의 트랜잭션 ID를 기반으로 연관된 모든 로그 흐름을 추적합니다.

---

## 🛡️ Spam Analyzer (반복 로그 분석기)

수만 줄의 로그 중 의미 없이 반복되어 분석을 방해하는 '스팸' 로그를 식별하고 그룹화하는 기능입니다.

- **소스 중심 광폭 병합 (Source-First Grouping)**: 
    - 메시지 내용이 조금씩 다르더라도(예: 동적 변수 포함), **발생 소스 위치(`FileName: FunctionName`)**가 동일하다면 하나의 그룹으로 병합합니다. 
    - **초광속 파서 v2**: 정규표현식(Regex)을 완전히 제거하고, 확장자 기반의 선별적 콜론 스캔 알고리즘을 사용하여 100만 행 분석을 **500ms 이내**에 완료합니다.
- **하이퍼 점프 (Hyper-Jump) 시스템**: 
    - 분석 시점에 모든 발생 위치의 인덱스를 미리 수집(Indexing)하여, 탐색 시 검색 엔진을 거치지 않고 **0.001초 만에 즉시 점프**합니다.
    - **순환 탐색**: `1/N` 형태의 인덱스 표시와 함께 처음과 끝을 자유롭게 오가는 루프 탐색을 지원합니다.
- **TOP 100 랭킹**: 가장 많이 발생한 순서대로 상위 100개의 패턴을 추출하여 관리합니다.
- **Visual UX 최적화**: 
    - **경량 애니메이션**: `framer-motion`과 같은 무거운 JS 엔진 대신 순수 CSS 애니메이션을 사용하여 100개 항목 렌더링 시에도 UI Jank가 발생하지 않습니다.
    - **밀집도 시각화**: 각 패턴별 발생 빈도를 미니 액티비티 바(Bar)로 시각화하여 밀집도를 직관적으로 파악할 수 있습니다.

---

## 📌 주요 단축키 요약
- `Ctrl + \``: 설정 패널 토글
- `Ctrl + B`: 북마크 목록 보기
- `Space`: 북마크 토글
- `F3 / F4`: 이전/다음 북마크 이동
- `Ctrl + Shift + X`: 로그 클리어
- `Shift + Wheel / Arrow`: 스크롤 동기화 (듀얼 뷰 모드)
- `Ctrl + Arrow Left/Right`: 왼쪽/오른쪽 패인 포커스 전환
- `Ctrl + / -`: 화면 확대/축소 (UI 전역 줌)
- `Ctrl + Wheel`: **Pane-aware Zoom**. 마우스가 올라가 있는 패널(로그 패널 또는 성능 대시보드)에 맞게 독립적인 줌이 트리거됩니다.
- `Ctrl + [`, `Ctrl + ]` : font size 조절 (개별 패널)
- `Ctrl + Shift [`, `Ctrl + Shift ]` : Configuration 영역 width 조절

---

**작성일**: 2026-03-02  
**상태**: v1.1.2 Confluence Table 복사 기능 추가 및 성능 최적화
