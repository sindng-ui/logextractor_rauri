/* eslint-disable no-restricted-globals */
import { LogRule } from '../types';
import { checkIsMatch } from '../utils/logFiltering';

const ctx: Worker = self as any;

// Notify parent worker immediately that nested sub-worker booted cleanly
try {
    ctx.postMessage({ type: 'SUBWORKER_READY' });
} catch {
    // Ignore if detached
}

// --- WASM Filter Engine ---
import initWasmModule, { FilterEngine } from '../public/wasm/happy_filter.js';
// @ts-ignore: Vite public url resolving
import wasmUrl from '/wasm/happy_filter_bg.wasm?url';

let wasmEngine: any = null;
let wasmMemory: WebAssembly.Memory | null = null;
let wasmModule: any = { FilterEngine }; // Store reference
let lastWasmCaseSensitive: boolean | null = null;
let lastWasmKeywordsKey: string | null = null;

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1B\[[0-9;]*[a-zA-Z]/g;

const initWasm = async () => {
    try {
        console.log('[SubWorker] Initializing WASM Filter Engine (Bundled)...');
        console.log('[SubWorker] wasmUrl:', wasmUrl);
        const wasmLoadWithTimeout = Promise.race([
            initWasmModule(wasmUrl),
            new Promise((_, reject) => setTimeout(() => reject(new Error('WASM load timeout')), 2500))
        ]);
        const instance: any = await wasmLoadWithTimeout;
        wasmMemory = instance.memory;
        wasmEngine = new FilterEngine(false);
        lastWasmCaseSensitive = false;
        lastWasmKeywordsKey = '';

        // --- WASM & JIT Warmup (Cold Start Optimization) ---
        // Pre-warm the V8 engine (TurboFan) and WASM bridge to an optimized state before initial filtering.
        try {
            const dummyRule = { excludes: [], includeGroups: [['___warmup___']], happyCombosCaseSensitive: false, showRawLogLines: true };
            wasmEngine.update_keywords(['___warmup___']);
            lastWasmKeywordsKey = '___warmup___';
            const dummyLine = "01-01 12:00:00.000  1000  1000 I WARMUP  : Warmup V8 JIT and WASM Bridge for fast first filter";
            // ✅ Efficient pre-warming: Induce JIT optimization within max 10ms instead of unconditional 50k loops to prevent CPU waste
            const startTime = performance.now();
            let iterations = 0;
            while (performance.now() - startTime < 10 && iterations < 15000) {
                checkIsMatch(dummyLine, dummyRule as any, false, 'none', wasmEngine, wasmMemory, textEncoder);
                iterations++;
            }
            console.log(`[SubWorker] JIT warmed up with ${iterations} iterations in ${(performance.now() - startTime).toFixed(1)}ms`);
        } catch (warmupErr) {
            console.warn('[SubWorker] JIT warmup failed:', warmupErr);
        }

        console.log('[SubWorker] WASM Filter Engine initialized and JIT warmed up successfully');
    } catch (e) {
        console.warn('[SubWorker] WASM init failed, using JS fallback', e);
        wasmEngine = null;
        wasmMemory = null;
    }
};

const syncWasmKeywords = (rule: any) => {
    if (!wasmEngine || !wasmModule) return;
    try {
        const isCaseSensitive = !!rule?.happyCombosCaseSensitive;
        const allKeywords = Array.isArray(rule?.includeGroups) ? (rule.includeGroups as string[][]).flat() : [];
        const keywordsKey = allKeywords.join('\u0000');

        if (lastWasmCaseSensitive !== isCaseSensitive) {
            try { wasmEngine.free?.(); } catch { }
            wasmEngine = new wasmModule.FilterEngine(isCaseSensitive);
            lastWasmCaseSensitive = isCaseSensitive;
            lastWasmKeywordsKey = null;
        }

        if (lastWasmKeywordsKey !== keywordsKey) {
            wasmEngine.update_keywords(allKeywords);
            lastWasmKeywordsKey = keywordsKey;
        }
    } catch (e) {
        console.warn('[SubWorker] WASM keyword sync failed, falling back to JS matching', e);
        wasmEngine = null;
    }
};

const textEncoder = new TextEncoder();

const wasmInitPromise = initWasm();

ctx.onmessage = async (e) => {
    const { type, payload } = e.data || {};

    // Acknowledge immediately so parent worker knows sub-worker is alive before any async wait
    if ((type === 'FILTER_CHUNK' || type === 'FILTER_LINES') && payload) {
        ctx.postMessage({
            type: 'CHUNK_ACK',
            payload: { chunkId: payload.chunkId, requestId: payload.requestId }
        });
    }

    await wasmInitPromise; // 🚨 Critical fix: Prevent JS Fallback (5.5s) from triggering if processing starts before WASM is ready!

    if (type === 'FILTER_CHUNK') {
        const { blob, buffer, rule, quickFilter, chunkId, offset = 0, requestId } = payload;
        const startTime = Date.now();
        console.log(`[SubWorker ${chunkId}] FILTER_CHUNK Start (RequestID: ${requestId})`);

        syncWasmKeywords(rule);

        let relativeLineIndex = 0;
        const matchesList: number[] = [];

        try {
            if (blob) {
                const reader = (blob as Blob).stream().getReader();
                const decoder = new TextDecoder();
                let textBuf = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunkText = decoder.decode(value, { stream: true });
                    textBuf += chunkText;
                    const lines = textBuf.split('\n');
                    textBuf = lines.pop() || '';

                    for (let i = 0; i < lines.length; i++) {
                        let line = lines[i];
                        if (line.endsWith('\r')) line = line.slice(0, -1);
                        const cleanLine = line.includes('\x1b') ? line.replace(ANSI_REGEX, '') : line;
                        if (checkIsMatch(cleanLine, rule, false, quickFilter, wasmEngine, wasmMemory || undefined, textEncoder)) {
                            matchesList.push(offset + relativeLineIndex);
                        }
                        relativeLineIndex++;
                    }
                }
                if (textBuf) {
                    const cleanTail = textBuf.includes('\x1b') ? textBuf.replace(ANSI_REGEX, '') : textBuf;
                    if (checkIsMatch(cleanTail, rule, false, quickFilter, wasmEngine, wasmMemory || undefined, textEncoder)) {
                        matchesList.push(offset + relativeLineIndex);
                    }
                    relativeLineIndex++;
                }
            } else if (buffer) {
                const decoder = new TextDecoder();
                const textBuf = decoder.decode(buffer);
                const lines = textBuf.split('\n');

                // If it ends exactly with \n, the last element is an empty string we should ignore.
                if (textBuf.endsWith('\n')) lines.pop();

                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    if (line.endsWith('\r')) line = line.slice(0, -1);
                    const cleanLine = line.includes('\x1b') ? line.replace(ANSI_REGEX, '') : line;

                    if (checkIsMatch(cleanLine, rule, false, quickFilter, wasmEngine, wasmMemory || undefined, textEncoder)) {
                        matchesList.push(offset + relativeLineIndex);
                    }
                    relativeLineIndex++;
                }
            }
        } catch (err) {
            console.error(`[SubWorker ${chunkId}] Error`, err);
        }

        console.log(`[SubWorker ${chunkId}] FILTER_CHUNK Done (RequestID: ${requestId}) matches: ${matchesList.length} time: ${Date.now() - startTime}ms`);

        // ✅ Optimization: Use Int32Array for Zero-copy transfer to main worker
        const matches = new Int32Array(matchesList);
        ctx.postMessage({
            type: 'CHUNK_COMPLETE',
            payload: {
                chunkId,
                matches,
                lineCount: relativeLineIndex,
                requestId // ✅ Return requestId
            }
        }, [matches.buffer] as any);
    } else if (type === 'FILTER_LINES') {
        const { lines, rule, quickFilter, chunkId, offset, requestId } = payload;
        const startTime = Date.now();
        console.log(`[SubWorker ${chunkId}] FILTER_LINES Start (RequestID: ${requestId}) lines: ${lines.length}`);

        syncWasmKeywords(rule);

        const matchesList: number[] = [];
        try {
            for (let i = 0; i < lines.length; i++) {
                if (checkIsMatch(lines[i], rule, false, quickFilter, wasmEngine, wasmMemory || undefined, textEncoder)) {
                    matchesList.push(offset + i);
                }
            }
        } catch (err) {
            console.error(`[SubWorker ${chunkId}] FILTER_LINES Error`, err);
        }

        console.log(`[SubWorker ${chunkId}] FILTER_LINES Done (RequestID: ${requestId}) matches: ${matchesList.length} time: ${Date.now() - startTime}ms`);

        const matches = new Int32Array(matchesList);
        ctx.postMessage({
            type: 'FILTER_LINES_COMPLETE',
            payload: {
                chunkId,
                matches,
                lineCount: lines.length,
                requestId // ✅ Return requestId
            }
        }, [matches.buffer] as any);
    }
};
