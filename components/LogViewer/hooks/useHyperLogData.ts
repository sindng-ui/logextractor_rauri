import { useState, useRef, useCallback, useEffect } from 'react';

// 형님, HTML 엔터티를 완벽하게 디코딩해야 폰트 너비 계산 시 오차가 생기지 않습니다.
export const decodeHTMLEntities = (text: string) => {
    if (!text) return '';
    if (text.indexOf('&') === -1 && text.indexOf('\t') === -1) {
        return text;
    }
    return text
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
        .replace(/\t/g, '    ');
};

export interface CachedLine {
    lineNum: number;
    content: string;
    decodedContent: string;
    levelColor?: string;
}

export interface UseHyperLogDataProps {
    onScrollRequest: (startIndex: number, count: number) => Promise<{ lineNum?: number; content: string }[]>;
    totalCount: number;
    levelMatchers?: { regex: RegExp; color: string }[];
    clearCacheTick?: number;
}

export const useHyperLogData = ({
    onScrollRequest,
    totalCount,
    levelMatchers = [],
    clearCacheTick
}: UseHyperLogDataProps) => {
    const [cachedLines, setCachedLines] = useState<Map<number, CachedLine>>(new Map());
    const cachedLinesRef = useRef(cachedLines);
    const pendingIndices = useRef<Set<number>>(new Set());

    useEffect(() => {
        cachedLinesRef.current = cachedLines;
    }, [cachedLines]);

    useEffect(() => {
        setCachedLines(new Map());
        pendingIndices.current.clear();
    }, [clearCacheTick]);

    // levelMatchers가 변경될 때 캐시되어 있는 라인들의 색상을 즉각 재평가하여 0ms 실시간 반영! ⚡
    useEffect(() => {
        if (cachedLines.size === 0) return;
        setCachedLines(prev => {
            const next = new Map(prev);
            let updated = false;
            next.forEach((cached, key) => {
                let newLevelColor = '#ccc';
                if (levelMatchers && levelMatchers.length > 0) {
                    const prefix = cached.content.substring(0, 100);
                    for (const m of levelMatchers) {
                        if (m.regex.test(prefix)) {
                            newLevelColor = m.color;
                            break;
                        }
                    }
                }
                if (cached.levelColor !== newLevelColor) {
                    next.set(key, { ...cached, levelColor: newLevelColor });
                    updated = true;
                }
            });
            if (updated) {
                cachedLinesRef.current = next;
                return next;
            }
            return prev;
        });
    }, [levelMatchers]);

    const loadVisibleLines = useCallback(async (startIdx: number, endIdx: number) => {
        const needed: number[] = [];
        const currentCache = cachedLinesRef.current;
        const checkStart = Math.max(0, startIdx - 1000);
        const checkEnd = Math.min(totalCount - 1, endIdx + 3000);

        for (let i = checkStart; i <= checkEnd; i++) {
            if (!currentCache.has(i) && !pendingIndices.current.has(i)) {
                needed.push(i);
            }
        }

        if (needed.length > 0) {
            const batchStart = Math.max(0, needed[0] - 1000);
            const batchCount = Math.min(totalCount - batchStart, (needed[needed.length - 1] - batchStart) + 5000);

            for (let i = batchStart; i < batchStart + batchCount; i++) pendingIndices.current.add(i);

            try {
                const lines = await onScrollRequest(batchStart, batchCount);
                if (!lines || lines.length === 0) {
                    for (let i = batchStart; i < batchStart + batchCount; i++) pendingIndices.current.delete(i);
                    return;
                }

                setCachedLines(prev => {
                    const next = new Map(prev);
                    for (let i = batchStart; i < batchStart + batchCount; i++) {
                        pendingIndices.current.delete(i);
                    }

                    lines.forEach((l, idx) => {
                        if (!l) return;
                        const content = typeof l === 'string' ? l : (l.content || '');
                        const decodedContent = decodeHTMLEntities(content);

                        let levelColor = '#ccc';
                        if (levelMatchers && levelMatchers.length > 0) {
                            const prefix = content.substring(0, 100);
                            for (const m of levelMatchers) {
                                if (m.regex.test(prefix)) {
                                    levelColor = m.color;
                                    break;
                                }
                            }
                        }

                        const cached: CachedLine = {
                            lineNum: typeof l === 'string' ? batchStart + idx : (l.lineNum ?? batchStart + idx),
                            content: content,
                            decodedContent,
                            levelColor
                        };
                        next.set(batchStart + idx, cached);
                    });

                    if (next.size > 150000) {
                        const amountToDelete = next.size - 120000;
                        let deleteCount = 0;
                        for (const key of next.keys()) {
                            next.delete(key);
                            deleteCount++;
                            if (deleteCount >= amountToDelete) break;
                        }
                    }
                    cachedLinesRef.current = next;
                    return next;
                });
            } catch (e) {
                console.error('[HyperLog] Fetch failed', e);
                for (let i = batchStart; i < batchStart + batchCount; i++) pendingIndices.current.delete(i);
            }
        }
    }, [onScrollRequest, totalCount, levelMatchers]);

    return { cachedLines, loadVisibleLines };
};
