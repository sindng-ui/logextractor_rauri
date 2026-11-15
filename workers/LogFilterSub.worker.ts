/* eslint-disable no-restricted-globals */
import {
    compileFilterRule,
    filterByteBuffer,
    matchCompiledLine,
    type CompiledFilterRule,
    type QuickFilterMode,
} from '../utils/byteLogFiltering';

const ctx: Worker = self as any;
const sharedDecoder = new TextDecoder();

// Notify parent worker immediately that nested sub-worker booted cleanly
try {
    ctx.postMessage({ type: 'SUBWORKER_READY' });
} catch {
    // Ignore if detached
}

let cachedRequestId: number | null = null;
let cachedCompiledRule: CompiledFilterRule | null = null;

const getCompiledRule = (rule: any, quickFilter: QuickFilterMode | undefined, requestId: number): CompiledFilterRule => {
    if (cachedRequestId === requestId && cachedCompiledRule) {
        return cachedCompiledRule;
    }
    const compiled = compileFilterRule(rule, quickFilter || 'none');
    cachedRequestId = requestId;
    cachedCompiledRule = compiled;
    return compiled;
};

ctx.onmessage = async (e) => {
    const { type, payload } = e.data || {};
    if (!payload) return;

    // Acknowledge immediately so parent worker knows sub-worker is alive
    if (type === 'FILTER_CHUNK' || type === 'FILTER_LINES') {
        ctx.postMessage({
            type: 'CHUNK_ACK',
            payload: { chunkId: payload.chunkId, requestId: payload.requestId },
        });
    }

    if (type === 'FILTER_CHUNK') {
        const { blob, buffer, rule, quickFilter, chunkId, offset = 0, requestId } = payload;
        const startTime = performance.now();
        const compiled = getCompiledRule(rule, quickFilter, requestId);

        let matches = new Int32Array(0);
        let lineCount = 0;

        try {
            let targetBuf: Uint8Array | null = null;
            if (blob) {
                const arrayBuffer = await (blob as Blob).arrayBuffer();
                targetBuf = new Uint8Array(arrayBuffer);
            } else if (buffer) {
                targetBuf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
            }

            if (targetBuf && targetBuf.length > 0) {
                const res = filterByteBuffer(targetBuf, offset, compiled, sharedDecoder);
                matches = res.matches;
                lineCount = res.lineCount;
            }
        } catch (err) {
            console.error(`[SubWorker ${chunkId}] FILTER_CHUNK Error`, err);
        }

        const elapsed = performance.now() - startTime;
        if (elapsed > 150 || chunkId === 0) {
            console.log(
                `[SubWorker ${chunkId}] FILTER_CHUNK Done (req=${requestId}, mode=${compiled.canUseAsciiByteScan ? 'bmh-byte' : 'js-fast'}, lines=${lineCount}, matches=${matches.length}, time=${elapsed.toFixed(1)}ms)`
            );
        }

        ctx.postMessage(
            {
                type: 'CHUNK_COMPLETE',
                payload: {
                    chunkId,
                    matches,
                    lineCount,
                    requestId,
                },
            },
            [matches.buffer] as any
        );
    } else if (type === 'FILTER_LINES') {
        const { lines, rule, quickFilter, chunkId, offset = 0, requestId } = payload;
        const startTime = performance.now();
        const compiled = getCompiledRule(rule, quickFilter, requestId);

        const matchesList: number[] = [];
        try {
            if (compiled.isEmpty) {
                for (let i = 0; i < lines.length; i++) matchesList.push(offset + i);
            } else {
                for (let i = 0; i < lines.length; i++) {
                    if (matchCompiledLine(lines[i], compiled)) {
                        matchesList.push(offset + i);
                    }
                }
            }
        } catch (err) {
            console.error(`[SubWorker ${chunkId}] FILTER_LINES Error`, err);
        }

        const matches = new Int32Array(matchesList);
        const elapsed = performance.now() - startTime;
        if (elapsed > 150 || chunkId === 0) {
            console.log(
                `[SubWorker ${chunkId}] FILTER_LINES Done (req=${requestId}, lines=${lines.length}, matches=${matches.length}, time=${elapsed.toFixed(1)}ms)`
            );
        }

        ctx.postMessage(
            {
                type: 'FILTER_LINES_COMPLETE',
                payload: {
                    chunkId,
                    matches,
                    lineCount: lines.length,
                    requestId,
                },
            },
            [matches.buffer] as any
        );
    }
};
