import { useState, useRef, useEffect, useCallback } from 'react';

interface UseLogViewerDataSyncProps {
    workerReady: boolean;
    totalMatches: number;
    onScrollRequest: (startIndex: number, count: number) => Promise<{ lineNum: number; content: string }[]>;
    fileName?: string;
    clearCacheTick?: number;
}

export function useLogViewerDataSync({
    workerReady,
    totalMatches,
    onScrollRequest,
    fileName,
    clearCacheTick
}: UseLogViewerDataSyncProps) {
    const [cachedLines, setCachedLines] = useState<Map<number, { lineNum: number, content: string }>>(new Map());
    const cachedLinesRef = useRef(cachedLines);
    const pendingIndicesRef = useRef<Set<number>>(new Set());
    const isFetchingRef = useRef(false);
    const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const propsRef = useRef({ workerReady, totalMatches, onScrollRequest, fileName });
    useEffect(() => {
        propsRef.current = { workerReady, totalMatches, onScrollRequest, fileName };
    }, [workerReady, totalMatches, onScrollRequest, fileName]);

    // Clear cache when file changes or worker restarts
    useEffect(() => {
        const newMap = new Map<number, { lineNum: number, content: string }>();
        setCachedLines(newMap);
        cachedLinesRef.current = newMap;
        pendingIndicesRef.current.clear();
    }, [workerReady, fileName, clearCacheTick]);

    const loadMoreItems = useCallback((startIndex: number, endIndex: number) => {
        if (fetchTimeoutRef.current) {
            clearTimeout(fetchTimeoutRef.current);
        }

        fetchTimeoutRef.current = setTimeout(() => {
            const { workerReady, totalMatches, onScrollRequest, fileName: reqFileName } = propsRef.current;

            if (!workerReady || totalMatches === 0) return;
            if (startIndex >= totalMatches) return;

            const safeEndIndex = Math.min(endIndex, totalMatches - 1);
            if (startIndex > safeEndIndex) return;

            const requestContext = { fileName: reqFileName, totalMatches };
            const neededIndices: number[] = [];
            const currentCache = cachedLinesRef.current;

            for (let i = startIndex; i <= safeEndIndex; i++) {
                if (!currentCache.has(i) && !pendingIndicesRef.current.has(i)) {
                    neededIndices.push(i);
                }
            }

            if (neededIndices.length > 0) {
                const reqStart = neededIndices[0];
                const reqEnd = neededIndices[neededIndices.length - 1];

                for (let i = reqStart; i <= reqEnd; i++) pendingIndicesRef.current.add(i);

                const reqCount = reqEnd - reqStart + 1;
                isFetchingRef.current = true;

                onScrollRequest(reqStart, reqCount).then((lines) => {
                    isFetchingRef.current = false;
                    const currentProps = propsRef.current;

                    if (currentProps.fileName === requestContext.fileName) {
                        const cacheMap = cachedLinesRef.current;
                        lines.forEach((line, idx) => {
                            const lineIdx = reqStart + idx;
                            cacheMap.set(lineIdx, line);
                            pendingIndicesRef.current.delete(lineIdx);
                        });

                        requestAnimationFrame(() => {
                            setCachedLines(new Map(cacheMap));
                        });
                    }

                    for (let i = reqStart; i <= reqEnd; i++) pendingIndicesRef.current.delete(i);
                }).catch((e) => {
                    isFetchingRef.current = false;
                    for (let i = reqStart; i <= reqEnd; i++) pendingIndicesRef.current.delete(i);
                });
            }
        }, 16);
    }, []);

    return {
        cachedLines,
        cachedLinesRef,
        loadMoreItems,
        isFetchingRef
    };
}
