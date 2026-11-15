import { describe, it, expect } from 'vitest';
import {
    FilterCacheStore,
    coalesceCandidateWindows,
    isStrictNarrowingSnapshot,
    normalizeFilterSnapshot,
    selectIncrementalFilterPlan,
} from '../../utils/incrementalFilter';
import { LogRule } from '../../types';

const makeRule = (
    includeGroups: string[][],
    excludes: string[] = [],
    opts: Partial<LogRule> = {}
): LogRule => ({
    id: 'r1',
    name: 'test',
    includeGroups,
    excludes,
    highlights: [],
    happyCombosCaseSensitive: false,
    blockListCaseSensitive: false,
    ...opts,
});

describe('incrementalFilter utilities', () => {
    describe('isStrictNarrowingSnapshot', () => {
        it('accepts progressive Happy Combo AND branch additions (input -> input+start -> input+start+process)', () => {
            const s1 = normalizeFilterSnapshot(makeRule([['input']]), 'none');
            const s2 = normalizeFilterSnapshot(makeRule([['input', 'start']]), 'none');
            const s3 = normalizeFilterSnapshot(makeRule([['input', 'start', 'process']]), 'none');

            expect(isStrictNarrowingSnapshot(s1, s2)).toBe(true);
            expect(isStrictNarrowingSnapshot(s2, s3)).toBe(true);
            expect(isStrictNarrowingSnapshot(s1, s3)).toBe(true);
        });

        it('accepts tightening an existing term by substring extension, blocklist addition, branch removal, and quickFilter tightening', () => {
            const s1 = normalizeFilterSnapshot(makeRule([['input', 'a'], ['audio']], ['noise']), 'none');
            const s2 = normalizeFilterSnapshot(makeRule([['inputmethod', 'a']], ['noise', 'verbose']), 'error');

            expect(isStrictNarrowingSnapshot(s1, s2)).toBe(true);
        });

        it('accepts narrowing when previous includeGroups was empty (e.g., quickFilter/blocklist only -> add combo)', () => {
            const s1 = normalizeFilterSnapshot(makeRule([], ['verbose']), 'error');
            const s2 = normalizeFilterSnapshot(makeRule([['input']], ['verbose']), 'error');

            expect(isStrictNarrowingSnapshot(s1, s2)).toBe(true);
        });

        it('rejects widening changes (adding OR branch, removing AND word, removing exclude, loosening quickFilter, changing case sensitivity)', () => {
            const base = normalizeFilterSnapshot(makeRule([['input', 'start']], ['spam']), 'error');

            // Added new OR branch
            expect(isStrictNarrowingSnapshot(
                base,
                normalizeFilterSnapshot(makeRule([['input', 'start'], ['wifi']], ['spam']), 'error')
            )).toBe(false);

            // Removed AND term
            expect(isStrictNarrowingSnapshot(
                base,
                normalizeFilterSnapshot(makeRule([['input']], ['spam']), 'error')
            )).toBe(false);

            // Removed blocklist word
            expect(isStrictNarrowingSnapshot(
                base,
                normalizeFilterSnapshot(makeRule([['input', 'start']], []), 'error')
            )).toBe(false);

            // Switched quickFilter
            expect(isStrictNarrowingSnapshot(
                base,
                normalizeFilterSnapshot(makeRule([['input', 'start']], ['spam']), 'exception')
            )).toBe(false);

            // Removed quickFilter
            expect(isStrictNarrowingSnapshot(
                base,
                normalizeFilterSnapshot(makeRule([['input', 'start']], ['spam']), 'none')
            )).toBe(false);

            // Toggled happyCombosCaseSensitive
            expect(isStrictNarrowingSnapshot(
                base,
                normalizeFilterSnapshot(makeRule([['input', 'start']], ['spam'], { happyCombosCaseSensitive: true }), 'error')
            )).toBe(false);
        });
    });

    describe('coalesceCandidateWindows', () => {
        it('merges close lines within maxGapBytes and splits when gap exceeds threshold or window exceeds maxWindowBytes', () => {
            // 6 lines of 100 bytes each + a huge line gap
            const offsets = new BigInt64Array([0n, 100n, 200n, 500000n, 500100n, 600000n]);
            const fileSize = 600100;
            const candidates = new Int32Array([0, 2, 3, 4]);

            const res = coalesceCandidateWindows(candidates, offsets, fileSize, {
                maxGapBytes: 1024,
                maxWindowBytes: 150,
            });

            // Line 0: [0, 100], Line 2: [200, 500000] -> span > 150 -> split
            // Line 3: [500000, 500100], Line 4: [500100, 600000] -> span > 150 -> split
            expect(res.windows.length).toBeGreaterThanOrEqual(3);

            const resWide = coalesceCandidateWindows(candidates, offsets, 600100, {
                maxGapBytes: 1000,
                maxWindowBytes: 2_000_000,
            });
            // Lines [0, 2] span 0..500000, gap between 2 (ends at 500000) and 3 (starts at 500000) is 0!
            // Actually line 2 occupies [200, 500000] because lineOffsets[3] is 500000!
            // Use realistic offsets where line 2 is [200, 300] and line 3 starts at 500000
            const offsets2 = new BigInt64Array([0n, 100n, 200n, 300n, 500000n, 500100n]);
            const resSplit = coalesceCandidateWindows(new Int32Array([0, 2, 4]), offsets2, 500100, {
                maxGapBytes: 1000,
                maxWindowBytes: 2_000_000,
            });
            expect(resSplit.windows).toEqual([
                { startByte: 0, endByte: 300, lineIndices: [0, 2] },
                { startByte: 500000, endByte: 500100, lineIndices: [4] },
            ]);
            expect(resSplit.totalReadBytes).toBe(400);
            expect(resWide.windows.length).toBe(1);
        });
    });

    describe('FilterCacheStore & selectIncrementalFilterPlan', () => {
        it('picks exact match on backtrack and smallest subset parent on multi-step narrowing', () => {
            const store = new FilterCacheStore();
            const s1 = normalizeFilterSnapshot(makeRule([['input']]), 'none');
            const s2 = normalizeFilterSnapshot(makeRule([['input', 'start']]), 'none');

            store.record({
                snapshot: s1,
                rawMatchedIndices: new Int32Array([1, 5, 10, 20, 30]),
                totalLines: 1000,
            });
            store.record({
                snapshot: s2,
                rawMatchedIndices: new Int32Array([5, 20]),
                totalLines: 1000,
            });

            // Forward to s3 -> picks smaller parent s2 (length 2)
            const s3 = normalizeFilterSnapshot(makeRule([['input', 'start', 'process']]), 'none');
            const offsets = new BigInt64Array(1000);
            for (let i = 0; i < 1000; i++) offsets[i] = BigInt(i * 100);

            const plan3 = selectIncrementalFilterPlan({
                cache: store,
                nextSnapshot: s3,
                totalLines: 1000,
                isStreamMode: false,
                isLocalFileMode: false,
                lineOffsets: offsets,
                fileSize: 100000,
            });
            expect(plan3.mode).toBe('window-sparse');
            expect(plan3.sourceEntry?.rawMatchedIndices).toEqual(new Int32Array([5, 20]));

            // Exact match back to s1 -> exact-cache
            const planExact = selectIncrementalFilterPlan({
                cache: store,
                nextSnapshot: s1,
                totalLines: 1000,
                isStreamMode: false,
                isLocalFileMode: false,
                lineOffsets: offsets,
                fileSize: 100000,
            });
            expect(planExact.mode).toBe('exact-cache');
            expect(planExact.sourceEntry?.rawMatchedIndices).toEqual(new Int32Array([1, 5, 10, 20, 30]));
        });

        it('returns empty-instant immediately when candidate parent already has 0 matches', () => {
            const store = new FilterCacheStore();
            const s1 = normalizeFilterSnapshot(makeRule([['input', 'impossible']]), 'none');
            store.record({
                snapshot: s1,
                rawMatchedIndices: new Int32Array(0),
                totalLines: 1000,
            });

            const s2 = normalizeFilterSnapshot(makeRule([['input', 'impossible', 'extra']]), 'none');
            const plan = selectIncrementalFilterPlan({
                cache: store,
                nextSnapshot: s2,
                totalLines: 1000,
                isStreamMode: false,
                isLocalFileMode: false,
                lineOffsets: new BigInt64Array(1000),
                fileSize: 100000,
            });
            expect(plan.mode).toBe('empty-instant');
        });

        it('falls back to full-scan when candidate ratio exceeds 25% of totalLines or totalLines changed', () => {
            const store = new FilterCacheStore();
            const s1 = normalizeFilterSnapshot(makeRule([['a']]), 'none');
            // 5 of 10 lines = 50% > 25%
            store.record({
                snapshot: s1,
                rawMatchedIndices: new Int32Array([0, 2, 4, 6, 8]),
                totalLines: 10,
            });
            const offsets = new BigInt64Array([0n, 10n, 20n, 30n, 40n, 50n, 60n, 70n, 80n, 90n]);
            const s2 = normalizeFilterSnapshot(makeRule([['a', 'b']]), 'none');

            const densePlan = selectIncrementalFilterPlan({
                cache: store,
                nextSnapshot: s2,
                totalLines: 10,
                isStreamMode: false,
                isLocalFileMode: false,
                lineOffsets: offsets,
                fileSize: 100,
            });
            expect(densePlan.mode).toBe('full-scan');

            const grownPlan = selectIncrementalFilterPlan({
                cache: store,
                nextSnapshot: s2,
                totalLines: 11,
                isStreamMode: false,
                isLocalFileMode: false,
                lineOffsets: offsets,
                fileSize: 110,
            });
            expect(grownPlan.mode).toBe('full-scan');
        });
    });
});
