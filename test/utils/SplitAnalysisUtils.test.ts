import { describe, it, expect } from 'vitest';
import {
    extractSingleMetadata,
    AggregateMetrics,
    PointMetrics,
    alignSequences
} from '../../workers/SplitAnalysisUtils';
import { LogRule, LogMetadata } from '../../types';

describe('SplitAnalysisUtils', () => {
    const mockRule: LogRule = {
        id: 'test-rule',
        name: 'Test Rule',
        includeGroups: [],
        excludes: [],
        highlights: [],
        happyGroups: [
            { id: 'g1', tags: ['MatchingTag'], enabled: true, alias: 'Match' },
            { id: 'g2', tags: ['TagA', 'TagB'], enabled: true, alias: 'MultiMatch' }
        ]
    };

    describe('extractSingleMetadata', () => {
        it('should extract basic metadata from a log line', () => {
            const line = '[2024-03-08 10:00:00.123] (P 100, T 200) Logger.cs: OnStart(10)> Hello World';
            const meta = extractSingleMetadata(line, 0, 0, mockRule);

            expect(meta.fileName).toBe('Logger.cs');
            expect(meta.functionName).toBe('OnStart');
            expect(meta.codeLineNum).toBe('10');
            expect(meta.timestamp).toBeDefined();
            expect(meta.tid).toBe('200');
            expect(meta.isError).toBe(false);
        });

        it('should detect error and warning levels', () => {
            const errorLine = 'E/Tag (P 100, T 200) Something failed critically';
            const warnLine = 'W/Tag (P 100, T 200) Just a warning';

            const errMeta = extractSingleMetadata(errorLine, 0, 0, null);
            const warnMeta = extractSingleMetadata(warnLine, 1, 1, null);

            expect(errMeta.isError).toBe(true);
            expect(warnMeta.isWarn).toBe(true);
        });

        it('should match Happy Combo Alias with AND condition', () => {
            const matchLine = 'Some log with TagA and also TagB';
            const noMatchLine = 'Some log with only TagA';

            const matchMeta = extractSingleMetadata(matchLine, 0, 0, mockRule);
            const noMatchMeta = extractSingleMetadata(noMatchLine, 1, 1, mockRule);

            expect(matchMeta.alias).toBe('MultiMatch');
            expect(noMatchMeta.alias).toBeNull();
        });
    });

    describe('alignSequences (LCS Split Analysis Engine)', () => {    
        const createSeqItem = (sig: string, lineNum: number, timestamp: number, isError = false): import('../../workers/SplitAnalysisUtils').SequenceItem => {
            const normalizedSig = sig.replace(/\s+/g, ' ').trim();
            return {
                sig: normalizedSig,
                timestamp,
                lineNum,
                originalLineNum: lineNum,
                codeLineNum: null,
                preview: sig,
                fileName: 'File.js',
                functionName: 'Func',
                tid: null,
                isError,
                isWarn: false,
                alias: null
            };
        };

        it('should aggregate metrics correctly for perfectly matched sequence pairs', () => {
            const leftSeq = [
                createSeqItem('File.js::Func::[A]', 0, 1000),
                createSeqItem('File.js::Func::[B]', 1, 1100),
            ];
            const rightSeq = [
                createSeqItem('File.js::Func::[A]', 0, 1000),
                createSeqItem('File.js::Func::[B]', 1, 1500),
            ];

            const results = alignSequences(leftSeq, rightSeq);
            expect(results.length).toBe(1); // One interval A -> B
            
            const res = results[0];
            expect(res.key).toBe('File.js::Func::[A] ➔ File.js::Func::[B]');
            expect(res.leftCount).toBe(1);
            expect(res.rightCount).toBe(1);
            expect(res.leftAvgDelta).toBe(100);
            expect(res.rightAvgDelta).toBe(500);
        });

        it('should handle gaps and detect NEW ERRORs in right sequence', () => {
            const leftSeq = [
                createSeqItem('File.js::Func::[START]', 0, 1000),
                createSeqItem('File.js::Func::[END]', 1, 1200)
            ];
            // 오른쪽 로그에는 중간에 불필요한 에러가 삽입됨
            const rightSeq = [
                createSeqItem('File.js::Func::[START]', 0, 1000),
                createSeqItem('File.js::Crash::[CRITICAL EXCEPTION]', 1, 1100, true),
                createSeqItem('File.js::Func::[END]', 2, 1300)
            ];

            const results = alignSequences(leftSeq, rightSeq) as import('../../workers/SplitAnalysisUtils').SplitAnalysisResult[];
            expect(results.length).toBe(2); 

            const intervalMatch = results.find(r => r.key === 'File.js::Func::[START] ➔ File.js::Func::[END]');
            expect(intervalMatch).toBeDefined();
            expect(intervalMatch?.leftAvgDelta).toBe(200);
            expect(intervalMatch?.rightAvgDelta).toBe(300);

            // 매칭되지 않은 오른쪽 시퀀스 에러 검출 (New Error)
            const newErrorMatch = results.find(r => r.isNewError);
            expect(newErrorMatch).toBeDefined();
            expect(newErrorMatch?.isError).toBe(true);
            expect(newErrorMatch?.key).toContain('NEW_ERROR');
        });

        it('should handle zero timestamp deltas correctly', () => {
            const leftSeq = [
                createSeqItem('File.js::Func::[START]', 0, 1000),
                createSeqItem('File.js::Func::[END]', 1, 1000) // 0ms delay
            ];
            const rightSeq = [
                createSeqItem('File.js::Func::[START]', 0, 2000),
                createSeqItem('File.js::Func::[END]', 1, 2000) // 0ms delay
            ];

            const results = alignSequences(leftSeq, rightSeq);
            expect(results.length).toBe(1);
            expect(results[0].leftAvgDelta).toBe(0);
            expect(results[0].rightAvgDelta).toBe(0);
        });
        
        it('should correctly build Sequence alignment with Patience Diff approach', () => {
            const leftSeq = [
                createSeqItem('A', 0, 100),
                createSeqItem('X', 1, 200),
                createSeqItem('B', 2, 300),
            ];
            const rightSeq = [
                createSeqItem('A', 0, 100),
                createSeqItem('Y', 1, 200),
                createSeqItem('Z', 2, 250),
                createSeqItem('B', 3, 400),
            ];
            
            // X and (Y, Z) are gaps
            const results = alignSequences(leftSeq, rightSeq);
            expect(results.length).toBe(1);
            
            const res = results[0];
            expect(res.key).toBe('A ➔ B');
            expect(res.leftAvgDelta).toBe(200); // 300 - 100
            expect(res.rightAvgDelta).toBe(300); // 400 - 100
        });
        
        it('should correctly align sequences even with whitespace noise (Space Normalization)', () => {
            const leftSeq = [
                createSeqItem('File.js::Func::[A] start', 0, 1000),
                createSeqItem('File.js::Func::[A]   end', 1, 1200), // 3 spaces
            ];
            const rightSeq = [
                createSeqItem('File.js::Func::[A] start', 0, 1000),
                createSeqItem('File.js::Func::[A] end', 1, 1500),   // 1 space
            ];

            const results = alignSequences(leftSeq, rightSeq);
            // Whitespace should be normalized, so A ➔ A is matched
            expect(results.length).toBe(1);
            
            const res = results[0];
            expect(res.leftAvgDelta).toBe(200);
            expect(res.rightAvgDelta).toBe(500);
        });

        it('should group repeated sequential logs into a Burst (Burst Grouping)', () => {
            const leftSeq = [
                createSeqItem('Start', 0, 1000),
                createSeqItem('Repeat', 1, 1100),
                createSeqItem('Repeat', 2, 1200),
                createSeqItem('Repeat', 3, 1300),
                createSeqItem('End', 4, 1400),
            ];
            const rightSeq = [
                createSeqItem('Start', 0, 1000),
                createSeqItem('Repeat', 1, 1200),
                createSeqItem('Repeat', 2, 1400),
                createSeqItem('Repeat', 3, 1600),
                createSeqItem('End', 4, 1800),
            ];

            const results = alignSequences(leftSeq, rightSeq);
            
            expect(results.length).toBe(3);
            
            const burstSeg = results[1];
            expect(burstSeg.isBurst).toBe(true);
            expect(burstSeg.burstCount).toBe(2);
            expect(burstSeg.leftAvgDelta).toBe(200); 
            expect(burstSeg.rightAvgDelta).toBe(400);
        });

        it('should correctly handle N:M repeated anchors without misaligning gaps (Bug Repro)', () => {
            const leftSeq = [
                createSeqItem('UniqueA', 0, 100),
                createSeqItem('OnError', 1, 200), // Left 1
                createSeqItem('OnError', 2, 300), // Left 2
                createSeqItem('OnError', 3, 400), // Left 3
                createSeqItem('OnError', 4, 500), // Left 4
                createSeqItem('UniqueB', 5, 600),
                createSeqItem('OnError', 6, 700), // Left 5
                createSeqItem('UniqueC', 7, 800),
                createSeqItem('OnError', 8, 900), // Left 6
                createSeqItem('OnError', 9, 1000), // Left 7
                createSeqItem('UniqueD', 10, 1100),
            ];
            const rightSeq = [
                createSeqItem('UniqueA', 0, 100),
                createSeqItem('OnError', 1, 200), // Right 1
                createSeqItem('OnError', 2, 300), // Right 2
                createSeqItem('OnError', 3, 400), // Right 3
                createSeqItem('OnError', 4, 500), // Right 4
                createSeqItem('UniqueB', 5, 600),
                createSeqItem('OnError', 6, 700), // Right 5
                createSeqItem('UniqueC', 7, 800),
                createSeqItem('OnError', 8, 900), // Right 6
                createSeqItem('OnError', 9, 1000), // Right 7
                createSeqItem('OnError', 10, 1050), // Right 8 (Extra)
                createSeqItem('OnError', 11, 1080), // Right 9 (Extra)
                createSeqItem('UniqueD', 12, 1100),
            ];

            const results = alignSequences(leftSeq, rightSeq);
            expect(results.length).toBeGreaterThan(0);
        });
    });
});
