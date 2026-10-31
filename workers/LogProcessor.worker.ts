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
const numSubWorkers = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
const subWorkers: Worker[] = [];
let isTabActive = true; // ✅ Tracks current tab active state

// Sub-workers only terminate when the tab becomes inactive (SET_ACTIVE_STATE).

const terminateSubWorkers = () => {
    if (subWorkers.length === 0) return;
    console.log('[Worker] Terminating sub-workers (tab inactive).');
    subWorkers.forEach(sw => sw.terminate());
    subWorkers.length = 0;
};

const initSubWorkers = () => {
    if (!isTabActive) {
        console.log('[Worker] Tab is inactive. Skipping sub-worker spawn.');
        return;
    }
    if (subWorkers.length > 0) {
        console.log(`[Worker] Using existing ${subWorkers.length} sub-workers`);
        return;
    }
    console.log(`[Worker] Spawning ${numSubWorkers} sub-workers...`);
    for (let i = 0; i < numSubWorkers; i++) {
        try {
            const sw = new LogFilterSubWorker();
            sw.onerror = (e) => console.error(`[Worker] SubWorker ${i} error:`, e);
            subWorkers.push(sw);
        } catch (e) {
            console.error('[Worker] Failed to spawn sub-worker', i, e);
        }
    }
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

// --- Shared Buffer Initialization ---
const LOG_SAB_SIZE = 100 * 1024 * 1024; // 100MB Shared Log Store
const MAX_LINES = 20 * 1024 * 1024; // 20M Lines maximum (for 1GB+ very dense files)

let logSharedBuffer: any;
let logBuffer: Uint8Array;
let offsetSharedBuffer: any;
let lineOffsetsStream: Uint32Array;
let lengthSharedBuffer: any;
let lineLengthsStream: Uint32Array;
let indexSharedBuffer: any;
let filteredIndicesBuffer: Int32Array;

try {
    if (typeof SharedArrayBuffer !== 'undefined') {
        indexSharedBuffer = new SharedArrayBuffer(MAX_LINES * 4);
        filteredIndicesBuffer = new Int32Array(indexSharedBuffer);
        console.log('[Worker] indexSharedBuffer initialized successfully');
    } else {
        throw new Error('SharedArrayBuffer is NOT available');
    }
} catch (e) {
    console.warn('[Worker] SharedArrayBuffer not supported.', e);
    indexSharedBuffer = new ArrayBuffer(MAX_LINES * 4);
    filteredIndicesBuffer = new Int32Array(indexSharedBuffer);
}

// ✅ Lazy Allocation for Stream mode (Saves 260MB per background tab in LocalFileMode)
let streamBuffersAllocated = false;
const allocateStreamBuffers = () => {
    if (streamBuffersAllocated) return;
    try {
        if (typeof SharedArrayBuffer !== 'undefined') {
            logSharedBuffer = new SharedArrayBuffer(LOG_SAB_SIZE);
            logBuffer = new Uint8Array(logSharedBuffer);
            offsetSharedBuffer = new SharedArrayBuffer(MAX_LINES * 4);
            lineOffsetsStream = new Uint32Array(offsetSharedBuffer);
            lengthSharedBuffer = new SharedArrayBuffer(MAX_LINES * 4);
            lineLengthsStream = new Uint32Array(lengthSharedBuffer);
            console.log('[Worker] Stream SharedArrayBuffers generated lazily (260MB)');
        } else {
            throw new Error('SAB NA');
        }
    } catch (e) {
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

// Performance Heatmap State
let isCalculatingHeatmap = false;

// --- Constants ---
const CHUNK_SIZE = 10 * 1024 * 1024;

// --- Helper: Response ---
const respond = (response: LogWorkerResponse) => {
    ctx.postMessage(response);
};

// --- Helper: Get Visual Bookmarks ---
const invalidateBookmarkCache = () => BookmarkManager.invalidateCache();
const getVisualBookmarks = (): number[] => BookmarkManager.getVisualBookmarks(filteredIndices);

// --- Helper: Merge Sorted Arrays (Unique) ---
// Imported from ./workerUtils

const getSingleLineContent = async (originalIdx: number): Promise<string> => {
    try {
        if (isStreamMode) {
            if (!logBuffer || !lineOffsetsStream || !lineLengthsStream) return '';
            const start = lineOffsetsStream[originalIdx];
            const len = lineLengthsStream[originalIdx];
            return sharedDecoder.decode(logBuffer.subarray(start, start + len).slice()).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        } else if (isLocalFileMode && localFilePath) {
            const offset = lineOffsets![originalIdx];
            const nextOffset = originalIdx < lineOffsets!.length - 1 ? lineOffsets![originalIdx + 1] : BigInt(localFileSize);
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
    if (!filteredIndices) return;
    const newLen = filteredIndices.length - 1;
    if (visualIdx < newLen) {
        filteredIndicesBuffer.set(filteredIndicesBuffer.subarray(visualIdx + 1, filteredIndices.length), visualIdx);
    }
    filteredIndices = (filteredIndicesBuffer as any).subarray(0, newLen);
    invalidateBookmarkCache();
};

const insertIntoFilteredIndicesSorted = (originalIdx: number) => {
    if (!filteredIndices) return;
    
    // Find insertion point
    let low = 0;
    let high = filteredIndices.length - 1;
    let insertAt = filteredIndices.length;

    while (low <= high) {
        const mid = (low + high) >>> 1;
        if (filteredIndices[mid] === originalIdx) return; // Already exists
        if (filteredIndices[mid] < originalIdx) {
            low = mid + 1;
            insertAt = low;
        } else {
            high = mid - 1;
            insertAt = mid;
        }
    }

    if (filteredIndices.length >= MAX_LINES) return;

    // Shift right
    filteredIndicesBuffer.set(filteredIndicesBuffer.subarray(insertAt, filteredIndices.length), insertAt + 1);
    filteredIndicesBuffer[insertAt] = originalIdx;
    filteredIndices = (filteredIndicesBuffer as any).subarray(0, filteredIndices.length + 1);
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
        console.log(`[Worker] Initiating RPC_REQUEST: ${method}`, args);
        respond({ type: 'RPC_REQUEST', requestId, payload: { method, args } } as any);
    });
};


// --- Handler: File Indexing ---
const buildFileIndex = async (file: File) => {
    isStreamMode = false;
    isLiveStream = false;
    currentFile = file;
    // streamLines = []; // Clear stream data - REMOVED
    BookmarkManager.clearAll(); // Clear bookmarks for new file
    isCalculatingHeatmap = false; // Reset heatmap state for new file
    currentFilterRequestId++; // ✅ Cancel any pending filters from previous file

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

    // ✅ Order Fix: Initialize filteredIndices BEFORE notifying the UI
    if (lineCount <= filteredIndicesBuffer.length) {
        for (let i = 0; i < lineCount; i++) filteredIndicesBuffer[i] = i;
        filteredIndices = (filteredIndicesBuffer as any).subarray(0, lineCount);
    } else {
        // Fallback for extremely large files
        const all = new Int32Array(lineCount);
        for (let i = 0; i < lineCount; i++) all[i] = i;
        filteredIndices = all as any;
    }

    respond({ type: 'STATUS_UPDATE', payload: { status: 'indexing', progress: 100 } });
    respond({ type: 'INDEX_COMPLETE', payload: { totalLines: lineCount } });

    // Background timestamp cache building
    timestampCache = null; // Reset
    buildTimestampCache({
        currentFile,
        lineOffsets,
        filteredIndices,
        isStreamMode,
        isLocalFileMode,
        localFilePath,
        localFileSize,
        rpcCall,
        respond,
        timestampCache,
        setTimestampCache: (cache) => { timestampCache = cache; }
    }).then((cache) => {
        timestampCache = cache;
        console.log(`[Worker] Timestamp cache built: ${cache ? cache.length : 0} lines`);
        calculateHistogram({
            filteredIndices,
            timestampCache,
            respond,
            currentFile,
            lineOffsets,
            isStreamMode
        });
    }).catch(err => {
        console.error('[Worker] buildTimestampCache failed', err);
    });
};

// --- Handler: Local File Indexing (RPC 2GB+ OOM Free) ---
const buildLocalFileIndex = async (path: string, size: number) => {
    isStreamMode = false;
    isLiveStream = false;
    isLocalFileMode = true;
    localFilePath = path;
    localFileSize = size;
    currentFile = null;
    BookmarkManager.clearAll();
    isCalculatingHeatmap = false;
    currentFilterRequestId++;

    initSubWorkers(); // ✅ Spawn to proceed with WASM initialization in parallel (WASM Cold Start optimization)

    respond({ type: 'STATUS_UPDATE', payload: { status: 'indexing', progress: 0 } });

    // Memory efficient indexing
    let capacity = 5 * 1024 * 1024; // Start with 5M lines
    let tempOffsets = new BigInt64Array(capacity);
    tempOffsets[0] = 0n;
    let lineCount = 1;

    let offset = 0n;
    let processedBytes = 0;
    // 💡 50MB Chunks: Reduces IPC round-trip count from 290 to 29, minimizing contention during multi-tab use 🐧🚀
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

    if (lineCount <= filteredIndicesBuffer.length) {
        for (let i = 0; i < lineCount; i++) filteredIndicesBuffer[i] = i;
        filteredIndices = (filteredIndicesBuffer as any).subarray(0, lineCount);
    } else {
        const all = new Int32Array(lineCount);
        for (let i = 0; i < lineCount; i++) all[i] = i;
        filteredIndices = all as any;
    }

    respond({ type: 'STATUS_UPDATE', payload: { status: 'indexing', progress: 100 } });
    respond({ type: 'INDEX_COMPLETE', payload: { totalLines: lineCount } });

    // Background timestamp cache building
    timestampCache = null; // Reset
    buildTimestampCache({
        currentFile,
        lineOffsets,
        filteredIndices,
        isStreamMode,
        isLocalFileMode,
        localFilePath,
        localFileSize,
        rpcCall,
        respond,
        timestampCache,
        setTimestampCache: (cache) => { timestampCache = cache; }
    }).then((cache) => {
        timestampCache = cache;
        console.log(`[Worker] Timestamp cache built (Local): ${cache ? cache.length : 0} lines`);
        calculateHistogram({
            filteredIndices,
            timestampCache,
            respond,
            currentFile,
            lineOffsets,
            isStreamMode
        });
    }).catch(err => {
        console.error('[Worker] buildTimestampCache (Local) failed', err);
    });
};

// --- Handler: Stream Init ---
const initStream = (payload?: { isLive?: boolean }) => {
    isStreamMode = true;
    isLiveStream = payload?.isLive !== false;
    currentFile = null;
    lineOffsets = null;

    allocateStreamBuffers(); // ✅ Lazily allocate 260MB buffers ONLY when stream starts

    // Reset Binary Store
    logBufferPtr = 0;
    streamLineCount = 0;

    BookmarkManager.clearAll();
    streamBuffer = '';
    filteredIndices = (filteredIndicesBuffer as any).subarray(0, 0);
    timestampCache = new Float64Array(MAX_LINES);
    lastFilterNotifyTime = 0;
    currentFilterRequestId++;
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

            if (requiredLen <= filteredIndicesBuffer.length) {
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
    console.log(`[Worker] Starting applyFilter (RequestID: ${filterRequestId})`);

    // ✅ Sync WASM Engine keywords for the main worker (for getLines etc)
    if (wasmEngine && wasmModule) {
        wasmEngine = new wasmModule.FilterEngine(isHappyCase);
        const allKeywords = normalizedRule.includeGroups.flat();
        wasmEngine.update_keywords(allKeywords);
    }

    // Optimization for empty rule (Both File and Stream modes)
    if (normalizedRule.excludes.length === 0 && normalizedRule.includeGroups.length === 0 && currentQuickFilter === 'none') {
        const lineCount = isStreamMode ? streamLineCount : (lineOffsets ? lineOffsets.length : 0);
        const safeMatchCount = Math.min(lineCount, MAX_LINES);
        
        console.log(`[Worker-Debug] 🚀 Dynamic Empty rule bypass TRIGGERED! safeMatchCount: ${safeMatchCount}, totalLines: ${lineCount}`);
        
        // 🐧 형님! 최초 인덱싱 당시의 완벽한 룰에 맞춰 filteredIndices와 공유 버퍼를 동일하게 초기화 복원합니다!
        if (lineCount <= filteredIndicesBuffer.length) {
            for (let i = 0; i < lineCount; i++) {
                filteredIndicesBuffer[i] = i;
            }
            filteredIndices = (filteredIndicesBuffer as any).subarray(0, lineCount);
        } else {
            // 대용량 파일 대응 Fallback
            const all = new Int32Array(lineCount);
            for (let i = 0; i < lineCount; i++) {
                all[i] = i;
            }
            filteredIndices = all as any;
        }

        // Notify UI about shared buffers structure
        sendSharedBuffers();

        respond({ type: 'FILTER_COMPLETE', payload: { matchCount: safeMatchCount, totalLines: lineCount, visualBookmarks: getVisualBookmarks() } });
        respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });

        calculateHistogram({
            filteredIndices,
            timestampCache,
            respond,
            currentFile,
            lineOffsets,
            isStreamMode
        });
        return;
    }

    // --- High Performance Parallel Filtering (Common for File and Stream) ---
    initSubWorkers();
    const totalLines = isStreamMode ? streamLineCount : (lineOffsets ? lineOffsets.length : 0);
    console.log(`[Worker] Preparing filter for ${totalLines} lines (isStream: ${isStreamMode})`);

    // ✅ Dynamic Scaling (File size proportional): Maximizes processing speed by variably applying chunk size and concurrency based on line count.
    let MAX_LINES_PER_CHUNK = 20000;
    let dynamicConcurrency = Math.max(2, numSubWorkers);

    if (totalLines > 5000000) {
        // Ultra-large capacity (5M+ lines) -> Maximize chunk size to minimize IPC/stream overhead (up to 250k)
        MAX_LINES_PER_CHUNK = 250000;
        dynamicConcurrency = Math.max(6, numSubWorkers + 2); // Allow exceeding available cores (Induce intensive multitasking)
    } else if (totalLines > 1000000) {
        // Large capacity (1M ~ 5M lines) -> 100k chunks
        MAX_LINES_PER_CHUNK = 100000;
        dynamicConcurrency = Math.max(4, numSubWorkers);
    } else {
        // Normal capacity (under 1M) -> Split finely for better UI responsiveness
        MAX_LINES_PER_CHUNK = 20000;
        dynamicConcurrency = numSubWorkers;
    }

    const numChunks = Math.ceil(totalLines / MAX_LINES_PER_CHUNK);
    const linesPerChunk = MAX_LINES_PER_CHUNK;
    console.log(`[Worker] Dynamic Strategy: ${numChunks} chunks (${linesPerChunk} lines each), Concurrency: ${dynamicConcurrency}`);

    const chunkResults: (Int32Array | null)[] = new Array(numChunks).fill(null);
    let completedChunks = 0;

    const onChunkDone = (chunkId: number, matches: Int32Array | null, receivedRequestId: number) => {
        if (receivedRequestId !== filterRequestId || filterRequestId !== currentFilterRequestId) return;

        chunkResults[chunkId] = matches;
        completedChunks++;

        if (numChunks > 10 && completedChunks % Math.ceil(numChunks / 10) === 0) {
            console.log(`[Worker] Filtering Progress: ${((completedChunks / numChunks) * 100).toFixed(1)}%`);
        }

        respond({ type: 'STATUS_UPDATE', payload: { status: 'filtering', progress: (completedChunks / numChunks) * 100 } });

        if (completedChunks === numChunks) {
            console.log(`[Worker] Filtering complete. Aggregating results for ${numChunks} chunks...`);

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

            // --- Merge Bookmarks (Persistent Visualization) ---
            const bookmarks = BookmarkManager.getOriginalBookmarksSorted();
            const mergedMatches = mergeSortedUnique(finalMatches, bookmarks);

            // ✅ Prevent Shared Buffer size overflow
            const safeMatchCount = Math.min(mergedMatches.length, MAX_LINES);
            filteredIndicesBuffer.set(mergedMatches.subarray(0, safeMatchCount));
            filteredIndices = (filteredIndicesBuffer as any).subarray(0, safeMatchCount);

            if (finalMatches.length > MAX_LINES) {
                console.warn(`[Worker] Match count (${finalMatches.length}) exceeds SharedBuffer capacity (${MAX_LINES}). Truncating results.`);
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


    const decoder = new TextDecoder();
    let nextChunkIdx = 0;
    const MAX_CONCURRENT_CHUNKS = dynamicConcurrency; // ✅ Apply calculated dynamic concurrency

    const processNextChunk = async () => {
        if (nextChunkIdx >= numChunks || filterRequestId !== currentFilterRequestId) return;

        const i = nextChunkIdx++;
        const startLine = i * linesPerChunk;
        const endLine = Math.min(startLine + linesPerChunk, totalLines);
        const sw = subWorkers.length > 0 ? subWorkers[i % subWorkers.length] : null;

        if (!sw) {
            // Fallback: Main Worker
            try {
                if (isStreamMode) {
                    const chunkLines: string[] = [];
                    for (let j = startLine; j < endLine; j++) {
                        const s = lineOffsetsStream[j];
                        const l = lineLengthsStream[j];
                        chunkLines.push(decoder.decode(logBuffer.subarray(s, s + l).slice()));
                    }
                    const mList: number[] = [];
                    for (let j = 0; j < chunkLines.length; j++) {
                        if (checkIsMatch(chunkLines[j], normalizedRule, false, currentQuickFilter, wasmEngine, wasmMemory || undefined, textEncoder)) {
                            mList.push(startLine + j);
                        }
                    }
                    onChunkDone(i, new Int32Array(mList), filterRequestId);
                } else if (isLocalFileMode) {
                    const startByte = Number(lineOffsets![startLine]);
                    const endByte = Number(endLine < lineOffsets!.length ? lineOffsets![endLine] : localFileSize);
                    const chunkBuffer = await rpcCall('readFileSegment', { path: localFilePath, start: startByte, end: endByte });
                    const text = decoder.decode(chunkBuffer);
                    const lines = text.split('\n');
                    if (text.endsWith('\n')) lines.pop();
                    const mList: number[] = [];
                    for (let j = 0; j < lines.length; j++) {
                        const line = lines[j];
                        const cleanLine = line.endsWith('\r') ? line.slice(0, -1) : line;
                        if (checkIsMatch(cleanLine, normalizedRule, false, currentQuickFilter, wasmEngine, wasmMemory || undefined, textEncoder)) {
                            mList.push(startLine + j);
                        }
                    }
                    onChunkDone(i, new Int32Array(mList), filterRequestId);
                }
            } catch (err) {
                console.error(`[Worker] Main worker chunk processing failed: ${i}`, err);
                onChunkDone(i, null, filterRequestId);
            }
            processNextChunk();
            return;
        }

        // Parallel: SubWorker
        if (isStreamMode) {
            const chunkLines: string[] = [];
            for (let j = startLine; j < endLine; j++) {
                const s = lineOffsetsStream[j];
                const l = lineLengthsStream[j];
                chunkLines.push(decoder.decode(logBuffer.subarray(s, s + l).slice()));
            }

            const messageHandler = (e: MessageEvent) => {
                if (e.data.type === 'FILTER_LINES_COMPLETE' && e.data.payload.chunkId === i) {
                    if (e.data.payload.requestId === filterRequestId) {
                        sw.removeEventListener('message', messageHandler);
                        onChunkDone(i, e.data.payload.matches, e.data.payload.requestId);
                        processNextChunk();
                    }
                }
            };
            sw.addEventListener('message', messageHandler);
            sw.postMessage({
                type: 'FILTER_LINES',
                payload: { chunkId: i, lines: chunkLines, offset: startLine, rule: currentRule, quickFilter: currentQuickFilter, requestId: filterRequestId }
            });
        } else if (isLocalFileMode) {
            const startByte = Number(lineOffsets![startLine]);
            const endByte = Number(endLine < lineOffsets!.length ? lineOffsets![endLine] : localFileSize);

            rpcCall('readFileSegment', { path: localFilePath, start: startByte, end: endByte }).then((chunkBuffer: Uint8Array) => {
                const messageHandler = (e: MessageEvent) => {
                    if (e.data.type === 'CHUNK_COMPLETE' && e.data.payload.chunkId === i) {
                        if (e.data.payload.requestId === filterRequestId) {
                            sw.removeEventListener('message', messageHandler);
                            onChunkDone(i, e.data.payload.matches, e.data.payload.requestId);
                            processNextChunk();
                        }
                    }
                };
                sw.addEventListener('message', messageHandler);
                sw.postMessage({
                    type: 'FILTER_CHUNK',
                    payload: { chunkId: i, buffer: chunkBuffer, offset: startLine, rule: currentRule, quickFilter: currentQuickFilter, requestId: filterRequestId }
                }, [chunkBuffer.buffer]);
            }).catch(err => {
                console.error(`[Worker] RPC failed for chunk ${i}`, err);
                onChunkDone(i, null, filterRequestId);
                processNextChunk();
            });
        } else if (currentFile) {
            const chunkBlob = currentFile.slice(Number(lineOffsets![startLine]), Number(endLine < lineOffsets!.length ? lineOffsets![endLine] : currentFile.size));
            const messageHandler = (e: MessageEvent) => {
                if (e.data.type === 'CHUNK_COMPLETE' && e.data.payload.chunkId === i) {
                    if (e.data.payload.requestId === filterRequestId) {
                        sw.removeEventListener('message', messageHandler);
                        onChunkDone(i, e.data.payload.matches, e.data.payload.requestId);
                        processNextChunk();
                    }
                }
            };
            sw.addEventListener('message', messageHandler);
            sw.postMessage({
                type: 'FILTER_CHUNK',
                payload: { chunkId: i, blob: chunkBlob, offset: startLine, rule: currentRule, quickFilter: currentQuickFilter, requestId: filterRequestId }
            });
        }
    };

    // Initial execution
    for (let k = 0; k < Math.min(MAX_CONCURRENT_CHUNKS, numChunks); k++) {
        processNextChunk();
    }
};


// --- Helper: Get DataReader Context ---
const getDataReaderContext = (): DataReader.DataReaderContext => ({
    filteredIndices,
    isStreamMode,
    isLocalFileMode,
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
    isStreamMode,
    isLocalFileMode,
    localFilePath,
    localFileSize,
    rpcCall,
    logBuffer,
    lineOffsetsStream,
    lineLengthsStream,
    respond,
    currentRule
});

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
                console.log('[Worker] Tab activated → SubWorkers will be respawned on next filter or index');
                if (currentFile || isLocalFileMode || isStreamMode) {
                    initSubWorkers(); // Spawn immediately upon activation for warm-up
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
            if (currentFile && currentFile.name === payload.name && currentFile.size === payload.size && filteredIndices) {
                console.log(`[LogProcessorWorker-${workerId}] Ignoring redundant INIT_FILE for: ${payload.name} ♻️`);
                respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
                respond({ type: 'INDEX_COMPLETE', payload: { totalLines: lineOffsets ? lineOffsets.length : 0 } });
                return;
            }
            // Hotfix: Payload itself is a File object, so pass it directly.
            await buildFileIndex(payload);
            break;
        case 'INIT_LOCAL_FILE_STREAM':
            if (localFilePath === payload.path && filteredIndices) {
                console.log(`[LogProcessorWorker-${workerId}] Ignoring redundant INIT_LOCAL_FILE_STREAM for: ${payload.path} ♻️`);
                respond({ type: 'STATUS_UPDATE', payload: { status: 'ready' } });
                respond({ type: 'INDEX_COMPLETE', payload: { totalLines: lineOffsets ? lineOffsets.length : 0 } });
                return;
            }
            await buildLocalFileIndex(payload.path, payload.size);
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
        case 'TOGGLE_BOOKMARK':
            const toggleResult = BookmarkManager.toggleBookmark(payload.visualIndex, filteredIndices);
            if (toggleResult) {
                const { originalIndex, isAdded } = toggleResult;
                if (!isAdded) {
                    // Removed: check if it still matches filter
                    const content = await getSingleLineContent(originalIndex);
                    const isMatch = checkIsMatch(content, currentRule, false, currentQuickFilter, wasmEngine, wasmMemory || undefined, textEncoder);
                    if (!isMatch) {
                        // Remove from view as it's no longer bookmarked and doesn't match filter
                        removeFromFilteredIndices(payload.visualIndex);
                    }
                } else {
                    // Added: it's already in view since user clicked it
                }
                
                // Always notify UI of updated bookmarks and match count (in case it changed)
                respond({
                    type: 'FILTER_COMPLETE',
                    payload: {
                        matchCount: filteredIndices ? filteredIndices.length : 0,
                        totalLines: isStreamMode ? streamLineCount : (lineOffsets ? lineOffsets.length : 0),
                        visualBookmarks: getVisualBookmarks()
                    }
                });
            }
            break;
        case 'CLEAR_BOOKMARKS':
            BookmarkManager.clearBookmarks(respond);
            if (currentRule && (currentRule.excludes.length > 0 || currentRule.includeGroups.length > 0 || currentQuickFilter !== 'none')) {
                // Re-apply filter to remove lines that were only visible because of bookmarks
                await applyFilter(currentRule as any);
            }
            break;
        case 'GET_LINES':
            if (payload.startLine === undefined && payload.startFilterIndex !== undefined) {
                payload.startLine = payload.startFilterIndex; // Fallback for transition
            }
            if (!filteredIndices) {
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
            await DataReader.getFullText(getDataReaderContext(), requestId || '');
            break;
        case 'ANALYZE_TRANSACTION':
            try {
                await AnalysisHandlers.analyzeTransaction(getAnalysisContext(), payload.identity, requestId || '');
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
        case 'PERF_ANALYSIS':
            try {
                await AnalysisHandlers.analyzePerformance(getAnalysisContext(), payload, requestId || '');
            } catch (e) {
                console.error('[Worker] PERF_ANALYSIS failed', e);
                respond({ type: 'PERF_ANALYSIS_RESULT', payload: null, requestId });
            }
            break;
        case 'ANALYZE_SPAM':
            try {
                await AnalysisHandlers.analyzeSpamLogs(getAnalysisContext(), requestId || '');
            } catch (e) {
                console.error('[Worker] ANALYZE_SPAM failed', e);
                respond({ type: 'SPAM_ANALYSIS_RESULT', payload: { results: [] }, requestId } as any);
            }
            break;
        case 'ANALYZE_LATENCY':
            try {
                await AnalysisHandlers.analyzeLatencySpots(getAnalysisContext(), payload, requestId || '');
            } catch (e) {
                console.error('[Worker] ANALYZE_LATENCY failed', e);
                respond({ type: 'LATENCY_ANALYSIS_RESULT', payload: { results: [] }, requestId });
            }
            break;
        case 'GET_ALL_METADATA':
            try {
                await AnalysisHandlers.extractAllMetadata(getAnalysisContext(), requestId || '');
            } catch (e) {
                console.error('[Worker] GET_ALL_METADATA failed', e);
                respond({ type: 'ALL_METADATA_RESULT', payload: { metadata: [] }, requestId } as any);
            }
            break;
        case 'GET_ANALYSIS_METRICS':
            try {
                console.log(`[LogProcessorWorker] GET_ANALYSIS_METRICS message caught in switch.`);
                await AnalysisHandlers.extractAnalysisMetrics(getAnalysisContext(), payload, requestId || '', respond);
            } catch (e) {
                console.error('[Worker] GET_ANALYSIS_METRICS failed', e);
                respond({ type: 'ANALYSIS_METRICS_RESULT', payload: { metrics: {} }, requestId } as any);
            }
            break;
        case 'GET_ALIAS_EVENTS':
            try {
                await AnalysisHandlers.extractAliasEvents(getAnalysisContext(), requestId || '');
            } catch (e) {
                console.error('[Worker] GET_ALIAS_EVENTS failed', e);
                respond({ type: 'ALIAS_EVENTS_RESULT', payload: { events: [] }, requestId } as any);
            }
            break;
        case 'FIND_VISUAL_INDEX':
            if (filteredIndices) {
                const visualIndex = filteredIndices.indexOf(payload.absoluteIndex);
                respond({ type: 'FIND_RESULT', payload: { foundIndex: visualIndex }, requestId: requestId || '' });
            } else {
                respond({ type: 'FIND_RESULT', payload: { foundIndex: -1 }, requestId: requestId || '' });
            }
            break;
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

                const totalLines = isStreamMode ? streamLineCount : (lineOffsets ? lineOffsets.length : 0);
                const results: Array<{ lineNum: number; content: string }> = [];
                const maxMatches = 3000;
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
