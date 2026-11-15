import { LogRule } from '../types';
import { QuickFilterMode } from './byteLogFiltering';

export interface FilterRuleSnapshot {
    quickFilter: QuickFilterMode;
    happyCombosCaseSensitive: boolean;
    blockListCaseSensitive: boolean;
    excludes: string[];
    includeGroups: string[][];
    key: string;
}

export interface FilterCacheEntry {
    snapshot: FilterRuleSnapshot;
    rawMatchedIndices: Int32Array;
    totalLines: number;
}

export interface IncrementalFilterPlan {
    mode: 'exact-cache' | 'empty-instant' | 'stream-candidates' | 'window-sparse' | 'full-scan';
    sourceEntry?: FilterCacheEntry;
    windows?: CoalescedWindow[];
    totalReadBytes?: number;
}

export interface CoalescedWindow {
    startByte: number;
    endByte: number;
    lineIndices: number[];
}

export interface CoalesceOptions {
    maxGapBytes?: number;
    maxWindowBytes?: number;
}

export interface CoalesceResult {
    windows: CoalescedWindow[];
    totalReadBytes: number;
}

const DEFAULT_MAX_GAP_BYTES = 32 * 1024;
const DEFAULT_MAX_WINDOW_BYTES = 4 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 5;
const MAX_TOTAL_CACHED_INDICES = 2_500_000;

const MAX_SPARSE_CANDIDATE_RATIO = 0.25;
const MAX_DENSE_READ_CANDIDATE_RATIO = 0.15;
const MAX_DENSE_READ_BYTE_RATIO = 0.45;
const MAX_BROWSER_WINDOWS = 4096;
const MAX_LOCAL_IPC_WINDOWS = 512;
const MAX_STREAM_CANDIDATE_RATIO = 0.6;

/**
 * Create a canonical, immutable snapshot from an already-normalized LogRule.
 */
export const normalizeFilterSnapshot = (
    normalizedRule: LogRule,
    quickFilter: QuickFilterMode = 'none'
): FilterRuleSnapshot => {
    const happyCase = !!normalizedRule.happyCombosCaseSensitive;
    const blockCase = !!normalizedRule.blockListCaseSensitive;
    const excludes = normalizedRule.excludes.slice();
    const includeGroups = normalizedRule.includeGroups.map(group => group.slice());

    const key = JSON.stringify({
        q: quickFilter,
        hc: happyCase,
        bc: blockCase,
        ex: excludes,
        inc: includeGroups,
    });

    return {
        quickFilter,
        happyCombosCaseSensitive: happyCase,
        blockListCaseSensitive: blockCase,
        excludes,
        includeGroups,
        key,
    };
};

export const areFilterSnapshotsEqual = (a: FilterRuleSnapshot, b: FilterRuleSnapshot): boolean =>
    a.key === b.key;

/**
 * Check whether every possible line matched by `next` is mathematically guaranteed
 * to also match `prev` (i.e. Matches(next) is a subset of Matches(prev)).
 */
export const isStrictNarrowingSnapshot = (
    prev: FilterRuleSnapshot,
    next: FilterRuleSnapshot
): boolean => {
    // 1. Quick filter can only remain identical or tighten from 'none' -> 'error'/'exception'
    if (prev.quickFilter !== next.quickFilter && prev.quickFilter !== 'none') {
        return false;
    }

    // 2. Excludes must block at least everything previously blocked under identical case rules
    if (prev.excludes.length > 0) {
        if (prev.blockListCaseSensitive !== next.blockListCaseSensitive) {
            return false;
        }
        for (let i = 0; i < prev.excludes.length; i++) {
            const pEx = prev.excludes[i];
            let stillBlocked = false;
            for (let j = 0; j < next.excludes.length; j++) {
                if (pEx.includes(next.excludes[j])) {
                    stillBlocked = true;
                    break;
                }
            }
            if (!stillBlocked) return false;
        }
    }

    // 3. Include groups: empty means "allow all lines"
    if (prev.includeGroups.length === 0) {
        return true;
    }
    if (next.includeGroups.length === 0) {
        return false;
    }
    if (prev.happyCombosCaseSensitive !== next.happyCombosCaseSensitive) {
        return false;
    }

    // Every OR branch in `next` must imply at least one OR branch in `prev`
    for (let i = 0; i < next.includeGroups.length; i++) {
        const nextGroup = next.includeGroups[i];
        let coveredByPrev = false;

        for (let j = 0; j < prev.includeGroups.length; j++) {
            const prevGroup = prev.includeGroups[j];
            let groupMatches = true;

            for (let k = 0; k < prevGroup.length; k++) {
                const prevTerm = prevGroup[k];
                let termCovered = false;
                for (let m = 0; m < nextGroup.length; m++) {
                    if (nextGroup[m].includes(prevTerm)) {
                        termCovered = true;
                        break;
                    }
                }
                if (!termCovered) {
                    groupMatches = false;
                    break;
                }
            }

            if (groupMatches) {
                coveredByPrev = true;
                break;
            }
        }

        if (!coveredByPrev) return false;
    }

    return true;
};

/**
 * Coalesce sorted ascending candidate line indices into contiguous byte windows
 * so sparse re-filtering avoids thousands of tiny slice/IPC reads.
 */
export const coalesceCandidateWindows = (
    candidates: Int32Array,
    lineOffsets: BigInt64Array,
    fileSize: number,
    options: CoalesceOptions = {}
): CoalesceResult => {
    const count = candidates.length;
    if (count === 0 || lineOffsets.length === 0) {
        return { windows: [], totalReadBytes: 0 };
    }

    const maxGapBytes = options.maxGapBytes ?? DEFAULT_MAX_GAP_BYTES;
    const maxWindowBytes = options.maxWindowBytes ?? DEFAULT_MAX_WINDOW_BYTES;
    const totalOffsets = lineOffsets.length;

    const windows: CoalescedWindow[] = [];
    let currentWindow: CoalescedWindow | null = null;
    let totalReadBytes = 0;

    for (let i = 0; i < count; i++) {
        const lineIdx = candidates[i];
        if (lineIdx < 0 || lineIdx >= totalOffsets) continue;

        const lineStart = Number(lineOffsets[lineIdx]);
        const rawEnd = lineIdx + 1 < totalOffsets ? Number(lineOffsets[lineIdx + 1]) : fileSize;
        const lineEnd = rawEnd >= lineStart ? rawEnd : lineStart;

        if (!currentWindow) {
            currentWindow = {
                startByte: lineStart,
                endByte: lineEnd,
                lineIndices: [lineIdx],
            };
            continue;
        }

        const gap = lineStart - currentWindow.endByte;
        const mergedSpan = lineEnd - currentWindow.startByte;

        if (gap <= maxGapBytes && mergedSpan <= maxWindowBytes) {
            if (lineEnd > currentWindow.endByte) {
                currentWindow.endByte = lineEnd;
            }
            currentWindow.lineIndices.push(lineIdx);
        } else {
            totalReadBytes += currentWindow.endByte - currentWindow.startByte;
            windows.push(currentWindow);
            currentWindow = {
                startByte: lineStart,
                endByte: lineEnd,
                lineIndices: [lineIdx],
            };
        }
    }

    if (currentWindow) {
        totalReadBytes += currentWindow.endByte - currentWindow.startByte;
        windows.push(currentWindow);
    }

    return { windows, totalReadBytes };
};

/**
 * Bounded multi-step LRU cache holding pure (pre-bookmark) match indices
 * so both forward narrowing (`a -> a+b -> a+b+c`) and backtracked narrowing (`a+b+d`) reuse candidates.
 */
export class FilterCacheStore {
    private entries: FilterCacheEntry[] = [];
    private totalCachedIndices = 0;

    clear(): void {
        this.entries = [];
        this.totalCachedIndices = 0;
    }

    size(): number {
        return this.entries.length;
    }

    record(entry: FilterCacheEntry): void {
        const len = entry.rawMatchedIndices.length;
        if (len > MAX_TOTAL_CACHED_INDICES) {
            return;
        }

        // Invalidate stale entries if total line count changed (e.g., live streaming grew)
        if (this.entries.length > 0 && this.entries[0].totalLines !== entry.totalLines) {
            this.clear();
        }

        const existingIdx = this.entries.findIndex(e => e.snapshot.key === entry.snapshot.key);
        if (existingIdx !== -1) {
            this.totalCachedIndices -= this.entries[existingIdx].rawMatchedIndices.length;
            this.entries.splice(existingIdx, 1);
        }

        this.entries.push(entry);
        this.totalCachedIndices += len;

        while (
            this.entries.length > MAX_CACHE_ENTRIES ||
            (this.entries.length > 1 && this.totalCachedIndices > MAX_TOTAL_CACHED_INDICES)
        ) {
            const evicted = this.entries.shift();
            if (evicted) {
                this.totalCachedIndices -= evicted.rawMatchedIndices.length;
            }
        }
    }

    findBestParent(
        nextSnapshot: FilterRuleSnapshot,
        totalLines: number
    ): { entry: FilterCacheEntry; exact: boolean } | null {
        let bestSubset: FilterCacheEntry | null = null;

        // Scan most recent entries first for exact match, otherwise pick smallest superset candidate list
        for (let i = this.entries.length - 1; i >= 0; i--) {
            const entry = this.entries[i];
            if (entry.totalLines !== totalLines) continue;

            if (areFilterSnapshotsEqual(entry.snapshot, nextSnapshot)) {
                return { entry, exact: true };
            }

            if (isStrictNarrowingSnapshot(entry.snapshot, nextSnapshot)) {
                if (!bestSubset || entry.rawMatchedIndices.length < bestSubset.rawMatchedIndices.length) {
                    bestSubset = entry;
                }
            }
        }

        return bestSubset ? { entry: bestSubset, exact: false } : null;
    }
}

export interface PlanSelectionContext {
    cache: FilterCacheStore;
    nextSnapshot: FilterRuleSnapshot;
    totalLines: number;
    isStreamMode: boolean;
    isLocalFileMode: boolean;
    lineOffsets: BigInt64Array | null;
    fileSize: number;
}

/**
 * Decide whether the incoming filter can reuse cached candidate indices cleanly
 * and remain faster than a multi-worker full scan.
 */
export const selectIncrementalFilterPlan = (ctx: PlanSelectionContext): IncrementalFilterPlan => {
    const match = ctx.cache.findBestParent(ctx.nextSnapshot, ctx.totalLines);
    if (!match) {
        return { mode: 'full-scan' };
    }

    const { entry, exact } = match;
    if (exact) {
        return { mode: 'exact-cache', sourceEntry: entry };
    }

    const candidates = entry.rawMatchedIndices;
    if (candidates.length === 0) {
        return { mode: 'empty-instant', sourceEntry: entry };
    }

    if (ctx.isStreamMode) {
        if (ctx.totalLines > 0 && candidates.length > ctx.totalLines * MAX_STREAM_CANDIDATE_RATIO) {
            return { mode: 'full-scan' };
        }
        return { mode: 'stream-candidates', sourceEntry: entry };
    }

    if (!ctx.lineOffsets || ctx.fileSize <= 0) {
        return { mode: 'full-scan' };
    }

    if (ctx.totalLines > 0 && candidates.length > ctx.totalLines * MAX_SPARSE_CANDIDATE_RATIO) {
        return { mode: 'full-scan' };
    }

    const coalesceOpts: CoalesceOptions = ctx.isLocalFileMode
        ? { maxGapBytes: 256 * 1024, maxWindowBytes: 4 * 1024 * 1024 }
        : { maxGapBytes: DEFAULT_MAX_GAP_BYTES, maxWindowBytes: DEFAULT_MAX_WINDOW_BYTES };

    const { windows, totalReadBytes } = coalesceCandidateWindows(
        candidates,
        ctx.lineOffsets,
        ctx.fileSize,
        coalesceOpts
    );

    if (windows.length === 0) {
        return { mode: 'empty-instant', sourceEntry: entry };
    }

    const maxWindows = ctx.isLocalFileMode ? MAX_LOCAL_IPC_WINDOWS : MAX_BROWSER_WINDOWS;
    if (windows.length > maxWindows) {
        return { mode: 'full-scan' };
    }

    // If a single-worker sparse pass still has to read >45% of the file AND >15% of lines are candidates,
    // 8 parallel sub-workers doing full contiguous scans are faster than 1 worker.
    if (
        ctx.totalLines > 0 &&
        ctx.fileSize > 0 &&
        totalReadBytes > ctx.fileSize * MAX_DENSE_READ_BYTE_RATIO &&
        candidates.length > ctx.totalLines * MAX_DENSE_READ_CANDIDATE_RATIO
    ) {
        return { mode: 'full-scan' };
    }

    return {
        mode: 'window-sparse',
        sourceEntry: entry,
        windows,
        totalReadBytes,
    };
};
