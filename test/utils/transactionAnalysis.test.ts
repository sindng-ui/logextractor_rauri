import { describe, it, expect } from 'vitest';
import { extractTransactionIds, calculateTimeDiff } from '../../utils/transactionAnalysis';

describe('transactionAnalysis', () => {
    describe('extractTransactionIds', () => {
        it('should extract IDs from standard Tizen format', () => {
            const line = '02-16 09:46:13.123  1234  5678 I TagName: Message';
            const ids = extractTransactionIds(line);
            expect(ids).toContainEqual({ type: 'pid', value: '1234' });
            expect(ids).toContainEqual({ type: 'tid', value: '5678' });
            expect(ids).toContainEqual({ type: 'tag', value: 'TagName' });
        });

        it('should extract IDs from bracket format [PID:TID]', () => {
            const line = '[ 1111: 2222] D/SomeTag: Hello';
            const ids = extractTransactionIds(line);
            expect(ids).toContainEqual({ type: 'pid', value: '1111' });
            expect(ids).toContainEqual({ type: 'tid', value: '2222' });
        });

        it('should extract IDs from bracket format [PID TID]', () => {
            const line = '[ 3333 4444 ] I/OtherTag: World';
            const ids = extractTransactionIds(line);
            expect(ids).toContainEqual({ type: 'pid', value: '3333' });
            expect(ids).toContainEqual({ type: 'tid', value: '4444' });
        });

        it('should extract IDs from simple tag with PID in parens', () => {
            const line = 'V/MyService( 5555): Starting up';
            const ids = extractTransactionIds(line);
            expect(ids).toContainEqual({ type: 'tag', value: 'MyService' });
            expect(ids).toContainEqual({ type: 'pid', value: '5555' });
        });

        it('should extract IDs from modern P/T format', () => {
            const line = 'I/Process (P 123, T 456) Message here';
            const ids = extractTransactionIds(line);
            expect(ids).toContainEqual({ type: 'pid', value: 'P123' });
            expect(ids).toContainEqual({ type: 'tid', value: 'T456' });
        });

        it('should extract numeric tid in brackets', () => {
            const line = 'Some log message [789]';
            const ids = extractTransactionIds(line);
            expect(ids).toContainEqual({ type: 'tid', value: '789' });
        });

        it('should deduplicate IDs', () => {
            const line = '02-16 09:46:13.123  1234  1234 I Tag: Tag';
            const ids = extractTransactionIds(line);
            // Even if matched by multiple regexes, should only appear once
            const tids = ids.filter(id => id.type === 'tid');
            expect(tids).toHaveLength(1);
        });
    });

    describe('calculateTimeDiff', () => {
        it('should calculate difference in ms', () => {
            const lineA = '09:46:13.000  1234  5678 I Tag: A';
            const lineB = '09:46:13.500  1234  5678 I Tag: B';
            expect(calculateTimeDiff(lineA, lineB)).toBe('+500ms');
        });

        it('should calculate difference in seconds', () => {
            const lineA = '09:46:10.000  1234  5678 I Tag: A';
            const lineB = '09:46:15.000  1234  5678 I Tag: B';
            expect(calculateTimeDiff(lineA, lineB)).toBe('+5.00s');
        });

        it('should return null if timestamps are missing', () => {
            const lineA = 'No timestamp line';
            const lineB = 'Another invalid line';
            expect(calculateTimeDiff(lineA, lineB)).toBeNull();
        });
    });
});
