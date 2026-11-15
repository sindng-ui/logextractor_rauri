import { checkIsMatch } from '../utils/logFiltering';

const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;
const CHUNK_ACK_TIMEOUT_MS = 2000;
const CHUNK_EXEC_TIMEOUT_MS = 60000;
const FALLBACK_YIELD_INTERVAL = 25000;

export const stripLineForMatch = (line: string): string => {
    const cleanCr = line.endsWith('\r') ? line.slice(0, -1) : line;
    return cleanCr.includes('\x1b') ? cleanCr.replace(ANSI_ESCAPE_REGEX, '') : cleanCr;
};

export interface SubWorkerEntry {
    id: number;
    worker: Worker;
    alive: boolean;
    booted: boolean;
    busyCount: number;
    onFatalError: Set<() => void>;
}

export class SubWorkerPool {
    private entries: SubWorkerEntry[] = [];
    private disabled = false;
    private nextId = 0;

    constructor(
        public readonly maxSubWorkers: number,
        private readonly spawnWorker: () => Worker,
    ) {}

    public isDisabled(): boolean {
        return this.disabled;
    }

    public getActiveCount(): number {
        let count = 0;
        for (const entry of this.entries) {
            if (entry.alive) count++;
        }
        return count;
    }

    public init(isTabActive: boolean): void {
        if (!isTabActive) {
            console.log('[Worker] Tab is inactive. Skipping sub-worker spawn.');
            return;
        }
        if (this.disabled) {
            return;
        }
        if (this.entries.some(entry => entry.alive)) {
            return;
        }
        this.entries = [];

        console.log(`[Worker] Spawning ${this.maxSubWorkers} sub-workers...`);
        let spawned = 0;
        for (let i = 0; i < this.maxSubWorkers; i++) {
            try {
                const sw = this.spawnWorker();
                const entry: SubWorkerEntry = {
                    id: this.nextId++,
                    worker: sw,
                    alive: true,
                    booted: false,
                    busyCount: 0,
                    onFatalError: new Set(),
                };

                const onReadyMsg = (e: MessageEvent) => {
                    const msgType = e.data?.type;
                    if (
                        msgType === 'SUBWORKER_READY' ||
                        msgType === 'CHUNK_ACK' ||
                        msgType === 'CHUNK_COMPLETE' ||
                        msgType === 'FILTER_LINES_COMPLETE'
                    ) {
                        entry.booted = true;
                    }
                };
                const onFailure = (reason: string, err?: unknown) => {
                    console.error(`[Worker] SubWorker ${entry.id} ${reason}:`, err);
                    this.invalidateEntry(entry, !entry.booted);
                };

                sw.addEventListener('message', onReadyMsg);
                sw.onerror = (e) => onFailure('error', e);
                sw.addEventListener('messageerror', (e) => onFailure('messageerror', e));

                this.entries.push(entry);
                spawned++;
            } catch (e) {
                console.error('[Worker] Failed to spawn sub-worker', i, e);
            }
        }

        if (spawned === 0) {
            console.warn('[Worker] Failed to spawn any sub-workers; falling back to Main Worker.');
            this.disabled = true;
        }
    }

    public invalidateEntry(entry: SubWorkerEntry, disableIfAllUnbooted = false): void {
        if (!entry.alive) return;
        entry.alive = false;
        try {
            entry.worker.terminate();
        } catch {
            // Ignore terminate errors on dead worker
        }
        this.entries = this.entries.filter(item => item !== entry);

        if (disableIfAllUnbooted && this.entries.length === 0) {
            console.warn('[Worker] All sub-workers failed before booting; disabling sub-workers and switching to Main Worker.');
            this.disabled = true;
        }

        const callbacks = Array.from(entry.onFatalError);
        entry.onFatalError.clear();
        for (const cb of callbacks) {
            try {
                cb();
            } catch (err) {
                console.error('[Worker] Error in sub-worker fatal recovery handler:', err);
            }
        }
    }

    public terminateAll(): void {
        if (this.entries.length === 0) return;
        console.log('[Worker] Terminating sub-workers (tab inactive).');
        const snapshot = [...this.entries];
        this.entries = [];
        for (const entry of snapshot) {
            entry.alive = false;
            try {
                entry.worker.terminate();
            } catch {
                // Ignore terminate errors
            }
            const callbacks = Array.from(entry.onFatalError);
            entry.onFatalError.clear();
            for (const cb of callbacks) {
                try {
                    cb();
                } catch {
                    // Ignore recovery errors during shutdown
                }
            }
        }
    }

    public pickEntry(preferredIndex: number): SubWorkerEntry | null {
        if (this.disabled || this.entries.length === 0) return null;
        const aliveEntries = this.entries.filter(entry => entry.alive);
        if (aliveEntries.length === 0) return null;

        let best = aliveEntries[preferredIndex % aliveEntries.length];
        if (best.busyCount === 0) return best;

        for (let k = 1; k < aliveEntries.length; k++) {
            const candidate = aliveEntries[(preferredIndex + k) % aliveEntries.length];
            if (candidate.busyCount < best.busyCount) {
                best = candidate;
                if (best.busyCount === 0) break;
            }
        }
        return best;
    }
}

export interface FilterStrategy {
    linesPerChunk: number;
    concurrency: number;
    numChunks: number;
}

export const computeFilterStrategy = (
    totalLines: number,
    isLocalFileMode: boolean,
    hasAliveSubWorkers: boolean,
    numSubWorkers: number,
): FilterStrategy => {
    let linesPerChunk = 20000;
    let concurrency = Math.max(2, numSubWorkers);

    if (!hasAliveSubWorkers) {
        linesPerChunk = 100000;
        concurrency = isLocalFileMode ? 2 : 1;
    } else if (isLocalFileMode) {
        linesPerChunk = 100000;
        concurrency = Math.min(Math.max(2, numSubWorkers), 4);
    } else if (totalLines > 5000000) {
        linesPerChunk = 250000;
        concurrency = Math.max(6, numSubWorkers + 2);
    } else if (totalLines > 1000000) {
        linesPerChunk = 100000;
        concurrency = Math.max(4, numSubWorkers);
    } else {
        linesPerChunk = 20000;
        concurrency = Math.max(1, numSubWorkers);
    }

    return {
        linesPerChunk,
        concurrency,
        numChunks: Math.max(1, Math.ceil(totalLines / linesPerChunk)),
    };
};

export interface FilterExecutionContext {
    totalLines: number;
    linesPerChunk: number;
    numChunks: number;
    initialConcurrency: number;
    filterRequestId: number;
    isCancelled: () => boolean;
    isStreamMode: boolean;
    isLocalFileMode: boolean;
    localFilePath: string | null;
    localFileSize: number;
    currentFile: File | null;
    lineOffsets: any;
    lineOffsetsStream: ArrayLike<number>;
    lineLengthsStream: ArrayLike<number>;
    logBuffer: Uint8Array;
    normalizedRule: any;
    currentRule: any;
    currentQuickFilter: string;
    wasmEngine: any;
    wasmMemory: WebAssembly.Memory | null;
    textEncoder: TextEncoder;
    rpcCall: (method: string, params: any) => Promise<any>;
    pool: SubWorkerPool;
    onChunkDone: (chunkId: number, matches: Int32Array | null, requestId: number) => void;
}

const yieldToEventLoop = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const runLinesMatchOnMainWorker = async (
    lines: string[],
    startLine: number,
    ctx: FilterExecutionContext,
    stripLines: boolean,
): Promise<Int32Array | null> => {
    const matches: number[] = [];
    for (let j = 0; j < lines.length; j++) {
        if (j > 0 && j % FALLBACK_YIELD_INTERVAL === 0) {
            await yieldToEventLoop();
            if (ctx.isCancelled()) return null;
        }
        const candidate = stripLines ? stripLineForMatch(lines[j]) : lines[j];
        if (
            checkIsMatch(
                candidate,
                ctx.normalizedRule,
                false,
                ctx.currentQuickFilter,
                ctx.wasmEngine,
                ctx.wasmMemory || undefined,
                ctx.textEncoder,
            )
        ) {
            matches.push(startLine + j);
        }
    }
    return new Int32Array(matches);
};

const runChunkOnMainWorker = async (
    chunkId: number,
    startLine: number,
    endLine: number,
    decoder: TextDecoder,
    ctx: FilterExecutionContext,
): Promise<Int32Array | null> => {
    if (ctx.isCancelled()) return null;

    if (ctx.isStreamMode) {
        const isShared =
            typeof SharedArrayBuffer !== 'undefined' &&
            ctx.logBuffer.buffer instanceof SharedArrayBuffer;
        const matches: number[] = [];
        let processed = 0;
        for (let j = startLine; j < endLine; j++) {
            if (processed > 0 && processed % FALLBACK_YIELD_INTERVAL === 0) {
                await yieldToEventLoop();
                if (ctx.isCancelled()) return null;
            }
            const s = ctx.lineOffsetsStream[j];
            const l = ctx.lineLengthsStream[j];
            const slice = ctx.logBuffer.subarray(s, s + l);
            const line = decoder.decode(isShared ? slice.slice() : slice);
            if (
                checkIsMatch(
                    stripLineForMatch(line),
                    ctx.normalizedRule,
                    false,
                    ctx.currentQuickFilter,
                    ctx.wasmEngine,
                    ctx.wasmMemory || undefined,
                    ctx.textEncoder,
                )
            ) {
                matches.push(j);
            }
            processed++;
        }
        return new Int32Array(matches);
    }

    if (ctx.isLocalFileMode && ctx.lineOffsets && ctx.localFilePath) {
        const startByte = Number(ctx.lineOffsets[startLine]);
        const endByte = Number(endLine < ctx.lineOffsets.length ? ctx.lineOffsets[endLine] : ctx.localFileSize);
        const chunkBuffer: Uint8Array = await ctx.rpcCall('readFileSegment', {
            path: ctx.localFilePath,
            start: startByte,
            end: endByte,
        });
        if (ctx.isCancelled()) return null;

        const text = decoder.decode(chunkBuffer);
        const lines = text.split('\n');
        if (text.endsWith('\n')) lines.pop();
        return runLinesMatchOnMainWorker(lines, startLine, ctx, true);
    }

    if (ctx.currentFile && ctx.lineOffsets) {
        const startByte = Number(ctx.lineOffsets[startLine]);
        const endByte = Number(endLine < ctx.lineOffsets.length ? ctx.lineOffsets[endLine] : ctx.currentFile.size);
        const chunkBlob = ctx.currentFile.slice(startByte, endByte);
        const arrayBuffer = await chunkBlob.arrayBuffer();
        if (ctx.isCancelled()) return null;

        const text = decoder.decode(new Uint8Array(arrayBuffer));
        const lines = text.split('\n');
        if (text.endsWith('\n')) lines.pop();
        return runLinesMatchOnMainWorker(lines, startLine, ctx, true);
    }

    console.warn(`[Worker] No readable source available for Main Worker chunk ${chunkId}`);
    return new Int32Array(0);
};

const runChunkOnSubWorker = (
    entry: SubWorkerEntry,
    chunkId: number,
    startLine: number,
    endLine: number,
    decoder: TextDecoder,
    ctx: FilterExecutionContext,
): Promise<Int32Array | null> => {
    return new Promise((resolve) => {
        let settled = false;
        let ackTimer: ReturnType<typeof setTimeout> | null = null;
        let execTimer: ReturnType<typeof setTimeout> | null = null;

        const expectedCompleteType = ctx.isStreamMode ? 'FILTER_LINES_COMPLETE' : 'CHUNK_COMPLETE';

        const cleanup = () => {
            if (ackTimer !== null) {
                clearTimeout(ackTimer);
                ackTimer = null;
            }
            if (execTimer !== null) {
                clearTimeout(execTimer);
                execTimer = null;
            }
            entry.worker.removeEventListener('message', onMessage);
            entry.onFatalError.delete(onFatal);
        };

        const recoverInMainWorker = () => {
            if (settled) return;
            settled = true;
            cleanup();
            entry.busyCount = Math.max(0, entry.busyCount - 1);

            if (ctx.isCancelled()) {
                resolve(null);
                return;
            }
            runChunkOnMainWorker(chunkId, startLine, endLine, decoder, ctx)
                .then(resolve)
                .catch((err) => {
                    console.error(`[Worker] Main Worker recovery failed for chunk ${chunkId}:`, err);
                    resolve(null);
                });
        };

        const onFatal = () => {
            recoverInMainWorker();
        };

        const onMessage = (e: MessageEvent) => {
            if (settled) return;
            const data = e.data;
            if (!data || !data.payload) return;
            if (data.payload.chunkId !== chunkId || data.payload.requestId !== ctx.filterRequestId) {
                return;
            }

            if (data.type === 'CHUNK_ACK') {
                entry.booted = true;
                if (ackTimer !== null) {
                    clearTimeout(ackTimer);
                    ackTimer = null;
                }
                if (execTimer === null) {
                    execTimer = setTimeout(() => {
                        console.error(`[Worker] SubWorker ${entry.id} execution timed out on chunk ${chunkId}; recovering in Main Worker.`);
                        ctx.pool.invalidateEntry(entry, false);
                        recoverInMainWorker();
                    }, CHUNK_EXEC_TIMEOUT_MS);
                }
                return;
            }

            if (data.type === expectedCompleteType) {
                entry.booted = true;
                settled = true;
                cleanup();
                entry.busyCount = Math.max(0, entry.busyCount - 1);
                resolve(data.payload.matches ?? null);
            }
        };

        entry.busyCount++;
        entry.onFatalError.add(onFatal);
        entry.worker.addEventListener('message', onMessage);

        ackTimer = setTimeout(() => {
            if (settled) return;
            console.warn(`[Worker] SubWorker ${entry.id} missed CHUNK_ACK within ${CHUNK_ACK_TIMEOUT_MS}ms for chunk ${chunkId}; switching to Main Worker.`);
            ctx.pool.invalidateEntry(entry, !entry.booted);
            recoverInMainWorker();
        }, CHUNK_ACK_TIMEOUT_MS);

        try {
            if (ctx.isStreamMode) {
                const isShared =
                    typeof SharedArrayBuffer !== 'undefined' &&
                    ctx.logBuffer.buffer instanceof SharedArrayBuffer;
                const chunkLines: string[] = [];
                for (let j = startLine; j < endLine; j++) {
                    const s = ctx.lineOffsetsStream[j];
                    const l = ctx.lineLengthsStream[j];
                    const slice = ctx.logBuffer.subarray(s, s + l);
                    chunkLines.push(decoder.decode(isShared ? slice.slice() : slice));
                }
                entry.worker.postMessage({
                    type: 'FILTER_LINES',
                    payload: {
                        chunkId,
                        lines: chunkLines,
                        offset: startLine,
                        rule: ctx.currentRule,
                        quickFilter: ctx.currentQuickFilter,
                        requestId: ctx.filterRequestId,
                    },
                });
            } else if (ctx.isLocalFileMode && ctx.lineOffsets && ctx.localFilePath) {
                const startByte = Number(ctx.lineOffsets[startLine]);
                const endByte = Number(endLine < ctx.lineOffsets.length ? ctx.lineOffsets[endLine] : ctx.localFileSize);

                ctx.rpcCall('readFileSegment', {
                    path: ctx.localFilePath,
                    start: startByte,
                    end: endByte,
                })
                    .then((chunkBuffer: Uint8Array) => {
                        if (settled || ctx.isCancelled() || !entry.alive) {
                            recoverInMainWorker();
                            return;
                        }
                        const isTransferable =
                            chunkBuffer.byteOffset === 0 &&
                            chunkBuffer.byteLength === chunkBuffer.buffer.byteLength &&
                            !(typeof SharedArrayBuffer !== 'undefined' && chunkBuffer.buffer instanceof SharedArrayBuffer);
                        const message = {
                            type: 'FILTER_CHUNK',
                            payload: {
                                chunkId,
                                buffer: chunkBuffer,
                                offset: startLine,
                                rule: ctx.currentRule,
                                quickFilter: ctx.currentQuickFilter,
                                requestId: ctx.filterRequestId,
                            },
                        };
                        if (isTransferable) {
                            entry.worker.postMessage(message, [chunkBuffer.buffer]);
                        } else {
                            entry.worker.postMessage(message);
                        }
                    })
                    .catch((err) => {
                        console.error(`[Worker] RPC failed for chunk ${chunkId}:`, err);
                        if (!settled) {
                            settled = true;
                            cleanup();
                            entry.busyCount = Math.max(0, entry.busyCount - 1);
                            resolve(null);
                        }
                    });
            } else if (ctx.currentFile && ctx.lineOffsets) {
                const startByte = Number(ctx.lineOffsets[startLine]);
                const endByte = Number(endLine < ctx.lineOffsets.length ? ctx.lineOffsets[endLine] : ctx.currentFile.size);
                const chunkBlob = ctx.currentFile.slice(startByte, endByte);
                entry.worker.postMessage({
                    type: 'FILTER_CHUNK',
                    payload: {
                        chunkId,
                        blob: chunkBlob,
                        offset: startLine,
                        rule: ctx.currentRule,
                        quickFilter: ctx.currentQuickFilter,
                        requestId: ctx.filterRequestId,
                    },
                });
            } else {
                recoverInMainWorker();
            }
        } catch (postErr) {
            console.error(`[Worker] Failed to post chunk ${chunkId} to sub-worker ${entry.id}:`, postErr);
            ctx.pool.invalidateEntry(entry, !entry.booted);
            recoverInMainWorker();
        }
    });
};

export const runParallelFilterChunks = (ctx: FilterExecutionContext): void => {
    const decoder = new TextDecoder();
    let nextChunkIdx = 0;
    let inFlightLoops = 0;

    const maxFallbackConcurrency = ctx.isLocalFileMode ? 2 : 1;

    const processNextChunk = async () => {
        if (nextChunkIdx >= ctx.numChunks || ctx.isCancelled()) return;

        const chunkId = nextChunkIdx++;
        const startLine = chunkId * ctx.linesPerChunk;
        const endLine = Math.min(startLine + ctx.linesPerChunk, ctx.totalLines);

        inFlightLoops++;
        try {
            if (startLine >= endLine) {
                ctx.onChunkDone(chunkId, new Int32Array(0), ctx.filterRequestId);
            } else {
                const entry = ctx.pool.pickEntry(chunkId);
                let matches: Int32Array | null;
                if (entry) {
                    matches = await runChunkOnSubWorker(entry, chunkId, startLine, endLine, decoder, ctx);
                } else {
                    matches = await runChunkOnMainWorker(chunkId, startLine, endLine, decoder, ctx);
                }
                ctx.onChunkDone(chunkId, matches, ctx.filterRequestId);
            }
        } catch (err) {
            console.error(`[Worker] Unexpected chunk processing failure at ${chunkId}:`, err);
            ctx.onChunkDone(chunkId, null, ctx.filterRequestId);
        } finally {
            inFlightLoops--;
        }

        if (nextChunkIdx >= ctx.numChunks || ctx.isCancelled()) return;
        if (ctx.pool.isDisabled() && inFlightLoops >= maxFallbackConcurrency) {
            return;
        }
        processNextChunk();
    };

    const launchCount = Math.min(ctx.initialConcurrency, ctx.numChunks);
    for (let k = 0; k < launchCount; k++) {
        processNextChunk();
    }
};
