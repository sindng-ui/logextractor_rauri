
// Dedicated worker for real-time log streaming
// Shares similar filtering logic with LogProcessor but optimized for stream chunks

import { LogRule, LogWorkerMessage, LogWorkerResponse, LogHighlight } from '../types';

interface StreamLine {
    lineNum: number;
    content: string;
    timestamp: number;
}

let currentLines: StreamLine[] = [];
let totalLines = 0;
let filteredMatches: StreamLine[] = [];
let currentRule: LogRule | null = null;
const BUFFER_SIZE = 100000; // Keep last 100k lines in memory to prevent overflow

const isMatch = (content: string, rule: LogRule): boolean => {
    // Basic Filtering Logic (Duplicated for speed, could be shared util)
    if (rule.excludes && rule.excludes.some(ex => ex && content.includes(ex))) return false;

    if (!rule.includeGroups || rule.includeGroups.length === 0) return true;

    // Standard Happy Combo Logic
    for (const group of rule.includeGroups) { // OR
        if (group.length === 0) continue;
        let groupMatch = true;
        for (const term of group) { // AND
            if (term && !content.includes(term)) {
                groupMatch = false;
                break;
            }
        }
        if (groupMatch) return true;
    }

    return rule.includeGroups.every(g => g.length === 0 || g.every(t => !t));
};

self.onmessage = (e: MessageEvent<LogWorkerMessage>) => {
    const { type, payload, requestId } = e.data;

    switch (type) {
        case 'INIT_STREAM':
            // Reset state
            currentLines = [];
            totalLines = 0;
            filteredMatches = [];
            currentRule = payload.rules ? payload.rules[0] : null; // Initial rule
            self.postMessage({ type: 'STATUS_UPDATE', payload: { status: 'ready', progress: 0 } });
            break;

        case 'UPDATE_RULES':
            currentRule = payload.rules ? payload.rules[0] : null;
            // Re-filter existing buffer? For now, just apply to new lines or request a full re-filter
            if (currentRule) {
                filteredMatches = currentLines.filter(line => isMatch(line.content, currentRule!));
                self.postMessage({ type: 'FILTER_COMPLETE', payload: { matchCount: filteredMatches.length } });
                // Also inform that view needs update
                self.postMessage({ type: 'STREAM_FLUSH' });
            }
            break;

        case 'PROCESS_CHUNK':
            const chunk = payload.chunk as string;
            const newLines = chunk.split('\n');
            const processedLines: StreamLine[] = [];

            newLines.forEach(lineContent => {
                if (!lineContent.trim()) return; // Skip empty lines in stream?

                totalLines++;
                const lineObj: StreamLine = {
                    lineNum: totalLines,
                    content: lineContent,
                    timestamp: 0 // Parse if needed
                };

                currentLines.push(lineObj);

                if (currentRule) {
                    if (isMatch(lineContent, currentRule)) {
                        filteredMatches.push(lineObj);
                    }
                } else {
                    filteredMatches.push(lineObj);
                }
            });

            // Buffer Management
            if (currentLines.length > BUFFER_SIZE) {
                const removeCount = currentLines.length - BUFFER_SIZE;
                currentLines.splice(0, removeCount);
                // Also trim filtered matches to keep sync? 
                // Actually we should just keep filteredMatches aligned or rebuild it.
                // For simplicity, let's just trim filteredMatches vaguely or rebuild.
                // Rebuild is safer:
                if (currentRule) {
                    filteredMatches = currentLines.filter(l => isMatch(l.content, currentRule!));
                } else {
                    filteredMatches = [...currentLines];
                }
            }

            self.postMessage({ type: 'FILTER_COMPLETE', payload: { matchCount: filteredMatches.length } });
            break;

        case 'GET_LINES':
            // Same interface as LogProcessor
            const { start, count } = payload;
            const results = filteredMatches.slice(start, start + count);
            self.postMessage({ type: 'LINES_DATA', payload: { lines: results }, requestId });
            break;
    }
};
