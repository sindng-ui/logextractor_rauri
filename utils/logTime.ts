
/**
 * Utility for parsing timestamps from log lines and formatting durations.
 */

// Regex patterns for common log timestamp formats
const TIME_PATTERNS = [
    // 1. Standard: "MM-DD HH:mm:ss.mss" or "YYYY-MM-DD HH:mm:ss.mss"
    // Matches: 01-01 12:00:00.123, 2024-01-01 12:00:00.123
    /(\d{2}-\d{2}\s+)?\d{2}:\d{2}:\d{2}\.\d{3}/,

    // 2. Simple Time: "HH:mm:ss"
    // Matches: 12:00:00
    /\d{2}:\d{2}:\d{2}/,

    // 3. Kernel Time: "[ 123.456]" (seconds.microseconds)
    // Matches: [ 1234.567890], [  12.345]
    /^\s*\[\s*(\d+\.\d+)\s*\]/
];

export const extractTimestamp = (line: string): number | null => {
    if (!line) return null;

    // Determine the boundary of the header to avoid picking up large numbers
    // in the log message as timestamps (e.g., "Value: 200000.0").
    // We prioritize " > " as a strong indicator of the message start.
    let boundary = 256;
    const arrowIdx = line.indexOf(' > ');
    if (arrowIdx !== -1) {
        boundary = arrowIdx;
    } else {
        // Fallback to ": " but only if it's not too early (likely a prefix like "aaaa: ")
        // or if it's following a common "thread-like" pattern.
        const colonSpaceIdx = line.indexOf(': ');
        // If colon is within first 16 chars, it's often a label/prefix, ignore it as boundary
        if (colonSpaceIdx !== -1 && colonSpaceIdx < boundary && colonSpaceIdx > 16) {
            boundary = colonSpaceIdx;
        }
    }

    // End of C#-style or other source metadata: FileName.cs:Func()>
    const metaEndIdx = line.indexOf(')>');
    if (metaEndIdx !== -1 && (metaEndIdx + 2) < 256) {
        // If meta end exists, we can search up to it if it's further than current boundary
        if (metaEndIdx + 2 > boundary) boundary = metaEndIdx + 2;
    }

    const preamble = line.substring(0, boundary);
    const candidates: { value: number; index: number }[] = [];

    const stdRegex = /(\d{4}-)?(\d{2}-\d{2}\s+)?(\d{2}:\d{2}:\d{2}\.\d{3})/g;
    let match;
    const stdRanges: { start: number, end: number }[] = [];

    while ((match = stdRegex.exec(preamble)) !== null) {
        stdRanges.push({ start: match.index, end: match.index + match[0].length });

        const now = new Date();
        let year = now.getFullYear();
        let month = now.getMonth();
        let day = now.getDate();

        if (match[1]) year = parseInt(match[1], 10);
        if (match[2]) {
            const dateParts = match[2].trim().split('-');
            if (dateParts.length === 2) {
                month = parseInt(dateParts[0], 10) - 1;
                day = parseInt(dateParts[1], 10);
            }
        }

        const timePart = match[3];
        const h = parseInt(timePart.substring(0, 2), 10);
        const m = parseInt(timePart.substring(3, 5), 10);
        const s = parseInt(timePart.substring(6, 8), 10);
        const ms = parseInt(timePart.substring(9, 12), 10);

        const val = new Date(year, month, day, h, m, s, ms).getTime();
        candidates.push({ value: val, index: match.index });
    }

    // 2. Monotonic / Seconds-Dot-Milliseconds (e.g. 12345.6789)
    // Matches if preceded by space, start, colon, or bracket
    // This catches the second time in "[Date] service: 123.456"
    const monoRegex = /(?:^|\s|[:]\s*|\[\s*)(\d+\.\d{3,})(?:\s|\]|:|$)/g;
    while ((match = monoRegex.exec(preamble)) !== null) {
        const val = parseFloat(match[1]);
        if (!isNaN(val)) {
            // Calculate actual index of the digits
            const digitIdx = match.index + match[0].indexOf(match[1]);
            const isInsideStd = stdRanges.some(r => digitIdx >= r.start && digitIdx < r.end);
            if (!isInsideStd) {
                candidates.push({ value: val * 1000, index: digitIdx });
            }
        }
    }

    // 3. Simple Monotonic at start or in brackets (2 decimal places fallback)
    const simpleMonoRegex = /^\s*(?:\[\s*)?(\d+\.\d{1,2})(?:\s*\])?/g;
    while ((match = simpleMonoRegex.exec(preamble)) !== null) {
        const val = parseFloat(match[1]);
        if (!isNaN(val)) {
            const digitIdx = match.index + match[0].indexOf(match[1]);
            const isInsideStd = stdRanges.some(r => digitIdx >= r.start && digitIdx < r.end);
            if (!isInsideStd) {
                candidates.push({ value: val * 1000, index: digitIdx });
            }
        }
    }

    if (candidates.length === 0) return null;

    // Sort by index descending (rightmost first)
    candidates.sort((a, b) => b.index - a.index);
    return candidates[0].value;
};

/**
 * Formats a duration in milliseconds into a human-readable string.
 * Format: "1h 2m 3s 45ms"
 */
export const formatDuration = (ms: number): string => {
    if (ms < 0) ms = -ms;
    if (ms === 0) return '0ms';

    const time = Math.abs(ms);

    // Less than 1 second
    if (time < 1000) {
        return `${Math.round(time)}ms`;
    }

    const seconds = Math.floor(time / 1000);
    const milliseconds = Math.round(time % 1000);

    // Less than 1 minute
    if (seconds < 60) {
        return milliseconds > 0
            ? `${seconds}s ${milliseconds}ms`
            : `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    // Less than 1 hour
    if (minutes < 60) {
        return remainingSeconds > 0
            ? `${minutes}m ${remainingSeconds}s`
            : `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return remainingMinutes > 0
        ? `${hours}h ${remainingMinutes}m`
        : `${hours}h`;
};
