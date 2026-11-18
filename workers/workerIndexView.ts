export interface FilteredView {
    isIdentity: boolean;
    totalLines: number;
    indices: Int32Array | null;
}

export function binarySearchSortedInt32(arr: Int32Array, val: number): number {
    let low = 0;
    let high = arr.length - 1;
    while (low <= high) {
        const mid = (low + high) >>> 1;
        const midVal = arr[mid];
        if (midVal === val) return mid;
        if (midVal < val) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}

export function getViewLength(view: FilteredView): number {
    if (view.isIdentity) return view.totalLines;
    return view.indices ? view.indices.length : 0;
}

export function getOriginalAt(view: FilteredView, visualIdx: number): number {
    if (visualIdx < 0) return -1;
    if (view.isIdentity) {
        return visualIdx < view.totalLines ? visualIdx : -1;
    }
    if (!view.indices || visualIdx >= view.indices.length) return -1;
    return view.indices[visualIdx];
}

export function findVisualOfOriginal(view: FilteredView, originalIdx: number): number {
    if (originalIdx < 0) return -1;
    if (view.isIdentity) {
        return originalIdx < view.totalLines ? originalIdx : -1;
    }
    if (!view.indices) return -1;
    return binarySearchSortedInt32(view.indices, originalIdx);
}

/**
 * Allocates a concrete Int32Array ONLY when heavy on-demand analysis panels request it.
 */
export function materializeViewIndices(view: FilteredView): Int32Array | null {
    if (!view.isIdentity) return view.indices;
    const arr = new Int32Array(view.totalLines);
    for (let i = 0; i < view.totalLines; i++) {
        arr[i] = i;
    }
    return arr;
}

export function insertSortedInt32(arr: Int32Array, val: number): Int32Array {
    let low = 0;
    let high = arr.length - 1;
    let insertAt = arr.length;

    while (low <= high) {
        const mid = (low + high) >>> 1;
        if (arr[mid] === val) return arr;
        if (arr[mid] < val) {
            low = mid + 1;
            insertAt = low;
        } else {
            high = mid - 1;
            insertAt = mid;
        }
    }

    const next = new Int32Array(arr.length + 1);
    next.set(arr.subarray(0, insertAt), 0);
    next[insertAt] = val;
    next.set(arr.subarray(insertAt), insertAt + 1);
    return next;
}

export function removeAtInt32(arr: Int32Array, removeIdx: number): Int32Array {
    if (removeIdx < 0 || removeIdx >= arr.length) return arr;
    const next = new Int32Array(arr.length - 1);
    next.set(arr.subarray(0, removeIdx), 0);
    next.set(arr.subarray(removeIdx + 1), removeIdx);
    return next;
}

export function decodePackedLinesBinary(
    raw: Uint8Array,
    decoder: TextDecoder
): Array<{ lineIdx: number; content: string }> {
    if (!raw || raw.byteLength < 4) return [];
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const count = dv.getUint32(0, true);
    const results: Array<{ lineIdx: number; content: string }> = new Array(count);

    let cursor = 4;
    let outIdx = 0;
    for (let i = 0; i < count && cursor + 8 <= raw.byteLength; i++) {
        const lineIdx = dv.getUint32(cursor, true);
        const len = dv.getUint32(cursor + 4, true);
        cursor += 8;
        if (cursor + len > raw.byteLength) break;
        const content = decoder.decode(raw.subarray(cursor, cursor + len));
        cursor += len;
        results[outIdx++] = { lineIdx, content };
    }

    if (outIdx < count) {
        results.length = outIdx;
    }
    return results;
}
