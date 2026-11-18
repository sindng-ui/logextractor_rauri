import { LogRule, LogWorkerResponse } from '../types';
import {
    FilteredView,
    decodePackedLinesBinary,
    findVisualOfOriginal,
    getOriginalAt,
    getViewLength,
} from './workerIndexView';

export interface DataReaderContext {
    filteredIndices: Int32Array | null;
    isIdentityView?: boolean;
    identityTotalLines?: number;
    isStreamMode: boolean;
    isLocalFileMode?: boolean;
    hasNativeEngine?: boolean;
    activeFilterSnapshotKey?: string | null;
    bookmarksSorted?: number[];
    localFilePath?: string | null;
    localFileSize?: number;
    rpcCall?: (method: string, args: any) => Promise<any>;
    // ✅ Hyungnim, we now receive binary-only buffers instead of string arrays! 🐧💎
    logBuffer?: Uint8Array;
    lineOffsetsStream?: Uint32Array;
    lineLengthsStream?: Uint32Array;
    currentFile: File | null;
    lineOffsets: BigInt64Array | null;
    currentRule: LogRule | null;
    respond: (response: any) => void;
    postMessage: (message: any, transferables?: Transferable[]) => void;
}

const sharedDecoder = new TextDecoder();

function contextToView(context: DataReaderContext): FilteredView {
    return {
        isIdentity: !!context.isIdentityView,
        totalLines: context.identityTotalLines ?? 0,
        indices: context.filteredIndices,
    };
}

export function binarySearch(arr: Int32Array, val: number): number {
    let low = 0;
    let high = arr.length - 1;
    while (low <= high) {
        const mid = (low + high) >>> 1;
        const midVal = arr[mid];
        if (midVal === val) return mid;
        else if (midVal < val) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}

export const getLines = async (context: DataReaderContext, startFilterIndex: number, count: number, requestId: string) => {
    const { filteredIndices, isStreamMode, logBuffer, lineOffsetsStream, lineLengthsStream, currentFile, lineOffsets, respond } = context;
    const view = contextToView(context);
    const totalVisible = getViewLength(view);

    if (totalVisible === 0 && !view.isIdentity && !filteredIndices) {
        respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
        return;
    }

    const resultLines: { lineNum: number, content: string }[] = [];
    const max = Math.min(startFilterIndex + count, totalVisible);

    if (isStreamMode) {
        if (!filteredIndices || !logBuffer || !lineOffsetsStream || !lineLengthsStream) {
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }
        for (let i = startFilterIndex; i < max; i++) {
            const originalIdx = filteredIndices[i];
            const start = lineOffsetsStream[originalIdx];
            const len = lineLengthsStream[originalIdx];
            // ✅ Zero-copy (with slice fallback): SharedArrayBuffer cannot be decoded directly by TextDecoder
            // slice() creates a tiny non-shared copy for the decoder.
            const rawText = sharedDecoder.decode(logBuffer.subarray(start, start + len).slice());
            // Strip ANSI (LogProcessor.worker.ts already does this for Stream mode, but we keep it for consistency)
            const text = rawText.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
            resultLines.push({ lineNum: originalIdx + 1, content: text });
        }
    } else if (context.isLocalFileMode && context.hasNativeEngine && context.localFilePath && context.rpcCall) {
        if (startFilterIndex >= max) {
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }
        try {
            const indices: number[] = new Array(max - startFilterIndex);
            for (let i = startFilterIndex; i < max; i++) {
                indices[i - startFilterIndex] = getOriginalAt(view, i);
            }
            const raw: Uint8Array = await context.rpcCall('readLocalLinesByIndices', {
                path: context.localFilePath,
                indices,
                stripAnsi: true,
            });
            const decoded = decodePackedLinesBinary(raw, sharedDecoder);
            for (const row of decoded) {
                resultLines.push({ lineNum: row.lineIdx + 1, content: row.content });
            }
        } catch (err) {
            console.error('[DataReader] Native readLocalLinesByIndices failed', err);
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }
    } else {
        if (!context.isLocalFileMode && !currentFile) {
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }

        if (!lineOffsets || (!view.isIdentity && !filteredIndices)) {
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }

        if (startFilterIndex >= max) {
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }

        try {
            const MAX_GAP_BYTES = 10 * 1024 * 1024;
            const MAX_CHUNK_BYTES = 20 * 1024 * 1024;

            interface ReadChunk {
                minByte: bigint;
                maxByte: bigint;
                lineIndices: number[];
            }

            const chunks: ReadChunk[] = [];
            let currentChunk: ReadChunk | null = null;
            const fileSize = context.isLocalFileMode ? context.localFileSize! : currentFile!.size;

            for (let i = startFilterIndex; i < max; i++) {
                const idx = getOriginalAt(view, i);
                const startByte = lineOffsets[idx];
                const endByte = idx < lineOffsets.length - 1 ? lineOffsets[idx + 1] : BigInt(fileSize);

                if (!currentChunk) {
                    currentChunk = { minByte: startByte, maxByte: endByte, lineIndices: [i] };
                } else {
                    const gap = startByte - currentChunk.maxByte;
                    const newChunkSize = endByte - currentChunk.minByte;

                    if (gap <= BigInt(MAX_GAP_BYTES) && newChunkSize <= BigInt(MAX_CHUNK_BYTES)) {
                        currentChunk.maxByte = endByte;
                        currentChunk.lineIndices.push(i);
                    } else {
                        chunks.push(currentChunk);
                        currentChunk = { minByte: startByte, maxByte: endByte, lineIndices: [i] };
                    }
                }
            }
            if (currentChunk) chunks.push(currentChunk);

            const CONCURRENCY_LIMIT = 15;
            const results: { lineNum: number, content: string }[] = [];

            const processChunk = async (chunk: ReadChunk) => {
                let uint8View: Uint8Array;
                try {
                    if (context.isLocalFileMode) {
                        uint8View = await context.rpcCall!('readFileSegment', { path: context.localFilePath, start: Number(chunk.minByte), end: Number(chunk.maxByte) });
                    } else {
                        const chunkBlob = currentFile!.slice(Number(chunk.minByte), Number(chunk.maxByte));
                        const buffer = await chunkBlob.arrayBuffer();
                        uint8View = new Uint8Array(buffer);
                    }

                    for (const k of chunk.lineIndices) {
                        const originalIdx = getOriginalAt(view, k);
                        const lineStart = lineOffsets[originalIdx];
                        const lineEnd = originalIdx < lineOffsets.length - 1 ? lineOffsets[originalIdx + 1] : BigInt(fileSize);

                        const relStart = Number(lineStart - chunk.minByte);
                        const relEnd = Number(lineEnd - chunk.minByte);

                        let realEnd = relEnd;
                        if (realEnd > relStart && uint8View[realEnd - 1] === 10) realEnd--; // \n
                        if (realEnd > relStart && uint8View[realEnd - 1] === 13) realEnd--; // \r

                        const text = sharedDecoder.decode(uint8View.subarray(relStart, realEnd)).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
                        results.push({ lineNum: originalIdx + 1, content: text });
                    }
                } catch (e) {
                    console.error('[DataReader] Chunk process error:', e);
                }
            };

            for (let i = 0; i < chunks.length; i += CONCURRENCY_LIMIT) {
                const batch = chunks.slice(i, i + CONCURRENCY_LIMIT);
                await Promise.all(batch.map(processChunk));
            }

            resultLines.push(...results);
            resultLines.sort((a, b) => a.lineNum - b.lineNum);

        } catch (err) {
            console.error('[Worker] Smart batch read failed', err);
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }
    }

    respond({ type: 'LINES_DATA', payload: { lines: resultLines }, requestId });
};

const readLocalRangeLines = async (
    context: DataReaderContext,
    startIdx: number,
    count: number,
    stripAnsi: boolean
): Promise<{ lineNum: number; content: string }[]> => {
    const raw: Uint8Array = await context.rpcCall!('readLocalLineRange', {
        path: context.localFilePath,
        startLine: startIdx,
        count,
        stripAnsi,
    });
    const decoded = decodePackedLinesBinary(raw, sharedDecoder);
    return decoded.map(row => ({ lineNum: row.lineIdx + 1, content: row.content }));
};

export const getRawLines = async (context: DataReaderContext, startLineNum: number, count: number, requestId: string) => {
    const { isStreamMode, logBuffer, lineOffsetsStream, lineLengthsStream, currentFile, lineOffsets, respond } = context;
    const startIdx = startLineNum;
    let resultLines: { lineNum: number, content: string }[] = [];

    if (isStreamMode) {
        if (!logBuffer || !lineOffsetsStream || !lineLengthsStream) {
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }
        const max = Math.min(startIdx + count, lineOffsetsStream.length);
        for (let i = startIdx; i < max; i++) {
            const start = lineOffsetsStream[i];
            const len = lineLengthsStream[i];
            if (len === 0 && start === 0 && i > 0) break;
            const text = sharedDecoder.decode(logBuffer.subarray(start, start + len).slice());
            resultLines.push({ lineNum: i + 1, content: text });
        }
    } else if (context.isLocalFileMode && context.hasNativeEngine && context.localFilePath && context.rpcCall) {
        try {
            resultLines = await readLocalRangeLines(context, startIdx, count, true);
        } catch (err) {
            console.error('[Worker] Native getRawLines failed', err);
        }
    } else {
        if (!context.isLocalFileMode && !currentFile) {
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }
        if (!lineOffsets) {
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }
        const max = Math.min(startIdx + count, lineOffsets.length);

        let minByte = -1n;
        let maxByte = -1n;
        for (let i = startIdx; i < max; i++) {
            const startByte = lineOffsets[i];
            const fileSize = context.isLocalFileMode ? context.localFileSize! : currentFile!.size;
            const endByte = i < lineOffsets.length - 1 ? lineOffsets[i + 1] : BigInt(fileSize);
            if (minByte === -1n || startByte < minByte) minByte = startByte;
            if (maxByte === -1n || endByte > maxByte) maxByte = endByte;
        }

        try {
            if (minByte !== -1n && maxByte !== -1n) {
                let uint8View: Uint8Array;
                if (context.isLocalFileMode) {
                    uint8View = await context.rpcCall!('readFileSegment', { path: context.localFilePath, start: Number(minByte), end: Number(maxByte) });
                } else {
                    const chunkBlob = currentFile!.slice(Number(minByte), Number(maxByte));
                    const arrayBuf = await chunkBlob.arrayBuffer();
                    uint8View = new Uint8Array(arrayBuf);
                }
                const rawText = sharedDecoder.decode(uint8View).replace(/\r?\n$/, '');
                const text = rawText.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
                const lines = text.split('\n');

                for (let i = 0; i < lines.length; i++) {
                    resultLines.push({ lineNum: startIdx + i + 1, content: lines[i] });
                }
            }
        } catch (err) {
            console.error('[Worker] getRawLines failed', err);
        }
    }
    respond({ type: 'LINES_DATA', payload: { lines: resultLines }, requestId });
};

export const getSurroundingLines = async (context: DataReaderContext, absoluteIndex: number, count: number, requestId: string) => {
    const { isStreamMode, logBuffer, lineOffsetsStream, lineLengthsStream, currentFile, lineOffsets, respond } = context;
    let resultLines: { lineNum: number, content: string }[] = [];

    const startIdx = Math.max(0, absoluteIndex - Math.floor(count / 2));

    if (isStreamMode) {
        if (!logBuffer || !lineOffsetsStream || !lineLengthsStream) {
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }
        const max = Math.min(startIdx + count, lineOffsetsStream.length);
        for (let i = startIdx; i < max; i++) {
            const start = lineOffsetsStream[i];
            const len = lineLengthsStream[i];
            if (len === 0 && start === 0 && i > 0) break;
            const text = sharedDecoder.decode(logBuffer.subarray(start, start + len).slice());
            resultLines.push({ lineNum: i + 1, content: text });
        }
    } else if (context.isLocalFileMode && context.hasNativeEngine && context.localFilePath && context.rpcCall) {
        try {
            resultLines = await readLocalRangeLines(context, startIdx, count, false);
        } catch (err) {
            console.error('[Worker] Native getSurroundingLines failed', err);
        }
    } else {
        if (!context.isLocalFileMode && !currentFile) {
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }
        if (!lineOffsets) {
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }
        const max = Math.min(startIdx + count, lineOffsets.length);
        let minByte = -1n;
        let maxByte = -1n;
        for (let i = startIdx; i < max; i++) {
            const startByte = lineOffsets[i];
            const fileSize = context.isLocalFileMode ? context.localFileSize! : currentFile!.size;
            const endByte = i < lineOffsets.length - 1 ? lineOffsets[i + 1] : BigInt(fileSize);
            if (minByte === -1n || startByte < minByte) minByte = startByte;
            if (maxByte === -1n || endByte > maxByte) maxByte = endByte;
        }

        try {
            if (minByte !== -1n && maxByte !== -1n) {
                let uint8View: Uint8Array;
                if (context.isLocalFileMode) {
                    uint8View = await context.rpcCall!('readFileSegment', { path: context.localFilePath, start: Number(minByte), end: Number(maxByte) });
                } else {
                    const chunkBlob = currentFile!.slice(Number(minByte), Number(maxByte));
                    const arrayBuf = await chunkBlob.arrayBuffer();
                    uint8View = new Uint8Array(arrayBuf);
                }
                const text = sharedDecoder.decode(uint8View).replace(/\r?\n$/, '');
                const lines = text.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    resultLines.push({ lineNum: startIdx + i + 1, content: lines[i] });
                }
            }
        } catch (err) {
            console.error('[Worker] getSurroundingLines failed', err);
        }
    }
    respond({ type: 'LINES_DATA', payload: { lines: resultLines }, requestId });
};

export const getLinesByIndices = async (context: DataReaderContext, indices: number[], requestId: string, isAbsolute: boolean = false) => {
    const { filteredIndices, isStreamMode, logBuffer, lineOffsetsStream, lineLengthsStream, currentFile, lineOffsets, respond } = context;
    const view = contextToView(context);
    const totalVisible = getViewLength(view);

    if (totalVisible === 0 && !view.isIdentity && !filteredIndices) {
        respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
        return;
    }

    const resultLines: any[] = [];
    const sortedIndices = [...indices].sort((a, b) => a - b);

    if (isStreamMode) {
        if (!filteredIndices || !logBuffer || !lineOffsetsStream || !lineLengthsStream) {
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }
        for (const idx of sortedIndices) {
            let visualIdx = idx;
            let originalIdx = -1;

            if (isAbsolute) {
                visualIdx = binarySearch(filteredIndices, idx);
                originalIdx = idx;
            } else if (idx >= 0 && idx < filteredIndices.length) {
                originalIdx = filteredIndices[idx];
            }

            if (originalIdx !== -1 && visualIdx !== -1) {
                const start = lineOffsetsStream[originalIdx];
                const len = lineLengthsStream[originalIdx];
                const text = sharedDecoder.decode(logBuffer.subarray(start, start + len).slice());
                resultLines.push({
                    lineNum: originalIdx + 1,
                    content: text,
                    formattedLineIndex: visualIdx
                });
            }
        }
    } else if (context.isLocalFileMode && context.hasNativeEngine && context.localFilePath && context.rpcCall) {
        const mapped: Array<{ visualIdx: number; originalIdx: number }> = [];
        const requestLineIndices: number[] = [];
        for (const idx of sortedIndices) {
            const visualIdx = isAbsolute ? findVisualOfOriginal(view, idx) : idx;
            const originalIdx = isAbsolute ? idx : getOriginalAt(view, idx);
            if (originalIdx !== -1 && visualIdx !== -1) {
                mapped.push({ visualIdx, originalIdx });
                requestLineIndices.push(originalIdx);
            }
        }
        if (requestLineIndices.length > 0) {
            try {
                const raw: Uint8Array = await context.rpcCall('readLocalLinesByIndices', {
                    path: context.localFilePath,
                    indices: requestLineIndices,
                    stripAnsi: false,
                });
                const decoded = decodePackedLinesBinary(raw, sharedDecoder);
                const contentMap = new Map<number, string>();
                for (const row of decoded) {
                    contentMap.set(row.lineIdx, row.content);
                }
                for (const item of mapped) {
                    const content = contentMap.get(item.originalIdx);
                    if (content !== undefined) {
                        resultLines.push({
                            lineNum: item.originalIdx + 1,
                            content,
                            formattedLineIndex: item.visualIdx,
                        });
                    }
                }
            } catch (err) {
                console.error('[DataReader] Native getLinesByIndices failed', err);
            }
        }
    } else {
        if (!context.isLocalFileMode && !currentFile) {
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }
        if (!lineOffsets) {
            respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
            return;
        }

        const readSlice = (blob: Blob): Promise<string> => {
            return new Promise((resolve) => {
                const r = new FileReader();
                r.onload = (e) => resolve(e.target?.result as string);
                r.onerror = () => resolve('');
                r.readAsText(blob);
            });
        };

        for (const idx of sortedIndices) {
            const visualIdx = isAbsolute ? findVisualOfOriginal(view, idx) : idx;
            const originalIdx = isAbsolute ? idx : getOriginalAt(view, idx);

            if (originalIdx !== -1 && visualIdx !== -1 && originalIdx < lineOffsets.length) {
                const startByte = Number(lineOffsets[originalIdx]);
                const fileSize = context.isLocalFileMode ? context.localFileSize! : currentFile!.size;
                const endByte = originalIdx < lineOffsets.length - 1 ? Number(lineOffsets[originalIdx + 1]) : fileSize;

                if (startByte < endByte) {
                    let text = '';
                    if (context.isLocalFileMode) {
                        const buffer = await context.rpcCall!('readFileSegment', { path: context.localFilePath, start: startByte, end: endByte });
                        text = sharedDecoder.decode(buffer);
                    } else {
                        text = await readSlice(currentFile!.slice(startByte, endByte));
                    }
                    resultLines.push({
                        lineNum: originalIdx + 1,
                        content: text.replace(/\r?\n$/, ''),
                        formattedLineIndex: visualIdx
                    });
                }
            }
        }
    }

    respond({ type: 'LINES_DATA', payload: { lines: resultLines }, requestId });
};

export const findHighlight = async (context: DataReaderContext, keyword: string, startFilterIndex: number, direction: 'next' | 'prev', requestId: string) => {
    const { filteredIndices, isStreamMode, logBuffer, lineOffsetsStream, lineLengthsStream, currentFile, lineOffsets, currentRule, respond } = context;
    const view = contextToView(context);
    const totalVisible = getViewLength(view);

    if (totalVisible === 0 && !view.isIdentity && !filteredIndices) {
        respond({ type: 'FIND_RESULT', payload: { foundIndex: -1 }, requestId });
        return;
    }

    let searchIdx = startFilterIndex;
    if (direction === 'next') searchIdx++; else searchIdx--;

    const isCaseSensitive = currentRule?.colorHighlightsCaseSensitive || false;
    const effectiveKeyword = isCaseSensitive ? keyword : keyword.toLowerCase();

    if (isStreamMode) {
        if (!filteredIndices || !logBuffer || !lineOffsetsStream || !lineLengthsStream) return;
        while (searchIdx >= 0 && searchIdx < filteredIndices.length) {
            const originalIdx = filteredIndices[searchIdx];
            const start = lineOffsetsStream[originalIdx];
            const len = lineLengthsStream[originalIdx];
            const line = sharedDecoder.decode(logBuffer.subarray(start, start + len).slice());
            const lineCheck = isCaseSensitive ? line : line.toLowerCase();
            if (lineCheck.includes(effectiveKeyword)) {
                respond({ type: 'FIND_RESULT', payload: { foundIndex: searchIdx, originalLineNum: originalIdx + 1 }, requestId });
                return;
            }
            if (direction === 'next') searchIdx++; else searchIdx--;
        }
    } else if (context.isLocalFileMode && context.hasNativeEngine && context.localFilePath && context.rpcCall) {
        try {
            const res: { supported: boolean; foundIndex?: number; originalLineNum?: number } =
                await context.rpcCall('findHighlightNative', {
                    path: context.localFilePath,
                    filterKey: view.isIdentity ? null : (context.activeFilterSnapshotKey ?? null),
                    bookmarks: view.isIdentity ? null : (context.bookmarksSorted ?? null),
                    keyword,
                    startVisualIdx: startFilterIndex,
                    direction,
                    caseSensitive: isCaseSensitive,
                });
            if (res && res.supported) {
                respond({
                    type: 'FIND_RESULT',
                    payload: { foundIndex: res.foundIndex ?? -1, originalLineNum: res.originalLineNum ?? -1 },
                    requestId,
                });
                return;
            }
        } catch (err) {
            console.warn('[DataReader] findHighlightNative failed, using batch scan fallback:', err);
        }

        const BATCH = 2000;
        let cur = searchIdx;
        while (cur >= 0 && cur < totalVisible) {
            const batchVisuals: number[] = [];
            const batchOriginals: number[] = [];
            for (let k = 0; k < BATCH && cur >= 0 && cur < totalVisible; k++) {
                batchVisuals.push(cur);
                batchOriginals.push(getOriginalAt(view, cur));
                cur += direction === 'next' ? 1 : -1;
            }
            const raw: Uint8Array = await context.rpcCall('readLocalLinesByIndices', {
                path: context.localFilePath,
                indices: batchOriginals,
                stripAnsi: false,
            });
            const decoded = decodePackedLinesBinary(raw, sharedDecoder);
            for (let k = 0; k < decoded.length; k++) {
                const line = decoded[k].content;
                const lineCheck = isCaseSensitive ? line : line.toLowerCase();
                if (lineCheck.includes(effectiveKeyword)) {
                    respond({
                        type: 'FIND_RESULT',
                        payload: { foundIndex: batchVisuals[k], originalLineNum: batchOriginals[k] + 1 },
                        requestId,
                    });
                    return;
                }
            }
        }
    } else {
        if (!context.isLocalFileMode && !currentFile) return;
        if (!lineOffsets) return;

        const readSlice = (blob: Blob): Promise<string> => {
            return new Promise((resolve) => {
                const r = new FileReader();
                r.onload = (e) => resolve(e.target?.result as string);
                r.readAsText(blob);
            });
        };

        while (searchIdx >= 0 && searchIdx < totalVisible) {
            const originalLineNum = getOriginalAt(view, searchIdx);
            const startByte = Number(lineOffsets[originalLineNum]);
            const fileSize = context.isLocalFileMode ? context.localFileSize! : currentFile!.size;
            const endByte = originalLineNum < lineOffsets.length - 1 ? Number(lineOffsets[originalLineNum + 1]) : fileSize;

            if (startByte < endByte) {
                let line = '';
                if (context.isLocalFileMode) {
                    const buffer = await context.rpcCall!('readFileSegment', { path: context.localFilePath, start: startByte, end: endByte });
                    line = sharedDecoder.decode(buffer);
                } else {
                    line = await readSlice(currentFile!.slice(startByte, endByte));
                }
                const lineCheck = isCaseSensitive ? line : line.toLowerCase();
                if (lineCheck.includes(effectiveKeyword)) {
                    respond({ type: 'FIND_RESULT', payload: { foundIndex: searchIdx, originalLineNum: originalLineNum + 1 }, requestId });
                    return;
                }
            }
            if (direction === 'next') searchIdx++; else searchIdx--;
        }
    }

    respond({ type: 'FIND_RESULT', payload: { foundIndex: -1, originalLineNum: -1 }, requestId });
};

export const getFullText = async (context: DataReaderContext, requestId: string) => {
    const { filteredIndices, isStreamMode, logBuffer, lineOffsetsStream, lineLengthsStream, currentFile, lineOffsets, respond, postMessage } = context;
    const view = contextToView(context);
    const totalVisible = getViewLength(view);

    if (totalVisible === 0 && !view.isIdentity && !filteredIndices) {
        respond({ type: 'FULL_TEXT_DATA', payload: { text: '' }, requestId } as any);
        return;
    }

    if (isStreamMode) {
        if (!filteredIndices || !logBuffer || !lineOffsetsStream || !lineLengthsStream) {
            respond({ type: 'FULL_TEXT_DATA', payload: { text: '' }, requestId } as any);
            return;
        }
        const lines: string[] = [];
        for (let i = 0; i < filteredIndices.length; i++) {
            const originalIdx = filteredIndices[i];
            const start = lineOffsetsStream[originalIdx];
            const len = lineLengthsStream[originalIdx];
            lines.push(sharedDecoder.decode(logBuffer.subarray(start, start + len).slice()));
        }
        const fullText = lines.join('\n');
        try {
            const encoder = new TextEncoder();
            const raw = encoder.encode(fullText);
            postMessage({ type: 'FULL_TEXT_DATA', payload: { buffer: raw.buffer }, requestId }, [raw.buffer]);
        } catch (e) {
            console.error('Failed to encode full text', e);
            respond({ type: 'ERROR', payload: { error: 'Failed to encode text buffer' }, requestId });
        }
        return;
    }

    if (!context.isLocalFileMode && !currentFile) {
        respond({ type: 'FULL_TEXT_DATA', payload: { text: '' }, requestId } as any);
        return;
    }
    if (!lineOffsets) {
        respond({ type: 'FULL_TEXT_DATA', payload: { text: '' }, requestId } as any);
        return;
    }

    try {
        const rawChunks: { start: number, end: number }[] = [];
        let rangeStartIdx = 0;
        let totalLen = 0;

        for (let i = 0; i < totalVisible; i++) {
            const currentLine = getOriginalAt(view, i);
            const nextLine = (i + 1 < totalVisible) ? getOriginalAt(view, i + 1) : -2;

            if (nextLine !== currentLine + 1) {
                const startLine = getOriginalAt(view, rangeStartIdx);
                const endLine = currentLine;

                const startByte = Number(lineOffsets[startLine]);
                const endByteLine = endLine < lineOffsets.length - 1 ? endLine + 1 : -1;
                const fileSize = context.isLocalFileMode ? context.localFileSize! : currentFile!.size;
                const endByte = endByteLine !== -1 ? Number(lineOffsets[endByteLine]) : fileSize;

                if (startByte < endByte) {
                    rawChunks.push({ start: startByte, end: endByte });
                    totalLen += (endByte - startByte);
                }
                rangeStartIdx = i + 1;
            }
        }

        const GAP_THRESHOLD = 64 * 1024; // 64KB
        const readOps: { fileStart: number, fileEnd: number, subCopies: { srcOffset: number, len: number, dstOffset: number }[] }[] = [];

        let currentDstOffset = 0;

        if (rawChunks.length > 0) {
            let currentOp = {
                fileStart: rawChunks[0].start,
                fileEnd: rawChunks[0].end,
                subCopies: [{ srcOffset: 0, len: rawChunks[0].end - rawChunks[0].start, dstOffset: 0 }]
            };
            currentDstOffset += (rawChunks[0].end - rawChunks[0].start);

            for (let i = 1; i < rawChunks.length; i++) {
                const chunk = rawChunks[i];
                const gap = chunk.start - currentOp.fileEnd;

                if (gap < GAP_THRESHOLD) {
                    const srcOffset = chunk.start - currentOp.fileStart;
                    const len = chunk.end - chunk.start;
                    currentOp.subCopies.push({ srcOffset, len, dstOffset: currentDstOffset });
                    currentOp.fileEnd = chunk.end;
                } else {
                    readOps.push(currentOp);
                    currentOp = {
                        fileStart: chunk.start,
                        fileEnd: chunk.end,
                        subCopies: [{ srcOffset: 0, len: chunk.end - chunk.start, dstOffset: currentDstOffset }]
                    };
                }
                currentDstOffset += (chunk.end - chunk.start);
            }
            readOps.push(currentOp);
        }

        const merged = new Uint8Array(totalLen);
        const reader = new FileReaderSync();

        for (const op of readOps) {
            let buf: Uint8Array;
            if (context.isLocalFileMode) {
                buf = await context.rpcCall!('readFileSegment', { path: context.localFilePath, start: op.fileStart, end: op.fileEnd });
            } else {
                const blob = currentFile!.slice(op.fileStart, op.fileEnd);
                buf = new Uint8Array(reader.readAsArrayBuffer(blob));
            }

            for (const copy of op.subCopies) {
                if (copy.srcOffset < buf.length) {
                    const slice = buf.subarray(copy.srcOffset, Math.min(buf.length, copy.srcOffset + copy.len));
                    merged.set(slice, copy.dstOffset);
                }
            }
        }

        postMessage({ type: 'FULL_TEXT_DATA', payload: { buffer: merged.buffer }, requestId }, [merged.buffer]);

    } catch (e) {
        console.error('Fast copy failed', e);
        respond({ type: 'ERROR', payload: { error: 'Failed to copy logs' }, requestId });
    }
};
