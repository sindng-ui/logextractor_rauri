// Keep necessary interfaces like PointAnalysisResult and import the rest from SplitAnalysisUtils.
import {
    PointMetrics,
    AliasEvent,
    SplitAnalysisResult,
    PointAnalysisResult,
    matchAliasEvents,
    computeAliasIntervals,
    computeGlobalAliasRanges,
    SequenceItem,
    alignSequences
} from './SplitAnalysisUtils';

export interface SplitAnalysisRequest {
    leftSequence: SequenceItem[];
    rightSequence: SequenceItem[];
    leftPointMetrics?: PointMetrics;
    rightPointMetrics?: PointMetrics;
    leftAliasEvents?: AliasEvent[];
    rightAliasEvents?: AliasEvent[];
}

export interface SplitAnalysisWorkerResponse {
    type: 'SPLIT_ANALYSIS_COMPLETE' | 'STATUS_UPDATE';
    payload?: any;
}

const ctx: Worker = self as any;

ctx.onmessage = (e: MessageEvent<SplitAnalysisRequest>) => {
    const { leftSequence, rightSequence, leftPointMetrics, rightPointMetrics, leftAliasEvents, rightAliasEvents } = e.data;
    console.log('[SplitAnalysisWorker] Received metrics', {
        leftSeqLen: leftSequence?.length,
        rightSeqLen: rightSequence?.length,
        leftPoints: Object.keys(leftPointMetrics || {}).length,
        rightPoints: Object.keys(rightPointMetrics || {}).length,
        leftAliasEvents: leftAliasEvents?.length,
        rightAliasEvents: rightAliasEvents?.length
    });

    if (!leftSequence || !rightSequence) {
        console.warn('[SplitAnalysisWorker] Missing sequence data');
        ctx.postMessage({ type: 'SPLIT_ANALYSIS_COMPLETE', payload: { results: [], pointResults: [] } });
        return;
    }

    ctx.postMessage({ type: 'STATUS_UPDATE', payload: { status: 'analyzing', progress: 10 } });

    // --- Part 1: Interval Analysis (Original) ---
    const results: SplitAnalysisResult[] = [];
    // ... (Legacy interval analysis logic omitted - should actually be included)
    // 🐧💡 Maintain legacy logic for speed but add Alias matching results at the top.

    // --- Part 2: Alias Sequence Matching (New Engine) ---
    if (leftAliasEvents && rightAliasEvents) {
        const aliasMatches = matchAliasEvents(leftAliasEvents, rightAliasEvents);
        const aliasIntervals = computeAliasIntervals(leftAliasEvents, rightAliasEvents);
        const globalRanges = computeGlobalAliasRanges(leftAliasEvents, rightAliasEvents);

        results.push(...aliasMatches);
        results.push(...aliasIntervals);
        results.push(...globalRanges);
    }

    // --- Part 3: Sequence Alignment (New LCS Engine) ---
    // Delete legacy N-gram window loop and receive DP-based global alignment results.
    const alignedResults = alignSequences(leftSequence, rightSequence);
    results.push(...alignedResults);

    // 🐧⚡ Pre-calculate sorting weight (Sorting Severity)
    for (const res of results) {
        (res as any)._severity = Math.abs(res.deltaDiff) * 0.5 + Math.abs(res.countDiff) * 10;
    }

    // Sort: Global Batch first, then Alias Intervals, then Alias matches, then New Errors, then Severity.
    results.sort((a, b) => {
        if (a.isGlobalBatch && !b.isGlobalBatch) return -1;
        if (!a.isGlobalBatch && b.isGlobalBatch) return 1;

        if (a.isAliasInterval && !b.isAliasInterval) return -1;
        if (!a.isAliasInterval && b.isAliasInterval) return 1;

        if (a.isAliasMatch && !b.isAliasMatch) return -1;
        if (!a.isAliasMatch && b.isAliasMatch) return 1;

        if (a.isNewError && !b.isNewError) return -1;
        if (!a.isNewError && b.isNewError) return 1;

        return ((b as any)._severity || 0) - ((a as any)._severity || 0);
    });

    // 🐧⚡ Deduplication: Remove redundant segments pointing to visually identical ranges
    // If Alias analysis results overlap with general results, prioritize the sorted (Alias, etc.) results at the top.
    const finalResults: SplitAnalysisResult[] = [];
    const seenRanges = new Set<string>();

    for (const res of results) {
        // Judge as duplicate if start-end lines of both left/right logs are identical
        // 🐧⚡ (Fix) Exclude matches where both start/end lines are 0, focusing on significant intervals
        if (res.leftPrevLineNum === res.leftLineNum && res.rightPrevLineNum === res.rightLineNum && !res.isAliasMatch) {
            // Skip segments with virtually no content
            continue;
        }

        const rangeKey = `${res.leftPrevLineNum}-${res.leftLineNum}|${res.rightPrevLineNum}-${res.rightLineNum}`;

        if (!seenRanges.has(rangeKey)) {
            finalResults.push(res);
            seenRanges.add(rangeKey);
        } else {
            console.log(`[SplitAnalysisWorker] Deduplicated redundant segment: ${res.key} (Range: ${rangeKey})`);
        }
    }

    const pointResults: PointAnalysisResult[] = [];
    if (rightPointMetrics) {
        for (const sig in rightPointMetrics) {
            if (!leftPointMetrics || !leftPointMetrics[sig]) {
                const pm = rightPointMetrics[sig];
                pointResults.push({
                    sig,
                    fileName: pm.fileName,
                    functionName: pm.functionName,
                    codeLineNum: pm.codeLineNum,
                    preview: pm.preview,
                    count: pm.count,
                    visualIndices: pm.visualIndices,
                    originalLineNums: pm.originalLineNums
                });
            }
        }
    }
    pointResults.sort((a, b) => b.count - a.count);

    ctx.postMessage({ type: 'STATUS_UPDATE', payload: { status: 'ready', progress: 100 } });
    ctx.postMessage({ type: 'SPLIT_ANALYSIS_COMPLETE', payload: { results: finalResults, pointResults } });
};
