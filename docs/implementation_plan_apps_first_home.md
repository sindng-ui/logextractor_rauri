# 🚀 Apps-First 부팅 & 전 앱 평등화 구현 계획서

- **작성일**: 2026-11-21
- **목표**: 앱 실행 직후 `Log Extractor`를 강제 마운트하지 않고 **Apps Home 화면으로 즉시 시작**하며, `Log Extractor` · `JSON Beautify` · `Snap Studio`를 100% 동등한 `React.lazy` 앱으로 평등화

## 1. 성능 전략 (`Log Extractor` 사전 준비 여부)
- **사전 마운트 / 워커 스폰 `0`**: `LogExtractor`를 `React.lazy(() => import('../components/LogExtractor'))`로 분리하여 부팅 번들 및 초기 RAM/워커 점유 최소화.
- **Zero-RAM 모듈 프리패치**: Apps 도크에서 아이콘에 호버/포커스 시 컴포넌트 마운트 없이 JS 청크만 1회 `preload()` 호출하여 클릭 지연 최소화.
- **세션 100% 보존**: `PluginContainer`의 `hasBeenActive` 유지로 한 번 연 앱은 전환 후에도 상태 보존, 미사용 앱은 로드 `0`.

## 2. UI/UX 개편
- `APPS_REGISTRY`에 `#1 Log Extractor`, `#2 JSON Beautify`, `#3 Snap Studio` 동등 등록.
- `activePluginId === null` 시 `AppsHomeView` (중앙 Dock-Rail Hybrid + `Glass Clear 0.85s` 스윕) 표시.
- 앱 실행 중 `LayoutGrid` 버튼 / `Ctrl+Shift+P`로 좌상단 앵커드 팝오버(`AppsLauncherModal`) 토글.
- `JsonBeautifyHeader`, `AnnotatorHeader`, `AppsLauncherModal`에서 특수 `← Logs` 복귀 UI 완전 제거.
