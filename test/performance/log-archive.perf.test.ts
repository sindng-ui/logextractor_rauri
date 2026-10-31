/**
 * Performance Benchmark Tests for HappyTool
 * 
 * 이 테스트들은 성능 저하를 조기에 발견하기 위한 벤치마크입니다.
 * 
 * 실행: npm run test:performance
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../components/LogArchive/db/LogArchiveDB';

// 성능 기준 상수
const PERFORMANCE_THRESHOLDS = {
    // Log Archive
    LOG_ARCHIVE_INSERT_1K: 2000,      // 1,000개 삽입: 2초 이내
    LOG_ARCHIVE_SEARCH_50: 500,       // 50개 검색: 0.5초 이내
    LOG_ARCHIVE_GET_TAGS: 100,        // 태그 조회: 0.1초 이내
    LOG_ARCHIVE_STATS: 1000,          // 통계: 1초 이내

    // Memory (MB)
    MAX_MEMORY_INCREASE_1K: 50,       // 1,000개 삽입 시 메모리 증가: 50MB 이내
    MAX_MEMORY_STATS: 20,             // 통계 처리 시 메모리 증가: 20MB 이내
};

// 메모리 헬퍼
const getMemoryUsage = () => {
    if ((performance as any).memory) {
        return (performance as any).memory.usedJSHeapSize / 1024 / 1024; // MB
    }
    return 0;
};

describe('Performance Benchmarks - Log Archive', () => {
    beforeAll(async () => {
        // 테스트 시작 전 DB 초기화
        await db.clearAll();
    });

    it('should insert 1,000 items within performance threshold', async () => {
        const startTime = performance.now();
        const memBefore = getMemoryUsage();

        const items = Array.from({ length: 1000 }, (_, i) => ({
            title: `Performance Test Log ${i}`,
            content: `This is test content for log ${i}. ${i % 5 === 0 ? 'ERROR: Network timeout' : 'INFO: Success'}`,
            tags: i % 5 === 0 ? ['ERROR', 'NETWORK'] : ['INFO'],
            metadata: { folder: i % 10 === 0 ? 'Critical' : 'General' },
        }));

        await db.archives.bulkAdd(items as any);

        const duration = performance.now() - startTime;
        const memAfter = getMemoryUsage();
        const memIncrease = memAfter - memBefore;

        console.log(`  📊 Insert 1K: ${duration.toFixed(2)}ms, Memory: +${memIncrease.toFixed(2)}MB`);

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.LOG_ARCHIVE_INSERT_1K);
        if (memBefore > 0) {
            expect(memIncrease).toBeLessThan(PERFORMANCE_THRESHOLDS.MAX_MEMORY_INCREASE_1K);
        }
    }, 10000);

    it('should retrieve all tags efficiently', async () => {
        const startTime = performance.now();

        const tags = await db.getAllTags();

        const duration = performance.now() - startTime;

        console.log(`  📊 Get Tags: ${duration.toFixed(2)}ms, Found: ${tags.length}`);

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.LOG_ARCHIVE_GET_TAGS);
        expect(tags.length).toBeGreaterThan(0);
    });

    it('should retrieve all folders efficiently', async () => {
        const startTime = performance.now();

        const folders = await db.getAllFolders();

        const duration = performance.now() - startTime;

        console.log(`  📊 Get Folders: ${duration.toFixed(2)}ms, Found: ${folders.length}`);

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.LOG_ARCHIVE_GET_TAGS);
        expect(folders.length).toBeGreaterThan(0);
    });

    it('should search and return 50 results efficiently', async () => {
        const startTime = performance.now();

        const results = await db.searchArchives({
            query: 'test',
            limit: 50
        });

        const duration = performance.now() - startTime;

        console.log(`  📊 Search (50): ${duration.toFixed(2)}ms, Found: ${results.length}`);

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.LOG_ARCHIVE_SEARCH_50);
        expect(results.length).toBeLessThanOrEqual(50);
    });

    it('should perform tag statistics without memory bloat', async () => {
        const startTime = performance.now();
        const memBefore = getMemoryUsage();

        const stats = await db.getTagStatistics();

        const duration = performance.now() - startTime;
        const memAfter = getMemoryUsage();
        const memIncrease = memAfter - memBefore;

        console.log(`  📊 Tag Stats: ${duration.toFixed(2)}ms, Memory: +${memIncrease.toFixed(2)}MB`);

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.LOG_ARCHIVE_STATS);
        expect(Object.keys(stats).length).toBeGreaterThan(0);

        if (memBefore > 0) {
            expect(memIncrease).toBeLessThan(PERFORMANCE_THRESHOLDS.MAX_MEMORY_STATS);
        }
    });

    it('should perform folder statistics without memory bloat', async () => {
        const startTime = performance.now();
        const memBefore = getMemoryUsage();

        const stats = await db.getFolderStatistics();

        const duration = performance.now() - startTime;
        const memAfter = getMemoryUsage();
        const memIncrease = memAfter - memBefore;

        console.log(`  📊 Folder Stats: ${duration.toFixed(2)}ms, Memory: +${memIncrease.toFixed(2)}MB`);

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.LOG_ARCHIVE_STATS);
        expect(Object.keys(stats).length).toBeGreaterThan(0);

        if (memBefore > 0) {
            expect(memIncrease).toBeLessThan(PERFORMANCE_THRESHOLDS.MAX_MEMORY_STATS);
        }
    });

    it('should handle regex search efficiently', async () => {
        const startTime = performance.now();

        const results = await db.searchArchives({
            query: 'error|info',
            isRegex: true,
            limit: 50
        });

        const duration = performance.now() - startTime;

        console.log(`  📊 Regex Search: ${duration.toFixed(2)}ms, Found: ${results.length}`);

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.LOG_ARCHIVE_SEARCH_50);
    });

    it('should handle tag filter search efficiently', async () => {
        const startTime = performance.now();

        const results = await db.searchArchives({
            tags: ['ERROR'],
            limit: 50
        });

        const duration = performance.now() - startTime;

        console.log(`  📊 Tag Filter: ${duration.toFixed(2)}ms, Found: ${results.length}`);

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.LOG_ARCHIVE_SEARCH_50);
    });
});

describe('Performance Benchmarks - Large Scale Log Archive', () => {
    it('should handle 10,000 items search efficiently', async () => {
        // Clear and insert 10K items
        await db.clearAll();

        console.log('  📦 Inserting 10,000 items for large-scale test...');
        const insertStart = performance.now();

        // Insert in chunks to avoid memory issues
        const chunkSize = 1000;
        for (let chunk = 0; chunk < 10; chunk++) {
            const items = Array.from({ length: chunkSize }, (_, i) => {
                const idx = chunk * chunkSize + i;
                return {
                    title: `Large Scale Test ${idx}`,
                    content: `Content ${idx} with random data ${Math.random()}`,
                    tags: idx % 5 === 0 ? ['ERROR'] : idx % 3 === 0 ? ['WARNING'] : ['INFO'],
                    metadata: { folder: idx % 10 === 0 ? 'Critical' : 'General' },
                };
            });

            await db.archives.bulkAdd(items as any);
        }

        const insertDuration = performance.now() - insertStart;
        console.log(`  ✅ Inserted 10K in ${insertDuration.toFixed(2)}ms`);

        // Test search performance
        const searchStart = performance.now();
        const results = await db.searchArchives({
            query: 'test',
            limit: 50
        });
        const searchDuration = performance.now() - searchStart;

        console.log(`  📊 Search 10K dataset: ${searchDuration.toFixed(2)}ms`);

        // Should still be fast even with 10K items
        expect(searchDuration).toBeLessThan(1000); // 1초 이내
        expect(results.length).toBeLessThanOrEqual(50);
    }, 60000); // 60초 타임아웃

    it('should handle statistics on 10,000 items efficiently', async () => {
        const memBefore = getMemoryUsage();
        const startTime = performance.now();

        // 순차 실행으로 변경하여 테스트 환경 메모리 부하 감소 및 안정성 확보
        const tagStats = await db.getTagStatistics();
        const folderStats = await db.getFolderStatistics();

        const duration = performance.now() - startTime;
        const memAfter = getMemoryUsage();
        const memIncrease = memAfter - memBefore;

        console.log(`  📊 Stats on 10K: ${duration.toFixed(2)}ms, Memory: +${memIncrease.toFixed(2)}MB`);

        // Should not load all 10K items into memory
        expect(duration).toBeLessThan(5000); // 5초 이내 (테스트 환경 고려 상향)
        if (memBefore > 0) {
            expect(memIncrease).toBeLessThan(50); // 50MB 이내
        }

        expect(Object.keys(tagStats).length).toBeGreaterThan(0);
        expect(Object.keys(folderStats).length).toBeGreaterThan(0);
    }, 60000); // 60초 타임아웃
});
