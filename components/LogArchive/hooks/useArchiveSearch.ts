import { useState, useCallback, useEffect, useRef } from 'react';
import { ArchivedLog, SearchOptions } from '../db/LogArchiveDB';
import ArchiveSearchWorker from '../workers/ArchiveSearch.worker.ts?worker';

/**
 * Worker 메시지 타입
 */
type WorkerMessageType =
    | 'SEARCH_ARCHIVES'
    | 'GET_ARCHIVE_COUNT'
    | 'GET_ALL_TAGS'
    | 'GET_ALL_FOLDERS';

interface WorkerMessage {
    type: WorkerMessageType;
    payload?: any;
    requestId?: string;
}

interface WorkerResponse {
    type: string;
    payload: any;
    requestId?: string;
    error?: string;
}

/**
 * 검색 결과 인터페이스
 */
export interface SearchResult {
    archives: ArchivedLog[];
    total: number;
    hasMore: boolean;
}

/**
 * 아카이브 검색 Hook 반환 타입
 */
export interface UseArchiveSearchReturn {
    // 검색 실행
    search: (options: SearchOptions, immediate?: boolean) => Promise<void>;
    loadMore: () => Promise<void>;
    refresh: () => Promise<void>;

    // 검색 결과
    results: ArchivedLog[];
    total: number;
    hasMore: boolean;

    // 상태
    isSearching: boolean;
    error: Error | null;

    // 초기화
    reset: () => void;
}

const PAGE_SIZE = 50;

/**
 * 아카이브 검색 Hook (Worker Thread 사용)
 * 
 * 대용량 데이터 검색을 Worker에서 처리하여 메인 스레드 블로킹 방지
 * 
 * @param debounceMs - 검색 debounce 시간 (기본: 1000ms)
 * 
 * @example
 * ```tsx
 * const { search, results, isSearching, loadMore } = useArchiveSearch();
 * 
 * // 검색 실행
 * await search({ query: 'error', isRegex: false, tags: ['network'] });
 * 
 * // 더 로드하기
 * await loadMore();
 * ```
 */
export function useArchiveSearch(debounceMs: number = 1000): UseArchiveSearchReturn {
    const [results, setResults] = useState<ArchivedLog[]>([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const currentOptionsRef = useRef<SearchOptions | null>(null);
    const currentPageRef = useRef(0);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const pendingRequestsRef = useRef<Map<string, (data: any) => void>>(new Map());

    /**
     * Worker 초기화
     */
    useEffect(() => {
        // Worker 생성
        workerRef.current = new ArchiveSearchWorker();

        // Worker 메시지 리스너
        workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
            const { type, payload, requestId, error: workerError } = e.data;

            if (requestId && pendingRequestsRef.current.has(requestId)) {
                const resolver = pendingRequestsRef.current.get(requestId);
                pendingRequestsRef.current.delete(requestId);

                if (workerError) {
                    setError(new Error(workerError));
                    setIsSearching(false);
                    return;
                }

                resolver?.(payload);
            }
        };

        workerRef.current.onerror = (e: any) => {
            console.error('[ArchiveSearch] Worker Error event caught:', e);
            const detail = {
                message: e.message,
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno,
                error: String(e.error || 'N/A')
            };
            console.warn('[ArchiveSearch] Detailed Info:', detail);
            setError(new Error(`Worker error: ${e.message || 'Unknown error'}`));
            setIsSearching(false);
        };

        // Cleanup
        return () => {
            workerRef.current?.terminate();
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    /**
     * Worker에 메시지 전송 (Promise 래핑)
     */
    const sendWorkerMessage = useCallback(
        <T,>(type: WorkerMessageType, payload?: any): Promise<T> => {
            return new Promise((resolve, reject) => {
                if (!workerRef.current) {
                    reject(new Error('Worker not initialized'));
                    return;
                }

                const requestId = `${type}_${Date.now()}_${Math.random()}`;
                const timeout = setTimeout(() => {
                    pendingRequestsRef.current.delete(requestId);
                    reject(new Error('Worker request timeout'));
                }, 30000); // 30초 타임아웃

                pendingRequestsRef.current.set(requestId, (data: T) => {
                    clearTimeout(timeout);
                    resolve(data);
                });

                const message: WorkerMessage = { type, payload, requestId };
                workerRef.current.postMessage(message);
            });
        },
        []
    );

    /**
     * 검색 실행
     */
    const executeSearch = useCallback(
        async (options: SearchOptions) => {
            setIsSearching(true);
            setError(null);

            try {
                // 페이징 옵션 추가
                const searchOptions: SearchOptions = {
                    ...options,
                    limit: PAGE_SIZE,
                    offset: 0,
                };

                // Worker에서 검색 실행
                const { archives, total } = await sendWorkerMessage<SearchResult>(
                    'SEARCH_ARCHIVES',
                    searchOptions
                );

                setResults(archives);
                setTotal(total);
                setHasMore(archives.length < total);
                currentOptionsRef.current = options;
                currentPageRef.current = 0;
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                setError(error);
                console.error('[ArchiveSearch] Search failed:', error);
            } finally {
                setIsSearching(false);
            }
        },
        [sendWorkerMessage]
    );

    /**
     * Debounced 검색
     */
    const search = useCallback(
        async (options: SearchOptions, immediate: boolean = false) => {
            // 이전 타이머 취소
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }

            if (immediate) {
                await executeSearch(options);
            } else {
                // Debounce
                return new Promise<void>((resolve) => {
                    debounceTimerRef.current = setTimeout(async () => {
                        await executeSearch(options);
                        resolve();
                    }, debounceMs);
                });
            }
        },
        [debounceMs, executeSearch]
    );

    /**
     * 추가 결과 로드 (무한 스크롤)
     */
    const loadMore = useCallback(async () => {
        if (!hasMore || isSearching || !currentOptionsRef.current) {
            return;
        }

        setIsSearching(true);
        setError(null);

        try {
            const nextPage = currentPageRef.current + 1;
            const searchOptions: SearchOptions = {
                ...currentOptionsRef.current,
                limit: PAGE_SIZE,
                offset: nextPage * PAGE_SIZE,
            };

            const { archives, total } = await sendWorkerMessage<SearchResult>(
                'SEARCH_ARCHIVES',
                searchOptions
            );

            setResults(prev => [...prev, ...archives]);
            setTotal(total);
            setHasMore(results.length + archives.length < total);
            currentPageRef.current = nextPage;
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            console.error('[ArchiveSearch] LoadMore failed:', error);
        } finally {
            setIsSearching(false);
        }
    }, [hasMore, isSearching, results.length, sendWorkerMessage]);

    /**
     * 검색 초기화
     */
    const reset = useCallback(() => {
        setResults([]);
        setTotal(0);
        setHasMore(false);
        setError(null);
        currentOptionsRef.current = null;
        currentPageRef.current = 0;

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }
    }, []);

    /**
     * 현재 검색 조건으로 재검색 (데이터 갱신용)
     */
    const refresh = useCallback(async () => {
        if (currentOptionsRef.current) {
            // Keep current offset/limit logic if needed, or just reload first page?
            // For simplicity, let's reload the current view by re-executing search with current options.
            // But if we have scrolled down, we might want to keep the list.
            // For now, let's just re-fetch the *current* set of results effectively?
            // Actually, simplest is to just re-run search(currentOptions) which resets to page 0.
            // If we want to keep scroll position, it's harder. Let's start with reset-search.
            await executeSearch(currentOptionsRef.current);
        } else {
            // Initial load
            await executeSearch({});
        }
    }, [executeSearch]);

    return {
        search,
        loadMore,
        refresh, // Export refresh
        results,
        total,
        hasMore,
        isSearching,
        error,
        reset,
    };
}
