import { HistogramData, HistogramBucket } from '../types';
import { extractTimestamp } from '../utils/logTime';

/**
 * 📊 workerHistogramHandler.ts
 * High-performance log histogram generation.
 * Parses timestamps once and caches them in Float64Array to prevent duplicate parsing and I/O.
 */

// We can extend the global worker context definition to include our cache
export interface HistogramWorkerContext {
  currentFile: File | null;
  lineOffsets: BigInt64Array | null;
  filteredIndices: Int32Array | null;
  isStreamMode: boolean;
  isLocalFileMode?: boolean;
  localFilePath?: string | null;
  localFileSize?: number;
  rpcCall?: (method: string, args: any) => Promise<any>;
  logBuffer?: Uint8Array;
  lineOffsetsStream?: Uint32Array;
  lineLengthsStream?: Uint32Array;
  respond: (response: any) => void;
  // Optional states managed in the main worker scope:
  timestampCache?: Float64Array | null;
  setTimestampCache?: (cache: Float64Array | null) => void;
}

/**
 * Build timestamp cache from a file (Local File or HTML5 File).
 * Runs asynchronously after indexing completes.
 */
export const buildTimestampCache = async (
  ctx: HistogramWorkerContext,
  onProgress?: (progress: number) => void
): Promise<Float64Array | null> => {
  const { currentFile, lineOffsets, isLocalFileMode, localFilePath, localFileSize, isStreamMode } = ctx;

  if (isStreamMode || !lineOffsets) {
    return null;
  }

  const totalLines = lineOffsets.length;
  const cache = new Float64Array(totalLines);
  const isLocal = !!isLocalFileMode && !!localFilePath;
  const isFile = !!currentFile;

  if (!isLocal && !isFile) {
    return null;
  }

  const decoder = new TextDecoder();
  const BATCH_SIZE = 20000;
  const MAX_CHUNK_BYTES = 10 * 1024 * 1024; // 10MB chunk limit

  let i = 0;
  let lastNotifyTime = 0;

  if (isLocal) {
    while (i < totalLines) {
      let chunkStartIdx = i;
      let minByte = lineOffsets[i];
      let maxByte = -1n;

      let j = i;
      while (j < totalLines) {
        const offset = lineOffsets[j];
        const fileSize = localFileSize!;
        const endByte = j < lineOffsets.length - 1 ? lineOffsets[j + 1] : BigInt(fileSize);
        if (maxByte === -1n || endByte > maxByte) maxByte = endByte;

        if (j - i >= BATCH_SIZE) break;
        if (j + 1 < totalLines) {
          const nextEndByte = (j + 1 < lineOffsets.length - 1) ? lineOffsets[j + 2] : BigInt(fileSize);
          if (nextEndByte - minByte > BigInt(MAX_CHUNK_BYTES)) break;
        }
        j++;
      }

      const chunkEndIdx = Math.min(j + 1, totalLines);
      if (maxByte > minByte) {
        try {
          const uint8View: Uint8Array = await ctx.rpcCall!('readFileSegment', {
            path: localFilePath,
            start: Number(minByte),
            end: Number(maxByte)
          });

          for (let k = chunkStartIdx; k < chunkEndIdx; k++) {
            const lineStart = lineOffsets[k];
            const fileSize = localFileSize!;
            const lineEnd = k < lineOffsets.length - 1 ? lineOffsets[k + 1] : BigInt(fileSize);
            if (lineStart >= lineEnd) continue;

            const relStart = Number(lineStart - minByte);
            const relEnd = Number(lineEnd - minByte);
            const line = decoder.decode(uint8View.subarray(relStart, relEnd)).replace(/\r?\n$/, '');
            const ts = extractTimestamp(line);
            cache[k] = ts !== null ? ts : 0;
          }
        } catch (err) {
          console.error('[Worker] Timestamp cache chunk build failed', err);
        }
      }

      i = chunkEndIdx;
      const now = Date.now();
      if (now - lastNotifyTime > 100 && onProgress) {
        onProgress((i / totalLines) * 100);
        lastNotifyTime = now;
      }
    }
  } else if (isFile) {
    const reader = new FileReaderSync();
    while (i < totalLines) {
      let chunkStartIdx = i;
      let minByte = lineOffsets[i];
      let maxByte = -1n;

      let j = i;
      while (j < totalLines) {
        const offset = lineOffsets[j];
        const fileSize = currentFile!.size;
        const endByte = j < lineOffsets.length - 1 ? lineOffsets[j + 1] : BigInt(fileSize);
        if (maxByte === -1n || endByte > maxByte) maxByte = endByte;

        if (j - i >= BATCH_SIZE) break;
        if (j + 1 < totalLines) {
          const nextEndByte = (j + 1 < lineOffsets.length - 1) ? lineOffsets[j + 2] : BigInt(fileSize);
          if (nextEndByte - minByte > BigInt(MAX_CHUNK_BYTES)) break;
        }
        j++;
      }

      const chunkEndIdx = Math.min(j + 1, totalLines);
      if (maxByte > minByte) {
        try {
          const chunkBlob = currentFile!.slice(Number(minByte), Number(maxByte));
          const buffer = reader.readAsArrayBuffer(chunkBlob);
          const uint8View = new Uint8Array(buffer);

          for (let k = chunkStartIdx; k < chunkEndIdx; k++) {
            const lineStart = lineOffsets[k];
            const fileSize = currentFile!.size;
            const lineEnd = k < lineOffsets.length - 1 ? lineOffsets[k + 1] : BigInt(fileSize);
            if (lineStart >= lineEnd) continue;

            const relStart = Number(lineStart - minByte);
            const relEnd = Number(lineEnd - minByte);
            const line = decoder.decode(uint8View.subarray(relStart, relEnd)).replace(/\r?\n$/, '');
            const ts = extractTimestamp(line);
            cache[k] = ts !== null ? ts : 0;
          }
        } catch (err) {
          console.error('[Worker] Timestamp cache chunk build failed (File)', err);
        }
      }

      i = chunkEndIdx;
      const now = Date.now();
      if (now - lastNotifyTime > 100 && onProgress) {
        onProgress((i / totalLines) * 100);
        lastNotifyTime = now;
      }
    }
  }

  if (onProgress) {
    onProgress(100);
  }

  return cache;
};

/**
 * Calculates log histogram from filteredIndices using timestampCache.
 * Time complexity: O(n) where n = filteredIndices.length. Very fast.
 */
export const calculateHistogram = (
  ctx: HistogramWorkerContext,
  requestId?: string
) => {
  const { filteredIndices, timestampCache, respond } = ctx;

  if (!filteredIndices || filteredIndices.length === 0 || !timestampCache) {
    respond({
      type: 'HISTOGRAM_DATA',
      payload: { buckets: [], maxCount: 0, totalCount: 0 },
      requestId
    });
    return;
  }

  // Find min and max timestamp from the filtered indices to define the range.
  // Note: Only valid timestamps (> 0) should be considered.
  let minTs = Infinity;
  let maxTs = -Infinity;
  let validCount = 0;

  for (let i = 0; i < filteredIndices.length; i++) {
    const originalIdx = filteredIndices[i];
    const ts = timestampCache[originalIdx];
    if (ts > 0) {
      if (ts < minTs) minTs = ts;
      if (ts > maxTs) maxTs = ts;
      validCount++;
    }
  }

  if (validCount === 0 || minTs === Infinity || maxTs === -Infinity) {
    respond({
      type: 'HISTOGRAM_DATA',
      payload: { buckets: [], maxCount: 0, totalCount: 0 },
      requestId
    });
    return;
  }

  // Edge case: all timestamps are identical
  if (minTs === maxTs) {
    respond({
      type: 'HISTOGRAM_DATA',
      payload: {
        buckets: [{ startTime: minTs, endTime: minTs + 1, count: validCount }],
        maxCount: validCount,
        totalCount: validCount
      },
      requestId
    });
    return;
  }

  const BUCKET_COUNT = 150; // Stable count for high-density visual presentation
  const range = maxTs - minTs;
  const bucketWidth = range / BUCKET_COUNT;

  // Initialize buckets
  const buckets: HistogramBucket[] = [];
  for (let b = 0; b < BUCKET_COUNT; b++) {
    buckets.push({
      startTime: minTs + b * bucketWidth,
      endTime: minTs + (b + 1) * bucketWidth,
      count: 0
    });
  }

  // Aggregate O(n)
  let maxCount = 0;
  for (let i = 0; i < filteredIndices.length; i++) {
    const originalIdx = filteredIndices[i];
    const ts = timestampCache[originalIdx];
    if (ts > 0) {
      let bIdx = Math.floor((ts - minTs) / bucketWidth);
      if (bIdx >= BUCKET_COUNT) {
        bIdx = BUCKET_COUNT - 1; // Safeguard bound
      }
      if (bIdx >= 0) {
        if (buckets[bIdx].count === 0) {
          buckets[bIdx].firstVisualIndex = i;
        }
        buckets[bIdx].count++;
        if (buckets[bIdx].count > maxCount) {
          maxCount = buckets[bIdx].count;
        }
      }
    }
  }

  const result: HistogramData = {
    buckets,
    maxCount,
    totalCount: filteredIndices.length
  };

  respond({
    type: 'HISTOGRAM_DATA',
    payload: result,
    requestId
  });
};
