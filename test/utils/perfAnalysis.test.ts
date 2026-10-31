import { describe, it, expect } from 'vitest';
import { analyzePerfSegments, extractLogIds, extractSourceMetadata } from '../../utils/perfAnalysis';
import { LogRule } from '../../types';

describe('Performance Utils', () => {
    describe('extractLogIds', () => {
        it('should extract IDs from (P 123, T 456) format', () => {
            const line = 'V/Tag (P 123, T 456) Message';
            const { pid, tid } = extractLogIds(line);
            expect(pid).toBe('123');
            expect(tid).toBe('456');
        });

        it('should extract IDs from [PID:TID] format', () => {
            const line = '[ 1111: 2222] Message';
            const { pid, tid } = extractLogIds(line);
            expect(pid).toBe('1111');
            expect(tid).toBe('2222');
        });

        it('should extract IDs from Android standard format', () => {
            const line = '02-16 09:46:13.123  1234  5678 I Tag: Message';
            const { pid, tid } = extractLogIds(line);
            expect(pid).toBe('1234');
            expect(tid).toBe('5678');
        });

        it('should extract combined T/P as both', () => {
            const line = 'T/P: 7777 Message';
            const { pid, tid } = extractLogIds(line);
            expect(pid).toBe('7777');
            expect(tid).toBe('7777');
        });
    });

    describe('extractSourceMetadata', () => {
        it('should extract fileName and functionName', () => {
            const line = 'Logger.cs: OnStart(10)> Hello';
            const { fileName, functionName } = extractSourceMetadata(line);
            expect(fileName).toBe('Logger.cs');
            expect(functionName).toBe('OnStart');
        });

        it('should handle different extensions', () => {
            const line = 'test_module.py: handle_event:20> log message';
            const { fileName, functionName } = extractSourceMetadata(line);
            expect(fileName).toBe('test_module.py');
            expect(functionName).toBe('handle_event:20');
        });
    });

    describe('analyzePerfSegments (Core Logic)', () => {

        const baseRule: LogRule = {
            id: 'perf-rule',
            name: 'Perf Rule',
            includeGroups: [],
            excludes: [],
            highlights: [],
            happyGroups: [
                { id: 'g1', tags: ['StepA'], enabled: true, alias: 'Step A' },
                { id: 'g2', tags: ['StepB'], enabled: true, alias: 'Step B' }
            ],
            dangerThresholds: [{ ms: 100, color: 'bg-red-500', label: 'Slow' }]
        };

        const targetTime = 50; // 50ms threshold

        it('should return empty segments if no lines match', () => {
            const lines = ['[INFO] nothing here'];
            const indices = [0];
            const segments = analyzePerfSegments(lines, indices, baseRule, targetTime, false);
            expect(segments).toHaveLength(0);
        });

        it('should create Step segments for grouped logs (Single Alias Group)', () => {
            // Step A start ... Step A end
            // Timestamp 1000 ... 1060 (duration 60)
            const lines = [
                '[2024-02-16 10:00:01.000] [INFO] StepA Start',
                '[2024-02-16 10:00:01.060] [INFO] StepA End'
            ];
            const indices = [0, 1];

            const segments = analyzePerfSegments(lines, indices, baseRule, targetTime, false);

            // Should find 1 'step' segment for Step A
            const stepASegment = segments.find(s => s.type === 'step' && s.name === 'Step A (Group)');
            expect(stepASegment).toBeDefined();
            expect(stepASegment?.duration).toBe(60);
            expect(stepASegment?.status).toBe('fail'); // 60 > 50
            expect(stepASegment?.dangerColor).toBeUndefined(); // 60 < 100 (Threshold)
        });

        it('should assign danger color based on threshold', () => {
            const lines = [
                '[2024-02-16 10:00:01.000] [INFO] StepA Start',
                '[2024-02-16 10:00:01.200] [INFO] StepA End'
            ]; // 200ms duration
            const indices = [0, 1];
            const segments = analyzePerfSegments(lines, indices, baseRule, targetTime, false);
            const seg = segments[0];
            expect(seg.duration).toBe(200);
            expect(seg.dangerColor).toBe('bg-red-500'); // 200 >= 100
        });

        it('should create Interval segments between different aliases', () => {
            // Step A (1000) -> Step B (1030)
            // Interval: 30ms
            const lines = [
                '[2024-02-16 10:00:01.000] [INFO] StepA',
                '[2024-02-16 10:00:01.030] [INFO] StepB'
            ];
            const indices = [10, 20]; // Arbitrary original line numbers

            const segments = analyzePerfSegments(lines, indices, baseRule, targetTime, false);

            // Expect 1 interval: Step A -> Step B
            const interval = segments.find(s => s.type === 'combo');
            expect(interval).toBeDefined();
            expect(interval?.name).toBe('Step A → Step B');
            expect(interval?.duration).toBe(30);
            expect(interval?.status).toBe('pass'); // 30 < 50
            expect(interval?.startLine).toBe(10);
            expect(interval?.endLine).toBe(20);
        });

        it('should handle complex flow', () => {
            // A(0) -> B(100) -> A(200)
            // Interval 1: A->B (100ms)
            // Interval 2: B->A (100ms)
            const lines = [
                '[2024-02-16 10:00:00.000] [INFO] StepA',
                '[2024-02-16 10:00:00.100] [INFO] StepB',
                '[2024-02-16 10:00:00.200] [INFO] StepA'
            ];
            const indices = [1, 2, 3];
            const segments = analyzePerfSegments(lines, indices, baseRule, targetTime, false);

            const intervals = segments.filter(s => s.type === 'combo');
            expect(intervals).toHaveLength(2);
            expect(intervals[0].name).toBe('Step A → Step B');
            expect(intervals[1].name).toBe('Step B → Step A');
        });

        it('should assign segments to lanes based on TID', () => {
            const lines = [
                '[10:00:00.000] (T 100) StepA',
                '[10:00:00.100] (T 200) StepA',
                '[10:00:00.200] (T 100) StepB',
                '[10:00:00.300] (T 200) StepB'
            ];
            const indices = [0, 1, 2, 3];
            const segments = analyzePerfSegments(lines, indices, baseRule, targetTime, false);

            // Filter intervals
            const intervals = segments.filter(s => s.type === 'combo');

            // Find interval for TID 100/200 (Step A -> Step B)
            const tid100Seg = intervals.find(s => s.tid === '100');
            const tid200Seg = intervals.find(s => s.tid === '200');

            expect(tid100Seg).toBeDefined();
            expect(tid200Seg).toBeDefined();

            // They should be on different lanes because they belong to different TIDs
            expect(tid100Seg?.lane).not.toBe(tid200Seg?.lane);
        });

        it('should pack overlapping segments in the same TID on different lanes', () => {
            // Alias 'A' tags [StepA]
            // Alias 'B' tags [StepB]
            // But let's say we have A ... B and inside it another match?
            // Current analyzePerfSegments logic creates intervals between CONSECUTIVE matches.
            // It also creates 'Group' segments for the same alias.

            const lines = [
                '[10:00:00.000] (T 100) StepA start',
                '[10:00:00.050] (T 100) StepA middle',
                '[10:00:00.100] (T 100) StepA end'
            ];
            const indices = [0, 1, 2];
            const segments = analyzePerfSegments(lines, indices, baseRule, targetTime, false);

            const groupSeg = segments.find(s => s.type === 'step'); // Step A (Group)
            const intervals = segments.filter(s => s.type === 'combo'); // A->A, A->A

            expect(groupSeg).toBeDefined();
            expect(intervals).toHaveLength(2);

            // The group segment (0~100) overlaps with the intervals.
            // Lane packing should ensure they don't share the same lane.
            const lanesUsed = segments.map(s => s.lane);
            const uniqueLanes = new Set(lanesUsed);

            expect(uniqueLanes.size).toBeGreaterThan(1);
        });

        it('should handle time reversal (negative duration) gracefully', () => {
            // A(100) -> B(50)
            const lines = [
                '[2024-02-16 10:00:00.100] [INFO] StepA',
                '[2024-02-16 10:00:00.050] [INFO] StepB'
            ];
            const indices = [1, 2];
            const segments = analyzePerfSegments(lines, indices, baseRule, targetTime, false);

            const interval = segments.find(s => s.type === 'combo');
            expect(interval).toBeDefined();
            expect(interval?.duration).toBe(-50);
            expect(interval?.status).toBe('pass'); // Negative is usually < targetTime
        });

        it('should ignore logs with invalid timestamps', () => {
            const lines = [
                '[2024-02-16 10:00:00.000] [INFO] StepA',
                '[INVALID TIMESTAMP] [INFO] StepB',
                '[2024-02-16 10:00:00.100] [INFO] StepA'
            ];
            const indices = [1, 2, 3];
            const segments = analyzePerfSegments(lines, indices, baseRule, targetTime, false);

            // Filter intervals: only A->A (100ms) should exist because B was ignored
            const intervals = segments.filter(s => s.type === 'combo');
            expect(intervals).toHaveLength(1);
            expect(intervals[0].name).toBe('Step A → Step A');
            expect(intervals[0].duration).toBe(100);
        });

        it('should fallback to Main when TID/PID cannot be extracted', () => {
            const lines = [
                'No IDs here StepA',
                'Still no IDs StepB'
            ];
            // Mock timestamps since extractTimestamp might fail on these
            // In real code, extractTimestamp is called, but for testing we can use valid looking lines
            const validLines = [
                '[10:00:00.000] No IDs here StepA',
                '[10:00:00.050] Still no IDs StepB'
            ];
            const indices = [10, 20];
            const segments = analyzePerfSegments(validLines, indices, baseRule, targetTime, false);

            const interval = segments.find(s => s.type === 'combo');
            expect(interval).toBeDefined();
            expect(interval?.tid).toBe('Main');
        });
    });
});
