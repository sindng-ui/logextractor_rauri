import { LogMetadata, LogRule } from '../types';
import { extractTimestamp } from '../utils/logTime';
import { extractSourceMetadata } from '../utils/perfAnalysis';

export interface PointAnalysisResult {
    sig: string;
    fileName: string;
    functionName: string;
    codeLineNum: string | null;
    preview: string;
    count: number;
    visualIndices: number[];
    originalLineNums: number[];
}

export interface SequenceItem {
    sig: string;
    timestamp: number | null;
    tid: string | null;
    preview: string;
    fileName: string;
    functionName: string;
    codeLineNum: string | null;
    isError: boolean;
    isWarn: boolean;
    lineNum: number;
    originalLineNum: number;
    alias: string | null;
}

// 🐧⚡ Constant declarations for regex reuse
const RE_TID_1 = /\(P\s*\d+,\s*T\s*(\d+)\)/;
const RE_TID_2 = /\[\s*(\d+):/;
const RE_NON_ALPHANUM = /[^a-zA-Z\uAC00-\uD7A3]/g;
const RE_DIGITS = /\d+/g;
const RE_HEX = /0x[0-9a-fA-F]+/g;
const RE_ERROR_LVL = /error|fail|critical/i;
const RE_WARN_LVL = /warn|warning/i;

export interface AliasEvent {
    alias: string;
    timestamp: number | null;
    visualIndex: number;
    lineNum: number;
    preview: string;
    fileName?: string;
    functionName?: string;
    codeLineNum?: string | null;
}

export interface SplitAnalysisResult {
    key: string;
    fileName: string;
    functionName: string;
    preview: string;

    leftCount: number;
    rightCount: number;
    countDiff: number;

    leftAvgDelta: number;
    rightAvgDelta: number;
    deltaDiff: number;

    isNewError: boolean;
    isError: boolean;
    isWarn: boolean;
    isAliasMatch?: boolean;
    isAliasInterval?: boolean;
    isGlobalBatch?: boolean; // 🐧⚡ For global batch indicator (top-level exposure)

    prevFileName?: string;
    prevFunctionName?: string;
    prevPreview?: string;

    leftUniqueTids?: number;
    rightUniqueTids?: number;

    leftLineNum: number;
    rightLineNum: number;
    leftPrevLineNum: number;
    rightPrevLineNum: number;

    leftOrigLineNum?: number;
    rightOrigLineNum?: number;
    leftPrevOrigLineNum?: number;
    rightPrevOrigLineNum?: number;

    leftCodeLineNum?: string | null;
    rightCodeLineNum?: string | null;
    leftPrevCodeLineNum?: string | null;
    rightPrevCodeLineNum?: string | null;

    // 🐧⚡ Burst (repeated logs) info
    isBurst?: boolean;
    burstCount?: number;
    // Burst end position (Jump uses burstEndLineNum if present, otherwise uses rightLineNum)
    burstEndLineNum?: number;      // Right visualIndex of last repeat occurrence
    burstEndOrigLineNum?: number;  // Right original line number of last repeat occurrence
    burstEndLeftLineNum?: number;  // Left visualIndex of last repeat occurrence
    burstEndLeftOrigLineNum?: number; // Left original line number of last repeat occurrence
    // burstDuration is removed as it can be replaced by accumulated leftAvgDelta/rightAvgDelta (Interface simplification)
}

/**
 * 🐧⚡ Returns a unified signature format by combining filename, function name, and line number.
 */
export const getFormattedSig = (fileName?: string, functionName?: string, codeLineNum?: string | null, preview?: string): string => {
    const fn = (fileName || '').split(/[\\/]/).pop() || '';
    const func = functionName || '';

    // 🐧⚡ Message pattern extraction: Create static patterns by replacing variable parts (numbers, hex, etc.) with #
    let pattern = '';
    if (preview) {
        // 🐧⚡ If '>' exists, only the real body content after it is used for pattern extraction (excluding timestamps, etc.)
        const markerIdx = preview.indexOf('>');
        const realBody = markerIdx !== -1 ? preview.substring(markerIdx + 1) : preview;

        pattern = realBody
            .replace(RE_HEX, '0x#')
            .replace(RE_DIGITS, '#')
            .replace(/\s+/g, ' ') // 🐧⚡ Merge consecutive spaces into one (Whitespace Normalization)
            .substring(0, 40)
            .trim();
    }

    const patternStr = pattern ? `::[${pattern}]` : '';
    const emptyFallback = (fileName || functionName || pattern) ? '' : '(?)';

    return `${fn}::${func}${patternStr}${emptyFallback}`;
};

/**
 * 🐧⚡ Extracts metadata from a single log line. (Optimized version)
 */
export const extractSingleMetadata = (
    text: string,
    originalIdx: number,
    visualIdx: number,
    currentRule: LogRule | null
): LogMetadata => {
    const timestamp = extractTimestamp(text);

    // TID extraction (Maintained for display decoration)
    const tidMatch = text.match(RE_TID_1) || text.match(RE_TID_2);
    const tid = tidMatch ? tidMatch[1] : null;

    // Extraction of file/function/line names
    const { fileName, functionName, codeLineNum } = extractSourceMetadata(text);

    const isError = RE_ERROR_LVL.test(text);
    const isWarn = RE_WARN_LVL.test(text);

    // Happy Combo Alias matching
    let matchedAlias: string | null = null;
    if (currentRule?.happyGroups) {
        const caseSensitive = currentRule.happyCombosCaseSensitive ?? false;
        const lowerText = caseSensitive ? text : text.toLowerCase();

        for (const group of currentRule.happyGroups) {
            if (!group.enabled || !group.alias || !group.tags.length) continue;

            // Check if all tags are included (AND condition)
            const allMatched = group.tags.every((tag, idx) => {
                // 🐧⚡ Use pre-lowercased tags if available, otherwise convert on the fly (maintain compatibility)
                const searchTag = (group as any)._lowercasedTags?.[idx] || (caseSensitive ? tag : tag.toLowerCase());
                return lowerText.includes(searchTag);
            });

            if (allMatched) {
                matchedAlias = group.alias;
                break;
            }
        }
    }

    return {
        fileName: fileName || '',
        functionName: functionName || '',
        codeLineNum,
        timestamp,
        tid,
        lineNum: originalIdx + 1,
        visualIndex: visualIdx,
        isError,
        isWarn,
        preview: text.length > 150 ? text.substring(0, 150) : text,
        alias: matchedAlias
    };
};

/**
 * 🐧⚡ Extracts only the Happy Combo Alias from a specific line.
 */
export const extractAliasFromLine = (text: string, currentRule: LogRule | null): string | null => {
    if (!currentRule?.happyGroups) return null;
    const caseSensitive = currentRule.happyCombosCaseSensitive ?? false;
    const lowerText = caseSensitive ? text : text.toLowerCase();

    for (const group of currentRule.happyGroups) {
        if (!group.enabled || !group.alias || !group.tags.length) continue;

        const allMatched = group.tags.every(tag => {
            const searchTag = caseSensitive ? tag : tag.toLowerCase();
            return lowerText.includes(searchTag);
        });

        if (allMatched) return group.alias;
    }
    return null;
};

/**
 * 🐧⚡ Matches Alias events and returns results.
 */
export const matchAliasEvents = (
    leftAliasEvents: AliasEvent[],
    rightAliasEvents: AliasEvent[]
): SplitAnalysisResult[] => {
    const results: SplitAnalysisResult[] = [];
    const getEventSig = (ev: AliasEvent) => {
        const normalizedPreview = (ev.preview || '').replace(/\s+/g, ' ').trim();
        return `${ev.alias}|${ev.fileName || ''}|${ev.functionName || ''}|${normalizedPreview}`;
    };
    const getFormattedEventSig = (ev: AliasEvent) => getFormattedSig(ev.fileName, ev.functionName || ev.alias, ev.codeLineNum, ev.preview);

    const leftAliasMap = new Map<string, AliasEvent[]>();
    leftAliasEvents.forEach(ev => {
        const sig = getEventSig(ev);
        const list = leftAliasMap.get(sig) || [];
        list.push(ev);
        leftAliasMap.set(sig, list);
    });

    const rightAliasCounts = new Map<string, number>();
    rightAliasEvents.forEach(rev => {
        const sig = getEventSig(rev);
        const count = rightAliasCounts.get(sig) || 0;
        const leftEvents = leftAliasMap.get(sig);
        const lev = leftEvents ? leftEvents[count] : null;

        if (lev) {
            const leftTs = lev.timestamp || 0;
            const rightTs = rev.timestamp || 0;
            const delta = leftTs > 0 && rightTs > 0 ? (rightTs - leftTs) : 0;

            results.push({
                key: `${getFormattedEventSig(rev)} (#${count + 1})`,
                fileName: rev.fileName || lev.fileName || '',
                functionName: rev.functionName || lev.functionName || rev.alias,
                preview: rev.preview,
                leftCount: 1,
                rightCount: 1,
                countDiff: 0,
                leftAvgDelta: 0,
                rightAvgDelta: 0,
                deltaDiff: delta,
                isNewError: false,
                isError: false,
                isWarn: false,
                isAliasMatch: true,
                leftLineNum: lev.visualIndex,
                rightLineNum: rev.visualIndex,
                leftPrevLineNum: lev.visualIndex,
                rightPrevLineNum: rev.visualIndex,
                leftOrigLineNum: lev.lineNum,
                rightOrigLineNum: rev.lineNum,
                leftPrevOrigLineNum: lev.lineNum,
                rightPrevOrigLineNum: rev.lineNum,
                leftCodeLineNum: lev.codeLineNum,
                rightCodeLineNum: rev.codeLineNum,
                leftUniqueTids: 1,
                rightUniqueTids: 1
            });
        } else {
            results.push({
                key: `${getFormattedEventSig(rev)} [NEW] (#${count + 1})`,
                fileName: rev.fileName || '',
                functionName: rev.functionName || rev.alias,
                preview: rev.preview,
                leftCount: 0,
                rightCount: 1,
                countDiff: 1,
                leftAvgDelta: 0,
                rightAvgDelta: 0,
                deltaDiff: 0,
                isNewError: false,
                isError: false,
                isWarn: false,
                isAliasMatch: true,
                leftLineNum: 0,
                rightLineNum: rev.visualIndex,
                leftPrevLineNum: 0,
                rightPrevLineNum: rev.visualIndex,
                leftOrigLineNum: 0,
                rightOrigLineNum: rev.lineNum,
                leftPrevOrigLineNum: 0,
                rightPrevOrigLineNum: rev.lineNum,
                rightCodeLineNum: rev.codeLineNum,
                leftUniqueTids: 0,
                rightUniqueTids: 1
            });
        }
        rightAliasCounts.set(sig, count + 1);
    });

    return results;
};

/**
 * 🐧⚡ Analyzes intervals between Aliases.
 */
export const computeAliasIntervals = (
    leftAliasEvents: AliasEvent[],
    rightAliasEvents: AliasEvent[]
): SplitAnalysisResult[] => {
    const results: SplitAnalysisResult[] = [];
    const getFormattedEventSig = (ev: AliasEvent) => getFormattedSig(ev.fileName, ev.functionName || ev.alias, ev.codeLineNum, ev.preview);

    const getIntervals = (events: AliasEvent[]) => {
        const intervals: { start: AliasEvent; end: AliasEvent; duration: number; sig: string }[] = [];
        for (let i = 0; i < events.length - 1; i++) {
            const start = events[i];
            const end = events[i + 1];

            // 🐧⚡ [FIX] Repetition of identical signatures (A ➔ A) is fully covered by Global Batch and LCS Burst Grouping
            // Skip to prevent creating meaningless 1:1 intervals. (However, proceed if signatures differ even if Aliases match)
            if (getFormattedEventSig(start) === getFormattedEventSig(end)) continue;

            if (start.timestamp && end.timestamp) {
                intervals.push({
                    start,
                    end,
                    duration: end.timestamp - start.timestamp,
                    sig: `${getFormattedEventSig(start)} ➔ ${getFormattedEventSig(end)}`
                });
            }
        }
        return intervals;
    };

    const leftIntervals = getIntervals(leftAliasEvents);
    const rightIntervals = getIntervals(rightAliasEvents);

    const leftInvMap = new Map<string, typeof leftIntervals>();
    leftIntervals.forEach(inv => {
        const list = leftInvMap.get(inv.sig) || [];
        list.push(inv);
        leftInvMap.set(inv.sig, list);
    });

    const rightInvCounts = new Map<string, number>();
    rightIntervals.forEach(rinv => {
        const count = rightInvCounts.get(rinv.sig) || 0;
        const linv = leftInvMap.get(rinv.sig)?.[count];

        if (linv) {
            results.push({
                key: `${rinv.sig} (#${count + 1})`,
                fileName: rinv.end.fileName || linv.end.fileName || '',
                functionName: rinv.end.functionName || linv.end.functionName || rinv.end.alias,
                preview: `${rinv.start.alias} ... ${rinv.end.alias}`,
                leftCount: 1,
                rightCount: 1,
                countDiff: 0,
                leftAvgDelta: linv.duration,
                rightAvgDelta: rinv.duration,
                deltaDiff: rinv.duration - linv.duration,
                isNewError: false,
                isError: false,
                isWarn: false,
                isAliasInterval: true,
                leftLineNum: linv.end.visualIndex,
                rightLineNum: rinv.end.visualIndex,
                leftPrevLineNum: linv.start.visualIndex,
                rightPrevLineNum: rinv.start.visualIndex,
                leftOrigLineNum: linv.end.lineNum,
                rightOrigLineNum: rinv.end.lineNum,
                leftPrevOrigLineNum: linv.start.lineNum,
                rightPrevOrigLineNum: rinv.start.lineNum,
                leftCodeLineNum: linv.end.codeLineNum,
                rightCodeLineNum: rinv.end.codeLineNum,
                leftUniqueTids: 1,
                rightUniqueTids: 1
            });
        }
        rightInvCounts.set(rinv.sig, count + 1);
    });

    return results;
};

/**
 * 🐧⚡ Calculates from the first occurrence to the last occurrence of the same Alias as one giant segment.
 */
export const computeGlobalAliasRanges = (
    leftAliasEvents: AliasEvent[],
    rightAliasEvents: AliasEvent[]
): SplitAnalysisResult[] => {
    const results: SplitAnalysisResult[] = [];
    const getFormattedEventSig = (ev: AliasEvent) => getFormattedSig(ev.fileName, ev.functionName || ev.alias, ev.codeLineNum, ev.preview);

    const getRanges = (events: AliasEvent[]) => {
        const groups = new Map<string, AliasEvent[]>();
        events.forEach(ev => {
            const sig = ev.alias; // 🐧⚡ Simply grouped by Alias name (position independent)
            const list = groups.get(sig) || [];
            list.push(ev);
            groups.set(sig, list);
        });

        const ranges: { sig: string; first: AliasEvent; last: AliasEvent; duration: number; count: number }[] = [];
        groups.forEach((list, sig) => {
            if (list.length >= 2) {
                const first = list[0];
                const last = list[list.length - 1];
                if (first.timestamp && last.timestamp) {
                    ranges.push({
                        sig,
                        first,
                        last,
                        duration: last.timestamp - first.timestamp,
                        count: list.length
                    });
                }
            }
        });
        return ranges;
    };

    const leftRanges = getRanges(leftAliasEvents);
    const rightRanges = getRanges(rightAliasEvents);

    const leftRangeMap = new Map<string, typeof leftRanges[0]>();
    leftRanges.forEach(r => leftRangeMap.set(r.sig, r));

    // 🐧⚡ Both-side matching and right-side new batch processing
    rightRanges.forEach(rr => {
        const lr = leftRangeMap.get(rr.sig);
        if (lr) {
            results.push({
                key: `${getFormattedEventSig(rr.first)} ➔ ${getFormattedEventSig(rr.last)}`,
                fileName: rr.last.fileName || lr.last.fileName || '',
                functionName: rr.last.functionName || lr.last.functionName || rr.last.alias,
                prevFileName: rr.first.fileName || lr.first.fileName || '',
                prevFunctionName: rr.first.functionName || lr.first.functionName || rr.first.alias,
                preview: `Global Batch: ${rr.first.alias} (First: line ${rr.first.lineNum}) ➔ ${rr.last.alias} (Last: line ${rr.last.lineNum})`,
                leftCount: lr.count,
                rightCount: rr.count,
                countDiff: rr.count - lr.count,
                leftAvgDelta: lr.duration,
                rightAvgDelta: rr.duration,
                deltaDiff: rr.duration - lr.duration,
                isNewError: false,
                isError: false,
                isWarn: false,
                isAliasMatch: true, // ⚠️ For preventing duplicate removal
                isAliasInterval: true,
                isGlobalBatch: true, // 🐧⚡ Global batch indicator
                leftLineNum: lr.last.visualIndex,
                rightLineNum: rr.last.visualIndex,
                leftPrevLineNum: lr.first.visualIndex,
                rightPrevLineNum: rr.first.visualIndex,
                leftOrigLineNum: lr.last.lineNum,
                rightOrigLineNum: rr.last.lineNum,
                leftPrevOrigLineNum: lr.first.lineNum,
                rightPrevOrigLineNum: rr.first.lineNum,
                leftCodeLineNum: lr.last.codeLineNum,
                rightCodeLineNum: rr.last.codeLineNum,
                leftPrevCodeLineNum: lr.first.codeLineNum,
                rightPrevCodeLineNum: rr.first.codeLineNum,
                leftUniqueTids: 1,
                rightUniqueTids: 1
            });
            leftRangeMap.delete(rr.sig); // Processed
        } else {
            results.push({
                key: `${getFormattedEventSig(rr.first)} ➔ ${getFormattedEventSig(rr.last)} [NEW]`,
                fileName: rr.last.fileName || '',
                functionName: rr.last.functionName || rr.last.alias,
                prevFileName: rr.first.fileName || '',
                prevFunctionName: rr.first.functionName || rr.first.alias,
                preview: `Global New: ${rr.first.alias} (First: line ${rr.first.lineNum}) ➔ ${rr.last.alias} (Last: line ${rr.last.lineNum})`,
                leftCount: 0,
                rightCount: rr.count,
                countDiff: rr.count,
                leftAvgDelta: 0,
                rightAvgDelta: rr.duration,
                deltaDiff: 0,
                isNewError: false,
                isError: false,
                isWarn: false,
                isAliasMatch: true,
                isAliasInterval: true,
                isGlobalBatch: true,
                leftLineNum: 0,
                rightLineNum: rr.last.visualIndex,
                leftPrevLineNum: 0,
                rightPrevLineNum: rr.first.visualIndex,
                leftOrigLineNum: 0,
                rightOrigLineNum: rr.last.lineNum,
                leftPrevOrigLineNum: 0,
                rightPrevOrigLineNum: rr.first.lineNum,
                rightCodeLineNum: rr.last.codeLineNum,
                rightPrevCodeLineNum: rr.first.codeLineNum,
                leftUniqueTids: 0,
                rightUniqueTids: 1
            });
        }
    });

    // 🐧⚡ Left-side only batch processing (Optional)
    leftRangeMap.forEach((lr, sig) => {
        results.push({
            key: `${getFormattedEventSig(lr.first)} ➔ ${getFormattedEventSig(lr.last)} [MISSING]`,
            fileName: lr.last.fileName || '',
            functionName: lr.last.functionName || lr.first.alias || sig,
            prevFileName: lr.first.fileName || '',
            prevFunctionName: lr.first.functionName || lr.first.alias || sig,
            preview: `Global Missing: ${lr.first.alias} (First: line ${lr.first.lineNum}) ➔ ${lr.last.alias} (Last: line ${lr.last.lineNum})`,
            leftCount: lr.count,
            rightCount: 0,
            countDiff: -lr.count,
            leftAvgDelta: lr.duration,
            rightAvgDelta: 0,
            deltaDiff: 0,
            isNewError: false,
            isError: false,
            isWarn: false,
            isAliasMatch: true,
            isAliasInterval: true,
            isGlobalBatch: true,
            leftLineNum: lr.last.visualIndex,
            rightLineNum: 0,
            leftPrevLineNum: lr.first.visualIndex,
            rightPrevLineNum: 0,
            leftOrigLineNum: lr.last.lineNum,
            rightOrigLineNum: 0,
            leftPrevOrigLineNum: lr.first.lineNum,
            rightPrevOrigLineNum: 0,
            leftCodeLineNum: lr.last.codeLineNum,
            leftPrevCodeLineNum: lr.first.codeLineNum,
            leftUniqueTids: 1,
            rightUniqueTids: 0
        });
    });

    return results;
};


export interface AggregateMetrics {
    [key: string]: {
        count: number;
        totalDelta: number;
        deltaSamples: number;
        tids: string[];
        preview: string;
        fileName: string;
        functionName: string;
        prevPreview?: string;
        prevFileName?: string;
        prevFunctionName?: string;
        isError: boolean;
        isWarn: boolean;
        lineNum: number;      // visualIndex (for jump)
        prevLineNum: number;  // visualIndex (for jump)
        originalLineNum: number;     // Original line number for display
        prevOriginalLineNum: number; // Original line number for display
        codeLineNum?: string | null;     // Code line number inside the log (e.g. 350)
        prevCodeLineNum?: string | null; // Code line number inside the log
        directCount?: number;            // Actual consecutive log pairing count
    };
}

export interface PointMetrics {
    [sig: string]: {
        count: number;
        fileName: string;
        functionName: string;
        codeLineNum: string | null;
        preview: string;
        tids: string[];
        visualIndices: number[];     // For detailed navigation (< > buttons)
        originalLineNums: number[];  // For display
    };
}

/**
 * 🐧⚡ Checks if it is a 'Significant' log (including filename/function name).
 */
export const isSignificant = (item: { fileName?: string, functionName?: string, alias?: string | null }): boolean => {
    return !!(item.fileName || item.functionName || item.alias);
};

/**
 * 🐧⚡ [NEW DP ALGORITHM] Global sequence alignment based on Needleman-Wunsch 
 * Sorts two giant sequences with O(N*M) optimization to overcome N-gram window limits. 
 */
export const alignSequences = (
    leftSeq: SequenceItem[],
    rightSeq: SequenceItem[]
): SplitAnalysisResult[] => {
    // 1. Find Anchors: Select signatures that appear exactly 1:1 or with the same frequency as anchor candidates 🐧⚡
    const leftCounts = new Map<string, number>();
    const rightCounts = new Map<string, number>();
    
    for (const item of leftSeq) leftCounts.set(item.sig, (leftCounts.get(item.sig) || 0) + 1);
    for (const item of rightSeq) rightCounts.set(item.sig, (rightCounts.get(item.sig) || 0) + 1);
    
    // 1:1 Unique anchors (legacy method)
    const uniqueSigs = new Set<string>();
    for (const [sig, count] of leftCounts) {
        if (count === 1 && rightCounts.get(sig) === 1) {
            uniqueSigs.add(sig);
        }
    }
    
    // 🐧⚡ Repeated anchors: Pair signatures appearing 2+ times on both sides while preserving order (N:M matching)
    // Ex: If OnError is 7 left, 9 right, create 7 1:1 anchors from the front (min(7,9)=7)
    //     -> Remaining 2 on the right stay as unmatched gaps
    //     -> This prevents gap DP from matching with wrong positions
    const repeatedSigLeftIndices = new Map<string, number[]>(); // sig -> leftSeq index array
    const repeatedSigRightIndices = new Map<string, number[]>(); // sig -> rightSeq index array
    for (const [sig, leftCount] of leftCounts) {
        const rightCount = rightCounts.get(sig) ?? 0;
        // 1:1 is handled by uniqueSigs, so exclude (leftCount > 1 && rightCount > 1)
        // Support up to 100 aliases (performance protection)
        if (leftCount > 1 && rightCount > 1 && Math.max(leftCount, rightCount) <= 100) {
            repeatedSigLeftIndices.set(sig, []);
            repeatedSigRightIndices.set(sig, []);
        }
    }
    for (let i = 0; i < leftSeq.length; i++) {
        const sig = leftSeq[i].sig;
        if (repeatedSigLeftIndices.has(sig)) repeatedSigLeftIndices.get(sig)!.push(i);
    }
    for (let j = 0; j < rightSeq.length; j++) {
        const sig = rightSeq[j].sig;
        if (repeatedSigRightIndices.has(sig)) repeatedSigRightIndices.get(sig)!.push(j);
    }
    
    // Extract indices of uniqueSigs from leftSeq (sig -> index map)
    const leftUniqueIdx = new Map<string, number>();
    for (let i = 0; i < leftSeq.length; i++) {
        if (uniqueSigs.has(leftSeq[i].sig)) {
            leftUniqueIdx.set(leftSeq[i].sig, i);
        }
    }
    
    // Traverse rightSeq to map leftIdx (Unique anchor search)
    const matches: { leftIdx: number, rightIdx: number }[] = [];
    for (let j = 0; j < rightSeq.length; j++) {
        const sig = rightSeq[j].sig;
        if (uniqueSigs.has(sig) && leftUniqueIdx.has(sig)) {
            matches.push({ leftIdx: leftUniqueIdx.get(sig)!, rightIdx: j });
        }
    }
    // 🐧⚡ Added repeated anchor pairing (Preserving N:M matching order)
    for (const [sig, leftIdxArr] of repeatedSigLeftIndices) {
        const rightIdxArr = repeatedSigRightIndices.get(sig)!;
        const pairCount = Math.min(leftIdxArr.length, rightIdxArr.length);
        for (let k = 0; k < pairCount; k++) {
            matches.push({ leftIdx: leftIdxArr[k], rightIdx: rightIdxArr[k] });
        }
    }
    
    // 🐧⚡ Must sort by rightIdx before LIS calculation (since repeated anchors were added randomly at the end)
    // Originally unique anchors were sorted by traversing rightSeq, but order broke as repeated anchors were added
    matches.sort((a, b) => a.rightIdx - b.rightIdx);
    
    // Extract the longest non-intersecting anchor sequence via LIS algorithm (based on leftIdx)
    const anchors = computeLIS(matches);
    
    const aggregatedMatches: { left: SequenceItem, right: SequenceItem }[] = [];
    
    // Add virtual start/end anchors
    anchors.unshift({ leftIdx: -1, rightIdx: -1 });
    anchors.push({ leftIdx: leftSeq.length, rightIdx: rightSeq.length });
    
    // Fills gaps between anchors with O(N*M) DP and merges them.
    for (let i = 0; i < anchors.length - 1; i++) {
        const startAnchor = anchors[i];
        const endAnchor = anchors[i + 1];
        
        if (startAnchor.leftIdx !== -1) {
            aggregatedMatches.push({ left: leftSeq[startAnchor.leftIdx], right: rightSeq[startAnchor.rightIdx] });
        }
        
        const L_start = startAnchor.leftIdx + 1;
        const L_end = endAnchor.leftIdx - 1;
        const R_start = startAnchor.rightIdx + 1;
        const R_end = endAnchor.rightIdx - 1;
        
        if (L_start <= L_end || R_start <= R_end) {
            const gapMatches = alignGapDP(leftSeq, rightSeq, L_start, L_end, R_start, R_end);
            for (const gm of gapMatches) {
                aggregatedMatches.push(gm);
            }
        }
    }
    
    // 2-1. Generate order-guaranteed result list (Based on aggregatedMatches order) 🐧⚡
    const rawResults: SplitAnalysisResult[] = [];
    const seenIntervals = new Set<string>();
    for (let i = 1; i < aggregatedMatches.length; i++) {
        const prev = aggregatedMatches[i-1];
        const curr = aggregatedMatches[i];
        const key = `${prev.left.sig} ➔ ${curr.left.sig}`;
        
        // Push metrics info at that point in order (skip if key is already accumulated in metrics object)
        // However, since 'consecutive' identical intervals must be grouped, handle separately if positions differ even if keys match
        // Therefore, instead of metrics object access, create Result objects on the fly here to build the raw list
        
        let leftDelta = 0;
        let rightDelta = 0;
        if (curr.left.timestamp !== null && prev.left.timestamp !== null) {
            leftDelta = curr.left.timestamp - prev.left.timestamp;
            if (leftDelta < 0 || leftDelta > 3600000) leftDelta = 0;
        }
        if (curr.right.timestamp !== null && prev.right.timestamp !== null) {
            rightDelta = curr.right.timestamp - prev.right.timestamp;
            if (rightDelta < 0 || rightDelta > 3600000) rightDelta = 0;
        }

        rawResults.push({
            key,
            fileName: curr.right.fileName || curr.left.fileName,
            functionName: curr.right.functionName || curr.left.functionName,
            preview: curr.right.preview || curr.left.preview,
            leftCount: 1,
            rightCount: 1,
            countDiff: 0,
            leftAvgDelta: leftDelta,
            rightAvgDelta: rightDelta,
            deltaDiff: rightDelta - leftDelta,
            isNewError: false,
            isError: curr.left.isError || curr.right.isError,
            isWarn: curr.left.isWarn || curr.right.isWarn,
            
            leftLineNum: curr.left.lineNum,
            rightLineNum: curr.right.lineNum,
            leftPrevLineNum: prev.left.lineNum,
            rightPrevLineNum: prev.right.lineNum,
            leftOrigLineNum: curr.left.originalLineNum,
            rightOrigLineNum: curr.right.originalLineNum,
            leftPrevOrigLineNum: prev.left.originalLineNum,
            rightPrevOrigLineNum: prev.right.originalLineNum,
            
            leftCodeLineNum: curr.left.codeLineNum,
            rightCodeLineNum: curr.right.codeLineNum,
            leftPrevCodeLineNum: prev.left.codeLineNum,
            rightPrevCodeLineNum: prev.right.codeLineNum,
            
            prevFileName: prev.right.fileName || prev.left.fileName,
            prevFunctionName: prev.right.functionName || prev.left.functionName
        });
    }
    
    // 3. Extract Unmatched NEW ERRORS from rightSeq
    const matchedRightSet = new Set<number>();
    for (const m of aggregatedMatches) matchedRightSet.add(m.right.lineNum);
    
    for (const rItem of rightSeq) {
        if (!matchedRightSet.has(rItem.lineNum) && rItem.isError) {
            const key = `NEW_ERROR_${rItem.sig}_${rItem.lineNum}`;
            rawResults.push({
                key,
                fileName: rItem.fileName,
                functionName: rItem.functionName,
                preview: rItem.preview,
                leftCount: 0,
                rightCount: 1,
                countDiff: 1,
                leftAvgDelta: 0,
                rightAvgDelta: 0,
                deltaDiff: 0,
                isNewError: true,
                isError: true,
                isWarn: false,
                leftLineNum: -1,
                rightLineNum: rItem.lineNum,
                leftPrevLineNum: -1,
                rightPrevLineNum: Math.max(0, rItem.lineNum - 1),
                leftOrigLineNum: -1,
                rightOrigLineNum: rItem.originalLineNum,
                leftPrevOrigLineNum: -1,
                rightPrevOrigLineNum: Math.max(0, rItem.originalLineNum - 1),
                prevFileName: '',
                prevFunctionName: ''
            });
        }
    }

    // 4. Post-processing: Group consecutive identical signature matching results (Burst/N-repeats) 🐧⚡
    const finalizedResults: SplitAnalysisResult[] = [];
    if (rawResults.length > 0) {
        let currentGroup: SplitAnalysisResult | null = null;
        let groupCount = 0;

        for (let i = 0; i < rawResults.length; i++) {
            const res = rawResults[i];
            
            // Try merging if it is an Interval match and has the same signature (Key) as the previous group
            // (Merge only regular DP matching sections without touching AliasMatch or NewError)
            const canGroup = currentGroup && 
                             !res.isAliasMatch && !res.isAliasInterval && !res.isNewError &&
                             !currentGroup.isAliasMatch && !currentGroup.isAliasInterval && !currentGroup.isNewError &&
                             res.key === currentGroup.key;

            if (canGroup && currentGroup) {
                groupCount++;
                currentGroup.isBurst = true;
                currentGroup.burstCount = groupCount;
                
                // Accumulate duration and counts
                currentGroup.leftAvgDelta += res.leftAvgDelta;
                currentGroup.rightAvgDelta += res.rightAvgDelta;
                currentGroup.deltaDiff = currentGroup.rightAvgDelta - currentGroup.leftAvgDelta;
                currentGroup.leftCount += res.leftCount;
                currentGroup.rightCount += res.rightCount;
                currentGroup.countDiff = currentGroup.rightCount - currentGroup.leftCount;
                
                // 🐧⚡ Jump position (lineNum) maintains the first occurrence position!
                // Burst end position is stored in a separate field
                currentGroup.burstEndLineNum = res.rightLineNum;
                currentGroup.burstEndOrigLineNum = res.rightOrigLineNum;
                currentGroup.burstEndLeftLineNum = res.leftLineNum;
                currentGroup.burstEndLeftOrigLineNum = res.leftOrigLineNum;
            } else {
                if (currentGroup) {
                    finalizedResults.push(currentGroup);
                }
                currentGroup = { ...res };
                groupCount = 1;
            }
        }
        if (currentGroup) {
            finalizedResults.push(currentGroup);
        }
    }

    return finalizedResults;
};

// --- HLEPERS ---

function computeLIS(matches: { leftIdx: number, rightIdx: number }[]): { leftIdx: number, rightIdx: number }[] {
    const n = matches.length;
    if (n === 0) return [];
    
    const dp = new Int32Array(n);
    const prev = new Int32Array(n);
    let len = 0;
    
    for (let i = 0; i < n; i++) {
        const val = matches[i].leftIdx;
        let low = 0, high = len - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (matches[dp[mid]].leftIdx < val) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        const pos = low;
        prev[i] = pos > 0 ? dp[pos - 1] : -1;
        dp[pos] = i;
        if (pos === len) len++;
    }
    
    const result: { leftIdx: number, rightIdx: number }[] = [];
    let curr = dp[len - 1];
    while (curr !== -1) {
        result.push(matches[curr]);
        curr = prev[curr];
    }
    return result.reverse();
}

function alignGapDP(
    leftSeq: SequenceItem[], rightSeq: SequenceItem[],
    ls: number, le: number, rs: number, re: number
): { left: SequenceItem, right: SequenceItem }[] {
    const results: { left: SequenceItem, right: SequenceItem }[] = [];
    
    // Simple optimization: common prefix matching
    while (ls <= le && rs <= re && leftSeq[ls].sig === rightSeq[rs].sig) {
        results.push({ left: leftSeq[ls], right: rightSeq[rs] });
        ls++; rs++;
    }
    // Simple optimization: common suffix matching
    const suffixes: { left: SequenceItem, right: SequenceItem }[] = [];
    while (ls <= le && rs <= re && leftSeq[le].sig === rightSeq[re].sig) {
        suffixes.unshift({ left: leftSeq[le], right: rightSeq[re] });
        le--; re--;
    }
    
    const N = le - ls + 1;
    const M = re - rs + 1;
    
    if (N > 0 && M > 0) {
        // [LIMIT CAP] DP too long will cause OOM. Hard cap
        if (N * M > 25000000) {
            console.warn(`[SplitAnalysis] Gap too large for DP (${N}x${M}). Falling back to greedy matching.`);
            let currR = rs;
            for (let i = ls; i <= le; i++) {
                for (let j = currR; j <= re; j++) {
                    if (leftSeq[i].sig === rightSeq[j].sig) {
                        results.push({ left: leftSeq[i], right: rightSeq[j] });
                        currR = j + 1;
                        break;
                    }
                }
            }
        } else {
            // Needleman-Wunsch / LCS (Only Matches)
            const dp = new Int32Array((N + 1) * (M + 1));
            
            for (let i = 1; i <= N; i++) {
                for (let j = 1; j <= M; j++) {
                    if (leftSeq[ls + i - 1].sig === rightSeq[rs + j - 1].sig) {
                        dp[i * (M + 1) + j] = dp[(i - 1) * (M + 1) + (j - 1)] + 1;
                    } else {
                        dp[i * (M + 1) + j] = Math.max(dp[(i - 1) * (M + 1) + j], dp[i * (M + 1) + (j - 1)]);
                    }
                }
            }
            
            // Backtrack
            let i = N;
            let j = M;
            const dpResults: { left: SequenceItem, right: SequenceItem }[] = [];
            while (i > 0 && j > 0) {
                // 🐧⚡ (Core Fix) Skip actual match adoption if DP table value is the same as the previous value
                // Since backtracking from the end, "skipping if possible"
                // Forces matching with the first A instead of the second in [A] vs [A, A] scenarios
                if (dp[i * (M + 1) + j] === dp[(i - 1) * (M + 1) + j]) {
                    i--;
                } else if (dp[i * (M + 1) + j] === dp[i * (M + 1) + (j - 1)]) {
                    j--;
                } else {
                    // Only pair at the point where DP value decreases (the one that actually added +1 to the common length)
                    dpResults.unshift({ left: leftSeq[ls + i - 1], right: rightSeq[rs + j - 1] });
                    i--; j--;
                }
            }
            for (const dpR of dpResults) results.push(dpR);
        }
    }
    
    for (const suf of suffixes) results.push(suf);
    return results;
};
