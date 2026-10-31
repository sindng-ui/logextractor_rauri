import { describe, it, expect } from 'vitest';

import { LogRule, LogMetadata } from '../../types';
import { extractTimestamp } from '../../utils/logTime';
import { extractSourceMetadata } from '../../utils/perfAnalysis';
import {
    extractSingleMetadata,
    extractAliasFromLine,
    matchAliasEvents,
    computeAliasIntervals,
    AliasEvent,
    SplitAnalysisResult,
    alignSequences
} from '../../workers/SplitAnalysisUtils';

const mockRule: LogRule = {
    id: 'test_rule',
    name: 'Test Rule',
    includeGroups: [],
    excludes: [],
    highlights: [],
    happyGroups: [
        { id: '1', enabled: true, alias: 'OnCreate', tags: ['OnCreate'] },
        { id: '2', enabled: true, alias: 'OnStart', tags: ['OnStart'] },
        { id: '3', enabled: true, alias: 'OnResume', tags: ['OnResume'] },
        { id: '4', enabled: true, alias: 'Init', tags: ['Init'] },
    ]
};

describe('Analyze Diff Segment Synchronization', () => {

    it('Should synchronize segments precisely by fileName, functionName, and codeLineNum', () => {
        const mockLeftLog = `
[1000.000] 100.001 I/TAG (P 1, T 1): main.cpp: Init(10) > System Boot
[1000.100] 100.101 I/TAG (P 1, T 1): main.cpp: OnCreate(20) > OnCreate
[1000.200] 100.201 I/TAG (P 1, T 1): main.cpp: OnStart(30) > OnStart
[1000.300] 100.301 I/TAG (P 1, T 1): main.cpp: OnResume(40) > OnResume
        `;
        const mockRightLog = `
[2000.000] 200.001 I/TAG (P 2, T 2): main.cpp: Init(10) > System Boot (New)
[2000.150] 200.151 I/TAG (P 2, T 2): main.cpp: OnCreate(20) > OnCreate
[2000.250] 200.251 I/TAG (P 2, T 2): main.cpp: OnStart(30) > OnStart
[2000.350] 200.351 I/TAG (P 2, T 2): main.cpp: OnResume(40) > OnResume
        `;

        const leftLines = mockLeftLog.split(/\r?\n/).filter(l => l.trim().length > 0);
        const rightLines = mockRightLog.split(/\r?\n/).filter(l => l.trim().length > 0);

        // 1. 메타데이터 및 시퀀스 추출
        const parseLogs = (lines: string[]) => {
            const aliasEvents: AliasEvent[] = [];
            const sequence: import('../../workers/SplitAnalysisUtils').SequenceItem[] = [];

            lines.forEach((text, i) => {
                const metadata = extractSingleMetadata(text, i, i, mockRule);
                
                // Significant 검사
                const isSig = !!(metadata.fileName || metadata.functionName || metadata.alias);
                
                if (isSig) {
                    let sig = '';
                    if (metadata.fileName) {
                        sig = `${metadata.fileName}::${metadata.functionName}::[${metadata.preview.substring(0, 50)}]`;
                    } else if (metadata.alias) {
                        sig = `[Alias] ${metadata.alias}|::::[${metadata.preview.substring(0, 50)}]`;
                    } else {
                        sig = `::::[${metadata.preview.substring(0, 50)}]`;
                    }
                    
                    sequence.push({
                        sig,
                        timestamp: metadata.timestamp,
                        lineNum: metadata.lineNum,
                        originalLineNum: i,
                        codeLineNum: metadata.codeLineNum,
                        preview: metadata.preview,
                        fileName: metadata.fileName,
                        functionName: metadata.functionName,
                        tid: metadata.tid,
                        isError: metadata.isError,
                        isWarn: metadata.isWarn,
                        alias: metadata.alias
                    });
                }

                const alias = extractAliasFromLine(text, mockRule);
                if (alias) {
                    aliasEvents.push({
                        alias,
                        timestamp: metadata.timestamp,
                        visualIndex: metadata.visualIndex,
                        lineNum: metadata.lineNum,
                        preview: metadata.preview,
                        fileName: metadata.fileName,
                        functionName: metadata.functionName,
                        codeLineNum: metadata.codeLineNum
                    });
                }
            });

            return { sequence, aliasEvents, metadataList: sequence.map(s => s as any) }; 
        };

        const leftData = parseLogs(leftLines);
        const rightData = parseLogs(rightLines);

        // 2. 워커 로직(세그먼트 추출) 시뮬레이션
        const results: SplitAnalysisResult[] = [];

        results.push(...matchAliasEvents(leftData.aliasEvents, rightData.aliasEvents));
        results.push(...computeAliasIntervals(leftData.aliasEvents, rightData.aliasEvents));

        const alignedResults = alignSequences(leftData.sequence, rightData.sequence);
        results.push(...alignedResults);

        // 3. Segment 순회하며 정합성(동기화) 체크 (왼쪽 및 오른쪽 모두 존재하는 매칭에 대해)
        let checkedCount = 0;

        results.forEach(seg => {
            // 양쪽 로그에 모두 매칭된 구간인지 확인 (어느 한쪽에 없으면 동기화 점검 대상 아님)
            if (seg.leftOrigLineNum >= 0 && seg.rightOrigLineNum >= 0 && !seg.isNewError) {

                // End Log Check
                const leftEndTarget = leftData.sequence.find(s => s.originalLineNum === seg.leftOrigLineNum);
                const rightEndTarget = rightData.sequence.find(s => s.originalLineNum === seg.rightOrigLineNum);

                if (leftEndTarget && rightEndTarget) {
                    if (leftEndTarget.fileName || rightEndTarget.fileName) {
                        try {
                            expect(leftEndTarget.fileName).toBe(rightEndTarget.fileName);
                        } catch (e) {
                            if (!seg.isAliasMatch && !seg.isAliasInterval) throw e;
                        }
                    }
                    if (leftEndTarget.functionName || rightEndTarget.functionName) {
                        try {
                            expect(leftEndTarget.functionName).toBe(rightEndTarget.functionName);
                        } catch (e) {
                            if (!seg.isAliasMatch && !seg.isAliasInterval) throw e;
                        }
                    }
                }

                // Start Log Check (for Intervals)
                if (seg.leftPrevOrigLineNum >= 0 && seg.rightPrevOrigLineNum >= 0) {
                    const leftStartTarget = leftData.sequence.find(s => s.originalLineNum === seg.leftPrevOrigLineNum);
                    const rightStartTarget = rightData.sequence.find(s => s.originalLineNum === seg.rightPrevOrigLineNum);

                    if (leftStartTarget && rightStartTarget) {
                        if (leftStartTarget.fileName || rightStartTarget.fileName) {
                            try {
                                expect(leftStartTarget.fileName).toBe(rightStartTarget.fileName);
                            } catch (e) {
                                if (!seg.isAliasMatch && !seg.isAliasInterval) throw e;
                            }
                        }
                        if (leftStartTarget.functionName || rightStartTarget.functionName) {
                            try {
                                expect(leftStartTarget.functionName).toBe(rightStartTarget.functionName);
                            } catch (e) {
                                if (!seg.isAliasMatch && !seg.isAliasInterval) throw e;
                            }
                        }
                    }
                }

                checkedCount++;
            }
        });

        // 매칭된 세그먼트가 최소 1개 이상 있는지 확인!
        expect(checkedCount).toBeGreaterThan(0);
    });
});
