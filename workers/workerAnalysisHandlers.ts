import { LogRule, LogWorkerResponse, LogMetadata } from '../types';
import { extractTimestamp } from '../utils/logTime';
import { extractSourceMetadata, analyzePerfSegments, extractLogIds } from '../utils/perfAnalysis';
import { extractSingleMetadata, PointMetrics, isSignificant, extractAliasFromLine, AliasEvent, SequenceItem, getFormattedSig } from './SplitAnalysisUtils';

export interface WorkerContext {
    currentFile: File | null;
    lineOffsets: BigInt64Array | null;
    filteredIndices: Int32Array | null;
    isStreamMode: boolean;
    isLocalFileMode?: boolean;
    localFilePath?: string | null;
    localFileSize?: number;
    rpcCall?: (method: string, args: any) => Promise<any>;
    // ✅ Added binary storage member
    logBuffer?: Uint8Array;
    lineOffsetsStream?: Uint32Array;
    lineLengthsStream?: Uint32Array;
    respond: (response: LogWorkerResponse) => void;
    currentRule: LogRule | null;
}

// --- Handler: Analyze Performance ---
export const analyzePerformance = async (
    ctx: WorkerContext,
    payload: { targetTime: number, updatedRule?: LogRule },
    requestId: string
) => {
    let { currentRule, filteredIndices, currentFile, lineOffsets, isStreamMode, logBuffer, lineOffsetsStream, lineLengthsStream, respond } = ctx;

    if (payload.updatedRule) {
        currentRule = payload.updatedRule;
    }

    if (!filteredIndices || !currentRule) {
        respond({ type: 'PERF_ANALYSIS_RESULT', payload: null, requestId });
        return;
    }

    respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: 0 } });

    const results: string[] = [];
    const lineIndices: number[] = [];
    const isFile = !!currentFile && !!lineOffsets;
    const isLocal = !!ctx.isLocalFileMode && !!lineOffsets;
    const isHappyCS = !!currentRule.happyCombosCaseSensitive;
    const decoder = new TextDecoder();

    const MAX_ANALYSIS_LINES = 100000;
    let limit = filteredIndices.length;

    if (limit > MAX_ANALYSIS_LINES) {
        console.warn(`[Worker] Performance analysis limited to first ${MAX_ANALYSIS_LINES} lines to prevent OOM.`);
        limit = MAX_ANALYSIS_LINES;
        respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: 0, message: 'Analysis limited to 100k lines' } });
    }

    if (isStreamMode) {
        if (!logBuffer || !lineOffsetsStream || !lineLengthsStream) {
            respond({ type: 'PERF_ANALYSIS_RESULT', payload: null, requestId });
            return;
        }
        for (let idx = 0; idx < limit; idx++) {
            const i = filteredIndices[idx];
            const start = lineOffsetsStream[i];
            const len = lineLengthsStream[i];
            // ✅ Create copy via .slice() because SharedArrayBuffer cannot be decoded directly 🐧💎
            results.push(decoder.decode(logBuffer.subarray(start, start + len).slice()));
            lineIndices.push(idx);
        }
    } else if (isFile || isLocal) {
        const reader = new FileReaderSync();
        const BATCH_SIZE = 5000;

        for (let idx = 0; idx < limit; idx += BATCH_SIZE) {
            const maxBatch = Math.min(idx + BATCH_SIZE, limit);
            let minByte = -1n;
            let maxByte = -1n;

            for (let k = idx; k < maxBatch; k++) {
                const i = filteredIndices[k];
                const start = lineOffsets![i];
                const fileSize = isLocal ? ctx.localFileSize! : currentFile!.size;
                const end = (i < lineOffsets!.length - 1) ? lineOffsets![i + 1] : BigInt(fileSize);
                if (minByte === -1n || start < minByte) minByte = start;
                if (maxByte === -1n || end > maxByte) maxByte = end;
            }

            if (minByte !== -1n) {
                let uint8View: Uint8Array;
                if (isLocal) {
                    const chunkBuffer = await ctx.rpcCall!('readFileSegment', { path: ctx.localFilePath, start: Number(minByte), end: Number(maxByte) });
                    uint8View = chunkBuffer;
                } else {
                    const fullBlob = currentFile!.slice(Number(minByte), Number(maxByte));
                    const arrayBuf = reader.readAsArrayBuffer(fullBlob);
                    uint8View = new Uint8Array(arrayBuf);
                }

                for (let k = idx; k < maxBatch; k++) {
                    const i = filteredIndices[k];
                    const lineStart = lineOffsets![i];
                    const fileSize = isLocal ? ctx.localFileSize! : currentFile!.size;
                    const lineEnd = (i < lineOffsets!.length - 1) ? lineOffsets![i + 1] : BigInt(fileSize);

                    const relStart = Number(lineStart - minByte);
                    const relEnd = Number(lineEnd - minByte);
                    const text = decoder.decode(uint8View.subarray(relStart, relEnd)).replace(/\r?\n$/, '');

                    results.push(text);
                    lineIndices.push(k);
                }
            }

            if (idx % (BATCH_SIZE * 2) === 0) {
                respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: (idx / limit) * 100 } });
            }
        }
    }

    const targetThreshold = currentRule.perfThreshold ?? payload.targetTime ?? 1000;
    const segments = analyzePerfSegments(results, lineIndices, currentRule, targetThreshold, isHappyCS);

    if (filteredIndices) {
        segments.forEach(s => {
            s.originalStartLine = (filteredIndices![s.startLine] ?? 0) + 1;
            s.originalEndLine = (filteredIndices![s.endLine] ?? 0) + 1;
        });
    }

    const hasSegments = segments.length > 0;
    const firstTs = hasSegments ? Math.min(...segments.map(s => s.startTime)) : 0;
    const lastTs = hasSegments ? Math.max(...segments.map(s => s.endTime)) : 0;

    const bottlenecks = [...segments]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 100);

    const analysisResult = {
        fileName: isFile ? currentFile!.name : 'Live Stream',
        totalDuration: lastTs - firstTs,
        segments: segments.sort((a, b) => a.startTime - b.startTime),
        startTime: firstTs,
        endTime: lastTs,
        logCount: results.length,
        passCount: segments.filter(s => s.status === 'pass').length,
        failCount: segments.filter(s => s.status === 'fail').length,
        bottlenecks,
        perfThreshold: targetThreshold
    };

    respond({ type: 'PERF_ANALYSIS_RESULT', payload: analysisResult, requestId });
    respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });

    // Clean up to free memory
    results.length = 0;
    lineIndices.length = 0;
    segments.length = 0;
};

// --- Handler: Get Performance Heatmap ---
export const getPerformanceHeatmap = async (
    ctx: WorkerContext,
    points: number = 500,
    requestId: string,
    isCalculatingHeatmapRef: { current: boolean }
) => {
    const { filteredIndices, isStreamMode, logBuffer, lineOffsetsStream, lineLengthsStream, currentFile, lineOffsets, respond } = ctx;

    if (isCalculatingHeatmapRef.current) {
        console.log(`[Worker] Heatmap calculation skipped: Already calculating. (req: ${requestId})`);
        return;
    }

    const hasFileData = (!isStreamMode && currentFile && lineOffsets) || (ctx.isLocalFileMode && lineOffsets);
    const hasStreamData = isStreamMode && logBuffer && lineOffsetsStream && lineLengthsStream;

    if (!filteredIndices || (!hasFileData && !hasStreamData)) {
        return;
    }

    const totalLines = filteredIndices.length;
    if (totalLines < 2) {
        respond({ type: 'HEATMAP_DATA', payload: { heatmap: [] }, requestId });
        return;
    }

    isCalculatingHeatmapRef.current = true;
    try {
        const heatmap = new Float32Array(points);
        const sampleSize = Math.max(1, Math.floor(totalLines / points));
        const decoder = new TextDecoder();

        for (let i = 0; i < points; i++) {
            const startIdx = i * sampleSize;
            if (startIdx >= totalLines - 1) break;

            try {
                const idx1 = filteredIndices[startIdx];
                const idx2 = filteredIndices[startIdx + 1];

                let t1: number | null = null;
                let t2: number | null = null;

                if (isStreamMode && logBuffer && lineOffsetsStream && lineLengthsStream) {
                    const s1 = lineOffsetsStream[idx1];
                    const l1 = lineLengthsStream[idx1];
                    const s2 = lineOffsetsStream[idx2];
                    const l2 = lineLengthsStream[idx2];
                    t1 = extractTimestamp(decoder.decode(logBuffer.subarray(s1, s1 + l1)));
                    t2 = extractTimestamp(decoder.decode(logBuffer.subarray(s2, s2 + l2)));
                } else if ((currentFile || ctx.isLocalFileMode) && lineOffsets) {
                    const startByte1 = lineOffsets[idx1];
                    const fileSize = ctx.isLocalFileMode ? ctx.localFileSize! : currentFile!.size;
                    const endByte1 = idx1 < lineOffsets.length - 1 ? lineOffsets[idx1 + 1] : BigInt(fileSize);
                    const startByte2 = lineOffsets[idx2];
                    const endByte2 = idx2 < lineOffsets.length - 1 ? lineOffsets[idx2 + 1] : BigInt(fileSize);

                    const minByte = startByte1;
                    const maxByte = endByte2;

                    if (maxByte - minByte > 1024 * 1024) {
                        heatmap[i] = 0;
                        continue;
                    }

                    let uint8View: Uint8Array;
                    if (ctx.isLocalFileMode) {
                        uint8View = await ctx.rpcCall!('readFileSegment', { path: ctx.localFilePath, start: Number(minByte), end: Number(maxByte) });
                    } else {
                        const chunkBlob = currentFile!.slice(Number(minByte), Number(maxByte));
                        const buffer = await chunkBlob.arrayBuffer();
                        uint8View = new Uint8Array(buffer);
                    }

                    const relEnd1 = Number(endByte1 - minByte);
                    const relStart2 = Number(startByte2 - minByte);

                    const text1 = decoder.decode(uint8View.subarray(0, relEnd1)).replace(/\r?\n$/, '');
                    const text2 = decoder.decode(uint8View.subarray(relStart2)).replace(/\r?\n$/, '');

                    t1 = extractTimestamp(text1);
                    t2 = extractTimestamp(text2);
                }

                if (t1 !== null && t2 !== null) {
                    const diff = Math.abs(t2 - t1);
                    heatmap[i] = Math.min(1.0, diff / 1000);
                }
            } catch (e) { }
        }

        respond({ type: 'HEATMAP_DATA', payload: { heatmap: Array.from(heatmap) }, requestId });
    } finally {
        isCalculatingHeatmapRef.current = false;
    }
};

// --- Handler: Spam Log Analysis ---
export const analyzeSpamLogs = async (
    ctx: WorkerContext,
    requestId: string
) => {
    const { filteredIndices, isStreamMode, logBuffer, lineOffsetsStream, lineLengthsStream, currentFile, lineOffsets, respond } = ctx;

    const indicesSnapshot = filteredIndices ? new Int32Array(filteredIndices) : null;
    const isFile = (!!currentFile || !!ctx.isLocalFileMode) && !!lineOffsets;

    if (!indicesSnapshot || (!isFile && !isStreamMode)) {
        respond({ type: 'SPAM_ANALYSIS_RESULT', payload: { results: [] }, requestId } as any);
        return;
    }

    respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: 0 } });

    const spamMap = new Map<string, { count: number, lineContent: string, fileName: string, functionName: string, lineNum: number, indices: number[] }>();

    const processSpamLine = (line: string, lineNum: number, originalIndex: number) => {
        const { fileName, functionName } = extractSourceMetadata(line);
        let key = '';
        let fName = fileName || 'Unknown File';
        let fnName = functionName || 'Unknown Location';

        if (fileName || functionName) {
            key = `${fName}::${fnName} `;
        } else {
            const messagePart = line.split('>').slice(1).join('>').trim() || line;
            const fingerprint = messagePart.replace(/[\d:\-\.\[\]\s]/g, '').substring(0, 60);
            key = fingerprint;
            if (key.length < 10) return;
        }

        const existing = spamMap.get(key);
        if (existing) {
            existing.count++;
            existing.indices.push(originalIndex);
        } else {
            spamMap.set(key, {
                count: 1,
                lineContent: line,
                fileName: fName,
                functionName: fnName,
                lineNum,
                indices: [originalIndex]
            });
        }
    };

    const totalLines = indicesSnapshot.length;
    const decoder = new TextDecoder();

    if (isStreamMode && logBuffer && lineOffsetsStream && lineLengthsStream) {
        for (let i = 0; i < totalLines; i++) {
            const originalIdx = indicesSnapshot[i];
            const start = lineOffsetsStream[originalIdx];
            const len = lineLengthsStream[originalIdx];
            // ✅ Bypass SharedArrayBuffer decoding constraint (.slice()) 🐧🚀
            const line = decoder.decode(logBuffer.subarray(start, start + len).slice());
            processSpamLine(line, originalIdx + 1, originalIdx);

            if (i % 20000 === 0) {
                respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: (i / totalLines) * 100 } });
            }
        }
    } else if (isFile) {
        const reader = new FileReaderSync();
        const MAX_SPAM_CHUNK_BYTES = 10 * 1024 * 1024;

        let i = 0;
        while (i < totalLines) {
            let chunkStartIdx = i;
            let minByte = lineOffsets[indicesSnapshot[i]];
            let maxByte = -1n;

            let j = i;
            while (j < totalLines) {
                const idx = indicesSnapshot[j];
                const fileSize = ctx.isLocalFileMode ? ctx.localFileSize! : currentFile!.size;
                const endByte = idx < lineOffsets!.length - 1 ? lineOffsets![idx + 1] : BigInt(fileSize);
                if (maxByte === -1n || endByte > maxByte) maxByte = endByte;

                if (j - i >= 50000) break;
                if (j + 1 < totalLines) {
                    const nextIdx = indicesSnapshot[j + 1];
                    const nextEndByte = nextIdx < lineOffsets!.length - 1 ? lineOffsets![nextIdx + 1] : BigInt(fileSize);
                    if (nextEndByte - minByte > BigInt(MAX_SPAM_CHUNK_BYTES)) break;
                }
                j++;
            }

            const chunkEndIdx = Math.min(j + 1, totalLines);
            if (maxByte > minByte) {
                try {
                    let uint8View: Uint8Array;
                    if (ctx.isLocalFileMode) {
                        uint8View = await ctx.rpcCall!('readFileSegment', { path: ctx.localFilePath, start: Number(minByte), end: Number(maxByte) });
                    } else {
                        const chunkBlob = currentFile!.slice(Number(minByte), Number(maxByte));
                        const buffer = reader.readAsArrayBuffer(chunkBlob);
                        uint8View = new Uint8Array(buffer);
                    }

                    for (let k = chunkStartIdx; k < chunkEndIdx; k++) {
                        const originalIdx = indicesSnapshot[k];
                        const lineStart = lineOffsets![originalIdx];
                        const fileSize = ctx.isLocalFileMode ? ctx.localFileSize! : currentFile!.size;
                        const lineEnd = originalIdx < lineOffsets!.length - 1 ? lineOffsets![originalIdx + 1] : BigInt(fileSize);

                        if (lineStart >= lineEnd) continue;

                        const relStart = Number(lineStart - minByte);
                        const relEnd = Number(lineEnd - minByte);

                        const line = decoder.decode(uint8View.subarray(relStart, relEnd)).replace(/\r?\n$/, '');
                        processSpamLine(line, originalIdx + 1, originalIdx);
                    }
                } catch (err) {
                    console.error('[Worker] Spam chunk processing failed', err);
                }
            }

            i = chunkEndIdx;
            respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: (i / totalLines) * 100 } });
        }
    }

    const results = Array.from(spamMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 100);

    respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
    respond({ type: 'SPAM_ANALYSIS_RESULT', payload: { results }, requestId } as any);
};

// --- Handler: Analyze Transaction ---
export const analyzeTransaction = async (
    ctx: WorkerContext,
    identity: { type: 'pid' | 'tid' | 'tag', value: string },
    requestId: string
) => {
    const { filteredIndices, isStreamMode, logBuffer, lineOffsetsStream, lineLengthsStream, currentFile, lineOffsets, respond } = ctx;
    const results: { lineNum: number, content: string, visualIndex: number }[] = [];
    const val = identity.value;
    const isFile = (!!currentFile || !!ctx.isLocalFileMode) && !!lineOffsets;
    const decoder = new TextDecoder();

    respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: 0 } });

    if (!filteredIndices) {
        respond({ type: 'LINES_DATA', payload: { lines: [] }, requestId });
        respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
        return;
    }

    const lowerVal = val.toLowerCase();
    let regex: RegExp | null = null;

    if (identity.type === 'pid' || identity.type === 'tid') {
        const regexVal = val.replace(/^(P|T)(\d+)$/i, '$1\\s*$2');
        regex = new RegExp(`(?:^|[^0-9a-zA-Z])${regexVal}(?:$|[^0-9a-zA-Z])`, 'i');
    }

    const MAX_RESULTS = 100000;

    if (isStreamMode && logBuffer && lineOffsetsStream && lineLengthsStream) {
        for (let idx = 0; idx < filteredIndices.length; idx++) {
            if (results.length >= MAX_RESULTS) break;

            const i = filteredIndices[idx];
            const start = lineOffsetsStream[i];
            const len = lineLengthsStream[i];
            const line = decoder.decode(logBuffer.subarray(start, start + len));
            if (!line) continue;

            let match = false;
            if (regex) match = regex.test(line);
            else match = line.toLowerCase().includes(lowerVal);

            if (match) {
                results.push({
                    lineNum: i + 1,
                    content: line,
                    visualIndex: idx
                });
            }
        }
    } else if (isFile) {
        const reader = new FileReaderSync();
        const totalFiltered = filteredIndices.length;
        const BATCH_SIZE = 5000;

        for (let idx = 0; idx < totalFiltered; idx += BATCH_SIZE) {
            if (results.length >= MAX_RESULTS) break;

            const maxBatch = Math.min(idx + BATCH_SIZE, totalFiltered);
            let minByte = -1n;
            let maxByte = -1n;
            for (let k = idx; k < maxBatch; k++) {
                const i = filteredIndices[k];
                const start = lineOffsets![i];
                const fileSize = ctx.isLocalFileMode ? ctx.localFileSize! : currentFile!.size;
                const end = (i < lineOffsets!.length - 1) ? lineOffsets![i + 1] : BigInt(fileSize);
                if (minByte === -1n || start < minByte) minByte = start;
                if (maxByte === -1n || end > maxByte) maxByte = end;
            }

            if (minByte !== -1n) {
                let buffer: ArrayBuffer;
                if (ctx.isLocalFileMode) {
                    const chunkBuffer = await ctx.rpcCall!('readFileSegment', { path: ctx.localFilePath, start: Number(minByte), end: Number(maxByte) });
                    buffer = chunkBuffer.buffer;
                } else {
                    const fullBlob = currentFile!.slice(Number(minByte), Number(maxByte));
                    buffer = reader.readAsArrayBuffer(fullBlob);
                }

                for (let k = idx; k < maxBatch; k++) {
                    if (results.length >= MAX_RESULTS) break;

                    const i = filteredIndices[k];
                    const lineStart = lineOffsets![i];
                    const fileSize = ctx.isLocalFileMode ? ctx.localFileSize! : currentFile!.size;
                    const lineEnd = (i < lineOffsets!.length - 1) ? lineOffsets![i + 1] : BigInt(fileSize);

                    const relStart = Number(lineStart - minByte);
                    const relEnd = Number(lineEnd - minByte);
                    const lineBuffer = buffer.slice(relStart, relEnd);
                    const text = decoder.decode(lineBuffer).replace(/\r?\n$/, '');

                    let match = false;
                    if (regex) match = regex.test(text);
                    else match = text.toLowerCase().includes(lowerVal);

                    if (match) {
                        results.push({
                            lineNum: i + 1,
                            content: text,
                            visualIndex: k
                        });
                    }
                }
            }

            if (idx % (BATCH_SIZE * 2) === 0) {
                respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: (idx / totalFiltered) * 100 } });
            }
        }
    }

    respond({ type: 'LINES_DATA', payload: { lines: results }, requestId });
    respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
};

// --- Handler: Extract All Metadata for Split Analysis ---
export const extractAllMetadata = async (
    ctx: WorkerContext,
    requestId: string
) => {
    const { filteredIndices, isStreamMode, logBuffer, lineOffsetsStream, lineLengthsStream, currentFile, lineOffsets, respond } = ctx;
    const results: LogMetadata[] = [];
    const isFile = (!!currentFile || !!ctx.isLocalFileMode) && !!lineOffsets;
    const decoder = new TextDecoder();

    respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: 0 } });

    if (!filteredIndices || filteredIndices.length === 0) {
        respond({ type: 'ALL_METADATA_RESULT', payload: { metadata: [] }, requestId });
        respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
        return;
    }

    const MAX_RESULTS = 500000; // Hard limit to avoid OOM for metadata extraction (500k logs = ~50MB array)
    const totalLines = Math.min(filteredIndices.length, MAX_RESULTS);

    if (filteredIndices.length > MAX_RESULTS) {
        console.warn(`[Worker] Extract metadata limited to first ${MAX_RESULTS} lines to prevent OOM.`);
        respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: 0, message: `Analysis limited to ${MAX_RESULTS} lines` } });
    }

    const processLine = (text: string, originalIdx: number, visualIdx: number) => {
        const { fileName, functionName, codeLineNum } = extractSourceMetadata(text);
        const timestamp = extractTimestamp(text);
        const { tid } = extractLogIds(text);

        // Simple Level Detection via common patterns
        const textUpper = text.toUpperCase();
        let isError = textUpper.includes(' ERROR ') || textUpper.includes(' E/') || textUpper.includes('[ERROR]') || textUpper.includes(' FATAL ');
        let isWarn = !isError && (textUpper.includes(' WARN ') || textUpper.includes(' W/') || textUpper.includes('[WARN]') || textUpper.includes(' WARNING '));

        results.push({
            fileName: fileName || '',
            functionName: functionName || '',
            codeLineNum, // ✅ NEW: Store extracted code line number
            timestamp,
            tid,
            lineNum: originalIdx + 1,
            visualIndex: visualIdx,
            isError,
            isWarn,
            preview: text.substring(0, 150) // Small preview string to show diff inline
        });
    };

    if (isStreamMode && logBuffer && lineOffsetsStream && lineLengthsStream) {
        for (let idx = 0; idx < totalLines; idx++) {
            const i = filteredIndices[idx];
            const start = lineOffsetsStream[i];
            const len = lineLengthsStream[i];
            const line = decoder.decode(logBuffer.subarray(start, start + len));
            processLine(line, i, idx);

            if (idx % 20000 === 0) {
                respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: (idx / totalLines) * 100 } });
            }
        }
    } else if (isFile) {
        const reader = new FileReaderSync();
        const BATCH_SIZE = 5000;

        for (let idx = 0; idx < totalLines; idx += BATCH_SIZE) {
            const maxBatch = Math.min(idx + BATCH_SIZE, totalLines);
            let minByte = -1n;
            let maxByte = -1n;
            for (let k = idx; k < maxBatch; k++) {
                const i = filteredIndices[k];
                const start = lineOffsets![i];
                const fileSize = ctx.isLocalFileMode ? ctx.localFileSize! : currentFile!.size;
                const end = (i < lineOffsets!.length - 1) ? lineOffsets![i + 1] : BigInt(fileSize);
                if (minByte === -1n || start < minByte) minByte = start;
                if (maxByte === -1n || end > maxByte) maxByte = end;
            }

            if (minByte !== -1n) {
                let buffer: ArrayBuffer;
                if (ctx.isLocalFileMode) {
                    const chunkBuffer = await ctx.rpcCall!('readFileSegment', { path: ctx.localFilePath, start: Number(minByte), end: Number(maxByte) });
                    buffer = chunkBuffer.buffer;
                } else {
                    const fullBlob = currentFile!.slice(Number(minByte), Number(maxByte));
                    buffer = reader.readAsArrayBuffer(fullBlob);
                }

                for (let k = idx; k < maxBatch; k++) {
                    const i = filteredIndices[k];
                    const lineStart = lineOffsets![i];
                    const fileSize = ctx.isLocalFileMode ? ctx.localFileSize! : currentFile!.size;
                    const lineEnd = (i < lineOffsets!.length - 1) ? lineOffsets![i + 1] : BigInt(fileSize);

                    const relStart = Number(lineStart - minByte);
                    const relEnd = Number(lineEnd - minByte);
                    const lineBuffer = buffer.slice(relStart, relEnd);
                    const text = decoder.decode(lineBuffer).replace(/\r?\n$/, '');

                    processLine(text, i, k);
                }
            }

            if (idx % (BATCH_SIZE * 2) === 0) {
                respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: (idx / totalLines) * 100 } });
            }
        }
    }

    respond({ type: 'ALL_METADATA_RESULT', payload: { metadata: results }, requestId });
    respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
};

/**
 * [OPTIMIZED] 🐧⚡
 * Extracts metadata and immediately aggregates it into Metrics to avoid freezing Main Thread.
 * This returns a summary (AggregateMetrics) instead of raw list of metadata.
 */
export const extractAnalysisMetrics = async (
    ctx: any,
    payload: any,
    requestId: string,
    respond: (msg: LogWorkerResponse) => void
) => {
    const side = payload?.side || 'left';
    console.log(`[SplitWorker] extractAnalysisMetrics started.side: ${side} `);
    const { filteredIndices, lineOffsets, lineOffsetsStream, lineLengthsStream, logBuffer, currentFile, currentRule } = ctx;
    const isStreamMode = !!(logBuffer && lineOffsetsStream && lineLengthsStream);
    const isFile = !!(currentFile || ctx.isLocalFileMode);

    if (!filteredIndices) {
        console.warn(`[SplitWorker] extractAnalysisMetrics: filteredIndices is null!`);
        respond({ type: 'ANALYSIS_METRICS_RESULT', payload: { sequence: [], pointMetrics: {} }, requestId });
        return;
    }

    const totalLines = filteredIndices.length;
    respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: 0, message: `[Worker][${side}] Starting metrics extraction for ${totalLines} lines` } });

    // 🐧⚡ Lowercase Happy Combo tag dictionary (Performance Optimization)
    if (currentRule?.happyGroups) {
        for (const group of currentRule.happyGroups) {
            if (group.tags && !(group as any)._lowercasedTags) {
                (group as any)._lowercasedTags = group.tags.map((t: string) => t.toLowerCase());
            }
        }
    }

    const decoder = new TextDecoder();
    let sequence: SequenceItem[] = [];
    let pointMetrics: PointMetrics = {};
    let pointMetricsCount = { val: 0 };
    let sequenceCount = { val: 0 };
    const processLineAndAggregate = (text: string, originalIdx: number, visualIdx: number) => {
        const item = extractSingleMetadata(text, originalIdx, visualIdx, currentRule);

        // 1. Generate signature
        if (!item.signature) {
            if (item.alias) {
                item.signature = `[Alias] ${item.alias}|${getFormattedSig(item.fileName, item.functionName, item.codeLineNum, item.preview)}`;
            } else if (isSignificant(item)) {
                item.signature = getFormattedSig(item.fileName, item.functionName, item.codeLineNum, item.preview);
            } else {
                return; // Do not include in sequence if not significant (for pure LCS matching)
            }
        }

        const currentSig = item.signature;

        // [POINT METRICS] Single point metrics update
        if (pointMetricsCount.val < 50000) {
            if (!pointMetrics[currentSig]) {
                pointMetrics[currentSig] = {
                    count: 0,
                    fileName: item.fileName || (item.alias ? `[Alias]` : ''),
                    functionName: item.functionName || item.alias || '',
                    codeLineNum: item.codeLineNum || null,
                    preview: item.preview,
                    tids: [],
                    visualIndices: [],
                    originalLineNums: []
                };
                pointMetricsCount.val++;
            }
            const pm = pointMetrics[currentSig];
            pm.count++;
            if (item.tid && !pm.tids.includes(item.tid)) {
                if (pm.tids.length < 10) pm.tids.push(item.tid);
            }
            if (pm.visualIndices.length < 5000) {
                pm.visualIndices.push(item.visualIndex);
                pm.originalLineNums.push(item.lineNum);
            }
        }

        // [SEQUENCE ITEM Addition] (For LCS)
        if (sequenceCount.val < 150000) {
            sequence.push({
                sig: currentSig,
                timestamp: item.timestamp,
                tid: item.tid,
                preview: item.preview,
                fileName: item.fileName || '',
                functionName: item.functionName || '',
                codeLineNum: item.codeLineNum,
                isError: item.isError,
                isWarn: item.isWarn,
                lineNum: item.visualIndex,
                originalLineNum: item.lineNum,
                alias: item.alias || null
            });
            sequenceCount.val++;
        }
    };

    if (isStreamMode && logBuffer && lineOffsetsStream && lineLengthsStream) {
        for (let idx = 0; idx < totalLines; idx++) {
            const i = filteredIndices[idx];
            const start = lineOffsetsStream[i];
            const len = lineLengthsStream[i];
            const line = decoder.decode(logBuffer.subarray(start, start + len));
            processLineAndAggregate(line, i, idx);

            if (idx % 20000 === 0) {
                respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: (idx / totalLines) * 100 } });
            }
        }
    } else if (isFile) {
        const reader = new FileReaderSync();
        const BATCH_SIZE = 5000;

        for (let idx = 0; idx < totalLines; idx += BATCH_SIZE) {
            const maxBatch = Math.min(idx + BATCH_SIZE, totalLines);
            let minByte = -1n;
            let maxByte = -1n;
            for (let k = idx; k < maxBatch; k++) {
                const i = filteredIndices[k];
                const start = lineOffsets![i];
                const fileSize = ctx.isLocalFileMode ? ctx.localFileSize! : currentFile!.size;
                const end = (i < lineOffsets!.length - 1) ? lineOffsets![i + 1] : BigInt(fileSize);
                if (minByte === -1n || start < minByte) minByte = start;
                if (maxByte === -1n || end > maxByte) maxByte = end;
            }

            if (minByte !== -1n) {
                let buffer: ArrayBuffer;
                if (ctx.isLocalFileMode) {
                    const chunkBuffer = await ctx.rpcCall!('readFileSegment', { path: ctx.localFilePath, start: Number(minByte), end: Number(maxByte) });
                    buffer = chunkBuffer.buffer;
                } else {
                    const fullBlob = currentFile!.slice(Number(minByte), Number(maxByte));
                    buffer = reader.readAsArrayBuffer(fullBlob);
                }

                for (let k = idx; k < maxBatch; k++) {
                    const i = filteredIndices[k];
                    const lineStart = lineOffsets![i];
                    const fileSize = ctx.isLocalFileMode ? ctx.localFileSize! : currentFile!.size;
                    const lineEnd = (i < lineOffsets!.length - 1) ? lineOffsets![i + 1] : BigInt(fileSize);

                    const relStart = Number(lineStart - minByte);
                    const relEnd = Number(lineEnd - minByte);
                    const lineBuffer = buffer.slice(relStart, relEnd);
                    const text = decoder.decode(lineBuffer).replace(/\r?\n$/, '');

                    processLineAndAggregate(text, i, k);
                }
            }

            if (idx % (BATCH_SIZE * 2) === 0) {
                respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: (idx / totalLines) * 100 } });
            }
        }
    }

    respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: 100, message: `[Worker][${side}] Extraction finished. Seq: ${sequence.length}, Pts: ${Object.keys(pointMetrics).length}` } });
    respond({ type: 'ANALYSIS_METRICS_RESULT', payload: { sequence, pointMetrics }, requestId });
    respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
};

/**
 * 🐧⚡ [NEW] Extracts all Happy Combo Alias events.
 */
export const extractAliasEvents = async (
    ctx: WorkerContext,
    requestId: string
) => {
    const { filteredIndices, lineOffsets, lineOffsetsStream, lineLengthsStream, logBuffer, currentFile, currentRule, respond } = ctx;

    if (!filteredIndices || !currentRule) {
        respond({ type: 'ALIAS_EVENTS_RESULT', payload: { events: [] }, requestId });
        return;
    }

    respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: 0, message: 'Extracting Alias Events...' } });

    // 🐧⚡ Lowercase Happy Combo tag dictionary (Performance Optimization)
    if (currentRule.happyGroups) {
        for (const group of currentRule.happyGroups) {
            if (group.tags && !(group as any)._lowercasedTags) {
                (group as any)._lowercasedTags = group.tags.map((t: string) => t.toLowerCase());
            }
        }
    }

    const events: AliasEvent[] = [];
    const decoder = new TextDecoder();
    const totalLines = filteredIndices.length;
    const isStreamMode = !!(logBuffer && lineOffsetsStream && lineLengthsStream);

    const processLine = (text: string, originalIdx: number, visualIdx: number) => {
        const alias = extractAliasFromLine(text, currentRule);
        if (alias) {
            const timestamp = extractTimestamp(text);
            const { fileName, functionName, codeLineNum } = extractSourceMetadata(text);
            events.push({
                alias,
                timestamp,
                visualIndex: visualIdx,
                lineNum: originalIdx + 1,
                preview: text.length > 200 ? text.substring(0, 200) : text,
                fileName: fileName || undefined,
                functionName: functionName || undefined,
                codeLineNum: codeLineNum || undefined
            });
        }
    };

    if (isStreamMode && logBuffer && lineOffsetsStream && lineLengthsStream) {
        for (let idx = 0; idx < totalLines; idx++) {
            const i = filteredIndices[idx];
            const start = lineOffsetsStream[i];
            const len = lineLengthsStream[i];
            const line = decoder.decode(logBuffer.subarray(start, start + len).slice());
            processLine(line, i, idx);

            if (idx % 50000 === 0) {
                respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: (idx / totalLines) * 100 } });
            }
        }
    } else if (currentFile || ctx.isLocalFileMode) {
        const reader = new FileReaderSync();
        const BATCH_SIZE = 10000;
        for (let idx = 0; idx < totalLines; idx += BATCH_SIZE) {
            const maxBatch = Math.min(idx + BATCH_SIZE, totalLines);
            let minByte = -1n;
            let maxByte = -1n;
            for (let k = idx; k < maxBatch; k++) {
                const i = filteredIndices[k];
                const start = lineOffsets![i];
                const fileSize = ctx.isLocalFileMode ? ctx.localFileSize! : currentFile!.size;
                const end = (i < lineOffsets!.length - 1) ? lineOffsets![i + 1] : BigInt(fileSize);
                if (minByte === -1n || start < minByte) minByte = start;
                if (maxByte === -1n || end > maxByte) maxByte = end;
            }

            if (minByte !== -1n) {
                let uint8View: Uint8Array;
                if (ctx.isLocalFileMode) {
                    uint8View = await ctx.rpcCall!('readFileSegment', { path: ctx.localFilePath, start: Number(minByte), end: Number(maxByte) });
                } else {
                    const fullBlob = currentFile!.slice(Number(minByte), Number(maxByte));
                    uint8View = new Uint8Array(reader.readAsArrayBuffer(fullBlob));
                }

                for (let k = idx; k < maxBatch; k++) {
                    const i = filteredIndices[k];
                    const lineStart = lineOffsets![i];
                    const fileSize = ctx.isLocalFileMode ? ctx.localFileSize! : currentFile!.size;
                    const lineEnd = (i < lineOffsets!.length - 1) ? lineOffsets![i + 1] : BigInt(fileSize);

                    const relStart = Number(lineStart - minByte);
                    const relEnd = Number(lineEnd - minByte);
                    const text = decoder.decode(uint8View.subarray(relStart, relEnd)).replace(/\r?\n$/, '');
                    processLine(text, i, k);
                }
            }
            respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: (idx / totalLines) * 100 } });
        }
    }

    respond({ type: 'ALIAS_EVENTS_RESULT', payload: { events }, requestId });
    respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
};

export { analyzeLatencySpots } from './latencyAnalysisHandler';
