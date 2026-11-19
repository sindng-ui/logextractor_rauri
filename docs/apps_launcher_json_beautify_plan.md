# 🚀 Apps 런처 (`Ctrl+Shift+P`) & 초고속 JSON Beautify & Analyzer — 풀세트 구현 계획서

- **작성일**: 2026-11-19
- **범위**: 기존 계획 + 풀세트 (**Visual Graph Canvas [JSON Crack 스타일]** + **Column Explorer [JSON Hero 스타일]** + **Quick Snapshot History** + **Embedded JSON 원클릭 해부**)

---

## 1. 사전 점검 & Zero-Regression 대책
1. `contexts/CommandContext.tsx`: `Ctrl+P`에 `!shift && !alt` 가드 추가하여 `Ctrl+Shift+P` 충돌 원천 차단.
2. `App.tsx` & `PluginContainer`: `activePluginId` 전환 시 `LogExtractor`를 언마운트하지 않고 `isActive={false}` + `hidden`으로 유지하여 기존 1GB 로그 세션·워커·스크롤 100% 보존 및 `useTauriFileDrop`/Canvas 자동 일시정지.
3. Zero-Blur & Zero-Clone: `backdrop-blur`/`blur-*` 0건, 워커 내부 Arena에만 원본 객체 상주.

---

## 2. Part A: 확장형 `Apps` 런처 (`Ctrl+Shift+P`)
- 전역 `Ctrl+Shift+P` (`e.code === 'KeyP'` 한글 IME 대응), 초기 아이콘은 `JSON Beautify` 1개(`plugins/appsRegistry.ts` 확장 구조).
- GPU `transform`/`opacity` 전용 Critical Damping Spring(`stiffness: 380, damping: 28, mass: 0.7`) + 2단계 아이콘 팝 + `radial-gradient` 아우라.
- 키보드 퍼스트(`Enter`/`1`/`Esc`) 및 `JSON Beautify` 상단 `← Log Extractor` 빠른 복귀.

---

## 3. Part B: 차세대 `JSON Beautify & Analyzer` (6대 뷰 풀세트)
- **입력**: 어디서나 `Ctrl+V` 즉시 파싱, 클립보드 버튼, Tauri 네이티브 드롭 + HTML5 드롭 + 파일 선택 + Raw Input 토글.
- **Smart Extract & Auto-Repair**: 로그 프리픽스 추출, 이중 이스케이프 복구, 후행 콤마/JSONC 제거, 에러 줄/컬럼 스니펫.
- **Quick Snapshot History (최근 5개)** & **Executive Summary Strip (Heavy Nodes Top 5 점프 칩)**.
- **6대 분석 뷰**:
  1. **Explorer Tree View (`react-virtuoso`)**: 접힌 상태 스마트 요약 프리뷰, Timestamp/Color/Embedded JSON(`{ } Parse`) 배지, Depth 컨트롤(`L1`~`L4`/All/Collapse), Jump Search + Filter Tree + JSONPath(`$.`), Breadcrumb & 우측 Node Inspector.
  2. **Visual Graph View (HTML5 Canvas 2D — JSON Crack 스타일)**: 다크 카드 노드(원시 속성 압축) + 3차 베지어 엣지 + Viewport Culling 60fps + 줌/팬 + 브랜치 접기/펼치기 + 대용량 배열 청킹(`+25 more`) + 우하단 미니맵 + PNG Export.
  3. **Column Explorer View (JSON Hero 스타일 Finder 컬럼)**: 단계별 가로 컬럼(`react-virtuoso` 가상화) + 컬럼별 로컬 필터 + 키보드 탐색 + 리프 Rich Detail Card.
  4. **Smart Table View (`react-virtuoso`)**: 객체 배열 자동 탐지, 정렬/필터/Tree 점프, CSV/Markdown 복사.
  5. **Virtual Code View (`react-virtuoso`)**: 지연 생성 라인 배열, 구문 강조, Sort Keys A→Z, Indent(2/4), Minify, Copy/Save.
  6. **Structure & Insights View**: Heavy Subtrees Top 15 차트, Depth 분포, Key 빈도 Top 20, TypeScript Interface 자동 생성.

---

## 4. 파일 구조 계획 (모든 파일 < 450줄)
- **신규**: `plugins/appsRegistry.ts`, `components/Apps/AppsLauncherModal.tsx`, `components/Apps/AppLauncherCard.tsx`, `types/jsonBeautify.ts`, `utils/jsonSmartRepair.ts`, `utils/jsonValueDecoders.ts`, `utils/jsonGraphLayout.ts`, `workers/JsonBeautify.worker.ts`, `workers/jsonWorkerHelpers.ts`, `components/JsonBeautify/*` (메인 + 훅 + 10개 컴포넌트), `test/jsonBeautify.test.ts`
- **수정**: `contexts/CommandContext.tsx`, `App.tsx`, `components/SettingsModal.tsx`, `APP_MAP.md`, `important/APP_MAP.md`, `docs/maps/UI_COMPONENTS.md`

---

## 5. 검증 계획
- `npx tsc --noEmit`, `npm run build`
- `vitest` 단위 및 500KB+ 대용량 Depth JSON 성능 벤치마크 (결과 `docs/json_beautify_test_results.txt` 저장)
- Zero-Blur, 파일 < 500줄, Log Extractor 회귀 제로 최종 점검
