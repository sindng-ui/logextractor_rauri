import { LogRule, HappyGroup } from '../types';
import { extractTimestamp } from './logTime';
import { extractTransactionIds } from './transactionAnalysis';

export interface AnalysisSegment {
    id: string;
    name: string;
    startTime: number;
    endTime: number;
    duration: number;
    startLine: number;
    endLine: number;
    originalStartLine: number;
    originalEndLine: number;
    type: 'combo' | 'manual' | 'step';

    status: 'pass' | 'fail';
    logs: string[]; // Stores [startLineContent, endLineContent] for combos
    lane?: number;
    color?: string; // Color based on name hash (Speedscope style)
    dangerColor?: string; // Color based on danger thresholds

    // Enhanced Metadata
    tid?: string;
    fileName?: string;
    functionName?: string;
    endFileName?: string;
    endFunctionName?: string;
    intervalIndex?: number;
    selfTime?: number; // Self execution time (excluding children)
}

export interface AnalysisResult {
    fileName: string;
    totalDuration: number;
    segments: AnalysisSegment[];
    startTime: number;
    endTime: number;
    logCount: number;
    passCount: number;
    failCount: number;
    bottlenecks: AnalysisSegment[];
    perfThreshold: number;
    functionStats?: Record<string, { totalTime: number; selfTime: number; count: number }>;
    lineOffsets?: [number, number][];
}

/**
 * Extracts potential PID and TID from a log line.
 * Used for automated PID discovery in PerfTool.
 */
export const extractLogIds = (line: string): { pid: string | null, tid: string | null } => {
    let pid: string | null = null;
    let tid: string | null = null;

    // Rule: We should only search for PID/TID to the left of the file name if it exists.
    // This prevents false positives from strings inside the payload or function names (e.g. functionName(223))
    let searchTarget = line;
    const fileMatch = line.match(/([\w\-\.]+\.(?:cs|cpp|h|java|kt|js|ts|tsx|py|c|h|cc|hpp|m|mm))\s*:/i);
    if (fileMatch) {
        searchTarget = line.substring(0, fileMatch.index);
    }

    // 1. (P 123, T 456) or (T 456, P 123) or (123, 456)
    const parenMatch = searchTarget.match(/\(\s*(?:P\s*)?(\d+)\s*[,:\s-]\s*(?:T\s*)?(\d+)\s*\)/i);
    if (parenMatch) {
        pid = parenMatch[1];
        tid = parenMatch[2];
    } else {
        // 2. [PID:TID] or [PID TID] or [PID-TID]
        const bracketMatch = searchTarget.match(/\[\s*(\d+)\s*[:\s-]\s*(\d+)\s*\]/);
        if (bracketMatch) {
            pid = bracketMatch[1];
            tid = bracketMatch[2];
        } else {
            // 3. Android/Tizen Standard: Date Time PID TID ... or DecimalTime PID TID
            const androidMatch = searchTarget.match(/^\s*(?:\d{2}-\d{2}\s+)?\d{2}:\d{2}:\d{2}\.\d{3}\s+(\d+)\s+(\d+)\s+/) ||
                searchTarget.match(/^\s*\d+\.\d{3}\s+(\d+)\s+(\d+)\s+/);
            if (androidMatch) {
                pid = androidMatch[1];
                tid = androidMatch[2];
            }
        }
    }

    // 4. Handle T/P or P/T combined (Common in some Tizen/embedded formats)
    const combinedMatch = searchTarget.match(/(?:T\/P|P\/T)[\s:]*(\d+)/i);
    if (combinedMatch) {
        if (!pid) pid = combinedMatch[1];
        if (!tid) tid = combinedMatch[1];
    }

    // Fallback for individual labels if not found in pairs
    if (!pid) {
        const pMatch = searchTarget.match(/(?:P\s*|PID[:\s]|ProcessId[:\s])(\d+)/i);
        if (pMatch) pid = pMatch[1];
    }
    if (!tid) {
        const tMatch = searchTarget.match(/(?:T\s*|TID[:\s]|ThreadId[:\s])(\d+)/i);
        if (tMatch) tid = tMatch[1];
    }

    // Final fallback for simple brackets [1234] if nothing else found
    if (!pid && !tid) {
        const simpleBracket = searchTarget.match(/\[\s*(\d+)\s*\]/);
        if (simpleBracket) pid = simpleBracket[1];
    }

    return { pid, tid };
};

/**
 * [SpeedScope Style] Generates a consistent HSL color based on a string (function name).
 * Uses a simple but fast hash to ensure stable colors across sessions.
 */
export const getSegmentColor = (name: string): string => {
    if (!name) return '#64748b'; // Default slate
    
    // 1. Simple fast hash
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (hash << 5) - hash + name.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }

    // 2. Generate HSL (Speedscope typically uses a certain range)
    // Hue: 0-360
    // Saturation: 15-30% (Deep Muted)
    // Lightness: 20-35% (Dark/Muted like real Speedscope)
    const h = Math.abs(hash % 360);
    const s = 15 + (Math.abs(hash >> 8) % 15);
    const l = 20 + (Math.abs(hash >> 16) % 15);

    return `hsl(${h}, ${s}%, ${l}%)`;
};

// ✅ [HYPER-PERFORMANCE] Extensions for fast metadata parsing
const EXT_SET = new Set(['cs', 'cpp', 'h', 'java', 'kt', 'js', 'ts', 'tsx', 'py', 'c', 'cc', 'hpp', 'm', 'mm']);

/**
 * Extracts source metadata (filename, function name, and code line number) from a log line.
 * Standard format: FileName.ext: FunctionName(Line)>
 * ✅ [HYPER-OPTIMIZED V3] 정밀 소스 추출 (파일명, 함수명, 라인번호)
 */
export const extractSourceMetadata = (line: string): { fileName: string | null, functionName: string | null, codeLineNum?: string | null } => {
    // 1. 필수 마커 '>' 탐색
    const markerIndex = line.indexOf('>', 0);
    if (markerIndex === -1 || markerIndex > 400) return { fileName: null, functionName: null, codeLineNum: null };

    // 2. 콜론(:) 탐색 및 파일 정보 추출
    let searchPos = 0;

    while (searchPos < line.length) {
        const colonIndex = line.indexOf(':', searchPos);
        if (colonIndex === -1 || (markerIndex !== -1 && colonIndex >= markerIndex)) break;

        // 콜론 앞의 텍스트가 파일명 형식인지 확인
        let fileStartIndex = colonIndex - 1;
        while (fileStartIndex >= 0 && (line[fileStartIndex] === ' ' || line[fileStartIndex] === '\t')) fileStartIndex--;

        let endOfFileName = fileStartIndex + 1;
        let hasDot = false;
        while (fileStartIndex >= 0) {
            const char = line[fileStartIndex];
            if (char === '.') hasDot = true;
            if (char === ' ' || char === '[' || char === '(' || char === '<' || char === '/' || char === '|' || char === ',' || char === '\t') {
                break;
            }
            fileStartIndex--;
        }
        fileStartIndex++;

        const rawFile = line.substring(fileStartIndex, endOfFileName).trim();
        if (rawFile.length >= 3 && hasDot) {
            const dotIdx = rawFile.lastIndexOf('.');
            const ext = rawFile.substring(dotIdx + 1).toLowerCase();
            if (EXT_SET.has(ext)) {
                // 파일 발견!
                const fileName = rawFile;
                // markerIndex가 없거나 콜론보다 뒤에 있는 경우 탐색
                const limit = markerIndex === -1 ? Math.min(line.length, colonIndex + 200) : markerIndex;
                let rest = line.substring(colonIndex + 1, limit).trim();

                let functionName = rest;
                let codeLineNum: string | null = null;

                // [OPTIMIZED] 함수명(라인) 추출 - Regex 대신 문자열 탐색으로 1M 라인 처리 속도 향상
                const openParen = rest.lastIndexOf('(');
                if (openParen !== -1) {
                    const closeParen = rest.indexOf(')', openParen);
                    if (closeParen !== -1 && closeParen > openParen) {
                        const potentialLine = rest.substring(openParen + 1, closeParen);
                        // 라인 번호가 숫자로만 구성되어 있는지 수동 체크 (isNaN보다 빠름)
                        let isNumeric = potentialLine.length > 0;
                        for (let k = 0; k < potentialLine.length; k++) {
                            const c = potentialLine[k];
                            if (c < '0' || c > '9') {
                                isNumeric = false;
                                break;
                            }
                        }
                        if (isNumeric) {
                            functionName = rest.substring(0, openParen).trim();
                            codeLineNum = potentialLine;
                        }
                    }
                }

                return { fileName, functionName, codeLineNum };
            }
        }

        searchPos = colonIndex + 1;
    }

    return { fileName: null, functionName: null, codeLineNum: null };
};

/**
 * Core performance analysis logic extracted from PerfAnalyzer.
 * Can be run in the main thread or worker.
 */
export const analyzePerfSegments = (
    lines: string[],
    lineIndices: number[], // Actual line numbers in the original file
    rule: LogRule,
    targetTime: number,
    isHappyCS: boolean
): AnalysisSegment[] => {
    const segments: AnalysisSegment[] = [];

    // 1. Filter Aliased Groups
    const validGroups = rule.happyGroups?.filter(g => g.enabled && g.alias && g.tags.length > 0) || [];

    if (validGroups.length === 0) return [];

    // 2. Collection Phase
    interface MatchedLog {
        timestamp: number;
        lineIndex: number;
        content: string;
        alias: string;
        tag: string;
        tid: string;
    }

    const matchedLogs: MatchedLog[] = [];

    for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        const lineLower = isHappyCS ? '' : line.toLowerCase();

        let foundGroup: HappyGroup | null = null;
        for (const g of validGroups) {
            const matched = g.tags.every(tag => isHappyCS ? line.includes(tag) : lineLower.includes(tag.toLowerCase()));
            if (matched) {
                foundGroup = g;
                break;
            }
        }

        if (!foundGroup) continue;

        const ts = extractTimestamp(line);
        if (ts === null) continue;

        matchedLogs.push({
            timestamp: ts,
            lineIndex: lineIndices[idx],
            content: line,
            alias: foundGroup.alias!.trim(),
            tag: foundGroup.tags[0],
            tid: extractLogIds(line).tid || 'Main'
        });
    }

    if (matchedLogs.length === 0) return [];

    // 3. Global Grouping by Alias (User Request: "OnCreate group section")
    const groupsByAlias = new Map<string, MatchedLog[]>();
    matchedLogs.forEach(log => {
        if (!groupsByAlias.has(log.alias)) groupsByAlias.set(log.alias, []);
        groupsByAlias.get(log.alias)!.push(log);
    });

    groupsByAlias.forEach((logs, alias) => {
        if (logs.length < 2) return; // ✅ Skip single-hit aliases as they don't form a duration/range

        const start = logs[0];
        const end = logs[logs.length - 1];
        const duration = end.timestamp - start.timestamp;

        segments.push({
            id: `group-${alias}-${Math.random().toString(36).substring(7)}`,
            name: `${alias} (Group)`,
            startTime: start.timestamp,
            endTime: end.timestamp,
            duration: duration,
            startLine: start.lineIndex,
            endLine: end.lineIndex,
            originalStartLine: start.lineIndex,
            originalEndLine: end.lineIndex,
            type: 'step',
            status: duration >= targetTime ? 'fail' : 'pass',
            logs: [start.content, end.content],
            tid: start.tid,
            dangerColor: rule.dangerThresholds?.[0]
                ? [...rule.dangerThresholds].sort((a, b) => b.ms - a.ms).find(d => duration >= d.ms)?.color
                : undefined
        });
    });

    // 4. Interval Segments: Flow between every consecutive match (A -> B, B -> C...)
    // This provides the "Transitions" the user asked for.
    for (let i = 0; i < matchedLogs.length - 1; i++) {
        const current = matchedLogs[i];
        const next = matchedLogs[i + 1];
        const duration = next.timestamp - current.timestamp;

        segments.push({
            id: `interval-${i}-${Math.random().toString(36).substring(7)}`,
            name: `${current.alias} → ${next.alias}`,
            startTime: current.timestamp,
            endTime: next.timestamp,
            duration: duration,
            startLine: current.lineIndex,
            endLine: next.lineIndex,
            originalStartLine: current.lineIndex, // Use visual index as fallback
            originalEndLine: next.lineIndex,     // Use visual index as fallback
            type: 'combo',
            status: duration >= targetTime ? 'fail' : 'pass',
            logs: [current.content, next.content],
            tid: current.tid,
            dangerColor: rule.dangerThresholds?.[0] ? [...rule.dangerThresholds].sort((a, b) => b.ms - a.ms).find(d => duration >= d.ms)?.color : undefined
        });
    }

    // 5. Lane Assignment (for Flame Chart)
    // Group segments by TID first, then pack them within Tid-specific bands
    const segmentsByTid = new Map<string, AnalysisSegment[]>();
    segments.forEach(s => {
        const tid = s.tid || 'Main';
        if (!segmentsByTid.has(tid)) segmentsByTid.set(tid, []);
        segmentsByTid.get(tid)!.push(s);
    });

    const sortedTids = Array.from(segmentsByTid.keys()).sort((a, b) => {
        if (a === 'Main') return -1;
        if (b === 'Main') return 1;
        return a.localeCompare(b);
    });

    let currentLaneOffset = 0;
    sortedTids.forEach(tid => {
        const tidSegments = segmentsByTid.get(tid)!;
        tidSegments.sort((a, b) => a.startTime - b.startTime || b.duration - a.duration);

        const localLanes: { endTime: number }[] = [];
        tidSegments.forEach(s => {
            let laneIndex = localLanes.findIndex(l => l.endTime <= s.startTime);
            if (laneIndex === -1) {
                laneIndex = localLanes.length;
                localLanes.push({ endTime: s.endTime });
            } else {
                localLanes[laneIndex].endTime = s.endTime;
            }
            s.lane = currentLaneOffset + laneIndex;
        });

        currentLaneOffset += localLanes.length;
    });

    return segments;
};
