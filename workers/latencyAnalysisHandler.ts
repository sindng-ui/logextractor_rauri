import { LogWorkerResponse, LatencySpot } from '../types';
import { extractTimestamp } from '../utils/logTime';
import { WorkerContext } from './workerAnalysisHandlers';

/**
 * 🐧⚡ [Latency Spotlight] analyzeLatencySpots
 * 필터링된 로그 라인들을 순차적으로 스캔하며 인접한 두 라인 간의 시간 간격(gapMs)이
 * 지정된 thresholdMs(기본 500ms) 이상 벌어진 구간을 탐지하여 최상위 20개 지연 스포트를 반환합니다.
 * 대용량 데이터 환경에서의 원활한 동작을 위해 청크 배치 I/O 기법을 적용했습니다.
 */
export const analyzeLatencySpots = async (
    ctx: WorkerContext,
    payload: { thresholdMs?: number },
    requestId: string
) => {
    const { filteredIndices, isStreamMode, logBuffer, lineOffsetsStream, lineLengthsStream, currentFile, lineOffsets, respond } = ctx;

    const indicesSnapshot = filteredIndices ? new Int32Array(filteredIndices) : null;
    const isFile = (!!currentFile || !!ctx.isLocalFileMode) && !!lineOffsets;

    if (!indicesSnapshot || indicesSnapshot.length < 2 || (!isFile && !isStreamMode)) {
        respond({ type: 'LATENCY_ANALYSIS_RESULT', payload: { results: [] }, requestId });
        return;
    }

    const thresholdMs = payload.thresholdMs ?? 500;
    respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: 0 } });

    let spots: LatencySpot[] = [];

    // 메모리 고갈(OOM) 방지를 위해 최대 100만 라인으로 분석 대상 제한
    const MAX_ANALYSIS_LINES = 1000000;
    const totalLines = Math.min(indicesSnapshot.length, MAX_ANALYSIS_LINES);

    if (indicesSnapshot.length > MAX_ANALYSIS_LINES) {
        console.warn(`[Worker] Latency analysis limited to first ${MAX_ANALYSIS_LINES} lines to prevent OOM.`);
    }

    const decoder = new TextDecoder();

    // 두 개의 연속된 타임스탬프와 정보를 추적하기 위해 이전 상태 저장
    let prevTimestamp: number | null = null;
    let prevIndex: number = -1; // filteredIndices 내의 visual index
    let prevLineNum: number = -1; // 1-based 원본 라인 번호
    let prevPreview: string = '';

    const processLine = (line: string, originalIdx: number, visualIdx: number) => {
        const ts = extractTimestamp(line);
        if (ts !== null) {
            if (prevTimestamp !== null) {
                const gap = ts - prevTimestamp;
                // 비정상 지연 구간 탐지 (시간이 거꾸로 흐르는 경우는 제외)
                if (gap >= thresholdMs) {
                    const spot: LatencySpot = {
                        gapMs: gap,
                        beforeIndex: prevIndex,
                        afterIndex: visualIdx,
                        beforeLineNum: prevLineNum,
                        afterLineNum: originalIdx + 1,
                        beforePreview: prevPreview,
                        afterPreview: line.substring(0, 120).replace(/\r?\n$/, ''),
                        beforeTimestamp: prevTimestamp,
                        afterTimestamp: ts
                    };
                    spots.push(spot);

                    // 수집 후보군이 너무 많아지면 메모리 절약을 위해 수시로 정렬 후 상위 50개만 남김
                    if (spots.length > 500) {
                        spots.sort((a, b) => b.gapMs - a.gapMs);
                        spots = spots.slice(0, 50);
                    }
                }
            }
            prevTimestamp = ts;
            prevIndex = visualIdx;
            prevLineNum = originalIdx + 1;
            prevPreview = line.substring(0, 120).replace(/\r?\n$/, '');
        }
    };

    if (isStreamMode && logBuffer && lineOffsetsStream && lineLengthsStream) {
        for (let i = 0; i < totalLines; i++) {
            const originalIdx = indicesSnapshot[i];
            const start = lineOffsetsStream[originalIdx];
            const len = lineLengthsStream[originalIdx];
            // SharedArrayBuffer decoding 우회를 위해 slice 처리
            const line = decoder.decode(logBuffer.subarray(start, start + len).slice());
            processLine(line, originalIdx, i);

            if (i % 20000 === 0) {
                respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: (i / totalLines) * 100 } });
            }
        }
    } else if (isFile) {
        const reader = new FileReaderSync();
        // 청크당 최대 10MB 바이트 제한
        const MAX_CHUNK_BYTES = 10 * 1024 * 1024;

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

                // 최대 20,000줄 또는 10MB 청크 제한
                if (j - i >= 20000) break;
                if (j + 1 < totalLines) {
                    const nextIdx = indicesSnapshot[j + 1];
                    const nextEndByte = nextIdx < lineOffsets!.length - 1 ? lineOffsets![nextIdx + 1] : BigInt(fileSize);
                    if (nextEndByte - minByte > BigInt(MAX_CHUNK_BYTES)) break;
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
                        processLine(line, originalIdx, k);
                    }
                } catch (err) {
                    console.error('[Worker] Latency chunk processing failed', err);
                }
            }

            i = chunkEndIdx;
            respond({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: (i / totalLines) * 100 } });
        }
    }

    // 최종 정렬 후 상위 20개 선정
    spots.sort((a, b) => b.gapMs - a.gapMs);
    const top20 = spots.slice(0, 20);

    respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
    respond({ type: 'LATENCY_ANALYSIS_RESULT', payload: { results: top20 }, requestId });
};
