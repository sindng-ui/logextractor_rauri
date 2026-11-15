import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    SubWorkerPool,
    computeFilterStrategy,
    runParallelFilterChunks,
    stripLineForMatch,
    type FilterExecutionContext,
} from '../../workers/workerFilterExecutor';

class MockSubWorker {
    public onerror: ((e: unknown) => void) | null = null;
    private listeners: Record<string, Array<(e: any) => void>> = {};
    public terminated = false;
    public postedMessages: Array<{ data: any; transfer?: any[] }> = [];
    public onPostMessage?: (data: any, worker: MockSubWorker) => void;

    addEventListener(type: string, cb: (e: any) => void) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(cb);
    }

    removeEventListener(type: string, cb: (e: any) => void) {
        if (!this.listeners[type]) return;
        this.listeners[type] = this.listeners[type].filter(item => item !== cb);
    }

    postMessage(data: any, transfer?: any[]) {
        this.postedMessages.push({ data, transfer });
        if (this.onPostMessage) {
            this.onPostMessage(data, this);
        }
    }

    terminate() {
        this.terminated = true;
    }

    emitMessage(data: any) {
        for (const cb of [...(this.listeners['message'] || [])]) {
            cb({ data });
        }
    }

    emitError(err: unknown) {
        if (this.onerror) this.onerror(err);
    }
}

const createLineOffsets = (lines: string[]): { file: File; offsets: BigInt64Array } => {
    const encoder = new TextEncoder();
    const content = lines.join('\n') + '\n';
    const bytes = encoder.encode(content);
    const offsets = new BigInt64Array(lines.length);
    let pos = 0;
    for (let i = 0; i < lines.length; i++) {
        offsets[i] = BigInt(pos);
        pos += encoder.encode(lines[i]).length + 1;
    }
    const file = new File([bytes], 'test.log', { type: 'text/plain' });
    return { file, offsets };
};

const createRules = (keyword: string) => {
    const currentRule = {
        id: 'test-rule',
        name: 'Test',
        includeGroups: [[keyword]],
        excludes: [],
        happyCombosCaseSensitive: false,
        blockListCaseSensitive: false,
        highlights: [],
        showRawLogLines: false,
    };
    const normalizedRule = {
        ...currentRule,
        includeGroups: [[keyword.toLowerCase()]],
    };
    return { currentRule, normalizedRule };
};

describe('workerFilterExecutor', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('stripLineForMatch strips trailing CR and ANSI escapes', () => {
        expect(stripLineForMatch('\x1b[31mNewRoot\x1b[0m line\r')).toBe('NewRoot line');
        expect(stripLineForMatch('plain line')).toBe('plain line');
    });

    it('computeFilterStrategy always guarantees numChunks >= 1 even for 0 lines', () => {
        const empty = computeFilterStrategy(0, false, true, 4);
        expect(empty.numChunks).toBe(1);

        const localCapped = computeFilterStrategy(6_000_000, true, true, 16);
        expect(localCapped.concurrency).toBe(4);
        expect(localCapped.linesPerChunk).toBe(100_000);

        const fallback = computeFilterStrategy(6_000_000, false, false, 16);
        expect(fallback.concurrency).toBe(1);
        expect(fallback.linesPerChunk).toBe(100_000);
    });

    it('SubWorkerPool disables sub-workers if all workers fail before booting', () => {
        const spawned: MockSubWorker[] = [];
        const pool = new SubWorkerPool(2, () => {
            const w = new MockSubWorker();
            spawned.push(w);
            return w as unknown as Worker;
        });

        pool.init(true);
        expect(pool.getActiveCount()).toBe(2);
        expect(pool.isDisabled()).toBe(false);

        spawned[0].emitError(new Error('boot fail 1'));
        expect(pool.getActiveCount()).toBe(1);
        expect(pool.isDisabled()).toBe(false);

        spawned[1].emitError(new Error('boot fail 2'));
        expect(pool.getActiveCount()).toBe(0);
        expect(pool.isDisabled()).toBe(true);
    });

    it('completes 0-line files immediately without hanging', async () => {
        const pool = new SubWorkerPool(1, () => new MockSubWorker() as unknown as Worker);
        const doneCalls: Array<{ chunkId: number; matches: Int32Array | null }> = [];

        const { currentRule, normalizedRule } = createRules('NewRoot');

        await new Promise<void>((resolve) => {
            const ctx: FilterExecutionContext = {
                totalLines: 0,
                linesPerChunk: 20000,
                numChunks: 1,
                initialConcurrency: 1,
                filterRequestId: 1,
                isCancelled: () => false,
                isStreamMode: false,
                isLocalFileMode: false,
                localFilePath: null,
                localFileSize: 0,
                currentFile: new File([], 'empty.log'),
                lineOffsets: new BigInt64Array(0),
                lineOffsetsStream: [],
                lineLengthsStream: [],
                logBuffer: new Uint8Array(0),
                normalizedRule,
                currentRule,
                currentQuickFilter: 'none',
                wasmEngine: null,
                wasmMemory: null,
                textEncoder: new TextEncoder(),
                rpcCall: vi.fn(),
                pool,
                onChunkDone: (chunkId, matches) => {
                    doneCalls.push({ chunkId, matches });
                    resolve();
                },
            };
            runParallelFilterChunks(ctx);
        });

        expect(doneCalls).toHaveLength(1);
        expect(doneCalls[0].chunkId).toBe(0);
        expect(Array.from(doneCalls[0].matches || [])).toEqual([]);
    });

    it('completes sub-worker CHUNK_ACK + CHUNK_COMPLETE flow cleanly', async () => {
        const lines = ['line 0', 'NewRoot hit 1', 'line 2'];
        const { file, offsets } = createLineOffsets(lines);
        const { currentRule, normalizedRule } = createRules('NewRoot');

        const pool = new SubWorkerPool(1, () => {
            const sw = new MockSubWorker();
            queueMicrotask(() => sw.emitMessage({ type: 'SUBWORKER_READY' }));
            sw.onPostMessage = (data, worker) => {
                if (data.type === 'FILTER_CHUNK') {
                    worker.emitMessage({
                        type: 'CHUNK_ACK',
                        payload: { chunkId: data.payload.chunkId, requestId: data.payload.requestId },
                    });
                    queueMicrotask(() => {
                        worker.emitMessage({
                            type: 'CHUNK_COMPLETE',
                            payload: {
                                chunkId: data.payload.chunkId,
                                requestId: data.payload.requestId,
                                matches: new Int32Array([1]),
                            },
                        });
                    });
                }
            };
            return sw as unknown as Worker;
        });
        pool.init(true);

        const matchesPromise = new Promise<number[]>((resolve) => {
            const ctx: FilterExecutionContext = {
                totalLines: lines.length,
                linesPerChunk: 10,
                numChunks: 1,
                initialConcurrency: 1,
                filterRequestId: 5,
                isCancelled: () => false,
                isStreamMode: false,
                isLocalFileMode: false,
                localFilePath: null,
                localFileSize: 0,
                currentFile: file,
                lineOffsets: offsets,
                lineOffsetsStream: [],
                lineLengthsStream: [],
                logBuffer: new Uint8Array(0),
                normalizedRule,
                currentRule,
                currentQuickFilter: 'none',
                wasmEngine: null,
                wasmMemory: null,
                textEncoder: new TextEncoder(),
                rpcCall: vi.fn(),
                pool,
                onChunkDone: (_chunkId, matches) => resolve(Array.from(matches || [])),
            };
            runParallelFilterChunks(ctx);
        });

        expect(await matchesPromise).toEqual([1]);
        expect(pool.isDisabled()).toBe(false);
    });

    it('recovers currentFile (Blob) filtering in Main Worker when sub-worker never sends CHUNK_ACK', async () => {
        vi.useFakeTimers();

        const lines = [
            'INFO: boot complete',
            'DEBUG: NewRoot initialized\r',
            'WARN: \x1b[33mnewroot\x1b[0m matched with ANSI',
            'ERROR: unrelated failure',
        ];
        const { file, offsets } = createLineOffsets(lines);
        const { currentRule, normalizedRule } = createRules('NewRoot');
        const pool = new SubWorkerPool(2, () => new MockSubWorker() as unknown as Worker);
        pool.init(true);

        const results = new Map<number, Int32Array | null>();

        const donePromise = new Promise<void>((resolve) => {
            const ctx: FilterExecutionContext = {
                totalLines: lines.length,
                linesPerChunk: 2,
                numChunks: 2,
                initialConcurrency: 2,
                filterRequestId: 7,
                isCancelled: () => false,
                isStreamMode: false,
                isLocalFileMode: false,
                localFilePath: null,
                localFileSize: 0,
                currentFile: file,
                lineOffsets: offsets,
                lineOffsetsStream: [],
                lineLengthsStream: [],
                logBuffer: new Uint8Array(0),
                normalizedRule,
                currentRule,
                currentQuickFilter: 'none',
                wasmEngine: null,
                wasmMemory: null,
                textEncoder: new TextEncoder(),
                rpcCall: vi.fn(),
                pool,
                onChunkDone: (chunkId, matches) => {
                    results.set(chunkId, matches);
                    if (results.size === 2) resolve();
                },
            };
            runParallelFilterChunks(ctx);
        });

        // Sub-workers silently stall without CHUNK_ACK; advance past 2000ms watchdog
        await vi.advanceTimersByTimeAsync(2200);
        await donePromise;

        expect(pool.isDisabled()).toBe(true);
        expect(Array.from(results.get(0) || [])).toEqual([1]);
        expect(Array.from(results.get(1) || [])).toEqual([2]);
    });

    it('recovers immediately in Main Worker if terminateAll() happens mid-filter', async () => {
        const lines = ['NewRoot line 0', 'other line 1'];
        const { file, offsets } = createLineOffsets(lines);
        const { currentRule, normalizedRule } = createRules('NewRoot');
        const pool = new SubWorkerPool(1, () => new MockSubWorker() as unknown as Worker);
        pool.init(true);

        const matchesPromise = new Promise<number[]>((resolve) => {
            const ctx: FilterExecutionContext = {
                totalLines: lines.length,
                linesPerChunk: 10,
                numChunks: 1,
                initialConcurrency: 1,
                filterRequestId: 3,
                isCancelled: () => false,
                isStreamMode: false,
                isLocalFileMode: false,
                localFilePath: null,
                localFileSize: 0,
                currentFile: file,
                lineOffsets: offsets,
                lineOffsetsStream: [],
                lineLengthsStream: [],
                logBuffer: new Uint8Array(0),
                normalizedRule,
                currentRule,
                currentQuickFilter: 'none',
                wasmEngine: null,
                wasmMemory: null,
                textEncoder: new TextEncoder(),
                rpcCall: vi.fn(),
                pool,
                onChunkDone: (_chunkId, matches) => {
                    resolve(Array.from(matches || []));
                },
            };
            runParallelFilterChunks(ctx);
            // Terminate mid-filter (e.g., user switches tabs while filtering)
            pool.terminateAll();
        });

        const matchedLines = await matchesPromise;
        expect(matchedLines).toEqual([0]);
    });
});
