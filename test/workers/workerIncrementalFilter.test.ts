import { describe, it, expect, vi } from 'vitest';
import {
    FilterCacheStore,
    normalizeFilterSnapshot,
    selectIncrementalFilterPlan,
} from '../../utils/incrementalFilter';
import { compileFilterRule, filterByteBuffer, QuickFilterMode } from '../../utils/byteLogFiltering';
import { executeIncrementalFilter } from '../../workers/workerIncrementalFilter';
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

const buildIndexedBuffer = (lines: string[]) => {
    const encoder = new TextEncoder();
    const rawText = lines.join('\n') + '\n';
    const fullBytes = encoder.encode(rawText);
    const offsets: bigint[] = [0n];
    for (let i = 0; i < fullBytes.length; i++) {
        if (fullBytes[i] === 10 && i + 1 < fullBytes.length) {
            offsets.push(BigInt(i + 1));
        }
    }
    return {
        fullBytes,
        lineOffsets: new BigInt64Array(offsets),
        totalLines: offsets.length,
    };
};

const createMockFile = (bytes: Uint8Array): File =>
    ({
        size: bytes.length,
        slice: (start = 0, end = bytes.length) => ({
            arrayBuffer: async () => {
                const sub = bytes.subarray(start, end);
                const copy = new Uint8Array(sub.length);
                copy.set(sub);
                return copy.buffer;
            },
        }),
    }) as unknown as File;

describe('executeIncrementalFilter parity with full byte scan', () => {
    const sampleLines = [
        '03-03 22:23:26.283 I InputMethod: Vibrator ignored\r',
        '03-03 22:23:27.452 W InputMethod: Vibrator started for process 5678\r',
        '\x1b[31m03-03 22:23:28.000 E/InputMethod: Vibrator started for process 9999\x1b[0m\r',
        '03-03 22:23:29.100 D AudioService: normal log line without targets\r',
        '03-03 22:23:30.200 I InputMethod: 한글 started for process 테스트\r',
        '03-03 22:23:31.300 E InputMethod: started without target word\r',
        '03-03 22:23:32.400 I Bluetooth: unrelated noise line\r',
        '03-03 22:23:33.500 D OtherService: filler line 1\r',
        '03-03 22:23:34.600 D OtherService: filler line 2\r',
        '03-03 22:23:35.700 D OtherService: filler line 3\r',
        '03-03 22:23:36.800 D OtherService: filler line 4\r',
        '03-03 22:23:37.900 D OtherService: filler line 5\r',
        '03-03 22:23:38.000 D OtherService: filler line 6\r',
        '03-03 22:23:39.100 D OtherService: filler line 7\r',
        ...Array.from({ length: 30 }, (_, idx) => `03-03 22:23:39.${idx} D Filler: unrelated line ${idx}\r`),
        '03-03 22:23:40.200 E/InputMethod: Vibrator started for process 7777 blocked_tag\r',
    ];

    const runStep = async (
        store: FilterCacheStore,
        rule: LogRule,
        quickFilter: QuickFilterMode,
        opts: { isLocalFileMode: boolean }
    ) => {
        const { fullBytes, lineOffsets, totalLines } = buildIndexedBuffer(sampleLines);
        const normalized: LogRule = {
            ...rule,
            excludes: rule.excludes.map(e => (rule.blockListCaseSensitive ? e : e.toLowerCase())),
            includeGroups: rule.includeGroups.map(g =>
                g.map(t => (rule.happyCombosCaseSensitive ? t : t.toLowerCase()))
            ),
        };
        const snapshot = normalizeFilterSnapshot(normalized, quickFilter);
        const plan = selectIncrementalFilterPlan({
            cache: store,
            nextSnapshot: snapshot,
            totalLines,
            isStreamMode: false,
            isLocalFileMode: opts.isLocalFileMode,
            lineOffsets,
            fileSize: fullBytes.length,
        });

        const rpcCall = vi.fn(async (_method: string, params: { start: number; end: number }) => {
            return fullBytes.slice(params.start, params.end);
        });

        const expected = filterByteBuffer(fullBytes, 0, compileFilterRule(normalized, quickFilter)).matches;

        if (plan.mode === 'full-scan') {
            store.record({
                snapshot,
                rawMatchedIndices: expected,
                totalLines,
            });
            return { plan, actual: expected, expected, rpcCall };
        }

        const actual = await executeIncrementalFilter({
            plan,
            normalizedRule: normalized,
            currentQuickFilter: quickFilter,
            totalLines,
            isCancelled: () => false,
            isStreamMode: false,
            logBuffer: new Uint8Array(0),
            lineOffsetsStream: new Int32Array(0),
            lineLengthsStream: new Int32Array(0),
            isLocalFileMode: opts.isLocalFileMode,
            localFilePath: opts.isLocalFileMode ? '/tmp/test.log' : null,
            localFileSize: fullBytes.length,
            currentFile: opts.isLocalFileMode ? null : createMockFile(fullBytes),
            lineOffsets,
            rpcCall,
        });

        expect(actual).not.toBeNull();
        if (plan.mode !== 'exact-cache') {
            store.record({
                snapshot,
                rawMatchedIndices: actual!,
                totalLines,
            });
        }
        return { plan, actual: actual!, expected, rpcCall };
    };

    it('matches full-scan results identically across File mode progressive narrowing steps (including ANSI & CRLF)', async () => {
        const store = new FilterCacheStore();

        const step1 = await runStep(store, makeRule([['input']]), 'none', { isLocalFileMode: false });
        expect(step1.plan.mode).toBe('full-scan');

        const step2 = await runStep(store, makeRule([['input', 'start']]), 'none', { isLocalFileMode: false });
        expect(step2.plan.mode).toBe('window-sparse');
        expect(step2.actual).toEqual(step2.expected);

        const step3 = await runStep(store, makeRule([['input', 'start', 'process']]), 'none', { isLocalFileMode: false });
        expect(step3.plan.mode).toBe('window-sparse');
        expect(step3.actual).toEqual(step3.expected);

        const step4 = await runStep(store, makeRule([['input', 'start', 'process']], ['blocked_tag']), 'none', { isLocalFileMode: false });
        expect(step4.plan.mode).toBe('window-sparse');
        expect(step4.actual).toEqual(step4.expected);

        // Non-ASCII Korean narrowing term
        const step5 = await runStep(store, makeRule([['input', 'start', 'process', '한글']]), 'none', { isLocalFileMode: false });
        expect(step5.plan.mode).toBe('window-sparse');
        expect(step5.actual).toEqual(new Int32Array([4]));
        expect(step5.actual).toEqual(step5.expected);
    });

    it('executes sparse readFileSegment RPC windows cleanly in Local File mode', async () => {
        const store = new FilterCacheStore();

        await runStep(store, makeRule([['input']]), 'none', { isLocalFileMode: true });
        const step2 = await runStep(store, makeRule([['input', 'start', 'process']]), 'error', { isLocalFileMode: true });

        expect(step2.plan.mode).toBe('window-sparse');
        expect(step2.rpcCall).toHaveBeenCalled();
        expect(step2.actual).toEqual(step2.expected);
        expect(step2.actual).toEqual(new Int32Array([2, sampleLines.length - 1]));
    });

    it('re-filters cached stream candidates cleanly in Stream mode', async () => {
        const encoder = new TextEncoder();
        const streamText = [
            'alpha input only',
            'beta other line',
            'gamma input start',
            'delta input start process',
            'epsilon unrelated',
        ];
        const offsets: number[] = [];
        const lengths: number[] = [];
        const chunks: Uint8Array[] = [];
        let cursor = 0;
        for (const l of streamText) {
            const b = encoder.encode(l);
            chunks.push(b);
            offsets.push(cursor);
            lengths.push(b.length);
            cursor += b.length;
        }
        const logBuffer = new Uint8Array(cursor);
        let p = 0;
        for (const c of chunks) {
            logBuffer.set(c, p);
            p += c.length;
        }

        const store = new FilterCacheStore();
        const rule1 = makeRule([['input']]);
        store.record({
            snapshot: normalizeFilterSnapshot(rule1, 'none'),
            rawMatchedIndices: new Int32Array([0, 2, 3]),
            totalLines: streamText.length,
        });

        const rule2 = makeRule([['input', 'start', 'process']]);
        const plan = selectIncrementalFilterPlan({
            cache: store,
            nextSnapshot: normalizeFilterSnapshot(rule2, 'none'),
            totalLines: streamText.length,
            isStreamMode: true,
            isLocalFileMode: false,
            lineOffsets: null,
            fileSize: 0,
        });

        expect(plan.mode).toBe('stream-candidates');

        const res = await executeIncrementalFilter({
            plan,
            normalizedRule: rule2,
            currentQuickFilter: 'none',
            totalLines: streamText.length,
            isCancelled: () => false,
            isStreamMode: true,
            logBuffer,
            lineOffsetsStream: new Int32Array(offsets),
            lineLengthsStream: new Int32Array(lengths),
            isLocalFileMode: false,
            localFilePath: null,
            localFileSize: 0,
            currentFile: null,
            lineOffsets: null,
            rpcCall: async () => new Uint8Array(0),
        });

        expect(res).toEqual(new Int32Array([3]));
    });

    it('returns null promptly when cancelled mid-execution', async () => {
        const { fullBytes, lineOffsets, totalLines } = buildIndexedBuffer(sampleLines);
        const store = new FilterCacheStore();
        store.record({
            snapshot: normalizeFilterSnapshot(makeRule([['input']]), 'none'),
            rawMatchedIndices: new Int32Array([0, 1, 2, 4, 5, 14]),
            totalLines,
        });
        const nextRule = makeRule([['input', 'start']]);
        const plan = selectIncrementalFilterPlan({
            cache: store,
            nextSnapshot: normalizeFilterSnapshot(nextRule, 'none'),
            totalLines,
            isStreamMode: false,
            isLocalFileMode: false,
            lineOffsets,
            fileSize: fullBytes.length,
        });

        const res = await executeIncrementalFilter({
            plan,
            normalizedRule: nextRule,
            currentQuickFilter: 'none',
            totalLines,
            isCancelled: () => true,
            isStreamMode: false,
            logBuffer: new Uint8Array(0),
            lineOffsetsStream: new Int32Array(0),
            lineLengthsStream: new Int32Array(0),
            isLocalFileMode: false,
            localFilePath: null,
            localFileSize: fullBytes.length,
            currentFile: createMockFile(fullBytes),
            lineOffsets,
            rpcCall: async () => new Uint8Array(0),
        });

        expect(res).toBeNull();
    });

    it('processes thousands of non-ANSI candidate lines inside a multi-megabyte window without O(N^2) scanning', async () => {
        // Reproduces 4MB window with 10,000 sparse non-ANSI lines (~400B each).
        // Previously, unbounded buf.indexOf(0x1b, relStart) scanned to EOF of the 4MB buffer per line (~20GB total).
        const lineText = '03-03 22:23:27.452 W InputMethod: Vibrator started for process 5678 ' + 'x'.repeat(320) + '\n';
        const lineBytes = new TextEncoder().encode(lineText);
        const lineLen = lineBytes.length;
        const totalLines = 12000;
        const fullBytes = new Uint8Array(lineLen * totalLines);
        const lineOffsets = new BigInt64Array(totalLines);

        for (let i = 0; i < totalLines; i++) {
            const off = i * lineLen;
            lineOffsets[i] = BigInt(off);
            fullBytes.set(lineBytes, off);
        }

        const candidateIndices: number[] = [];
        for (let i = 0; i < totalLines; i += 10) {
            candidateIndices.push(i);
        }

        const store = new FilterCacheStore();
        store.record({
            snapshot: normalizeFilterSnapshot(makeRule([['input']]), 'none'),
            rawMatchedIndices: new Int32Array(candidateIndices),
            totalLines,
        });

        const nextRule = makeRule([['input', 'start', 'process']]);
        const plan = selectIncrementalFilterPlan({
            cache: store,
            nextSnapshot: normalizeFilterSnapshot(nextRule, 'none'),
            totalLines,
            isStreamMode: false,
            isLocalFileMode: false,
            lineOffsets,
            fileSize: fullBytes.length,
        });

        expect(plan.mode).toBe('window-sparse');

        const startMs = performance.now();
        const res = await executeIncrementalFilter({
            plan,
            normalizedRule: nextRule,
            currentQuickFilter: 'none',
            totalLines,
            isCancelled: () => false,
            isStreamMode: false,
            logBuffer: new Uint8Array(0),
            lineOffsetsStream: new Int32Array(0),
            lineLengthsStream: new Int32Array(0),
            isLocalFileMode: false,
            localFilePath: null,
            localFileSize: fullBytes.length,
            currentFile: createMockFile(fullBytes),
            lineOffsets,
            rpcCall: async () => new Uint8Array(0),
        });
        const elapsedMs = performance.now() - startMs;

        expect(res?.length).toBe(candidateIndices.length);
        expect(elapsedMs).toBeLessThan(250);
    });
});
