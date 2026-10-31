import { useState, useCallback, useEffect } from 'react';
import { db, ArchivedLog, SearchOptions } from '../db/LogArchiveDB';

/**
 * 로그 아카이브 Hook 반환 타입
 */
export interface UseLogArchiveReturn {
    // CRUD 작업
    saveArchive: (data: Omit<ArchivedLog, 'id' | 'createdAt'>) => Promise<number>;
    updateArchive: (id: number, data: Partial<ArchivedLog>) => Promise<void>;
    deleteArchive: (id: number) => Promise<void>;
    getArchive: (id: number) => Promise<ArchivedLog | undefined>;

    // 메타데이터
    getAllTags: () => Promise<string[]>;
    getAllFolders: () => Promise<string[]>;
    getFolderStatistics: () => Promise<Record<string, number>>;

    // Export/Import
    exportToJSON: () => Promise<string>;
    importFromJSON: (json: string) => Promise<number>;
    clearAll: () => Promise<void>;

    // 통계
    getTotalCount: () => Promise<number>;

    // 상태
    isLoading: boolean;
    error: Error | null;
}

/**
 * 로그 아카이브 Hook
 * 
 * IndexedDB를 통한 로그 저장 및 관리 기능 제공
 * 
 * @example
 * ```tsx
 * const { saveArchive, deleteArchive, getAllTags } = useLogArchive();
 * 
 * // 로그 저장
 * await saveArchive({
 *   title: '에러 로그',
 *   content: 'Error: Connection timeout',
 *   tags: ['error', 'network'],
 * });
 * ```
 */
export function useLogArchive(): UseLogArchiveReturn {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    /**
     * 에러 핸들러
     */
    const handleError = useCallback((err: unknown, operation: string) => {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`[LogArchive] ${operation} failed:`, error);
        setError(error);
        throw error;
    }, []);

    /**
     * 로딩 상태 관리 래퍼
     */
    const withLoading = useCallback(async <T,>(
        operation: () => Promise<T>
    ): Promise<T> => {
        setIsLoading(true);
        setError(null);

        try {
            return await operation();
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * 아카이브 저장
     */
    const saveArchive = useCallback(
        async (data: Omit<ArchivedLog, 'id' | 'createdAt'>): Promise<number> => {
            return withLoading(async () => {
                try {
                    const id = await db.saveArchive(data);
                    console.log('[LogArchive] Saved archive:', id);
                    return id;
                } catch (err) {
                    return handleError(err, 'saveArchive');
                }
            });
        },
        [withLoading, handleError]
    );

    /**
     * 아카이브 업데이트
     */
    const updateArchive = useCallback(
        async (id: number, data: Partial<ArchivedLog>): Promise<void> => {
            return withLoading(async () => {
                try {
                    await db.updateArchive(id, data);
                    console.log('[LogArchive] Updated archive:', id);
                } catch (err) {
                    handleError(err, 'updateArchive');
                }
            });
        },
        [withLoading, handleError]
    );

    /**
     * 아카이브 삭제
     */
    const deleteArchive = useCallback(
        async (id: number): Promise<void> => {
            return withLoading(async () => {
                try {
                    await db.deleteArchive(id);
                    console.log('[LogArchive] Deleted archive:', id);
                } catch (err) {
                    handleError(err, 'deleteArchive');
                }
            });
        },
        [withLoading, handleError]
    );

    /**
     * ID로 아카이브 조회
     */
    const getArchive = useCallback(
        async (id: number): Promise<ArchivedLog | undefined> => {
            return withLoading(async () => {
                try {
                    return await db.getArchive(id);
                } catch (err) {
                    return handleError(err, 'getArchive');
                }
            });
        },
        [withLoading, handleError]
    );

    /**
     * 모든 태그 조회
     */
    const getAllTags = useCallback(async (): Promise<string[]> => {
        try {
            return await db.getAllTags();
        } catch (err) {
            return handleError(err, 'getAllTags');
        }
    }, [handleError]);

    /**
     * 모든 폴더 조회
     */
    const getAllFolders = useCallback(async (): Promise<string[]> => {
        try {
            return await db.getAllFolders();
        } catch (err) {
            return handleError(err, 'getAllFolders');
        }
    }, [handleError]);

    /**
     * 폴더별 아카이브 개수 통계
     */
    const getFolderStatistics = useCallback(async (): Promise<Record<string, number>> => {
        try {
            return await db.getFolderStatistics();
        } catch (err) {
            return handleError(err, 'getFolderStatistics');
        }
    }, [handleError]);

    /**
     * JSON으로 내보내기
     */
    const exportToJSON = useCallback(async (): Promise<string> => {
        return withLoading(async () => {
            try {
                return await db.exportToJSON();
            } catch (err) {
                return handleError(err, 'exportToJSON');
            }
        });
    }, [withLoading, handleError]);

    /**
     * JSON에서 가져오기
     */
    const importFromJSON = useCallback(
        async (json: string): Promise<number> => {
            return withLoading(async () => {
                try {
                    const count = await db.importFromJSON(json);
                    console.log('[LogArchive] Imported archives:', count);
                    return count;
                } catch (err) {
                    return handleError(err, 'importFromJSON');
                }
            });
        },
        [withLoading, handleError]
    );

    /**
     * 모든 아카이브 삭제
     */
    const clearAll = useCallback(async (): Promise<void> => {
        return withLoading(async () => {
            try {
                await db.clearAll();
                console.log('[LogArchive] Cleared all archives');
            } catch (err) {
                handleError(err, 'clearAll');
            }
        });
    }, [withLoading, handleError]);

    /**
     * 전체 아카이브 개수
     */
    const getTotalCount = useCallback(async (): Promise<number> => {
        try {
            return await db.getArchiveCount();
        } catch (err) {
            return handleError(err, 'getTotalCount');
        }
    }, [handleError]);

    return {
        saveArchive,
        updateArchive,
        deleteArchive,
        getArchive,
        getAllTags,
        getAllFolders,
        getFolderStatistics,
        exportToJSON,
        importFromJSON,
        clearAll,
        getTotalCount,
        isLoading,
        error,
    };
}
