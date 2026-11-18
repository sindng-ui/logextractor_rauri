# Happy Tool 성능 평가 기준 (Performance Standards) 🐧🚀🎯

형님! 우리 앱의 생명인 '타이트한 성능'을 유지하기 위한 절대 기준입니다. 모든 기능 개발 및 리팩토링 시 아래 수치를 반드시 만족해야 합니다.

## 1. 로그 필터링 및 파일 오픈 엔진 (Log Indexing & Filtering)
| 항목 | 기준 (Threshold) | 비고 |
| :--- | :--- | :--- |
| **Rust Native 오픈 (v2.0+)** | 1GB 파일 오픈 체감 즉시 (메타만 반환) | SWAR 8-byte 멀티코어(`<=12` 스레드) + `index_log_file_meta` |
| **Rust Native 1단어 필터** | 1GB 파일 풀스캔 체감 즉시 | OS 페이지 캐시 + BMH `AsciiPattern` + `4MB` 재사용 버퍼 |
| **Rust 증분 필터 (`parent_key`)** | 단어2·3 추가 시 수~수십 ms 이내 | `FILTER_CACHE` + 32KB/4MB 윈도우 Coalescing |
| **JS Fallback (브라우저/스트림)** | 100만 행 / 1.0초 이내 | 복합 규칙 기준 |
| **WASM Engine (스트림/폴백)** | 100만 행 / 0.5초 이내 | 하이퍼 성능 모드 |
| **Case-Insensitive** | CS 대비 2.5배 이내 지연 | ASCII 비트마스크 / 캐싱 레이어 동작 필수 |

## 2. 스팸 분석기 (Spam Analyzer)
| 항목 | 기준 (Threshold) | 비고 |
| :--- | :--- | :--- |
| **데이터 추출** | 10만 행 / 50ms 이내 | 소스 메타데이터 고속 파싱 (Regex-free) |
| **그룹화 분석** | 100만 행 / 1.0초 이내 | Map 기반 최적화 및 문자열 연산 최소화 |
| **UI 점프 반응** | 클릭 후 100ms 이내 | 렌더링 최적화(CSS Animation 적용) |

## 3. 워커 I/O 및 메모리 (Worker & I/O — v2.0.0 실측 기준)
| 항목 | 기준 (Threshold) | 비고 |
| :--- | :--- | :--- |
| **1GB 오픈 후 총 RAM** | **320MB 미만** (WebView2 증가 `<= 15MB`) | v2.0.0 실측: `293.2MB` (`WebView2 176.9MB`, `Rust 116.3MB`) |
| **1GB 필터링 후 총 RAM** | **350MB 미만** | v2.0.0 실측: `305.9MB` (`FILTER_CACHE` 128MB·8-entry 상한) |
| **Zero-Offset & Identity View** | 파일 모드 `indexSharedBuffer`/`lineOffsets` **0MB** | `allocateStreamBuffers()` 지연 할당 + `workerIndexView` |
| **Heatmap IPC 배칭** | 500포인트 조회 시 **1회 배치 호출** | `read_local_lines_by_indices` 활용 (500회 개별 IPC 금지) |
| **Smart Batching** | 100MB 갭 점프 / 500ms 이내 | `file_io` Lock-free 풀링(`<=16` 핸들) + 바이너리 `Response` |
| **Zero-copy** | Transferable / `subarray` 유지 | 불필요한 TypedArray 복사 및 JSON 직렬화 금지 |

## 4. UI 및 렌더링 (UX & Rendering)
| 항목 | 기준 (Threshold) | 비고 |
| :--- | :--- | :--- |
| **Canvas 리사이즈** | 16ms (1 Frame) 이내 반응 | `HyperLogRenderer` 최적화 |
| **Gutter/Divider Draw** | 1ms 미체감 오버헤드 | 레이어 분리 및 오프스크린 캔버스 대응 |
| **Hover Interaction** | 60fps (16ms) 유지 | `requestAnimationFrame` 및 인덱스 기반 즉시 매칭 |
| **Initial Draw** | 데이터 수신 후 100ms 이내 | 캔버스 첫 렌더링 완료 |

## 🚨 성능 품질 준수 수칙 & 회귀 금지 (Anti-Regression Guardrails)
1. **IPC 대용량 바이트 왕복 금지**: Tauri 로컬 OS 파일 경로(`hasNativeEngine`)에서는 절대 파일 원문/청크나 전체 `lineOffsets`를 WebView IPC로 넘겨 필터링/인덱싱하지 않는다. 연산은 Rust에서 끝내고 결과 메타/인덱스(`u32` 바이너리)만 전송한다.
2. **워커 초기 80MB SAB 커밋 금지**: 파일 모드 및 빈 필터 상태에서는 `filteredIndicesBuffer`(`80MB`)를 할당하거나 `0..N-1`로 채우지 않고 Virtual Identity View를 유지한다.
3. **네이티브 모드 SubWorker 워밍업 금지**: `hasNativeEngine` 활성 시 탭 활성화(`SET_ACTIVE_STATE`) 등에서 불필요한 SubWorker/WASM 풀을 미리 스폰하지 않는다.
4. **로드 직후 블로킹 분석 금지**: 타임스탬프 전체 파싱은 히스토그램 패널 오픈 시에만 지연 실행하고, 자동 실행되는 `GET_PERFORMANCE_HEATMAP`은 단 1회 배치 RPC만 사용한다.
5. **복사/할당 금지 (No Copy / Zero Alloc)**: 대용량 스캔 루프 내 줄 단위 `String` 힙 할당을 피하고 재사용 4MB 버퍼 및 `Transferable Objects`/`subarray`를 사용한다.
6. **UI `blur` 효과 금지 & 메모이제이션/캐시 회수 준수**: 탭 종료·파일 전환 시 `evict_log_cache`로 유휴 Rust 캐시를 즉시 회수한다.

---
**형님! 이 기준을 통과하지 못하는 코드는 Happy Tool에 발을 들일 수 없습니다! 🐧💪🥊**
