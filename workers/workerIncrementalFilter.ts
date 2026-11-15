import { LogRule } from '../types';
import {
    compileFilterRule,
    CompiledFilterRule,
    matchByteSpan,
    matchCompiledLine,
    QuickFilterMode,
} from '../utils/byteLogFiltering';
import { CoalescedWindow, IncrementalFilterPlan } from '../utils/incrementalFilter';

export interface IncrementalExecutionContext {
    plan: IncrementalFilterPlan;
    normalizedRule: LogRule;
    currentQuickFilter: QuickFilterMode;
    totalLines: number;
    isCancelled: () => boolean;
    onProgress?: (progress: number) => void;
    // Stream mode sources
    isStreamMode: boolean;
    logBuffer: Uint8Array;
    lineOffsetsStream: Int32Array;
    lineLengthsStream: Int32Array;
    // File / LocalFile mode sources
    isLocalFileMode: boolean;
    localFilePath: string | null;
    localFileSize: number;
    currentFile: File | null;
    lineOffsets: BigInt64Array | null;
    rpcCall: (method: string, params: any) => Promise<any>;
}

const STREAM_YIELD_INTERVAL = 25000;
const yieldToEventLoop = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const decodeStreamSlice = (decoder: TextDecoder, slice: Uint8Array): string => {
    const isShared =
        typeof SharedArrayBuffer !== 'undefined' &&
        slice.buffer instanceof SharedArrayBuffer;
    return decoder.decode(isShared ? slice.slice() : slice);
};

const runStreamIncremental = async (
    candidates: Int32Array,
    compiled: CompiledFilterRule,
    ctx: IncrementalExecutionContext
): Promise<Int32Array | null> => {
    const decoder = new TextDecoder();
    const matches: number[] = [];
    const total = candidates.length;
    let lastReportedPct = -1;

    for (let i = 0; i < total; i++) {
        if (i > 0 && i % STREAM_YIELD_INTERVAL === 0) {
            await yieldToEventLoop();
            if (ctx.isCancelled()) return null;

            const pct = Math.floor((i / total) * 100);
            if (pct !== lastReportedPct) {
                lastReportedPct = pct;
                ctx.onProgress?.(pct);
            }
        }

        const lineIdx = candidates[i];
        const s = ctx.lineOffsetsStream[lineIdx];
        const l = ctx.lineLengthsStream[lineIdx];
        const line = decodeStreamSlice(decoder, ctx.logBuffer.subarray(s, s + l));
        if (matchCompiledLine(line, compiled)) {
            matches.push(lineIdx);
        }
    }

    ctx.onProgress?.(100);
    return new Int32Array(matches);
};

const evaluateWindowBuffer = (
    buf: Uint8Array,
    win: CoalescedWindow,
    lineOffsets: BigInt64Array,
    totalOffsets: number,
    fileSize: number,
    compiled: CompiledFilterRule,
    decoder: TextDecoder
): number[] => {
    const winStart = win.startByte;
    const lineIndices = win.lineIndices;
    const winMatches: number[] = [];

    for (let i = 0; i < lineIndices.length; i++) {
        const lineIdx = lineIndices[i];
        const relStart = Number(lineOffsets[lineIdx]) - winStart;
        const absEnd = lineIdx + 1 < totalOffsets ? Number(lineOffsets[lineIdx + 1]) : fileSize;
        let relEnd = absEnd - winStart;

        if (relEnd > buf.length) relEnd = buf.length;
        if (relEnd > relStart && buf[relEnd - 1] === 10) relEnd--;
        if (relEnd > relStart && buf[relEnd - 1] === 13) relEnd--;

        // Pass chunkHasAnsi=undefined so only candidate spans scan for 0x1B (skipping gap bytes cleanly)
        if (matchByteSpan(buf, relStart, relEnd, compiled, decoder, undefined)) {
            winMatches.push(lineIdx);
        }
    }

    return winMatches;
};

const runSparseWindowsIncremental = async (
    windows: CoalescedWindow[],
    compiled: CompiledFilterRule,
    ctx: IncrementalExecutionContext
): Promise<Int32Array | null> => {
    const lineOffsets = ctx.lineOffsets;
    if (!lineOffsets) return null;

    const totalOffsets = lineOffsets.length;
    const fileSize = ctx.isLocalFileMode ? ctx.localFileSize : (ctx.currentFile?.size ?? 0);
    const numWindows = windows.length;
    const windowResults: (number[] | null)[] = new Array(numWindows).fill(null);
    const concurrency = Math.min(numWindows, ctx.isLocalFileMode ? 2 : 4);

    let nextIdx = 0;
    let completed = 0;
    let lastReportedPct = -1;

    const workerLoop = async () => {
        const decoder = new TextDecoder();

        while (true) {
            if (ctx.isCancelled()) return;
            const winIdx = nextIdx++;
            if (winIdx >= numWindows) return;

            const win = windows[winIdx];
            let buf: Uint8Array;

            if (ctx.isLocalFileMode && ctx.localFilePath) {
                buf = await ctx.rpcCall('readFileSegment', {
                    path: ctx.localFilePath,
                    start: win.startByte,
                    end: win.endByte,
                });
            } else if (ctx.currentFile) {
                const ab = await ctx.currentFile.slice(win.startByte, win.endByte).arrayBuffer();
                buf = new Uint8Array(ab);
            } else {
                windowResults[winIdx] = [];
                completed++;
                continue;
            }

            if (ctx.isCancelled()) return;

            windowResults[winIdx] = evaluateWindowBuffer(
                buf,
                win,
                lineOffsets,
                totalOffsets,
                fileSize,
                compiled,
                decoder
            );

            completed++;
            const pct = Math.floor((completed / numWindows) * 100);
            if (pct !== lastReportedPct) {
                lastReportedPct = pct;
                ctx.onProgress?.(pct);
            }
        }
    };

    const tasks: Promise<void>[] = [];
    for (let k = 0; k < concurrency; k++) {
        tasks.push(workerLoop());
    }
    await Promise.all(tasks);

    if (ctx.isCancelled()) return null;

    let totalMatches = 0;
    for (let i = 0; i < numWindows; i++) {
        const res = windowResults[i];
        if (res) totalMatches += res.length;
    }

    const finalMatches = new Int32Array(totalMatches);
    let offset = 0;
    for (let i = 0; i < numWindows; i++) {
        const res = windowResults[i];
        if (res && res.length > 0) {
            finalMatches.set(res, offset);
            offset += res.length;
        }
    }

    return finalMatches;
};

/**
 * Execute an incremental subset filter plan using previously cached candidate line indices.
 * Returns `null` if cancelled before completion.
 */
export const executeIncrementalFilter = async (
    ctx: IncrementalExecutionContext
): Promise<Int32Array | null> => {
    const { plan } = ctx;

    if (plan.mode === 'exact-cache' && plan.sourceEntry) {
        ctx.onProgress?.(100);
        return plan.sourceEntry.rawMatchedIndices;
    }

    if (plan.mode === 'empty-instant') {
        ctx.onProgress?.(100);
        return new Int32Array(0);
    }

    const compiled = compileFilterRule(ctx.normalizedRule, ctx.currentQuickFilter);

    if (plan.mode === 'stream-candidates' && plan.sourceEntry) {
        return runStreamIncremental(plan.sourceEntry.rawMatchedIndices, compiled, ctx);
    }

    if (plan.mode === 'window-sparse' && plan.windows) {
        return runSparseWindowsIncremental(plan.windows, compiled, ctx);
    }

    return null;
};
