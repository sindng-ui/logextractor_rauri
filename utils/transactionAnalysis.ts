
/**
 * Transaction Analysis Utilities
 */

import { extractTimestamp } from './logTime';

export interface TransactionIdentity {
    type: 'pid' | 'tid' | 'tag';
    value: string;
}

/**
 * Extracts potential transaction IDs from a log line
 * Handles standard Tizen/Android formats and variations
 */
export const extractTransactionIds = (line: string): TransactionIdentity[] => {
    const identities: TransactionIdentity[] = [];

    let searchTarget = line;
    const fileMatch = line.match(/([\w\-\.]+\.(?:cs|cpp|h|java|kt|js|ts|tsx|py|c|h|cc|hpp|m|mm))\s*:/i);
    if (fileMatch) {
        searchTarget = line.substring(0, fileMatch.index);
    }

    // 1. Standard Tizen/Android Format: "02-16 09:46:13.123  1234  5678 I Tag: Message"
    // Regex matches: [Optional Date] Time PID TID Level Tag:
    const standardMatch = searchTarget.match(/(?:\d{2}-\d{2}\s+)?\d{2}:\d{2}:\d{2}\.\d{3}\s+([0-9]+)\s+([0-9]+)\s+[VDIWE]\s+([^:]+):/);
    if (standardMatch) {
        identities.push({ type: 'pid', value: standardMatch[1] });
        identities.push({ type: 'tid', value: standardMatch[2] });
        identities.push({ type: 'tag', value: standardMatch[3].trim() });
    }

    // 2. Bracket/Alternative Format: "[ 1234: 5678] I/Tag: Message" or "09:46:13.123 1234-5678 Tag: Message"
    const bracketMatch = searchTarget.match(/\[\s*(\d+)\s*[:\s-]\s*(\d+)\s*\]|(\d+)\s*-\s*(\d+)\s+([VDIWE])\s+([^:]+):/);
    if (bracketMatch) {
        if (bracketMatch[1]) {
            identities.push({ type: 'pid', value: bracketMatch[1] });
            identities.push({ type: 'tid', value: bracketMatch[2] });
        } else if (bracketMatch[3]) {
            identities.push({ type: 'pid', value: bracketMatch[3] });
            identities.push({ type: 'tid', value: bracketMatch[4] });
            identities.push({ type: 'tag', value: (bracketMatch[6] || '').trim() });
        }
    }

    // 3. Simple Tag Pattern: "V/TagName( 1234): Message" or "V/TagName (P 123, T 333) Message"
    const simpleTagMatch = searchTarget.match(/([VDIWE])\/([^(: \t]+)\s*(?:\(\s*(\d+)\s*\)|\((P\s*\d+),\s*(T\s*\d+)\))?/);
    if (simpleTagMatch) {
        identities.push({ type: 'tag', value: simpleTagMatch[2].trim() });
        if (simpleTagMatch[3]) identities.push({ type: 'pid', value: simpleTagMatch[3].trim() });
        if (simpleTagMatch[4]) identities.push({ type: 'pid', value: simpleTagMatch[4].replace(/\s+/g, '') });
        if (simpleTagMatch[5]) identities.push({ type: 'tid', value: simpleTagMatch[5].replace(/\s+/g, '') });
    }

    // 4. Numeric or Alphanumeric brackets anywhere: "[22]" or "(P 123, T 333)"
    const bracketMatches = Array.from(searchTarget.matchAll(/[(\[]\s*(P\s*\d+|T\s*\d+|[a-zA-Z0-9_-]{3,})\s*[)\]]/g));
    for (const match of bracketMatches) {
        const val = match[1].trim();
        if (val.startsWith('P')) identities.push({ type: 'pid', value: val.replace(/\s+/g, '') });
        else if (val.startsWith('T')) identities.push({ type: 'tid', value: val.replace(/\s+/g, '') });
        else if (/^\d+$/.test(val) && val.length >= 2) identities.push({ type: 'tid', value: val });
    }

    if (identities.length > 0) {
        console.log(`[TransactionAnalysis] Found ${identities.length} potential IDs:`, identities);
    } else {
        console.log(`[TransactionAnalysis] No IDs found for line: "${line.substring(0, 50)}..."`);
    }

    // Deduplicate
    const seen = new Set<string>();
    return identities.filter(id => {
        if (!id.value) return false;
        const key = `${id.type}:${id.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

/**
 * Calculates time difference between two log lines
 */
export const calculateTimeDiff = (lineA: string, lineB: string): string | null => {
    const timeA = extractTimestamp(lineA);
    const timeB = extractTimestamp(lineB);

    if (timeA === null || timeB === null) return null;

    const diffMs = Math.abs(timeB - timeA);

    if (diffMs < 1000) return `+${diffMs}ms`;
    if (diffMs < 60000) return `+${(diffMs / 1000).toFixed(2)}s`;
    return `+${(diffMs / 60000).toFixed(1)}m`;
};

/**
 * Formats a list of transaction logs with delta times
 */
export const formatTransactionFlow = (lines: { content: string, lineNum: number }[]) => {
    const result = [];
    let prevLine: string | null = null;

    for (const item of lines) {
        const delta = prevLine ? calculateTimeDiff(prevLine, item.content) : null;
        result.push({
            ...item,
            delta
        });
        prevLine = item.content;
    }

    return result;
};
