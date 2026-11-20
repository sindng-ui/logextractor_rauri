# 🎨 Snap Studio (Quick Screenshot Annotator) 구현 계획서

- **작성일**: 2026-11-20
- **앱 ID**: `ToolId.SCREENSHOT_ANNOTATOR` (`plugins/appsRegistry.ts`, `React.lazy`)
- **목표**: `Ctrl+Shift+P` Apps 런처 2호 앱으로 **"캡처 → 마킹 → `Ctrl+C` 복사"** 3초 컷 오프라인 비파괴 스크린샷 편집기 구축

---

## 1. 핵심 기능 & 5대 킬러 기능
- **기본 도구 (단축키)**: 선택(`V`), 사각형(`1`), 원(`2`), 스마트 직선/곡선 화살표(`3`), 스텝 번호 뱃지/화살표 콤보(`4`), 텍스트/말풍선(`5`), 형광펜(`6`), 모자이크/가림막(`7`), 자유 펜(`8`), 비파괴 크롭(`C`)
- **5대 킬러 기능**:
  1. **스포트라이트 (`S`)**: 사각/원형 강조 영역 외 배경 전체 딤 처리 (`evenodd` 1-pass 렌더링)
  2. **멀티 캡처 이어 붙이기 (Multi-Paste Stitch)**: 작업 중 `Ctrl+V`/드롭 시 `Replace` / `Side-by-Side (→)` / `Stack Below (↓)` / `Overlay Sticker` 선택
  3. **중간 싹둑 잘라내기 (`X`, Cut-out)**: 가로/세로 불필요 띠 비파괴 절삭 + 지그재그/물결/틈 절취선 봉합 (`Ctrl+Z` 복원 가능)
  4. **예쁜 프레임 (Prettify Frame)**: 둥근 모서리 + 다층 그림자 + 8종 단색/그라데이션 패딩
  5. **최근 작업 히스토리 (IndexedDB)**: 최대 15개 FIFO 자동 저장, 벡터 레이어·Cut-out·프레임 설정 그대로 재편집 복원

## 2. 성능 아키텍처 (Performance-First & Zero-Blur)
- **Zero-Blur**: UI 전체 `backdrop-blur` 및 CSS `blur()` 0건
- **드래그 중 React Re-render 0회**: 진행 중 도형/이동/리사이즈/줌·패닝은 Mutable Ref + `requestAnimationFrame` 직접 Canvas 드로우, `pointerup` 시에만 상태 커밋
- **GPU 2-Pass 픽셀 모자이크**: CPU `getImageData` 대신 재사용 소형 오프스크린 캔버스 다운스케일→업스케일(`imageSmoothingEnabled = false`)
- **프레임 캐시**: 배경/그림자 레이어는 이미지·프레임 설정 변경 시에만 1회 캐싱
- **Zero-Copy Rust 클립보드 (`arboard`)**: `tauri::ipc::Request` Raw Binary 입력 & `tauri::ipc::Response` Raw Binary 출력으로 JSON 직렬화 오버헤드 제거
- **완전 비활성 격리**: `isActive={false}` 시 이벤트·단축키·드롭·rAF 완전 차단
