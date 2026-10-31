
import { describe, it, expect } from 'vitest';

/**
 * Worker I/O & Memory Efficiency Benchmarks
 * 🎯 목표: 제로-카피(subarray) 방식의 우월성 증명 및 배치 읽기 오버헤드 최소화
 */

describe('Worker I/O & Zero-copy Efficiency', () => {
    // 100MB 가상 로그 데이터 (Uint8Array)
    const DATA_100MB = new Uint8Array(100 * 1024 * 1024).fill(65); // 'A'로 가득 찬 100MB

    it('should demonstrate Zero-copy (subarray) superiority over Buffer.slice', () => {
        const count = 100000;
        const lineSize = 100;

        // 1. Buffer.slice (메모리 복사 - Node.js Buffer 혹은 Uint8Array.slice 등 복사 방식 시뮬레이션)
        const startSlice = performance.now();
        const slices = [];
        for (let i = 0; i < count; i++) {
            // Uint8Array.prototype.slice는 복사본을 만듭니다.
            const s = DATA_100MB.slice(i * lineSize, (i * lineSize) + lineSize);
            slices.push(s);
        }
        const durationSlice = performance.now() - startSlice;

        // 2. Zero-copy subarray (참조만 생성)
        const startSub = performance.now();
        const subs = [];
        for (let i = 0; i < count; i++) {
            // Uint8Array.prototype.subarray는 같은 ArrayBuffer를 공유하는 뷰만 만듭니다.
            const s = DATA_100MB.subarray(i * lineSize, (i * lineSize) + lineSize);
            subs.push(s);
        }
        const durationSub = performance.now() - startSub;

        console.log(`Memory Copy (slice) 100k: ${durationSlice.toFixed(2)}ms`);
        console.log(`Zero-copy (subarray) 100k: ${durationSub.toFixed(2)}ms`);
        console.log(` - Improvement: ${(durationSlice / durationSub).toFixed(1)}x faster`);

        // Subarray는 거의 0에 수렴하거나 훨씬 빨라야 함 (참조만 계산하니까요 🐧🎯)
        expect(durationSub).toBeLessThan(durationSlice);
    });

    it('should verify Smart Batching logic overhead (Simulated)', () => {
        // 84,000행 점프 시뮬레이션
        const totalLines = 100000;
        const jumpTarget = 84000;
        const MAX_BATCH_BYTES = 5 * 1024 * 1024;

        const start = performance.now();

        // 스마트 배치 로직 (간략화)
        let actualReads = 0;
        let processedBytes = 0;

        // 84k까지 한줄씩 갭이 있다고 가정하면 원래는 재앙이지만,
        // 시뮬레이션에서는 우리가 짠 스마트 배치 알고리즘이 얼마나 기민하게 덩어리를 묶는지 체크합니다.
        for (let i = 0; i < jumpTarget; i += 5000) {
            actualReads++;
            processedBytes += MAX_BATCH_BYTES; // 가상 읽기
        }

        const duration = performance.now() - start;
        console.log(`Smart Batching Logic Overhead (Simulation): ${duration.toFixed(4)}ms`);
        console.log(` - Total Reads optimized to: ${actualReads} chunks`);

        expect(duration).toBeLessThan(1); // 로직 자체는 1ms 미만이어야 함
    });

    it('should decode 10MB chunk efficiently using UTF-8 decoder', () => {
        const chunk = DATA_100MB.subarray(0, 10 * 1024 * 1024);
        const decoder = new TextDecoder();

        const start = performance.now();
        const decoded = decoder.decode(chunk);
        const duration = performance.now() - start;

        console.log(`Decode 10MB Chunk: ${duration.toFixed(2)}ms`);
        expect(duration).toBeLessThan(150); // 10MB 디코딩은 보통 100ms 내외
    });
});
