import Dexie, { Table } from 'dexie';

/**
 * 아카이브된 로그 항목 인터페이스
 */
export interface ArchivedLog {
    id?: number; // Auto-increment primary key
    title: string; // 로그 제목
    content: string; // 선택된 로그 텍스트
    tags: string[]; // 태그 배열
    memo?: string; // 사용자 메모/노트
    sourceFile?: string; // 원본 파일 경로
    sourceLineStart?: number; // 원본 파일 시작 라인
    sourceLineEnd?: number; // 원본 파일 끝 라인
    createdAt: number; // 생성 타임스탬프 (검색/정렬용)
    updatedAt?: number; // 수정 타임스탬프
    metadata?: {
        highlightMatches?: string[]; // 하이라이트할 키워드
        folder?: string; // 폴더 분류
        color?: string; // 사용자 지정 색상
    };
}

/**
 * 검색 옵션 인터페이스
 */
export interface SearchOptions {
    query?: string; // 검색 쿼리
    isRegex?: boolean; // RegEx 사용 여부
    tags?: string[]; // 태그 필터
    folder?: string; // 폴더 필터
    sortBy?: 'createdAt' | 'title' | 'updatedAt'; // 정렬 기준
    sortOrder?: 'asc' | 'desc'; // 정렬 순서
    limit?: number; // 결과 제한
    offset?: number; // 페이징 오프셋
}

/**
 * 로그 아카이브 데이터베이스
 * IndexedDB 기반 (Dexie.js 사용)
 */
export class LogArchiveDB extends Dexie {
    archives!: Table<ArchivedLog, number>;

    constructor() {
        super('LogArchiveDB');

        // 버전 1: 초기 스키마
        this.version(1).stores({
            archives: '++id, title, *tags, sourceFile, createdAt, updatedAt, metadata.folder'
        });

        // 버전 2: memo 필드 추가 (하위 호환 - 기존 데이터 유지)
        this.version(2).stores({
            archives: '++id, title, *tags, sourceFile, createdAt, updatedAt, metadata.folder'
        });
    }



    /**
     * 아카이브 저장
     */
    async saveArchive(archive: Omit<ArchivedLog, 'id' | 'createdAt'>): Promise<number> {
        const now = Date.now();
        const newArchive: Omit<ArchivedLog, 'id'> = {
            ...archive,
            createdAt: now,
            updatedAt: now,
        };

        return await this.archives.add(newArchive as ArchivedLog);
    }

    /**
     * 아카이브 업데이트
     */
    async updateArchive(id: number, updates: Partial<ArchivedLog>): Promise<number> {
        return await this.archives.update(id, {
            ...updates,
            updatedAt: Date.now(),
        });
    }

    /**
     * 아카이브 삭제
     */
    async deleteArchive(id: number): Promise<void> {
        await this.archives.delete(id);
    }

    /**
     * ID로 아카이브 조회
     */
    async getArchive(id: number): Promise<ArchivedLog | undefined> {
        return await this.archives.get(id);
    }

    /**
     * 모든 태그 목록 조회 (중복 제거)
     */
    async getAllTags(): Promise<string[]> {
        // Dexie의 uniqueKeys를 사용하여 전체 데이터를 로드하지 않고 인덱스에서 태그만 추출
        const uniqueTags = await this.archives.orderBy('tags').uniqueKeys();
        return uniqueTags.map(tag => String(tag)).sort();
    }

    /**
     * 모든 폴더 목록 조회 (중복 제거)
     */
    async getAllFolders(): Promise<string[]> {
        // Dexie의 uniqueKeys를 사용하여 전체 데이터를 로드하지 않고 인덱스에서 폴더만 추출
        const uniqueFolders = await this.archives.orderBy('metadata.folder').uniqueKeys();
        return uniqueFolders
            .map(folder => String(folder))
            .filter(folder => folder && folder !== 'undefined') // 유효한 폴더명만 필터링
            .sort();
    }

    /**
     * 고급 검색
     */
    async searchArchives(options: SearchOptions = {}): Promise<ArchivedLog[]> {
        const {
            query = '',
            isRegex = false,
            tags = [],
            folder,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            limit,
            offset = 0,
        } = options;

        let collection = this.archives.toCollection();

        // 폴더 필터
        if (folder) {
            if (folder === 'Uncategorized') {
                collection = collection.filter(archive => !archive.metadata?.folder);
            } else {
                collection = collection.filter(archive => archive.metadata?.folder === folder);
            }
        }

        // 태그 필터 (AND 조건)
        if (tags.length > 0) {
            collection = collection.filter(archive => {
                return tags.every(tag => archive.tags.includes(tag));
            });
        }

        // 텍스트 검색
        if (query) {
            if (isRegex) {
                try {
                    const regex = new RegExp(query, 'is');
                    collection = collection.filter(archive => {
                        return regex.test(archive.title) || regex.test(archive.content);
                    });
                } catch (e) {
                    console.warn('Invalid regex pattern:', query);
                }
            } else {
                const lowerQuery = query.toLowerCase();
                collection = collection.filter(archive => {
                    return (
                        archive.title.toLowerCase().includes(lowerQuery) ||
                        archive.content.toLowerCase().includes(lowerQuery)
                    );
                });
            }
        }

        // 정렬 및 페이징 최적화
        // sortOrder가 desc이고 기본 정렬 키를 사용하는 경우, reverse()를 먼저 적용
        if (sortOrder === 'desc') {
            collection = collection.reverse();
        }

        // offset/limit이 있는 경우 먼저 적용 (전체를 메모리에 로드하지 않음)
        if (offset > 0) {
            collection = collection.offset(offset);
        }
        if (limit !== undefined) {
            collection = collection.limit(limit);
        }

        // 최종 결과 반환 (메모리에 로드되는 데이터는 페이징된 결과만)
        const results = await collection.sortBy(sortBy);

        return sortOrder === 'desc' ? results.reverse() : results;
    }

    /**
     * 전체 아카이브 개수 조회
     */
    async getArchiveCount(options: Omit<SearchOptions, 'limit' | 'offset' | 'sortBy' | 'sortOrder'> = {}): Promise<number> {
        const {
            query = '',
            isRegex = false,
            tags = [],
            folder,
        } = options;

        let collection = this.archives.toCollection();

        // 폴더 필터
        if (folder) {
            if (folder === 'Uncategorized') {
                collection = collection.filter(archive => !archive.metadata?.folder);
            } else {
                collection = collection.filter(archive => archive.metadata?.folder === folder);
            }
        }

        // 태그 필터
        if (tags.length > 0) {
            collection = collection.filter(archive => {
                return tags.every(tag => archive.tags.includes(tag));
            });
        }

        // 텍스트 검색
        if (query) {
            if (isRegex) {
                try {
                    const regex = new RegExp(query, 'is');
                    collection = collection.filter(archive => {
                        return regex.test(archive.title) || regex.test(archive.content);
                    });
                } catch (e) {
                    console.warn('Invalid regex pattern:', query);
                }
            } else {
                const lowerQuery = query.toLowerCase();
                collection = collection.filter(archive => {
                    return (
                        archive.title.toLowerCase().includes(lowerQuery) ||
                        archive.content.toLowerCase().includes(lowerQuery)
                    );
                });
            }
        }

        return await collection.count();
    }

    /**
     * 모든 데이터 삭제 (초기화)
     */
    async clearAll(): Promise<void> {
        await this.archives.clear();
    }

    /**
     * 데이터베이스 내보내기 (JSON)
     */
    async exportToJSON(): Promise<string> {
        const archives = await this.archives.toArray();
        return JSON.stringify(archives, null, 2);
    }

    /**
     * 데이터베이스 가져오기 (JSON)
     */
    async importFromJSON(jsonString: string): Promise<number> {
        try {
            const archives: ArchivedLog[] = JSON.parse(jsonString);

            // 기존 ID 제거 (auto-increment 사용)
            const archivesToImport = archives.map(({ id, ...rest }) => rest);

            await this.archives.bulkAdd(archivesToImport as ArchivedLog[]);
            return archivesToImport.length;
        } catch (e) {
            console.error('Failed to import archives:', e);
            throw new Error('Invalid JSON format');
        }
    }

    /**
     * 태그별 통계 (Unique Keys + Count 방식)
     * 데이터가 많을 때 전체를 순회하는 것보다 Index Scan(uniqueKeys) 후 Count가 훨씬 빠름 (Low Cardinality 가정)
     */
    async getTagStatistics(): Promise<Record<string, number>> {
        const tagCounts: Record<string, number> = {};

        // 1. 존재하는 모든 Unique 태그 조회
        const uniqueTags = await this.archives.orderBy('tags').uniqueKeys();

        // 2. 각 태그별 개수 조회 (병렬 처리)
        // 태그 개수가 많지 않다고 가정 (일반적으로 수십~수백 개 수준)
        await Promise.all(uniqueTags.map(async (key) => {
            const tag = String(key);
            const count = await this.archives.where('tags').equals(tag).count();
            if (count > 0) {
                tagCounts[tag] = count;
            }
        }));

        return tagCounts;
    }

    /**
     * 폴더별 통계 (Unique Keys + Count 방식)
     */
    async getFolderStatistics(): Promise<Record<string, number>> {
        const folderCounts: Record<string, number> = {};

        // 1. 존재하는 모든 Folder 조회
        const uniqueFolders = await this.archives.orderBy('metadata.folder').uniqueKeys();

        // 2. 각 폴더별 개수 조회
        await Promise.all(uniqueFolders.map(async (key) => {
            if (!key) return; // undefined/null 스킵
            const folder = String(key);
            const count = await this.archives.where('metadata.folder').equals(folder).count();
            if (count > 0) {
                folderCounts[folder] = count;
            }
        }));

        // 3. Uncategorized (폴더 없는 항목) 계산
        // 전체 개수 - 폴더가 있는 항목들의 합
        const total = await this.archives.count();
        const categorizedCount = Object.values(folderCounts).reduce((a, b) => a + b, 0);

        if (total > categorizedCount) {
            folderCounts['Uncategorized'] = total - categorizedCount;
        }

        return folderCounts;
    }

    /**
     * 시간별 트렌드 (일별)
     */
    async getDailyTrend(days: number = 30): Promise<Array<{ date: string; count: number }>> {
        const now = Date.now();
        const startTime = now - (days * 24 * 60 * 60 * 1000);

        const archives = await this.archives
            .where('createdAt')
            .above(startTime)
            .toArray();

        // 날짜별로 그룹화
        const dateCounts: Record<string, number> = {};

        archives.forEach(archive => {
            const date = new Date(archive.createdAt).toISOString().split('T')[0];
            dateCounts[date] = (dateCounts[date] || 0) + 1;
        });

        // 배열로 변환 및 정렬
        return Object.entries(dateCounts)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    /**
     * 최근 활동 통계
     */
    async getRecentActivity(limit: number = 10): Promise<ArchivedLog[]> {
        return await this.archives
            .orderBy('createdAt')
            .reverse()
            .limit(limit)
            .toArray();
    }

    /**
     * 전체 통계 요약
     */
    async getStatisticsSummary(): Promise<{
        totalArchives: number;
        totalTags: number;
        totalFolders: number;
        mostUsedTags: Array<{ tag: string; count: number }>;
        recentArchives: number; // 최근 7일
    }> {
        const totalArchives = await this.archives.count();
        const allTags = await this.getAllTags();
        const allFolders = await this.getAllFolders();
        const tagStats = await this.getTagStatistics();

        // 가장 많이 사용된 태그 (상위 5개)
        const mostUsedTags = Object.entries(tagStats)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // 최근 7일간 아카이브 수
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const recentArchives = await this.archives
            .where('createdAt')
            .above(sevenDaysAgo)
            .count();

        return {
            totalArchives,
            totalTags: allTags.length,
            totalFolders: allFolders.length,
            mostUsedTags,
            recentArchives,
        };
    }

    /**
     * 스토리지 사용량 조회 (bytes)
     */
    async getStorageUsage(): Promise<{ totalBytes: number; count: number; avgBytes: number }> {
        let totalBytes = 0;
        let count = 0;

        await this.archives.each(archive => {
            totalBytes += new Blob([archive.content]).size;
            if (archive.memo) totalBytes += new Blob([archive.memo]).size;
            count++;
        });

        return {
            totalBytes,
            count,
            avgBytes: count > 0 ? Math.round(totalBytes / count) : 0,
        };
    }

    /**
     * 지정된 용량(바이트)보다 큰 아카이브 삭제
     * @param sizeBytes 기준 용량 (Bytes)
     */
    async deleteLargerThan(sizeBytes: number): Promise<number> {
        const largeArchives: number[] = [];
        await this.archives.each(archive => {
            const contentSize = new Blob([archive.content]).size;
            const memoSize = archive.memo ? new Blob([archive.memo]).size : 0;
            if ((contentSize + memoSize) > sizeBytes && archive.id) {
                largeArchives.push(archive.id);
            }
        });

        if (largeArchives.length > 0) {
            await this.archives.bulkDelete(largeArchives);
        }
        return largeArchives.length;
    }


    /**
     * 아카이브를 크기 순으로 정렬하여 반환
     */
    async getArchivesSortedBySize(limit: number = 20): Promise<Array<{ id: number; title: string; sizeBytes: number; createdAt: number }>> {
        const archives = await this.archives.toArray();
        return archives
            .map(a => ({
                id: a.id!,
                title: a.title,
                sizeBytes: new Blob([a.content]).size,
                createdAt: a.createdAt,
            }))
            .sort((a, b) => b.sizeBytes - a.sizeBytes)
            .slice(0, limit);
    }

    /**
     * N일 이전 아카이브 일괄 삭제
     */
    async deleteOlderThan(days: number): Promise<number> {
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        const oldArchives = await this.archives
            .where('createdAt')
            .below(cutoff)
            .primaryKeys();

        await this.archives.bulkDelete(oldArchives);
        return oldArchives.length;
    }
}

// 싱글톤 인스턴스
export const db = new LogArchiveDB();
