# 🗺️ 대규모 파일 리팩토링 지도 (Refactoring Treasure Map)

본 문서는 1000라인 이상의 대규모 파일들을 식별하고, 시스템의 안정성(Zero Regression)을 유지하면서 이를 어떻게 점진적으로 쪼갤 것인지에 대한 로드맵을 제시합니다.

---

## 🔍 대상 파일 목록 및 분석

### 1. `LogSession.tsx` (~1445 lines)
- **역할**: 로그 세션의 메인 컨트롤러. 파일 로딩, 실시간 스트리밍, 각종 모달(북마크, Tizen, 성능 분석), 단축키 핸들러 등 모든 비즈니스 로직과 UI 조립 담당.
- **주요 복잡성**: 
  - 거대한 `useLogContext` 상태 소비 및 수많은 콜백 핸들러.
  - 약 300라인에 달하는 전역 단축키(`keydown`) 핸들러 로직.
  - 400라인 이상의 UI 렌더링 코드 (Split View, Loading Overlay, Spam Panel 등).
- **리팩토링 전략**:
  - **Phase 1 (Shortcut Extraction)**: `keydown` 핸들러 로직을 `useLogSessionShortcuts.ts` 커스텀 훅으로 분리.
  - **Phase 2 (Sub-component Splitting)**: `LogSessionContainer`, `LogSessionHeader`, `LogPaneWrapper` 등으로 UI 컴포넌트 파편화.
  - **Phase 3 (Logic Extraction)**: 상태 관리 및 보조 핸들러들을 `useLogSessionLogic.ts`로 이동.

### 2. `LogProcessor.worker.ts` (~1466 lines)
- **역할**: 백그라운드에서 로그 필터링, 인덱싱, 검색, 성능 분석, 스팸 분석을 수행하는 핵심 엔진.
- **주요 복잡성**:
  - 모든 핸들러(`applyFilter`, `getLines`, `analyzePerformance`, `analyzeSpamLogs` 등)가 하나의 파일에 평면적으로 나열됨.
  - 메시지 리스너(`onmessage`)의 거대한 `switch` 문.
- **리팩토링 전략**:
  - **Phase 1 (Handler Module Extraction)**: 분석 로직(`analyzePerformance`, `analyzeSpamLogs`, `analyzeTransaction`)을 별도 모듈 파일로 추출.
  - **Phase 2 (Core Logic Splitting)**: 필터링 엔진(`applyFilter`, `processChunk`)과 데이터 로딩(`getLines`, `getRawLines`) 로직 분리.
  - **Phase 3 (Message Router)**: 메인 워커 파일은 메시지 라우팅만 담당하도록 경량화.

---

## 🛡️ 보수적 실행 원칙 (Conservative Principles)

형님의 소중한 코드가 망가지지 않도록 **'돌다리도 두드려보고 건너는'** 방식으로 진행합니다.

1. **관심사 분리 우선**: UI는 건드리지 않고, 내부 로직(핸들러, 훅)만 먼저 분리합니다.
2. **이름/인터페이스 유지**: 함수 이름과 Props 인터페이스를 그대로 유지하여 연결부의 수정을 최소화합니다.
3. **단계적 검증**: 한 번에 한 가지 기능만 떼어내고, 즉시 `npm run dev`로 동작을 확인합니다.
4. **회귀 테스트(Regression Test)**: 리팩토링 직후 기존에 잘 되던 기능(검색, 필터링, 스크롤)을 전수 체크합니다.

---

## 📅 예상 일정 (Draft)

1.  **Stage 1**: `LogProcessor.worker.ts`의 독립 분석 핸들러 추출 (가장 안전함)
2.  **Stage 2**: `LogSession.tsx`의 단축키 로직 추출 (코드 순수도 향상)
3.  **Stage 3**: UI 컴포넌트 분리 (가장 눈에 띄는 변화)

---

*형님, 이 지도를 바탕으로 하나씩 천천히, 하지만 확실하게 코드를 명품으로 다듬어 가겠습니다! 🐧💎*
