// workers/LogIndexer.worker.ts
/* eslint-disable no-restricted-globals */
const ctx: Worker = self as any;

// 🐧 Tip: Using native indexOf(10) (LF) to detect line breaks magnitudes faster than JS loops.
ctx.onmessage = async (e: MessageEvent) => {
  const { file } = e.data;
  if (!file) return;

  const fileSize = file.size;
  let capacity = 1024 * 1024; // Pre-allocate 1M lines initially
  let offsets = new Uint32Array(capacity);
  offsets[0] = 0; // First line starts at 0 bytes
  let lineCount = 1;

  const stream = file.stream();
  const reader = stream.getReader();
  let totalProcessed = 0;

  try {
    console.log(`[LogIndexer] Starting index for: ${file.name} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    const startTime = performance.now();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk: Uint8Array = value;
      let pos = -1;
      
      // ASCII 10 is '\n' (Line Feed)
      while ((pos = chunk.indexOf(10, pos + 1)) !== -1) {
        if (lineCount >= capacity) {
          const newCapacity = capacity * 2;
          const newArr = new Uint32Array(newCapacity);
          newArr.set(offsets);
          offsets = newArr;
          capacity = newCapacity;
        }
        // Next line start position = LF position in chunk + total bytes read so far + 1
        offsets[lineCount++] = totalProcessed + pos + 1;
      }
      totalProcessed += chunk.length;
    }
    
    const duration = performance.now() - startTime;
    console.log(`[LogIndexer] Indexing complete: ${lineCount.toLocaleString()} lines in ${duration.toFixed(2)}ms`);

    ctx.postMessage({ 
      type: 'INDEX_COMPLETE', 
      payload: { 
        offsets: offsets.subarray(0, lineCount),
        totalLines: lineCount 
      } 
    });
  } catch (err: any) {
    console.error('[LogIndexer] Indexing failed:', err);
    ctx.postMessage({ type: 'ERROR', payload: err.message });
  }
};
