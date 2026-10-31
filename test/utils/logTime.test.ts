import { describe, it, expect } from 'vitest';
import { extractTimestamp, formatDuration } from '../../utils/logTime';

describe('Log Time Utils', () => {
    describe('extractTimestamp', () => {
        it('should extract standard HH:mm:ss.mss timestamp', () => {
            const line = '01-23 12:34:56.789 D/Tag: Message';
            const ts = extractTimestamp(line);
            expect(ts).not.toBeNull();
            const date = new Date(ts!);
            expect(date.getHours()).toBe(12);
            expect(date.getMinutes()).toBe(34);
            expect(date.getSeconds()).toBe(56);
            expect(date.getMilliseconds()).toBe(789);
        });

        it('should extract timestamp with Year', () => {
            const line = '2024-01-23 12:34:56.789 D/Tag: Message';
            const ts = extractTimestamp(line);
            expect(ts).not.toBeNull();
            const date = new Date(ts!);
            expect(date.getFullYear()).toBe(2024);
        });

        it('should extract Kernel timestamp', () => {
            const line = '[ 123.456] Kernel message';
            const ts = extractTimestamp(line);
            expect(ts).toBe(123456);
        });

        it('should return null for non-log lines', () => {
            expect(extractTimestamp('Just some text')).toBeNull();
            expect(extractTimestamp('12:34 (No seconds)')).toBeNull();
        });

        it('should extract raw seconds timestamp', () => {
            const line = '27.888888 I/EEEE (P111, T222): log';
            const ts = extractTimestamp(line);
            expect(ts).toBeCloseTo(27888.888);
        });

        it('should extract adb logcat format with milliseconds', () => {
            // 02-24 00:34:11.401
            const line = '[02-24 00:34:11.401] 609-399  I/AAA(P 111, T222): log';
            const ts = extractTimestamp(line);
            expect(ts).not.toBeNull();
            const date = new Date(ts!);
            expect(date.getMonth() + 1).toBe(2);
            expect(date.getDate()).toBe(24);
            expect(date.getHours()).toBe(0);
            expect(date.getMinutes()).toBe(34);
            expect(date.getSeconds()).toBe(11);
            expect(date.getMilliseconds()).toBe(401);
        });

        it('should extract timestamp from prefixed monotonic logs (Type 1)', () => {
            const line = 'bluetooth: 4000.123456789 I/LOGTAG (P111, T111): contents';
            const ts = extractTimestamp(line);
            // 4000.123456789 seconds = 4000123.456789 ms
            expect(ts).toBeCloseTo(4000123.456789);
        });

        it('should extract timestamp from simple monotonic logs (Type 2)', () => {
            const line = '4000.123456789 I/LOGTAG (P111, T111): contents';
            const ts = extractTimestamp(line);
            expect(ts).toBeCloseTo(4000123.456789);
        });

        it('should extract timestamp from monotonic logs with leading spaces', () => {
            const line = '  4000.123456789 I/LOGTAG';
            const ts = extractTimestamp(line);
            expect(ts).toBeCloseTo(4000123.456789);
        });
    });

    describe('formatDuration', () => {
        it('should format milliseconds', () => {
            expect(formatDuration(123)).toBe('123ms');
        });

        it('should format seconds', () => {
            expect(formatDuration(1234)).toBe('1s 234ms');
            expect(formatDuration(1000)).toBe('1s');
        });

        it('should format minutes', () => {
            expect(formatDuration(65432)).toBe('1m 5s');
            expect(formatDuration(60000)).toBe('1m');
        });

        it('should format hours', () => {
            expect(formatDuration(3661000)).toBe('1h 1m');
            expect(formatDuration(3600000)).toBe('1h');
        });
    });
});
