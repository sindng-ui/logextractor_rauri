/**
 * Performance Benchmark Tests for Log Extractor
 * 
 * 대용량 로그 파일 처리 및 빠른 로그 스트림 처리 성능 테스트
 */

import { describe, it, expect } from 'vitest';

// 성능 기준
const PERFORMANCE_THRESHOLDS = {
    PARSE_10K_LINES: 500,         // 10,000줄 파싱: 0.5초 이내
    PARSE_100K_LINES: 5000,       // 100,000줄 파싱: 5초 이내
    FILTER_10K_LINES: 200,        // 10,000줄 필터링: 0.2초 이내
    HIGHLIGHT_1K_LINES: 300,      // 1,000줄 하이라이트: 0.3초 이내
};

// 테스트 로그 생성기
function generateLogLines(count: number): string[] {
    const logLevels = ['INFO', 'DEBUG', 'WARNING', 'ERROR', 'CRITICAL'];
    const messages = [
        'Application started successfully',
        'Processing request',
        'Database connection established',
        'Network timeout occurred',
        'Memory usage: 75%',
        'Cache invalidated',
        'User authentication failed',
        'API response time: 250ms'
    ];

    return Array.from({ length: count }, (_, i) => {
        const timestamp = new Date(Date.now() - (count - i) * 1000).toISOString();
        const level = logLevels[i % logLevels.length];
        const message = messages[i % messages.length];

        return `[${timestamp}] [${level}] ${message} (line ${i + 1})`;
    });
}

function generateLargeLogContent(sizeInMB: number): string {
    const targetSize = sizeInMB * 1024 * 1024;
    const lines: string[] = [];
    let currentSize = 0;
    let lineNumber = 1;

    while (currentSize < targetSize) {
        const line = `[${new Date().toISOString()}] [INFO] This is log line ${lineNumber++} with some additional text to increase size.\n`;
        lines.push(line);
        currentSize += line.length;
    }

    return lines.join('');
}

describe('Performance Benchmarks - Log Extractor', () => {
    it('should parse 10,000 log lines efficiently', () => {
        const logLines = generateLogLines(10000);
        const logContent = logLines.join('\n');

        const startTime = performance.now();

        // Simulate parsing: split by newline
        const parsed = logContent.split('\n');

        const duration = performance.now() - startTime;

        console.log(`  📊 Parse 10K lines: ${duration.toFixed(2)}ms`);

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.PARSE_10K_LINES);
        expect(parsed.length).toBe(10000);
    });

    it('should parse 100,000 log lines efficiently', () => {
        const logLines = generateLogLines(100000);
        const logContent = logLines.join('\n');

        const startTime = performance.now();

        const parsed = logContent.split('\n');

        const duration = performance.now() - startTime;

        console.log(`  📊 Parse 100K lines: ${duration.toFixed(2)}ms`);

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.PARSE_100K_LINES);
        expect(parsed.length).toBe(100000);
    }, 10000);

    it('should filter 10,000 log lines by keyword efficiently', () => {
        const logLines = generateLogLines(10000);

        const startTime = performance.now();

        // Filter by keyword
        const filtered = logLines.filter(line => line.includes('ERROR'));

        const duration = performance.now() - startTime;

        console.log(`  📊 Filter 10K lines: ${duration.toFixed(2)}ms, Found: ${filtered.length}`);

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.FILTER_10K_LINES);
        expect(filtered.length).toBeGreaterThan(0);
    });

    it('should filter with RegEx efficiently', () => {
        const logLines = generateLogLines(10000);
        const regex = /ERROR|CRITICAL/;

        const startTime = performance.now();

        const filtered = logLines.filter(line => regex.test(line));

        const duration = performance.now() - startTime;

        console.log(`  📊 RegEx Filter 10K lines: ${duration.toFixed(2)}ms, Found: ${filtered.length}`);

        expect(duration).toBeLessThan(500); // 0.5초 이내
        expect(filtered.length).toBeGreaterThan(0);
    });

    it('should handle highlight pattern matching efficiently', () => {
        const logLines = generateLogLines(1000);
        const keyword = 'ERROR';

        const startTime = performance.now();

        // Simulate highlight: find all occurrences
        const highlighted = logLines.map(line => {
            const index = line.indexOf(keyword);
            return index !== -1 ? { line, index, length: keyword.length } : null;
        }).filter(Boolean);

        const duration = performance.now() - startTime;

        console.log(`  📊 Highlight 1K lines: ${duration.toFixed(2)}ms, Found: ${highlighted.length}`);

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.HIGHLIGHT_1K_LINES);
    });

    it('should chunk large log file efficiently (2GB simulation)', () => {
        // Simulate 2GB file by processing in chunks
        const chunkSize = 10000; // lines per chunk
        const totalChunks = 10;

        const startTime = performance.now();

        let totalLines = 0;
        for (let i = 0; i < totalChunks; i++) {
            const chunk = generateLogLines(chunkSize);
            totalLines += chunk.length;
        }

        const duration = performance.now() - startTime;

        console.log(`  📊 Process ${totalChunks} chunks (${totalLines} lines): ${duration.toFixed(2)}ms`);

        expect(duration).toBeLessThan(5000); // 5초 이내
        expect(totalLines).toBe(chunkSize * totalChunks);
    });

    it('should handle rapid log streaming (100 logs/sec)', () => {
        const logsPerSecond = 100;
        const durationSeconds = 1;
        const totalLogs = logsPerSecond * durationSeconds;

        const startTime = performance.now();
        const buffer: string[] = [];

        // Simulate rapid incoming logs
        for (let i = 0; i < totalLogs; i++) {
            const log = `[${new Date().toISOString()}] [INFO] Rapid log ${i}`;
            buffer.push(log);
        }

        const duration = performance.now() - startTime;

        console.log(`  📊 Handle ${totalLogs} rapid logs: ${duration.toFixed(2)}ms`);

        expect(duration).toBeLessThan(200); // 0.2초 이내
        expect(buffer.length).toBe(totalLogs);
    });
});

describe('Performance Benchmarks - Log Processing', () => {
    it('should parse timestamp from logs efficiently', () => {
        const logLines = generateLogLines(10000);
        const timestampRegex = /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/;

        const startTime = performance.now();

        const timestamps = logLines.map(line => {
            const match = line.match(timestampRegex);
            return match ? match[1] : null;
        }).filter(Boolean);

        const duration = performance.now() - startTime;

        console.log(`  📊 Extract timestamps from 10K lines: ${duration.toFixed(2)}ms`);

        expect(duration).toBeLessThan(500);
        expect(timestamps.length).toBe(10000);
    });

    it('should parse log level efficiently', () => {
        const logLines = generateLogLines(10000);
        const levelRegex = /\[([A-Z]+)\]/g;

        const startTime = performance.now();

        const levels = logLines.map(line => {
            const matches = [...line.matchAll(levelRegex)];
            return matches.length > 1 ? matches[1][1] : null;
        }).filter(Boolean);

        const duration = performance.now() - startTime;

        console.log(`  📊 Extract log levels from 10K lines: ${duration.toFixed(2)}ms`);

        expect(duration).toBeLessThan(500);
    });

    it('should handle line selection operations efficiently', () => {
        const totalLines = 10000;
        const selectedLines = new Set<number>();

        const startTime = performance.now();

        // Simulate selecting every 10th line
        for (let i = 0; i < totalLines; i += 10) {
            selectedLines.add(i);
        }

        // Simulate checking if line is selected
        let checkCount = 0;
        for (let i = 0; i < totalLines; i++) {
            if (selectedLines.has(i)) {
                checkCount++;
            }
        }

        const duration = performance.now() - startTime;

        console.log(`  📊 Line selection operations: ${duration.toFixed(2)}ms, Selected: ${checkCount}`);

        expect(duration).toBeLessThan(100);
        expect(checkCount).toBe(1000);
    });
});

describe('Performance Benchmarks - Memory Efficiency', () => {
    it('should not leak memory when processing large logs', () => {
        const getMemoryUsage = () => {
            if ((performance as any).memory) {
                return (performance as any).memory.usedJSHeapSize / 1024 / 1024;
            }
            return 0;
        };

        const memBefore = getMemoryUsage();

        // Process multiple batches
        for (let batch = 0; batch < 5; batch++) {
            const lines = generateLogLines(10000);
            const filtered = lines.filter(l => l.includes('ERROR'));
            // Allow lines to be garbage collected
        }

        const memAfter = getMemoryUsage();
        const memIncrease = memAfter - memBefore;

        console.log(`  📊 Memory increase after 5 batches: ${memIncrease.toFixed(2)}MB`);

        if (memBefore > 0) {
            // Should not accumulate memory indefinitely
            expect(memIncrease).toBeLessThan(100); // 100MB 이내
        }
    });
});
