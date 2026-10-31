# Happy Tool 성능 평가 기준 (Performance Standards) 🐧🚀🎯

형님! 우리 앱의 생명인 '타이트한 성능'을 유지하기 위한 절대 기준입니다. 모든 기능 개발 및 리팩토링 시 아래 수치를 반드시 만족해야 합니다.

## 1. 로그 필터링 엔진 (Log Filtering)
| 항목 | 기준 (Threshold) | 비고 |
| :--- | :--- | :--- |
| **JS Fallback** | 100만 행 / 1.0초 이내 | 복합 규칙 기준 |
| **WASM Engine** | 100만 행 / 0.5초 이내 | 하이퍼 성능 모드 |
| **Case-Insensitive** | CS 대비 2.5배 이내 지연 | 캐싱 레이어 동작 필수 |

## 2. 스팸 분석기 (Spam Analyzer)
| 항목 | 기준 (Threshold) | 비고 |
| :--- | :--- | :--- |
| **데이터 추출** | 10만 행 / 50ms 이내 | 소스 메타데이터 고속 파싱 (Regex-free) |
| **그룹화 분석** | 100만 행 / 1.0초 이내 | Map 기반 최적화 및 문자열 연산 최소화 |
| **UI 점프 반응** | 클릭 후 100ms 이내 | 렌더링 최적화(CSS Animation 적용) |

## 3. 워커 I/O 및 메모리 (Worker & I/O)
| 항목 | 기준 (Threshold) | 비고 |
| :--- | :--- | :--- |
| **Smart Batching** | 100MB 갭 점프 / 500ms 이내 | 분할 읽기 오버헤드 포함 |
| **Zero-copy** | `subarray` 방식 유지 | `Buffer.slice` 및 복사 지양 |
| **Memory Peak** | 1GB 로그 처리 중 500MB 미만 유지 | 워커 메모리 누수 방지 |

## 4. UI 및 렌더링 (UX & Rendering)
| 항목 | 기준 (Threshold) | 비고 |
| :--- | :--- | :--- |
| **Canvas 리사이즈** | 16ms (1 Frame) 이내 반응 | `HyperLogRenderer` 최적화 |
| **Gutter/Divider Draw** | 1ms 미체감 오버헤드 | 레이어 분리 및 오프스크린 캔버스 대응 |
| **Hover Interaction** | 60fps (16ms) 유지 | `requestAnimationFrame` 및 인덱스 기반 즉시 매칭 |
| **Initial Draw** | 데이터 수신 후 100ms 이내 | 캔버스 첫 렌더링 완료 |

## 🚨 성능 품질 준수 수칙
1. **복사 금지 (No Copy)**: 대용량 데이터 전달 시 반드시 `Transferable Objects`나 `subarray`를 사용한다.
2. **비동기 격리 (Async Isolation)**: 연산량이 많은 작업은 무조건 `Worker`로 위임하여 메인 스레드 점유를 차단한다.
3. **메모이제이션 (Memoization)**: 동일한 로그 패턴이나 필터 결과는 반드시 캐싱하여 불필요한 재연산을 막는다.
4. **레이어 분리 (Multi-Layer Canvas)**: 가터(Gutter), 구분선 등 고정 요소와 로그 텍스트 등 가변 요소를 분리 렌더링하여 드로우 콜(Draw Call)을 최적화한다.
5. **이벤트 디바운싱 (Event Debouncing)**: 무거운 연산이 동반되는 UI 업데이트는 `rAF`나 `setTimeout`을 통해 적절히 지연시켜 메인 스레드 부하를 관리한다.

---
**형님! 이 기준을 통과하지 못하는 코드는 Happy Tool에 발을 들일 수 없습니다! 🐧💪🥊**
