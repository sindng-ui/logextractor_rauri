# 🚀 GitHub Release 기반 원클릭 앱 업데이터 구현 계획서

- **작성일**: 2026-11-23
- **대상**: `AppsHomeView` (`components/Apps/`), Tauri 2.0 Rust Core (`src-tauri/`)
- **목표**: 앱 최초 실행 시 중앙 `AppsHomeView`의 여유 공간을 기존 Dock-Rail Hybrid 스타일과 완벽히 어우러지게 활용하여, GitHub Release에 현재 설치 버전보다 높은 버전이 배포되었을 때 즉시 알리고 **원클릭 다운로드 → 무인 설치 → 자동 재실행**까지 매끄럽게 처리. (작업 중 앱 내부 알림은 사용하지 않고, 중앙 Apps 홈 화면에서만 제공)

---

## 1. 핵심 설계 & 기술 전략

### 1.1 GitHub Release 버전 감지 (`sindng-ui/logextractor_rauri`)
- **기준 버전**: Tauri 앱 런타임 패키지 버전 (`app.package_info().version`, 빌드 시 `package.json` → `tauri.conf.json` 동기화됨) vs GitHub Releases API(`https://api.github.com/repos/sindng-ui/logextractor_rauri/releases/latest`, 404 시 `/releases?per_page=1` 폴백).
- **SemVer 비교**: `v2.2.3` ↔ `2.2.2` 등 `v` 접두어 정규화 및 `major.minor.patch` + prerelease 비교 로직을 Rust와 Frontend 테스트용 유틸 모두에 정확히 구현.
- **왜 Rust Native에서 직접 조회·다운로드하는가?**
  - 본 앱은 `Cross-Origin-Embedder-Policy: require-corp` 보안 헤더를 사용하므로, WebView2 내 `fetch()`는 외부 GitHub CDN 리다이렉트 시 CORS/CORP 차단 위험이 있음.
  - Rust에서 `User-Agent: HappyTool-Tauri/<version>`을 포함해 직접 요청하면 COEP/CORS 제약이 없고, 스트리밍 다운로드 진행률(`downloadedBytes`, `totalBytes`, `percent`, `speedBps`)을 `tauri::Emitter`로 60fps UI에 무리 없이 전달 가능.
  - `.github/workflows/release.yml`에 별도 서명 키(`TAURI_SIGNING_PRIVATE_KEY`)나 `latest.json`을 추가하지 않아도 **기존에 빌드/배포된 GitHub Release 자산(`.exe` / `.msi`)을 즉시 활용** 가능.

### 1.2 원클릭 업데이트 실행 플로우 (Windows)
1. 릴리즈 `assets`에서 Windows NSIS Setup(`*-setup.exe` 또는 `.exe`)을 최우선 선택 (없으면 `.msi` 폴백).
2. `%TEMP%\HappyToolUpdate\`에 청크 스트리밍으로 다운로드하며 `update-download-progress` 이벤트 발행 (취소 토큰으로 중간 취소 지원).
3. 다운로드 완료 후 파일 크기(`> 0` 및 GitHub `asset.size` 일치 여부) 검증.
4. **릴리즈 바이너리 실행 중(`!cfg!(debug_assertions)`)**:
   - 현재 PID 종료를 대기한 뒤 NSIS `/S` 무인 설치(또는 `.msi` `/passive`)를 실행하고, 설치 완료 후 `HappyTool Tauri.exe`를 재실행하는 숨김 detached 런처(`CREATE_NO_WINDOW`) 스폰 → 즉시 `app.exit(0)` 호출로 파일 락 해제.
   - **개발 모드(`cfg!(debug_assertions)`) 보호**: 개발 중 `target/debug` 바이너리를 실수로 덮어쓰지 않도록 다운로드된 인스톨러 위치 열기/수동 실행 모드로 안전 처리.

---

## 2. UI/UX 설계 (`AppsHomeView` 빈 공간 활용 · Zero-Blur)

### 2.1 Zero-Layout-Shift 배치 전략
- **상단 타이틀바 (`AppsHomeView` 헤더)**:
  - 좌측 `HappyTool` 로고 옆: 현재 버전 배지 (`v2.2.2`).
  - 우측(OS 캡션 컨트롤 `144px` 좌측 여백): 컴팩트 업데이트 상태 필 (`Checking...` / `Up to date` / 클릭 가능한 `Update v2.2.3` + 수동 새로고침 버튼).
- **중앙 하단 스포트라이트 카드 (`AppUpdateCard.tsx`)**:
  - `AppsLauncherPanel` (`max-w-[560px]`) **바로 아래**에 동일 폭(`max-w-[560px]`)으로 배치하여, 부팅 후 비동기 API 응답이 도착하더라도 위쪽 앱 런처 카드의 좌표가 밀리지 않음(**Layout Shift = 0**).
  - 기존 런처와 동일한 `#0b1120` 서피스, 상단 `2px` 그라데이션 헤어라인, static specular rim, **Zero-Blur** 준수.
  - **상태별 화면**:
    - `available`: 버전 델타 배지(`v2.2.2 → v2.2.3`), 릴리즈 날짜, 접이식 `What's New` 릴리즈 노트, `Skip` / `Later`, 그리고 **원클릭 `[ Update & Restart ]` 버튼**.
    - `downloading` / `installing`: 카드 내부가 프로그레스 바(`%`, `MB / MB`, `MB/s`, `Cancel`)로 부드럽게 전환 후 `"Installing & Restarting..."` 표시.
    - `error`: 원인 메시지 + `[ Retry ]` + `[ Open Release Page ]` 브라우저 폴백.

---

## 3. 추가로 제안하는 개선 아이디어 (구현 전 검토 사항)

1. **ETag + 15분 캐싱 (`localStorage`)**: GitHub 비인증 API 제한(시간당 60회)을 방어하기 위해 `If-None-Match (ETag)` 및 15분 TTL 캐시를 적용 (`Refresh` 버튼 클릭 시 강제 갱신).
2. **`Skip This Version` & `What's New` 인라인 뷰어**: 특정 버전 알림 끄기 기능과, GitHub Release 본문(Markdown)을 깔끔한 불릿 리스트로 파싱해 카드 안에서 바로 확인 가능하게 제공.
3. **Settings → About 탭 연동**: 앱을 이미 사용 중인 상태에서도 `Ctrl+,` → `About` 탭에서 현재 버전 확인 및 원클릭 업데이트 실행 가능.
4. **앱 사용 중 미세 배지 (선택)**: 앱 화면 진입 후에도 새 버전이 감지된 상태라면 `TopBar`의 Apps 아이콘(`LayoutGrid`)에 작은 인디고/에메랄드 알림 점을 표시해 인지성 향상.

---

## 4. 단계별 변경 파일 계획

### Phase 1. Rust Native 업데이터 코어 (`src-tauri/`)
- `[MODIFY] src-tauri/Cargo.toml`: `reqwest` (`default-features = false`, `native-tls`, `json`, `stream`) 추가
- `[NEW] src-tauri/src/commands/updater.rs`:
  - `check_app_update(app, force, etag)`
  - `download_and_install_update(app, download_url, asset_name, expected_size, html_url)`
  - `cancel_app_update()`
  - SemVer 비교/자산 선택/파일명 검증 순수 함수 + `#[cfg(test)]` 단위 테스트
- `[MODIFY] src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`: 커맨드 등록

### Phase 2. Frontend 브릿지 & 상태 훅 (`utils/`, `hooks/`)
- `[NEW] utils/appUpdater.ts`: SemVer 비교, 릴리즈 노트 경량 포매터, ETag 캐시 헬퍼, IPC 래퍼
- `[NEW] hooks/useAppUpdater.ts`: 마운트 시 자동 체크(1회/세션 + TTL 캐시), 진행률 구독, 재시도/취소/버전 스킵 상태 관리
- `[MODIFY] utils/tauriBridge.ts`, `vite-env.d.ts`: `electronAPI` 업데이터 메서드 및 타입 확장

### Phase 3. 완성도 높은 UI 컴포넌트 (`components/`)
- `[NEW] components/Apps/AppUpdateCard.tsx`: Zero-Blur 스포트라이트 업데이트 카드 (확장형 What's New, 프로그레스 바, 에러 폴백)
- `[MODIFY] components/Apps/AppsHomeView.tsx`: 상단 버전/업데이트 상태 필 + 중앙 하단 `AppUpdateCard` 통합

### Phase 4. 검증 및 문서 동기화
- `[NEW] test/utils/appUpdater.test.ts`: SemVer 비교, 자산 선택, 캐시/에러 케이스 테스트
- `[NEW] test/components/AppUpdateCard.test.tsx`: 상태별 렌더링(Available, Downloading, Error, Skip, Expand Release Notes) 및 `AppsHomeView` 레이아웃 테스트
- `[MODIFY] APP_MAP.md`, `docs/maps/UI_COMPONENTS.md`, `docs/maps/BACKEND_SERVICES.md` 업데이트
- `[NEW] docs/app_updater_test_results.txt` 테스트 결과 기록
