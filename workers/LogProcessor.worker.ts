/* eslint-disable no-restricted-globals */
const workerId = Math.random().toString(36).substring(7);
console.log(`[LogProcessorWorker-${workerId}] Script loaded`);
import { LogRule, LogWorkerMessage, LogWorkerResponse } from '../types';
import { BookmarkManager } from './workerBookmarkHandlers';
import { buildTimestampCache, calculateHistogram } from './workerHistogramHandler';
import * as DataReader from './workerDataReader';
import { checkIsMatch } from '../utils/logFiltering';
import { extractTimestamp } from '../utils/logTime';
import { analyzePerfSegments, extractSourceMetadata } from '../utils/perfAnalysis';
import * as AnalysisHandlers from './workerAnalysisHandlers';
import LogFilterSubWorker from './LogFilterSub.worker.ts?worker';
import { mergeSortedUnique } from './workerUtils';
import {
    FilterCacheStore,
    normalizeFilterSnapshot,
    selectIncrementalFilterPlan,
} from '../utils/incrementalFilter';
import { executeIncrementalFilter } from './workerIncrementalFilter';
import {
    FilteredView,
    decodePackedLinesBinary,
    findVisualOfOriginal,
    materializeViewIndices,
    removeAtInt32,
} from './workerIndexView';

const ctx: Worker = self as any;
ctx.onerror = (e) => {
    console.error('[Worker] Global Error:', e);
};

// --- WASM Filter Engine ---
import initWasmModule, { FilterEngine } from '../public/wasm/happy_filter.js';
// @ts-ignore: Vite public url resolving
import wasmUrl from '/wasm/happy_filter_bg.wasm?url';

let wasmEngine: any = null;
let wasmMemory: WebAssembly.Memory | null = null;
let wasmModule: any = { FilterEngine }; // Store reference for sub-workers

const initWasm = async () => {
    try {
        console.log('[Worker] Initializing WASM Filter Engine (Bundled)...');
        console.log('[Worker] wasmUrl:', wasmUrl);
        // Vite handles the WASM URL resolution via wasmUrl import
        const instance = await initWasmModule(wasmUrl);
        wasmMemory = (instance as any).memory;
        wasmEngine = new FilterEngine(false);
        console.log('[Worker] WASM Filter Engine initialized successfully');
    } catch (e) {
        console.warn('[Worker] WASM initialization failed. Falling back to JS-based filtering.', e);
    }
};

initWasm();

// --- Parallelism: Worker Pool for Heavy Filtering ---
import { SubWorkerPool, computeFilterStrategy, runParallelFilterChunks } from './workerFilterExecutor';

const numSubWorkers = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
const subWorkerPool = new SubWorkerPool(numSubWorkers, () => new LogFilterSubWorker());
let isTabActive = true; // ✅ Tracks current tab active state

// Sub-workers only terminate when the tab becomes inactive (SET_ACTIVE_STATE).

const terminateSubWorkers = () => {
    subWorkerPool.terminateAll();
};

const initSubWorkers = () => {
    subWorkerPool.init(isTabActive);
};

// File Mode
let currentFile: File | null = null;
let lineOffsets: BigInt64Array | null = null; // Map LineNum -> ByteOffset

// Stream Mode (Binary Optimized with SharedArrayBuffer)
let isStreamMode = false;
let isLiveStream = false;
let isLocalFileMode = false;
let localFilePath: string | null = null;
let localFileSize: number = 0;
let hasNativeEngine = false;

// --- Shared Buffer Initialization ---
const LOG_SAB_SIZE = 100 * 1024 * 1024; // 100MB Shared Log Store
const MAX_LINES = 20 * 1024 * 1024; // 20M Lines maximum (for 1GB+ very dense files)

let logSharedBuffer: any;
let logBuffer: Uint8Array;
let offsetSharedBuffer: any;
let lineOffsetsStream: Uint32Array;
let lengthSharedBuffer: any;
let lineLengthsStream: Uint32Array;
let indexSharedBuffer: any = null;
let filteredIndicesBuffer: Int32Array | null = null;

// ✅ Lazy Allocation for Stream mode (Saves 340MB including 80MB indexSharedBuffer when in File mode)
let streamBuffersAllocated = false;
const allocateStreamBuffers = () => {
    if (streamBuffersAllocated) return;
    try {
        if (typeof SharedArrayBuffer !== 'undefined') {
            indexSharedBuffer = new SharedArrayBuffer(MAX_LINES * 4);
            filteredIndicesBuffer = new Int32Array(indexSharedBuffer);
            logSharedBuffer = new SharedArrayBuffer(LOG_SAB_SIZE);
            logBuffer = new Uint8Array(logSharedBuffer);
            offsetSharedBuffer = new SharedArrayBuffer(MAX_LINES * 4);
            lineOffsetsStream = new Uint32Array(offsetSharedBuffer);
            lengthSharedBuffer = new SharedArrayBuffer(MAX_LINES * 4);
            lineLengthsStream = new Uint32Array(lengthSharedBuffer);
            console.log('[Worker] Stream SharedArrayBuffers generated lazily (340MB)');
        } else {
            throw new Error('SAB NA');
        }
    } catch (e) {
        indexSharedBuffer = new ArrayBuffer(MAX_LINES * 4);
        filteredIndicesBuffer = new Int32Array(indexSharedBuffer);
        logSharedBuffer = new ArrayBuffer(LOG_SAB_SIZE);
        logBuffer = new Uint8Array(logSharedBuffer);
        offsetSharedBuffer = new ArrayBuffer(MAX_LINES * 4);
        lineOffsetsStream = new Uint32Array(offsetSharedBuffer);
        lengthSharedBuffer = new ArrayBuffer(MAX_LINES * 4);
        lineLengthsStream = new Uint32Array(lengthSharedBuffer);
    }
    streamBuffersAllocated = true;
};

let currentRule: LogRule | null = null;
let currentQuickFilter: 'none' | 'error' | 'exception' = 'none'; // ✅ New State

let logBufferPtr = 0;
let timestampCache: Float64Array | null = null;
let streamLineCount = 0;
let filteredIndices: Int32Array | null = null;
let isIdentityView = false;
let localTotalLines = 0;
let activeFilterSnapshotKey: string | null = null;
const textEncoder = new TextEncoder();
const sharedDecoder = new TextDecoder();

// Helper: Send shared buffer info to UI
const sendSharedBuffers = () => {
    respond({
        type: 'BUFFER_SHARED',
        payload: {
            logBuffer: logSharedBuffer,
            lineOffsets: offsetSharedBuffer,
            lineLengths: lengthSharedBuffer,
            filteredIndices: indexSharedBuffer,
            isStreamMode
        }
    });
};

// Bookmarks managed by BookmarkManager

// Concurrency Control for filtering
let currentFilterRequestId = 0;
const filterCache = new FilterCacheStore();

// Performance Heatmap & Timestamp Cache State
let isCalculatingHeatmap = false;
let isBuildingTimestampCache = false;

// --- Constants ---
const CHUNK_SIZE = 10 * 1024 * 1024;

// --- Helper: Response ---
const respond = (response: LogWorkerResponse) => {
    ctx.postMessage(response);
};

// --- Helper: Identity / Memory-Lite View ---
const getEffectiveTotalLines = (): number => {
    if (isStreamMode) return streamLineCount;
    if (isLocalFileMode && hasNativeEngine) return localTotalLines;
    return lineOffsets ? lineOffsets.length : 0;
};

const getCurrentFilteredView = (): FilteredView => ({
    isIdentity: isIdentityView && !isStreamMode,
    totalLines: getEffectiveTotalLines(),
    indices: filteredIndices,
});

const getVisualMatchCount = (): number =>
    isIdentityView && !isStreamMode ? getEffectiveTotalLines() : (filteredIndices ? filteredIndices.length : 0);

const setIdentityFileView = (lineCount: number) => {
    isIdentityView = true;
    localTotalLines = lineCount;
    filteredIndices = null;
    activeFilterSnapshotKey = null;
    BookmarkManager.invalidateCache();
};

const evictPreviousLocalPathIfNeeded = (nextPath: string | null) => {
    if (localFilePath && localFilePath !== nextPath && hasNativeEngine) {
        rpcCall('evictLogCache', { path: localFilePath }).catch(() => {});
    }
};

const ensureLocalOffsetsLoaded = async (): Promise<void> => {
    if (lineOffsets || !isLocalFileMode || !localFilePath || !hasNativeEngine) return;
    const rawOffsets: Uint8Array = await rpcCall('indexLogFile', { path: localFilePath });
    const count = Math.floor(rawOffsets.byteLength / 8);
    lineOffsets =
        rawOffsets.byteOffset % 8 === 0
            ? new BigInt64Array(rawOffsets.buffer, rawOffsets.byteOffset, count)
            : new BigInt64Array(rawOffsets.slice().buffer);
    localTotalLines = Math.max(1, count);
};

// --- Helper: Get Visual Bookmarks ---
const invalidateBookmarkCache = () => BookmarkManager.invalidateCache();
const getVisualBookmarks = (): number[] => BookmarkManager.getVisualBookmarksFromView(getCurrentFilteredView());

// --- Helper: Merge Sorted Arrays (Unique) ---
// Imported from ./workerUtils

const getSingleLineContent = async (originalIdx: number): Promise<string> => {
    try {
        if (isStreamMode) {
            if (!logBuffer || !lineOffsetsStream || !lineLengthsStream) return '';
            const start = lineOffsetsStream[originalIdx];
            const len = lineLengthsStream[originalIdx];
            return sharedDecoder.decode(logBuffer.subarray(start, start + len).slice()).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        } else if (isLocalFileMode && hasNativeEngine && localFilePath) {
            const raw: Uint8Array = await rpcCall('readLocalLinesByIndices', {
                path: localFilePath,
                indices: [originalIdx],
                stripAnsi: true,
            });
            const decoded = decodePackedLinesBinary(raw, sharedDecoder);
            return decoded.length > 0 ? decoded[0].content : '';
        } else if (isLocalFileMode && localFilePath && lineOffsets) {
            const offset = lineOffsets[originalIdx];
            const nextOffset = originalIdx < lineOffsets.length - 1 ? lineOffsets[originalIdx + 1] : BigInt(localFileSize);
            const uint8View = await rpcCall('readFileSegment', { path: localFilePath, start: Number(offset), end: Number(nextOffset) });
            return sharedDecoder.decode(uint8View).replace(/\r?\n$/, '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        } else if (currentFile && lineOffsets) {
            const offset = lineOffsets[originalIdx];
            const nextOffset = originalIdx < lineOffsets.length - 1 ? lineOffsets[originalIdx + 1] : BigInt(currentFile.size);
            const chunkBlob = currentFile.slice(Number(offset), Number(nextOffset));
            const arrayBuf = await chunkBlob.arrayBuffer();
            const uint8View = new Uint8Array(arrayBuf);
            return sharedDecoder.decode(uint8View).replace(/\r?\n$/, '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        }
    } catch (e) {
        console.error('[Worker] getSingleLineContent failed', e);
    }
    return '';
};

const removeFromFilteredIndices = (visualIdx: number) => {
    if (isIdentityView && !isStreamMode) return;
    if (!filteredIndices) return;
    if (isStreamMode && filteredIndicesBuffer) {
        const newLen = filteredIndices.length - 1;
        if (visualIdx < newLen) {
            filteredIndicesBuffer.set(filteredIndicesBuffer.subarray(visualIdx + 1, filteredIndices.length), visualIdx);
        }
        filteredIndices = (filteredIndicesBuffer as any).subarray(0, newLen);
    } else {
        filteredIndices = removeAtInt32(filteredIndices, visualIdx);
    }
    invalidateBookmarkCache();
};

// --- Helper: Match Logic ---
// NOTE: Extracted to utils/logFiltering.ts for testability and reusability
// (imports moved to top)




// --- RPC Helper ---
let _rpcCallIndex = 0;
const rpcWaiters = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>();
const rpcCall = (method: string, args: any): Promise<any> => {
    return new Promise((resolve, reject) => {
        const requestId = `rpc-${Date.now()}-${_rpcCallIndex++}`;
        rpcWaiters.set(requestId, { resolve, reject });
        respond({ type: 'RPC_REQUEST', requestId, payload: { method, args } } as any);
    });
};


// --- Handler: File Indexing ---
const buildFileIndex = async (file: File) => {
    evictPreviousLocalPathIfNeeded(null);
    isStreamMode = false;
    isLocalFileMode = false;
    localFilePath = null;
    localFileSize = 0;
    hasNativeEngine = false;
    isLiveStream = false;
    currentFile = file;
    // streamLines = []; // Clear stream data - REMOVED
    BookmarkManager.clearAll(); // Clear bookmarks for new file
    isCalculatingHeatmap = false; // Reset heatmap state for new file
    currentFilterRequestId++; // ✅ Cancel any pending filters from previous file
    filterCache.clear();

    initSubWorkers(); // ✅ Spawn to proceed with WASM initialization in parallel (WASM Cold Start optimization)

    respond({ type: 'STATUS_UPDATE', payload: { status: 'indexing', progress: 0 } });

    const fileSize = file.size;

    // Optimization: Use TypedArray with growth strategy to handle millions of lines efficiently
    let capacity = 2 * 1024 * 1024; // Start with 2M lines
    let tempOffsets = new BigInt64Array(capacity);
    tempOffsets[0] = 0n;
    let lineCount = 1;

    let offset = 0n;
    let processedBytes = 0;

    const stream = file.stream() as any;
    const reader = stream.getReader();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk: Uint8Array = value;
            const chunkLen = chunk.length;

            // ✅ Optimization: Native indexOf is significantly faster than JS loop
            let pos = -1;
            while ((pos = chunk.indexOf(10, pos + 1)) !== -1) {
                if (lineCount >= capacity) {
                    const newCapacity = capacity * 2;
                    const newArr = new BigInt64Array(newCapacity);
                    newArr.set(tempOffsets);
                    tempOffsets = newArr;
                    capacity = newCapacity;
                }
                tempOffsets[lineCount++] = offset + BigInt(pos) + 1n;
            }

            offset += BigInt(chunkLen);
            processedBytes += chunkLen;

            // Throttle progress updates to avoid message spam
            const progress = fileSize === 0 ? 100 : (processedBytes / fileSize) * 100;
            if (processedBytes % (100 * 1024 * 1024) === 0) {
                respond({ type: 'STATUS_UPDATE', payload: { status: 'indexing', progress } });
            }
        }
        // Ensure a final 100% progress update is sent after the loop finishes
        respond({ type: 'STATUS_UPDATE', payload: { status: 'indexing', progress: 100 } });
    } catch (e) {
        console.error('Indexing failed', e);
        respond({ type: 'ERROR', payload: 'Failed to index file' });
        return;
    }

    // ✅ Optimization: Use subarray to avoid memory copy
    lineOffsets = tempOffsets.subarray(0, lineCount);
    setIdentityFileView(lineCount);

    respond({ type: 'STATUS_UPDATE', payload: { status: 'indexing', progress: 100 } });
    respond({ type: 'INDEX_COMPLETE', payload: { totalLines: lineCount } });

    // Reset timestamp cache; built lazily on demand when histogram panel is opened
    timestampCache = null;
    isBuildingTimestampCache = false;
};

// --- Handler: Local File Indexing (Native Rust SWAR or RPC 2GB+ OOM Free) ---
const buildLocalFileIndex = async (path: string, size: number, useNativeEngine = false) => {
    evictPreviousLocalPathIfNeeded(path);
    isStreamMode = false;
    isLiveStream = false;
    isLocalFileMode = true;
    localFilePath = path;
    localFileSize = size;
    hasNativeEngine = useNativeEngine;
    currentFile = null;
    lineOffsets = null;
    BookmarkManager.clearAll();
    isCalculatingHeatmap = false;
    currentFilterRequestId++;
    filterCache.clear();

    respond({ type: 'STATUS_UPDATE', payload: { status: 'indexing', progress: 0 } });

    let lineCount = 1;
    let indexedNatively = false;

    if (useNativeEngine) {
        try {
            const t0 = performance.now();
            const meta: { totalLines: number; fileSize: number } = await rpcCall('indexLogFileMeta', { path });
            lineOffsets = null; // Held in Rust INDEX_CACHE only (0MB JS allocation!)
            lineCount = Math.max(1, Number(meta?.totalLines || 1));
            localTotalLines = lineCount;
            indexedNatively = true;
            console.log(`[Worker] Native Rust SWAR meta-indexing complete: ${lineCount} lines in ${(performance.now() - t0).toFixed(1)}ms (0MB JS offsets)`);
        } catch (nativeErr) {
            console.warn('[Worker] Native indexLogFileMeta failed, falling back to chunked RPC:', nativeErr);
            hasNativeEngine = false;
        }
    }

    if (!indexedNatively) {
        initSubWorkers(); // Spawn to proceed with WASM initialization in parallel

        // Memory efficient indexing
        let capacity = 5 * 1024 * 1024; // Start with 5M lines
        let tempOffsets = new BigInt64Array(capacity);
        tempOffsets[0] = 0n;
        lineCount = 1;

        let offset = 0n;
        let processedBytes = 0;
        const chunkSize = 50 * 1024 * 1024;

        try {
            console.log(`[Worker] Starting Local File Indexing: ${path} (${Math.round(size / 1024 / 1024)}MB, chunkSize=50MB)`);
            while (processedBytes < size) {
                const end = Math.min(processedBytes + chunkSize, size);
                const chunk: Uint8Array = await rpcCall('readFileSegment', { path, start: processedBytes, end });

                let pos = -1;
                while ((pos = chunk.indexOf(10, pos + 1)) !== -1) {
                    if (lineCount >= capacity) {
                        const newCapacity = capacity * 2;
                        const newArr = new BigInt64Array(newCapacity);
                        newArr.set(tempOffsets);
                        tempOffsets = newArr;
                        capacity = newCapacity;
                    }
                    tempOffsets[lineCount++] = offset + BigInt(pos) + 1n;
                }

                offset += BigInt(chunk.length);
                processedBytes += chunk.length;

                if (processedBytes % (100 * 1024 * 1024) === 0 || processedBytes >= size) {
                    const progress = (processedBytes / size) * 100;
                    respond({ type: 'STATUS_UPDATE', payload: { status: 'indexing', progress } });
                }
            }
        } catch (e) {
            console.error('Local File Indexing failed', e);
            respond({ type: 'ERROR', payload: 'Failed to index local file via RPC' });
            return;
        }

        lineOffsets = tempOffsets.subarray(0, lineCount);
    }

    setIdentityFileView(lineCount);

    respond({ type: 'STATUS_UPDATE', payload: { status: 'indexing', progress: 100 } });
    respond({ type: 'INDEX_COMPLETE', payload: { totalLines: lineCount } });

    // Reset timestamp cache; built lazily on demand when histogram panel is opened
    timestampCache = null;
    isBuildingTimestampCache = false;
};

// --- Handler: Stream Init ---
const initStream = (payload?: { isLive?: boolean }) => {
    evictPreviousLocalPathIfNeeded(null);
    isStreamMode = true;
    isLiveStream = payload?.isLive !== false;
    isIdentityView = false;
    isLocalFileMode = false;
    hasNativeEngine = false;
    localFilePath = null;
    localTotalLines = 0;
    activeFilterSnapshotKey = null;
    currentFile = null;
    lineOffsets = null;

    allocateStreamBuffers(); // ✅ Lazily allocate Stream SharedArrayBuffers ONLY when stream starts

    // Reset Binary Store
    logBufferPtr = 0;
    streamLineCount = 0;

    BookmarkManager.clearAll();
    streamBuffer = '';
    filteredIndices = (filteredIndicesBuffer as any).subarray(0, 0);
    timestampCache = new Float64Array(MAX_LINES);
    lastFilterNotifyTime = 0;
    currentFilterRequestId++;
    filterCache.clear();
    respond({ type: 'STATUS_UPDATE', payload: { status: 'loading', mode: 'stream' } });
    
    // 🐧 Hyungnim! Even if there's no data yet, the worker is ready, so we declare Ready immediately.
    // This allows the loading spinner to stop and show an empty screen before data reception.
    respond({ 
        type: 'FILTER_COMPLETE', 
        payload: { matchCount: 0, totalLines: 0, visualBookmarks: [] } 
    });
    respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
};

// --- Handler: Process Chunk (Stream) ---
let streamBuffer = '';
// ✅ Performance: Throttle FILTER_COMPLETE messages to ensure smooth 30+ FPS rendering
let lastFilterNotifyTime = 0;
const MIN_NOTIFY_INTERVAL_MS = 32; // Reduced from 500ms for buttery smooth live streaming

const processChunk = (chunk: string) => {
    if (!isStreamMode) return;

    const fullText = streamBuffer + chunk;
    const lines = fullText.split('\n');

    // Handle incomplete lines
    if (fullText.endsWith('\n')) {
        streamBuffer = '';
        if (lines.length > 0 && lines[lines.length - 1] === '') {
            lines.pop();
        }
    } else {
        // The last segment is incomplete, save to buffer
        streamBuffer = lines.pop() || '';
    }

    if (lines.length === 0) return;

    // Clear stale incremental filter cache immediately when new live lines arrive
    filterCache.clear();

    // ✅ Binary storage recording loop
    for (const line of lines) {
        // Remove ANSI and CR (maintain existing logic)
        // eslint-disable-next-line no-control-regex
        const cleanLine = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\r$/, '');
        const encoded = textEncoder.encode(cleanLine);
        const len = encoded.length;

        // Buffer expansion check (Since SAB cannot be expanded, must create a new SAB or switch to a regular buffer)
        // Handled as regular Uint8Array for flexibility here.
        if (logBufferPtr + len > logBuffer.length) {
            const newSize = logBuffer.length * 2 + len;
            console.log(`[Worker] Growing logBuffer to ${newSize / (1024 * 1024)} MB`);
            const newBuffer = new Uint8Array(newSize);
            newBuffer.set(logBuffer.subarray(0, logBufferPtr));
            logBuffer = newBuffer as any;
        }
        // Offset array expansion check
        if (streamLineCount >= lineOffsetsStream.length) {
            const newSize = lineOffsetsStream.length * 2;
            const newOffsets = new Uint32Array(newSize);
            newOffsets.set(lineOffsetsStream.subarray(0, streamLineCount));
            lineOffsetsStream = newOffsets as any;
            const newLengths = new Uint32Array(newSize);
            newLengths.set(lineLengthsStream.subarray(0, streamLineCount));
            lineLengthsStream = newLengths as any;
        }

        // Save
        logBuffer.set(encoded, logBufferPtr);
        lineOffsetsStream[streamLineCount] = logBufferPtr;
        lineLengthsStream[streamLineCount] = len;

        // Cache timestamp
        const ts = extractTimestamp(cleanLine);
        if (timestampCache && streamLineCount < timestampCache.length) {
            timestampCache[streamLineCount] = ts !== null ? ts : 0;
        }

        // Filtering check (Checked immediately in binary state for real-time matching)
        if (checkIsMatch(cleanLine, currentRule, isLiveStream, currentQuickFilter, wasmEngine, wasmMemory || undefined, textEncoder)) {
            // Append to filteredIndices (Shared Buffer Strategy)
            const currentLen = filteredIndices ? filteredIndices.length : 0;
            const requiredLen = currentLen + 1;

            if (filteredIndicesBuffer && requiredLen <= filteredIndicesBuffer.length) {
                filteredIndicesBuffer[currentLen] = streamLineCount;
                filteredIndices = (filteredIndicesBuffer as any).subarray(0, requiredLen);
            } else {
                console.warn('[Worker] Filtered indices buffer overflow (MAX_LINES reached)');
            }
        }

        logBufferPtr += len;
        streamLineCount++;
    }

    // ✅ Performance: Invalidate bookmark cache when filtered indices change
    invalidateBookmarkCache();

    // ✅ Send intermediate FILTER_COMPLETE only when isLiveStream is true (Tizen real-time stream)
    // File read streams (isLive: false) send only once at STREAM_DONE to prevent flickering
    if (isLiveStream) {
        const now = Date.now();
        if (now - lastFilterNotifyTime >= MIN_NOTIFY_INTERVAL_MS) {
            respond({
                type: 'FILTER_COMPLETE',
                payload: {
                    matchCount: filteredIndices ? filteredIndices.length : 0,
                    totalLines: streamLineCount, // Changed from streamLines.length
                    visualBookmarks: getVisualBookmarks()
                }
            });
            lastFilterNotifyTime = now;
            calculateHistogram({
                filteredIndices,
                timestampCache,
                respond,
                currentFile,
                lineOffsets,
                isStreamMode
            });
        }
    }
};


// --- Handler: Apply Filter ---
const applyFilter = async (payload: LogRule & { quickFilter?: 'none' | 'error' | 'exception' }) => {
    // 💡 Unified Happy Combos: includeGroups in payload has already been refined by assembleIncludeGroups in the main thread.
    const rawIncludeGroups = payload.includeGroups;

    const currentQuickFilterVal = payload.quickFilter || 'none';
    currentQuickFilter = currentQuickFilterVal;

    respond({ type: 'STATUS_UPDATE', payload: { status: 'filtering', progress: 0 } });

    // --- Optimization: Pre-normalize Rule Keywords ---
    const isHappyCase = !!payload.happyCombosCaseSensitive;
    const isBlockCase = !!payload.blockListCaseSensitive;

    const normalizedRule: LogRule = {
        ...payload,
        excludes: payload.excludes.map(e => e.trim()).filter(e => e !== '').map(e => isBlockCase ? e : e.toLowerCase()),
        includeGroups: rawIncludeGroups.map(group =>
            group.map(t => isHappyCase ? t.trim() : t.trim().toLowerCase()).filter(t => t !== '')
        ).filter(g => g.length > 0)
    };

    currentRule = normalizedRule;
    const filterRequestId = ++currentFilterRequestId; // ✅ Request ID for this specific filter call
    const filterStartTime = performance.now();
    console.log(`[Worker] Starting applyFilter (RequestID: ${filterRequestId})`);

    // ✅ Sync WASM Engine keywords for the main worker (for getLines etc)
    if (wasmEngine && wasmModule) {
        try {
            if (typeof wasmEngine.free === 'function') {
                wasmEngine.free();
            }
            wasmEngine = new wasmModule.FilterEngine(isHappyCase);
            const allKeywords = normalizedRule.includeGroups.flat();
            wasmEngine.update_keywords(allKeywords);
        } catch (err) {
            console.warn('[Worker] Failed to sync main WASM FilterEngine; falling back to JS matching:', err);
            wasmEngine = null;
        }
    }

    // Optimization for empty rule (Both File and Stream modes)
    if (normalizedRule.excludes.length === 0 && normalizedRule.includeGroups.length === 0 && currentQuickFilter === 'none') {
        const lineCount = getEffectiveTotalLines();
        const safeMatchCount = Math.min(lineCount, MAX_LINES);

        if (!isStreamMode) {
            setIdentityFileView(lineCount);
        } else if (filteredIndicesBuffer) {
            const isAlreadyIdentityInitialized =
                filteredIndices !== null &&
                filteredIndices.length === lineCount &&
                (lineCount === 0 || (filteredIndices[0] === 0 && filteredIndices[lineCount - 1] === lineCount - 1));

            if (!isAlreadyIdentityInitialized) {
                if (lineCount <= filteredIndicesBuffer.length) {
                    for (let i = 0; i < lineCount; i++) {
                        filteredIndicesBuffer[i] = i;
                    }
                    filteredIndices = (filteredIndicesBuffer as any).subarray(0, lineCount);
                } else {
                    const all = new Int32Array(lineCount);
                    for (let i = 0; i < lineCount; i++) {
                        all[i] = i;
                    }
                    filteredIndices = all as any;
                }
            }
        }

        sendSharedBuffers();

        respond({ type: 'FILTER_COMPLETE', payload: { matchCount: safeMatchCount, totalLines: lineCount, visualBookmarks: getVisualBookmarks() } });
        respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });

        if (timestampCache) {
            calculateHistogram({
                filteredIndices: materializeViewIndices(getCurrentFilteredView()),
                timestampCache,
                respond,
                currentFile,
                lineOffsets,
                isStreamMode
            });
        }
        return;
    }

    // --- High Performance Parallel / Incremental Filtering (Common for File and Stream) ---
    const totalLines = getEffectiveTotalLines();
    const filterSnapshot = normalizeFilterSnapshot(normalizedRule, currentQuickFilterVal);
    const NATIVE_JS_CACHE_LIMIT = 100_000;

    const finalizeFilterMatches = (finalMatches: Int32Array, shouldRecordCache: boolean) => {
        if (filterRequestId !== currentFilterRequestId) return;

        if (shouldRecordCache && finalMatches.length <= MAX_LINES) {
            if (isLocalFileMode && hasNativeEngine && finalMatches.length > NATIVE_JS_CACHE_LIMIT) {
                filterCache.record({
                    snapshot: filterSnapshot,
                    rawMatchedIndices: new Int32Array(0),
                    matchCount: finalMatches.length,
                    hasRawIndices: false,
                    totalLines,
                });
            } else {
                filterCache.record({
                    snapshot: filterSnapshot,
                    rawMatchedIndices: finalMatches,
                    matchCount: finalMatches.length,
                    hasRawIndices: true,
                    totalLines,
                });
            }
        }

        // --- Merge Bookmarks (Persistent Visualization) ---
        const bookmarks = BookmarkManager.getOriginalBookmarksSorted();
        const mergedMatches = mergeSortedUnique(finalMatches, bookmarks);

        const safeMatchCount = Math.min(mergedMatches.length, MAX_LINES);
        if (isStreamMode && filteredIndicesBuffer) {
            filteredIndicesBuffer.set(mergedMatches.subarray(0, safeMatchCount));
            filteredIndices = (filteredIndicesBuffer as any).subarray(0, safeMatchCount);
        } else {
            isIdentityView = false;
            activeFilterSnapshotKey = filterSnapshot.key;
            filteredIndices = safeMatchCount < mergedMatches.length
                ? mergedMatches.subarray(0, safeMatchCount)
                : mergedMatches;
        }

        if (finalMatches.length > MAX_LINES) {
            console.warn(`[Worker] Match count (${finalMatches.length}) exceeds capacity (${MAX_LINES}). Truncating results.`);
        }

        // ✅ Order Fix: Send shared buffers BEFORE completing filtering notification
        sendSharedBuffers();

        respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
        respond({
            type: 'FILTER_COMPLETE', payload: {
                matchCount: filteredIndices!.length,
                totalLines: totalLines,
                visualBookmarks: getVisualBookmarks()
            }
        });

        if (timestampCache) {
            calculateHistogram({
                filteredIndices,
                timestampCache,
                respond,
                currentFile,
                lineOffsets,
                isStreamMode
            });
        }
    };

    const fileSizeForPlan = isLocalFileMode ? localFileSize : (currentFile ? currentFile.size : 0);

    if (isLocalFileMode && localFilePath && hasNativeEngine && !isStreamMode) {
        const cachedMatch = filterCache.findBestParent(filterSnapshot, totalLines);
        if (cachedMatch?.exact && cachedMatch.entry.hasRawIndices !== false) {
            console.log(`[Worker] Native engine exact-cache hit (${cachedMatch.entry.rawMatchedIndices.length} matches)`);
            finalizeFilterMatches(cachedMatch.entry.rawMatchedIndices, false);
            return;
        }
        const cachedCount = cachedMatch
            ? (cachedMatch.entry.matchCount ?? cachedMatch.entry.rawMatchedIndices.length)
            : -1;
        if (cachedMatch && cachedCount === 0) {
            console.log(`[Worker] Native engine empty-instant hit (0 matches)`);
            finalizeFilterMatches(new Int32Array(0), true);
            return;
        }

        try {
            const parentKey = cachedMatch ? cachedMatch.entry.snapshot.key : null;
            const rawMatches: Uint8Array = await rpcCall('filterLogFile', {
                path: localFilePath,
                rule: {
                    quickFilter: currentQuickFilterVal,
                    happyCombosCaseSensitive: !!normalizedRule.happyCombosCaseSensitive,
                    blockListCaseSensitive: !!normalizedRule.blockListCaseSensitive,
                    excludes: normalizedRule.excludes,
                    includeGroups: normalizedRule.includeGroups,
                },
                snapshotKey: filterSnapshot.key,
                parentKey,
            });
            if (filterRequestId !== currentFilterRequestId) return;

            const matchCount = Math.floor(rawMatches.byteLength / 4);
            const matchedIndices =
                rawMatches.byteOffset % 4 === 0
                    ? new Int32Array(rawMatches.buffer, rawMatches.byteOffset, matchCount)
                    : new Int32Array(rawMatches.slice().buffer);

            const elapsedMs = performance.now() - filterStartTime;
            console.log(
                `[Worker] Native Rust ${parentKey ? 'incremental' : 'full'} filter complete in ${elapsedMs.toFixed(1)}ms. Matches: ${matchedIndices.length}`
            );
            finalizeFilterMatches(matchedIndices, true);
            return;
        } catch (nativeFilterErr) {
            if (filterRequestId !== currentFilterRequestId) return;
            console.warn('[Worker] Native filterLogFile failed, falling back to JS/SubWorker path:', nativeFilterErr);
            await ensureLocalOffsetsLoaded().catch(() => {});
            hasNativeEngine = false;
            filterCache.clear();
        }
    }

    const incrementalPlan = selectIncrementalFilterPlan({
        cache: filterCache,
        nextSnapshot: filterSnapshot,
        totalLines,
        isStreamMode,
        isLocalFileMode,
        lineOffsets,
        fileSize: fileSizeForPlan,
    });

    if (incrementalPlan.mode !== 'full-scan') {
        const candCount = incrementalPlan.sourceEntry?.rawMatchedIndices.length ?? 0;
        const winInfo = incrementalPlan.windows
            ? `, windows: ${incrementalPlan.windows.length}, read: ${((incrementalPlan.totalReadBytes || 0) / (1024 * 1024)).toFixed(2)}MB`
            : '';
        console.log(`[Worker] Incremental subset mode: ${incrementalPlan.mode} (candidates: ${candCount}/${totalLines}${winInfo})`);

        try {
            const incMatches = await executeIncrementalFilter({
                plan: incrementalPlan,
                normalizedRule,
                currentQuickFilter,
                totalLines,
                isCancelled: () => filterRequestId !== currentFilterRequestId,
                onProgress: (progress) => {
                    if (filterRequestId === currentFilterRequestId) {
                        respond({ type: 'STATUS_UPDATE', payload: { status: 'filtering', progress } });
                    }
                },
                isStreamMode,
                logBuffer,
                lineOffsetsStream,
                lineLengthsStream,
                isLocalFileMode,
                localFilePath,
                localFileSize,
                currentFile,
                lineOffsets,
                rpcCall,
            });

            if (filterRequestId !== currentFilterRequestId) return;
            if (incMatches !== null) {
                const incElapsedMs = performance.now() - filterStartTime;
                console.log(`[Worker] Incremental filtering (${incrementalPlan.mode}) complete in ${incElapsedMs.toFixed(1)}ms. Matches: ${incMatches.length}`);
                finalizeFilterMatches(incMatches, incrementalPlan.mode !== 'exact-cache');
                return;
            }
        } catch (incErr) {
            if (filterRequestId !== currentFilterRequestId) return;
            console.warn('[Worker] Incremental filtering failed, falling back to full scan:', incErr);
        }
    }

    initSubWorkers();
    console.log(`[Worker] Preparing filter for ${totalLines} lines (isStream: ${isStreamMode})`);

    const hasAliveSubWorkers = subWorkerPool.getActiveCount() > 0 && !subWorkerPool.isDisabled();
    const strategy = computeFilterStrategy(totalLines, isLocalFileMode, hasAliveSubWorkers, numSubWorkers);
    const numChunks = strategy.numChunks;
    const linesPerChunk = strategy.linesPerChunk;
    const dynamicConcurrency = strategy.concurrency;
    console.log(`[Worker] Dynamic Strategy: ${numChunks} chunks (${linesPerChunk} lines each), Concurrency: ${dynamicConcurrency}, SubWorkers: ${subWorkerPool.getActiveCount()}`);

    const chunkResults: (Int32Array | null)[] = new Array(numChunks).fill(null);
    let completedChunks = 0;
    let hasChunkFailure = false;

    const onChunkDone = (chunkId: number, matches: Int32Array | null, receivedRequestId: number) => {
        if (receivedRequestId !== filterRequestId || filterRequestId !== currentFilterRequestId) return;

        if (matches === null) hasChunkFailure = true;
        chunkResults[chunkId] = matches;
        completedChunks++;

        if (numChunks > 10 && completedChunks % Math.ceil(numChunks / 10) === 0) {
            console.log(`[Worker] Filtering Progress: ${((completedChunks / numChunks) * 100).toFixed(1)}%`);
        }

        respond({ type: 'STATUS_UPDATE', payload: { status: 'filtering', progress: (completedChunks / numChunks) * 100 } });

        if (completedChunks === numChunks) {
            const filterElapsedMs = performance.now() - filterStartTime;
            console.log(`[Worker] Filtering complete in ${filterElapsedMs.toFixed(1)}ms. Aggregating results for ${numChunks} chunks...`);

            // ✅ Defensive aggregation in case of failed chunks
            const totalMatches = chunkResults.reduce((sum, res) => sum + (res ? res.length : 0), 0);
            console.log(`[Worker] Total matches found: ${totalMatches}`);

            const finalMatches = new Int32Array(totalMatches);
            let currentIdx = 0;
            for (let i = 0; i < numChunks; i++) {
                const res = chunkResults[i];
                if (res && res.length > 0) {
                    finalMatches.set(res, currentIdx);
                    currentIdx += res.length;
                }
            }

            finalizeFilterMatches(finalMatches, !hasChunkFailure);
        }
    };


    runParallelFilterChunks({
        totalLines,
        linesPerChunk,
        numChunks,
        initialConcurrency: dynamicConcurrency,
        filterRequestId,
        isCancelled: () => filterRequestId !== currentFilterRequestId,
        isStreamMode,
        isLocalFileMode,
        localFilePath,
        localFileSize,
        currentFile,
        lineOffsets,
        lineOffsetsStream,
        lineLengthsStream,
        logBuffer,
        normalizedRule,
        currentRule,
        currentQuickFilter,
        wasmEngine,
        wasmMemory,
        textEncoder,
        rpcCall,
        pool: subWorkerPool,
        onChunkDone,
    });
};


// --- Helper: Get DataReader Context ---
const getDataReaderContext = (): DataReader.DataReaderContext => ({
    filteredIndices,
    isIdentityView: isIdentityView && !isStreamMode,
    identityTotalLines: getEffectiveTotalLines(),
    isStreamMode,
    isLocalFileMode,
    hasNativeEngine,
    activeFilterSnapshotKey,
    bookmarksSorted: BookmarkManager.getOriginalBookmarksSorted(),
    localFilePath,
    localFileSize,
    rpcCall,
    logBuffer,
    lineOffsetsStream,
    lineLengthsStream,
    currentFile,
    lineOffsets,
    currentRule,
    respond,
    postMessage: ctx.postMessage.bind(ctx)
});

// --- Helper: Get Analysis Context ---
const getAnalysisContext = (): AnalysisHandlers.WorkerContext => ({
    currentFile,
    lineOffsets,
    filteredIndices,
    isIdentityView: isIdentityView && !isStreamMode,
    identityTotalLines: getEffectiveTotalLines(),
    isStreamMode,
    isLocalFileMode,
    hasNativeEngine,
    localFilePath,
    localFileSize,
    rpcCall,
    logBuffer,
    lineOffsetsStream,
    lineLengthsStream,
    respond,
    currentRule
});

const getMaterializedAnalysisContext = async (): Promise<AnalysisHandlers.WorkerContext> => {
    await ensureLocalOffsetsLoaded();
    return {
        ...getAnalysisContext(),
        lineOffsets,
        filteredIndices: materializeViewIndices(getCurrentFilteredView()),
    };
};

// --- Message Listener ---
ctx.onmessage = async (evt: MessageEvent<LogWorkerMessage>) => {
    const { type, payload, requestId } = evt.data;
    if (type !== 'PROCESS_CHUNK' && type !== 'SET_ACTIVE_STATE') console.log(`[Worker] Received message: ${type}`);

    switch (type) {
        case 'SET_ACTIVE_STATE':
            isTabActive = payload !== false;
            if (!isTabActive) {
                console.log('[Worker] Tab became inactive, terminating idle sub-workers to save CPU/RAM');
                terminateSubWorkers();
            } else {
                if ((currentFile || (isLocalFileMode && !hasNativeEngine) || isStreamMode)) {
                    console.log('[Worker] Tab activated → SubWorkers warming up');
                    initSubWorkers();
                }
            }
            break;
        case 'RPC_RESPONSE':
            if (requestId && rpcWaiters.has(requestId)) {
                rpcWaiters.get(requestId)!.resolve(payload);
                rpcWaiters.delete(requestId);
            }
            break;
        case 'RPC_ERROR':
            if (requestId && rpcWaiters.has(requestId)) {
                rpcWaiters.get(requestId)!.reject(payload);
                rpcWaiters.delete(requestId);
            }
            break;
        case 'INIT_FILE':
            if (currentFile && currentFile.name === payload.name && currentFile.size === payload.size && (isIdentityView || filteredIndices)) {
                console.log(`[LogProcessorWorker-${workerId}] Ignoring redundant INIT_FILE for: ${payload.name} ♻️`);
                respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
                respond({ type: 'INDEX_COMPLETE', payload: { totalLines: getEffectiveTotalLines() } });
                return;
            }
            await buildFileIndex(payload);
            break;
        case 'INIT_LOCAL_FILE_STREAM':
            if (localFilePath === payload.path && (isIdentityView || filteredIndices)) {
                console.log(`[LogProcessorWorker-${workerId}] Ignoring redundant INIT_LOCAL_FILE_STREAM for: ${payload.path} ♻️`);
                respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
                respond({ type: 'INDEX_COMPLETE', payload: { totalLines: getEffectiveTotalLines() } });
                return;
            }
            await buildLocalFileIndex(payload.path, payload.size, !!payload.hasNativeEngine);
            break;
        case 'INIT_STREAM':
            initStream(payload);
            break;
        case 'PROCESS_CHUNK':
            processChunk(payload);
            break;
        case 'STREAM_DONE':
            if (streamBuffer.length > 0) {
                processChunk('');
            }
            respond({
                type: 'FILTER_COMPLETE',
                payload: {
                    matchCount: filteredIndices ? filteredIndices.length : 0,
                    totalLines: streamLineCount,
                    visualBookmarks: getVisualBookmarks()
                }
            });
            respond({ type: 'STREAM_DONE' });
            respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
            break;
        case 'FILTER_LOGS':
            await applyFilter(payload);
            break;
        case 'TOGGLE_BOOKMARK': {
            const toggleResult = BookmarkManager.toggleBookmarkFromView(payload.visualIndex, getCurrentFilteredView());
            if (toggleResult) {
                const { originalIndex, isAdded } = toggleResult;
                if (!isAdded && !(isIdentityView && !isStreamMode)) {
                    const content = await getSingleLineContent(originalIndex);
                    const isMatch = checkIsMatch(content, currentRule, false, currentQuickFilter, wasmEngine, wasmMemory || undefined, textEncoder);
                    if (!isMatch) {
                        removeFromFilteredIndices(payload.visualIndex);
                    }
                }

                respond({
                    type: 'FILTER_COMPLETE',
                    payload: {
                        matchCount: getVisualMatchCount(),
                        totalLines: getEffectiveTotalLines(),
                        visualBookmarks: getVisualBookmarks()
                    }
                });
            }
            break;
        }
        case 'CLEAR_BOOKMARKS':
            BookmarkManager.clearBookmarks(respond);
            if (currentRule && (currentRule.excludes.length > 0 || currentRule.includeGroups.length > 0 || currentQuickFilter !== 'none')) {
                await applyFilter(currentRule as any);
            }
            break;
        case 'GET_LINES':
            if (payload.startLine === undefined && payload.startFilterIndex !== undefined) {
                payload.startLine = payload.startFilterIndex;
            }
            if (!isIdentityView && !filteredIndices) {
                console.warn(`[LogProcessorWorker-${workerId}] GET_LINES called but filteredIndices is null! (File: ${currentFile?.name || localFilePath}, Mode: ${isLocalFileMode ? 'Local' : (isStreamMode ? 'Stream' : 'File')})`);
            }
            await DataReader.getLines(getDataReaderContext(), payload.startLine, payload.count, requestId || '');
            break;
        case 'GET_SURROUNDING_LINES':
            await DataReader.getSurroundingLines(getDataReaderContext(), payload.absoluteIndex, payload.count, requestId || '');
            break;
        case 'GET_RAW_LINES':
            if (payload.startLine === undefined && payload.startLineNum !== undefined) {
                payload.startLine = payload.startLineNum;
            }
            await DataReader.getRawLines(getDataReaderContext(), payload.startLine, payload.count, requestId || '');
            break;
        case 'GET_LINES_BY_INDICES':
            await DataReader.getLinesByIndices(getDataReaderContext(), payload.indices, requestId || '', !!payload.isAbsolute);
            break;
        case 'FIND_HIGHLIGHT':
            if (payload.startIndex === undefined && payload.startFilterIndex !== undefined) {
                payload.startIndex = payload.startFilterIndex;
            }
            await DataReader.findHighlight(getDataReaderContext(), payload.keyword, payload.startIndex, payload.direction, requestId || '');
            break;
        case 'GET_FULL_TEXT':
            await ensureLocalOffsetsLoaded();
            await DataReader.getFullText(getDataReaderContext(), requestId || '');
            break;
        case 'ANALYZE_TRANSACTION':
            try {
                await AnalysisHandlers.analyzeTransaction(await getMaterializedAnalysisContext(), payload.identity, requestId || '');
            } catch (e) {
                console.error('[Worker] ANALYZE_TRANSACTION failed', e);
                respond({ type: 'ERROR', payload: { error: 'Transaction analysis failed' }, requestId });
            }
            break;
        case 'GET_PERFORMANCE_HEATMAP':
            AnalysisHandlers.getPerformanceHeatmap(getAnalysisContext(), payload.points || 500, requestId || '', {
                get current() { return isCalculatingHeatmap; },
                set current(val) { isCalculatingHeatmap = val; }
            });
            break;
        case 'REQUEST_HISTOGRAM': {
            await ensureLocalOffsetsLoaded();
            const histIndices = materializeViewIndices(getCurrentFilteredView());
            if (timestampCache) {
                calculateHistogram({
                    filteredIndices: histIndices,
                    timestampCache,
                    respond,
                    currentFile,
                    lineOffsets,
                    isStreamMode
                });
            } else if (!isBuildingTimestampCache) {
                isBuildingTimestampCache = true;
                buildTimestampCache({
                    currentFile,
                    lineOffsets,
                    filteredIndices: histIndices,
                    isStreamMode,
                    isLocalFileMode,
                    localFilePath,
                    localFileSize,
                    rpcCall,
                    respond,
                    timestampCache,
                    setTimestampCache: (cache) => { timestampCache = cache; }
                }).then((cache) => {
                    isBuildingTimestampCache = false;
                    timestampCache = cache;
                    calculateHistogram({
                        filteredIndices: materializeViewIndices(getCurrentFilteredView()),
                        timestampCache,
                        respond,
                        currentFile,
                        lineOffsets,
                        isStreamMode
                    });
                }).catch(err => {
                    isBuildingTimestampCache = false;
                    console.error('[Worker] Lazy buildTimestampCache failed', err);
                });
            }
            break;
        }
        case 'PERF_ANALYSIS':
            try {
                await AnalysisHandlers.analyzePerformance(await getMaterializedAnalysisContext(), payload, requestId || '');
            } catch (e) {
                console.error('[Worker] PERF_ANALYSIS failed', e);
                respond({ type: 'PERF_ANALYSIS_RESULT', payload: null, requestId });
            }
            break;
        case 'ANALYZE_SPAM':
            try {
                await AnalysisHandlers.analyzeSpamLogs(await getMaterializedAnalysisContext(), requestId || '');
            } catch (e) {
                console.error('[Worker] ANALYZE_SPAM failed', e);
                respond({ type: 'SPAM_ANALYSIS_RESULT', payload: { results: [] }, requestId } as any);
            }
            break;
        case 'ANALYZE_LATENCY':
            try {
                await AnalysisHandlers.analyzeLatencySpots(await getMaterializedAnalysisContext(), payload, requestId || '');
            } catch (e) {
                console.error('[Worker] ANALYZE_LATENCY failed', e);
                respond({ type: 'LATENCY_ANALYSIS_RESULT', payload: { results: [] }, requestId });
            }
            break;
        case 'GET_ALL_METADATA':
            try {
                await AnalysisHandlers.extractAllMetadata(await getMaterializedAnalysisContext(), requestId || '');
            } catch (e) {
                console.error('[Worker] GET_ALL_METADATA failed', e);
                respond({ type: 'ALL_METADATA_RESULT', payload: { metadata: [] }, requestId } as any);
            }
            break;
        case 'GET_ANALYSIS_METRICS':
            try {
                console.log(`[LogProcessorWorker] GET_ANALYSIS_METRICS message caught in switch.`);
                await AnalysisHandlers.extractAnalysisMetrics(await getMaterializedAnalysisContext(), payload, requestId || '', respond);
            } catch (e) {
                console.error('[Worker] GET_ANALYSIS_METRICS failed', e);
                respond({ type: 'ANALYSIS_METRICS_RESULT', payload: { metrics: {} }, requestId } as any);
            }
            break;
        case 'GET_ALIAS_EVENTS':
            try {
                await AnalysisHandlers.extractAliasEvents(await getMaterializedAnalysisContext(), requestId || '');
            } catch (e) {
                console.error('[Worker] GET_ALIAS_EVENTS failed', e);
                respond({ type: 'ALIAS_EVENTS_RESULT', payload: { events: [] }, requestId } as any);
            }
            break;
        case 'FIND_VISUAL_INDEX': {
            const visualIndex = findVisualOfOriginal(getCurrentFilteredView(), payload.absoluteIndex);
            respond({ type: 'FIND_RESULT', payload: { foundIndex: visualIndex }, requestId: requestId || '' });
            break;
        }
        case 'SEARCH_GLOBAL_MISSION':
            try {
                const rule: LogRule = payload.rule;
                const isHappyCase = !!rule.happyCombosCaseSensitive;
                const isBlockCase = !!rule.blockListCaseSensitive;
                const normalizedRule: LogRule = {
                    ...rule,
                    excludes: rule.excludes.map(e => e.trim()).filter(e => e !== '').map(e => isBlockCase ? e : e.toLowerCase()),
                    includeGroups: rule.includeGroups.map(group =>
                        group.map(t => isHappyCase ? t.trim() : t.trim().toLowerCase()).filter(t => t !== '')
                    ).filter(g => g.length > 0)
                };

                // Safeguard: If no active filters are provided, return empty immediately to prevent match-all scan
                const hasHappy = normalizedRule.includeGroups && normalizedRule.includeGroups.length > 0;
                const hasBlock = normalizedRule.excludes && normalizedRule.excludes.length > 0;
                if (!hasHappy && !hasBlock) {
                    respond({ type: 'SEARCH_GLOBAL_MISSION_RESULT', payload: { results: [] }, requestId } as any);
                    break;
                }

                const maxMatches = 3000;
                if (isLocalFileMode && hasNativeEngine && localFilePath && !isStreamMode) {
                    const globalKey = `__global_mission__${JSON.stringify({
                        hc: isHappyCase,
                        bc: isBlockCase,
                        ex: normalizedRule.excludes,
                        inc: normalizedRule.includeGroups,
                    })}`;
                    const rawMatches: Uint8Array = await rpcCall('filterLogFile', {
                        path: localFilePath,
                        rule: {
                            quickFilter: 'none',
                            happyCombosCaseSensitive: isHappyCase,
                            blockListCaseSensitive: isBlockCase,
                            excludes: normalizedRule.excludes,
                            includeGroups: normalizedRule.includeGroups,
                        },
                        snapshotKey: globalKey,
                        parentKey: null,
                    });
                    const count = Math.min(maxMatches, Math.floor(rawMatches.byteLength / 4));
                    const dv = new DataView(rawMatches.buffer, rawMatches.byteOffset, rawMatches.byteLength);
                    const topIndices: number[] = new Array(count);
                    for (let k = 0; k < count; k++) {
                        topIndices[k] = dv.getUint32(k * 4, true);
                    }
                    const packed: Uint8Array = count > 0
                        ? await rpcCall('readLocalLinesByIndices', {
                            path: localFilePath,
                            indices: topIndices,
                            stripAnsi: true,
                        })
                        : new Uint8Array(0);
                    const decoded = decodePackedLinesBinary(packed, sharedDecoder);
                    const nativeResults = decoded.map(r => ({ lineNum: r.lineIdx, content: r.content }));
                    respond({ type: 'SEARCH_GLOBAL_MISSION_RESULT', payload: { results: nativeResults }, requestId } as any);
                    break;
                }

                const totalLines = getEffectiveTotalLines();
                const results: Array<{ lineNum: number; content: string }> = [];
                let matchCount = 0;

                const decoder = new TextDecoder();
                const searchChunkSize = 20000;

                for (let start = 0; start < totalLines; start += searchChunkSize) {
                    if (matchCount >= maxMatches) break;
                    const end = Math.min(start + searchChunkSize, totalLines);

                    if (isStreamMode) {
                        if (logBuffer && lineOffsetsStream && lineLengthsStream) {
                            for (let j = start; j < end; j++) {
                                if (matchCount >= maxMatches) break;
                                const s = lineOffsetsStream[j];
                                const l = lineLengthsStream[j];
                                const lineBytes = logBuffer.subarray(s, s + l);
                                const lineContent = decoder.decode(lineBytes).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

                                if (checkIsMatch(lineContent, normalizedRule, false, 'none', undefined, undefined, undefined)) {
                                    results.push({ lineNum: j, content: lineContent });
                                    matchCount++;
                                }
                            }
                        }
                    } else if (isLocalFileMode && localFilePath) {
                        const startByte = Number(lineOffsets![start]);
                        const endByte = Number(end < lineOffsets!.length ? lineOffsets![end] : localFileSize);
                        const chunkBuffer: Uint8Array = await rpcCall('readFileSegment', { path: localFilePath, start: startByte, end: endByte });

                        for (let j = start; j < end; j++) {
                            if (matchCount >= maxMatches) break;
                            const offsetInChunk = Number(lineOffsets![j]) - startByte;
                            const nextOffsetInChunk = Number(j < lineOffsets!.length - 1 ? lineOffsets![j + 1] : BigInt(localFileSize)) - startByte;

                            if (offsetInChunk >= 0 && nextOffsetInChunk <= chunkBuffer.length && offsetInChunk < nextOffsetInChunk) {
                                const lineBytes = chunkBuffer.subarray(offsetInChunk, nextOffsetInChunk);
                                const lineContent = decoder.decode(lineBytes).replace(/\r?\n$/, '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

                                if (checkIsMatch(lineContent, normalizedRule, false, 'none', undefined, undefined, undefined)) {
                                    results.push({ lineNum: j, content: lineContent });
                                    matchCount++;
                                }
                            }
                        }
                    } else if (currentFile && lineOffsets) {
                        const startByte = Number(lineOffsets[start]);
                        const endByte = Number(end < lineOffsets.length ? lineOffsets[end] : currentFile.size);
                        const chunkBlob = currentFile.slice(startByte, endByte);
                        const arrayBuf = await chunkBlob.arrayBuffer();
                        const chunkBuffer = new Uint8Array(arrayBuf);

                        for (let j = start; j < end; j++) {
                            if (matchCount >= maxMatches) break;
                            const offsetInChunk = Number(lineOffsets[j]) - startByte;
                            const nextOffsetInChunk = Number(j < lineOffsets.length - 1 ? lineOffsets[j + 1] : BigInt(currentFile.size)) - startByte;

                            if (offsetInChunk >= 0 && nextOffsetInChunk <= chunkBuffer.length && offsetInChunk < nextOffsetInChunk) {
                                const lineBytes = chunkBuffer.subarray(offsetInChunk, nextOffsetInChunk);
                                const lineContent = decoder.decode(lineBytes).replace(/\r?\n$/, '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

                                if (checkIsMatch(lineContent, normalizedRule, false, 'none', undefined, undefined, undefined)) {
                                    results.push({ lineNum: j, content: lineContent });
                                    matchCount++;
                                }
                            }
                        }
                    }

                    if (start % 100000 === 0 && !isLocalFileMode) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }

                respond({ type: 'SEARCH_GLOBAL_MISSION_RESULT', payload: { results }, requestId } as any);
            } catch (e) {
                console.error('[Worker] SEARCH_GLOBAL_MISSION failed', e);
                respond({ type: 'SEARCH_GLOBAL_MISSION_RESULT', payload: { results: [] }, requestId } as any);
            }
            break;
    }
};
