import { AnalysisResult, AnalysisSegment } from './perfAnalysis';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DiffSegment extends AnalysisSegment {
    baseDuration?: number;
    baseSelfTime?: number;
    delta?: number;          // ms
    deltaSelfTime?: number;  // ms
    deltaPercent?: number;   // %
    diffStatus: 'added' | 'removed' | 'slower' | 'faster' | 'neutral';
}

/** Per-function aggregate comparison */
export interface FunctionDiffStat {
    name: string;
    baseTotalTime: number;
    targetTotalTime: number;
    baseSelfTime: number;
    targetSelfTime: number;
    baseCallCount: number;
    targetCallCount: number;
    deltaTotal: number;      // targetTotal - baseTotal (ms)
    deltaSelf: number;       // targetSelf  - baseSelf  (ms)
    deltaPercent: number;    // deltaTotal / baseTotalTime * 100
    category: 'regressed' | 'improved' | 'added' | 'removed' | 'neutral';
}

export interface DiffAnalysisResult {
    targetResult: AnalysisResult;
    baseResult: AnalysisResult;
    diffSegments: DiffSegment[];
    /** Base-only segments (removed functions) */
    removedSegments: DiffSegment[];
    /** Per-function aggregates */
    functionStats: FunctionDiffStat[];
    globalStats: {
        totalDeltaMs: number;
        baseTotalMs: number;
        targetTotalMs: number;
        regressedCount: number;
        improvedCount: number;
        addedCount: number;
        removedCount: number;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a map: { name -> AnalysisSegment[] } for O(1) name lookup
 */
const buildNameIndex = (segments: AnalysisSegment[]): Map<string, AnalysisSegment[]> => {
    const map = new Map<string, AnalysisSegment[]>();
    for (const s of segments) {
        const key = s.functionName || s.name;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(s);
    }
    return map;
};

/**
 * Greedy best-match: find the base segment with the same name
 * whose (startTime / totalDuration) ratio is closest to target's.
 * Falls back to duration-closest if position differs.
 */
const findBestMatch = (
    ts: AnalysisSegment,
    candidates: AnalysisSegment[],
    baseTotalDuration: number,
    targetTotalDuration: number,
    usedBaseIds: Set<string>
): AnalysisSegment | null => {
    if (!candidates || candidates.length === 0) return null;

    const targetRatio = targetTotalDuration > 0
        ? ts.startTime / targetTotalDuration
        : 0;

    let best: AnalysisSegment | null = null;
    let bestScore = Infinity;

    for (const bs of candidates) {
        if (usedBaseIds.has(bs.id)) continue;

        const baseRatio = baseTotalDuration > 0
            ? bs.startTime / baseTotalDuration
            : 0;

        // Score: weighted combination of position ratio diff + duration ratio diff
        const posDiff = Math.abs(baseRatio - targetRatio);
        const durDiff = Math.abs(bs.duration - ts.duration) /
            (Math.max(bs.duration, ts.duration) || 1);

        // Lane similarity bonus (lower lane diff = better match)
        const laneDiff = Math.abs((bs.lane ?? 0) - (ts.lane ?? 0)) * 0.1;

        const score = posDiff * 0.6 + durDiff * 0.3 + laneDiff;
        if (score < bestScore) {
            bestScore = score;
            best = bs;
        }
    }

    // Accept only if score is reasonable (< 0.5 means somewhat similar)
    return bestScore < 0.5 ? best : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Comparison Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * [PerformanceDiff v2]
 * Compares two AnalysisResults using stack-path aware + greedy best-match.
 * Returns DiffSegments for target (matched/added) and removedSegments for base-only.
 */
export const comparePerformanceResults = (
    base: AnalysisResult,
    target: AnalysisResult
): DiffAnalysisResult => {

    const diffSegments: DiffSegment[] = [];
    const removedSegments: DiffSegment[] = [];

    // Track which base segments were matched
    const usedBaseIds = new Set<string>();

    // Build name → segments index for base
    const baseNameIndex = buildNameIndex(base.segments);

    const baseTotalDuration = base.totalDuration || (base.endTime - base.startTime) || 1;
    const targetTotalDuration = target.totalDuration || (target.endTime - target.startTime) || 1;

    // ── 1. Match target segments against base ──────────────────────────────
    for (const ts of target.segments) {
        const name = ts.functionName || ts.name;
        const candidates = baseNameIndex.get(name) ?? [];

        const match = findBestMatch(ts, candidates, baseTotalDuration, targetTotalDuration, usedBaseIds);

        let diffStatus: DiffSegment['diffStatus'] = 'neutral';
        let delta = 0;
        let deltaSelfTime = 0;
        let deltaPercent = 0;
        let baseDuration = 0;
        let baseSelfTime = 0;

        if (match) {
            usedBaseIds.add(match.id);
            baseDuration = match.duration;
            baseSelfTime = match.selfTime ?? 0;
            delta = ts.duration - match.duration;
            deltaSelfTime = (ts.selfTime ?? 0) - baseSelfTime;
            deltaPercent = baseDuration > 0 ? (delta / baseDuration) * 100 : 0;

            // Threshold: >5ms AND >5% change to avoid noise
            if (delta > 5 && deltaPercent > 5) diffStatus = 'slower';
            else if (delta < -5 && deltaPercent < -5) diffStatus = 'faster';
            else diffStatus = 'neutral';
        } else {
            diffStatus = 'added';
            delta = ts.duration;
            deltaSelfTime = ts.selfTime ?? 0;
            deltaPercent = 100;
        }

        diffSegments.push({
            ...ts,
            baseDuration,
            baseSelfTime,
            delta,
            deltaSelfTime,
            deltaPercent,
            diffStatus,
        });
    }

    // ── 2. Find removed (base-only) segments ──────────────────────────────
    for (const bs of base.segments) {
        if (usedBaseIds.has(bs.id)) continue;
        removedSegments.push({
            ...bs,
            baseDuration: bs.duration,
            baseSelfTime: bs.selfTime,
            delta: -bs.duration,
            deltaSelfTime: -(bs.selfTime ?? 0),
            deltaPercent: -100,
            diffStatus: 'removed',
        });
    }

    // ── 3. Build per-function aggregates ──────────────────────────────────
    const funcStatsMap = new Map<string, {
        baseTotalTime: number; targetTotalTime: number;
        baseSelfTime: number; targetSelfTime: number;
        baseCallCount: number; targetCallCount: number;
    }>();

    // Accumulate base
    for (const bs of base.segments) {
        const key = bs.functionName || bs.name;
        const entry = funcStatsMap.get(key) ?? {
            baseTotalTime: 0, targetTotalTime: 0,
            baseSelfTime: 0, targetSelfTime: 0,
            baseCallCount: 0, targetCallCount: 0,
        };
        entry.baseTotalTime += bs.duration;
        entry.baseSelfTime += bs.selfTime ?? 0;
        entry.baseCallCount += 1;
        funcStatsMap.set(key, entry);
    }

    // Accumulate target
    for (const ts of target.segments) {
        const key = ts.functionName || ts.name;
        const entry = funcStatsMap.get(key) ?? {
            baseTotalTime: 0, targetTotalTime: 0,
            baseSelfTime: 0, targetSelfTime: 0,
            baseCallCount: 0, targetCallCount: 0,
        };
        entry.targetTotalTime += ts.duration;
        entry.targetSelfTime += ts.selfTime ?? 0;
        entry.targetCallCount += 1;
        funcStatsMap.set(key, entry);
    }

    const functionStats: FunctionDiffStat[] = [];
    funcStatsMap.forEach((v, name) => {
        const deltaTotal = v.targetTotalTime - v.baseTotalTime;
        const deltaSelf = v.targetSelfTime - v.baseSelfTime;
        const deltaPercent = v.baseTotalTime > 0
            ? (deltaTotal / v.baseTotalTime) * 100
            : (v.targetTotalTime > 0 ? 100 : 0);

        let category: FunctionDiffStat['category'] = 'neutral';
        if (v.baseCallCount === 0) category = 'added';
        else if (v.targetCallCount === 0) category = 'removed';
        else if (deltaTotal > 5 && deltaPercent > 5) category = 'regressed';
        else if (deltaTotal < -5 && deltaPercent < -5) category = 'improved';

        functionStats.push({
            name, ...v, deltaTotal, deltaSelf, deltaPercent, category
        });
    });

    // Sort by |deltaTotal| desc (biggest change first)
    functionStats.sort((a, b) => Math.abs(b.deltaTotal) - Math.abs(a.deltaTotal));

    // ── 4. Global stats ───────────────────────────────────────────────────
    const regressedCount = diffSegments.filter(s => s.diffStatus === 'slower').length;
    const improvedCount = diffSegments.filter(s => s.diffStatus === 'faster').length;
    const addedCount = diffSegments.filter(s => s.diffStatus === 'added').length;

    return {
        targetResult: target,
        baseResult: base,
        diffSegments,
        removedSegments,
        functionStats,
        globalStats: {
            totalDeltaMs: target.totalDuration - base.totalDuration,
            baseTotalMs: base.totalDuration,
            targetTotalMs: target.totalDuration,
            regressedCount,
            improvedCount,
            addedCount,
            removedCount: removedSegments.length,
        },
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Color Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns HSL color scaled by delta magnitude.
 * Red = regressed, Blue = improved, Green = added, Dotted-Gray = removed.
 */
export const getDiffColor = (segment: DiffSegment): string => {
    switch (segment.diffStatus) {
        case 'added':
            return '#10b981'; // Emerald-500
        case 'removed':
            return '#6b7280'; // Gray-500
        case 'slower': {
            const pct = Math.min(100, Math.abs(segment.deltaPercent ?? 0));
            // hsl(0, saturation, lightness): more intense red for larger delta
            const s = 50 + pct * 0.4;
            const l = 42 - pct * 0.12;
            return `hsl(0, ${s}%, ${l}%)`;
        }
        case 'faster': {
            const pct = Math.min(100, Math.abs(segment.deltaPercent ?? 0));
            const s = 50 + pct * 0.4;
            const l = 42 - pct * 0.12;
            return `hsl(213, ${s}%, ${l}%)`;
        }
        case 'neutral':
        default:
            return '#374151'; // Gray-700 - subtler than before
    }
};

export const categoryColor = (cat: FunctionDiffStat['category']): string => {
    switch (cat) {
        case 'regressed': return '#ef4444';
        case 'improved':  return '#3b82f6';
        case 'added':     return '#10b981';
        case 'removed':   return '#6b7280';
        default:          return '#64748b';
    }
};
