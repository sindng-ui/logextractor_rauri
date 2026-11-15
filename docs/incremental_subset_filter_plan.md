# 증분 모수 축소 필터링(Incremental Subset Filtering) 구현 계획서

- 작성일: 2026-11-15
- 대상 이슈: Happy Combo 단계별 단어/브랜치 추가 시(`input` -> `input + start` -> `input + start + process`) 모수가 줄어듦에도 매번 전체 1GB 파일을 처음부터 재스캔하여 매회 동일하게 ~3초가 소요되는 현상 개선

## 1. 핵심 설계
1. `utils/byteLogFiltering.ts`: 단일 라인 바이트 구간 판정 헬퍼 `matchByteSpan` 분리 (전체 스캔/증분 스캔 공용)
2. `utils/incrementalFilter.ts`:
   - `isStrictNarrowingRule`: `quickFilter`, `caseSensitive`, `excludes`, `includeGroups`가 수학적으로 직전 룰의 순수 부분집합일 때만 `true`
   - `coalesceCandidateWindows`: `Int32Array` 후보 라인들을 `lineOffsets` 기반 인접 I/O 윈도우로 병합 및 비용(`totalReadBytes / fileSize`, `windows.length`) 산정
   - `shouldUseIncrementalRead`: `0`건 즉시 단축, 스트림 모드 고속 스캔, 파일/로컬파일 희소 윈도우 읽기 vs 전체 스캔 폴백 판정
3. `workers/workerIncrementalFilter.ts`:
   - `executeIncrementalFilter`: 취소 가드, 동시성 제어 윈도우 읽기 및 `matchByteSpan` 기반 후보 라인 재필터링
4. `workers/LogProcessor.worker.ts` (현재 1,162줄):
   - 로직 비대화 방지를 위해 위 별도 모듈로 위임하고, `FilterCandidateCache` (`lastFilterCache`: 북마크 합치기 전 순수 `rawMatchedIndices`, `wasTruncated`, `totalLines`) 상태 관리 및 연결 코드 최소 추가
5. 추후 900줄 초과 리팩토링 대상:
   - `workers/LogProcessor.worker.ts` (1,162줄): 인덱싱 핸들러(`workerIndexHandlers.ts`), 스트리밍 핸들러(`workerStreamHandlers.ts`) 분리 예정
   - `hooks/useLogExtractorLogic.tsx` (1,306줄)

## 2. 검증 항목
- `test/utils/incrementalFilter.test.ts` (부분집합 룰 판정, 윈도우 병합 단위 테스트)
- `test/workers/workerIncrementalFilter.test.ts` (전체 스캔 결과와 100% 일치성, ANSI/비ASCII/취소/북마크 보존 테스트)
- `npx vitest run test/utils/ test/workers/ test/hooks/LogFilteringFlow.test.tsx`
- `npm run build`
