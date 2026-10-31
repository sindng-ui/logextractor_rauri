/**
 * Large Scale Performance Tests
 * 
 * ⚠️ WARNING: 이 테스트는 실제 대용량 파일을 생성하고 처리합니다.
 * - 실행 시간: 5-10분 이상
 * - 디스크 공간: 최소 5GB 필요
 * - 메모리: 최소 4GB 권장
 * 
 * 기본적으로 모든 테스트는 .skip으로 비활성화되어 있습니다.
 * 실행하려면 .skip을 제거하세요.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEMP_DIR = path.join(os.tmpdir(), 'happytool-perf-test');
const LARGE_LOG_FILE = path.join(TEMP_DIR, 'large-test.log');

// 2GB 로그 파일 생성기
async function generateLargeLogFile(sizeInGB: number): Promise<string> {
    console.log(`🔧 Generating ${sizeInGB}GB log file...`);

    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const targetSize = sizeInGB * 1024 * 1024 * 1024;
    const stream = fs.createWriteStream(LARGE_LOG_FILE, { flags: 'w' });

    let currentSize = 0;
    let lineNumber = 0;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const writeLines = () => {
            let canWrite = true;

            while (currentSize < targetSize && canWrite) {
                const timestamp = new Date().toISOString();
                const level = ['INFO', 'DEBUG', 'WARNING', 'ERROR'][lineNumber % 4];
                const line = `[${timestamp}] [${level}] This is log entry ${lineNumber++} with some additional text to increase file size.\n`;

                currentSize += line.length;
                canWrite = stream.write(line);

                // 진행률 표시
                if (lineNumber % 100000 === 0) {
                    const progress = (currentSize / targetSize * 100).toFixed(2);
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                    console.log(`  Progress: ${progress}% (${(currentSize / 1024 / 1024).toFixed(2)}MB) - ${elapsed}s`);
                }
            }

            if (currentSize < targetSize) {
                stream.once('drain', writeLines);
            } else {
                stream.end(() => {
                    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                    console.log(`✅ Generated ${(currentSize / 1024 / 1024 / 1024).toFixed(2)}GB in ${duration}s`);
                    resolve(LARGE_LOG_FILE);
                });
            }
        };

        writeLines();
        stream.on('error', reject);
    });
}

// 청크 단위 파일 읽기 및 처리
async function processLargeLogInChunks(
    filePath: string,
    chunkSizeInMB: number,
    processor: (lines: string[]) => void
): Promise<{ totalLines: number; duration: number }> {
    const chunkSize = chunkSizeInMB * 1024 * 1024;
    const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: chunkSize });

    let buffer = '';
    let totalLines = 0;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        stream.on('data', (chunk: string) => {
            buffer += chunk;
            const lines = buffer.split('\n');

            // 마지막 불완전한 줄은 다음 청크로
            buffer = lines.pop() || '';

            totalLines += lines.length;
            processor(lines);

            if (totalLines % 100000 === 0) {
                console.log(`  Processed ${totalLines.toLocaleString()} lines...`);
            }
        });

        stream.on('end', () => {
            if (buffer) {
                const lines = [buffer];
                totalLines += lines.length;
                processor(lines);
            }

            const duration = Date.now() - startTime;
            resolve({ totalLines, duration });
        });

        stream.on('error', reject);
    });
}

describe('Large Scale Performance - Log Extractor (2GB+)', () => {
    // 이 테스트는 기본적으로 skip되며, 명시적으로 실행할 때만 동작
    it.skip('should process 2GB log file efficiently', async () => {
        // 1. 파일 생성
        const logFile = await generateLargeLogFile(2);

        // 2. 전체 파싱 테스트
        console.log('\n📊 Testing full file parsing...');
        const parseResult = await processLargeLogInChunks(logFile, 10, (lines) => {
            // 각 청크 파싱
        });

        console.log(`  ✅ Parsed ${parseResult.totalLines.toLocaleString()} lines in ${(parseResult.duration / 1000).toFixed(2)}s`);
        console.log(`  📈 Speed: ${(parseResult.totalLines / (parseResult.duration / 1000)).toFixed(0)} lines/sec`);

        expect(parseResult.totalLines).toBeGreaterThan(10_000_000); // 최소 1천만 줄
        expect(parseResult.duration).toBeLessThan(120_000); // 2분 이내

        // 3. 필터링 테스트
        console.log('\n📊 Testing filtering...');
        let errorCount = 0;
        const filterResult = await processLargeLogInChunks(logFile, 10, (lines) => {
            errorCount += lines.filter(line => line.includes('ERROR')).length;
        });

        console.log(`  ✅ Found ${errorCount.toLocaleString()} ERROR entries`);
        expect(errorCount).toBeGreaterThan(0);

        // 4. 정리
        fs.unlinkSync(logFile);
        console.log('🗑️  Cleaned up test file');
    }, 180000); // 3분 타임아웃

    it.skip('should handle memory efficiently with 2GB file', async () => {
        const logFile = await generateLargeLogFile(2);

        const getMemory = () => {
            if ((performance as any).memory) {
                return (performance as any).memory.usedJSHeapSize / 1024 / 1024;
            }
            return 0;
        };

        const memBefore = getMemory();
        console.log(`📊 Memory before: ${memBefore.toFixed(2)}MB`);

        // 스트리밍 방식으로 처리
        await processLargeLogInChunks(logFile, 10, (lines) => {
            // 처리만 하고 저장하지 않음
        });

        const memAfter = getMemory();
        const memIncrease = memAfter - memBefore;

        console.log(`📊 Memory after: ${memAfter.toFixed(2)}MB`);
        console.log(`📊 Memory increase: ${memIncrease.toFixed(2)}MB`);

        // 스트리밍 방식이므로 메모리 증가가 크지 않아야 함
        if (memBefore > 0) {
            expect(memIncrease).toBeLessThan(500); // 500MB 이내
        }

        fs.unlinkSync(logFile);
    }, 180000);
});

describe('Large Scale Performance - JSON Tools (1GB+)', () => {
    it.skip('should parse 1GB JSON efficiently', () => {
        // 1GB JSON 생성
        console.log('🔧 Generating 1GB JSON...');
        const largeData = {
            items: Array.from({ length: 1_000_000 }, (_, i) => ({
                id: i,
                name: `Item ${i}`,
                description: 'This is a sample item with some text to increase size. '.repeat(10),
                metadata: {
                    tags: ['tag1', 'tag2', 'tag3'],
                    timestamp: new Date().toISOString(),
                }
            }))
        };

        // 직렬화
        console.log('📊 Testing stringify...');
        const startStringify = Date.now();
        const jsonString = JSON.stringify(largeData);
        const stringifyDuration = Date.now() - startStringify;

        const sizeInMB = jsonString.length / 1024 / 1024;
        console.log(`  ✅ Stringified ${sizeInMB.toFixed(2)}MB in ${stringifyDuration.toFixed(2)}ms`);

        // 파싱
        console.log('📊 Testing parse...');
        const startParse = Date.now();
        const parsed = JSON.parse(jsonString);
        const parseDuration = Date.now() - startParse;

        console.log(`  ✅ Parsed ${sizeInMB.toFixed(2)}MB in ${parseDuration.toFixed(2)}ms`);

        expect(parsed.items.length).toBe(1_000_000);
        expect(parseDuration).toBeLessThan(10_000); // 10초 이내
    }, 60000); // 1분 타임아웃
});
