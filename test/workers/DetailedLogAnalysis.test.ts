import { describe, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    matchAliasEvents,
    computeAliasIntervals,
    AliasEvent
} from '../../workers/SplitAnalysisUtils';
import { extractTimestamp } from '../../utils/logTime';
import { extractSourceMetadata } from '../../utils/perfAnalysis';

describe('Detailed Real Log Analysis', () => {
    // 🐧🎯 사용자가 화면에서 보고 있는 'OnCreate', 'OnStart' 등을 Alias로 상정
    const aliases = ['OnCreate', 'OnStart', 'OnResume'];

    const logPath1 = path.join(__dirname, '../../test_startup.log');
    const logPath2 = path.join(__dirname, '../../test_startup_2.log');

    const extractEvents = (content: string): AliasEvent[] => {
        const lines = content.split(/\r?\n/);
        const events: AliasEvent[] = [];
        lines.forEach((line, idx) => {
            if (!line.trim()) return;
            for (const alias of aliases) {
                if (line.includes(alias)) {
                    const ts = extractTimestamp(line);
                    const meta = extractSourceMetadata(line);
                    events.push({
                        alias,
                        timestamp: ts || 0,
                        visualIndex: idx,
                        lineNum: idx + 1,
                        preview: line.substring(0, 100).trim(),
                        codeLineNum: meta.codeLineNum || undefined,
                        fileName: meta.fileName || undefined,
                        functionName: meta.functionName || undefined
                    });
                    break;
                }
            }
        });
        return events;
    };

    it('Print all analysis results for debugging', () => {
        if (!fs.existsSync(logPath1) || !fs.existsSync(logPath2)) return;

        const content1 = fs.readFileSync(logPath1, 'utf-8');
        const content2 = fs.readFileSync(logPath2, 'utf-8');

        const leftEvents = extractEvents(content1);
        const rightEvents = extractEvents(content2);

        const aliasMatches = matchAliasEvents(leftEvents, rightEvents);
        const aliasIntervals = computeAliasIntervals(leftEvents, rightEvents);

        const allResults = [...aliasMatches, ...aliasIntervals].sort((a, b) => (a.leftLineNum || 0) - (b.leftLineNum || 0));

        console.log(`\n=== DETAILED ANALYSIS RESULTS (Top 20 of ${allResults.length} items) ===`);
        allResults.slice(0, 20).forEach((res, i) => {
            const type = res.isAliasInterval ? '[INTERVAL]' : '[POINT]   ';
            const delta = (res.deltaDiff !== undefined && res.deltaDiff !== 0) ? ` (${res.deltaDiff > 0 ? '+' : ''}${res.deltaDiff.toFixed(1)}ms)` : '';
            console.log(`${i.toString().padStart(3, ' ')}: ${type} ${res.key.padEnd(50, ' ')} L:${res.leftLineNum} R:${res.rightLineNum}${delta}`);

            console.log(`     L_Log: "${content1.split(/\r?\n/)[res.leftLineNum]}"`);
            console.log(`     R_Log: "${content2.split(/\r?\n/)[res.rightLineNum]}"`);
        });
    });
});
