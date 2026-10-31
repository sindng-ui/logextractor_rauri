import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { LOG_VIEW_CONFIG } from '../../../constants/logViewUI';

interface UseLogViewerScrollProps {
    totalMatches: number;
    workerReady: boolean;
    initialScrollIndex?: number;
    absoluteOffset?: number;
    fileName?: string;
    onSyncScroll?: (deltaY: number) => void;
    callbacks: {
        scrollToIndex: (index: number, options?: { align: 'start' | 'center' | 'end' }) => void;
    };
}

export function useLogViewerScroll({
    totalMatches,
    workerReady,
    initialScrollIndex,
    absoluteOffset = 0,
    fileName,
    onSyncScroll,
    callbacks
}: UseLogViewerScrollProps) {
    const [atBottom, setAtBottom] = useState(true);
    const [isAutoScrollPaused, setIsAutoScrollPaused] = useState(false);

    // Sync Scroll tracking
    const [isShiftDown, setIsShiftDown] = useState(false);
    const shiftPressedRef = useRef(false);
    const ignoreSyncRef = useRef(false);
    const scrollTopRef = useRef<number>(0);

    const dynamicOverscan = useMemo(() => {
        return atBottom ? LOG_VIEW_CONFIG.OVERSCAN_COUNT_LOW : LOG_VIEW_CONFIG.OVERSCAN_COUNT;
    }, [atBottom]);

    const handleAtBottomChange = useCallback((isAtBottom: boolean) => {
        setAtBottom(isAtBottom);
    }, []);

    const handleScroll = useCallback((top: number) => {
        scrollTopRef.current = top;
        if (onSyncScroll && shiftPressedRef.current) {
            if (ignoreSyncRef.current) {
                ignoreSyncRef.current = false;
                return;
            }
            onSyncScroll(top);
        }
    }, [onSyncScroll]);

    // Smart Auto-Scroll
    useEffect(() => {
        if (!isAutoScrollPaused && atBottom && totalMatches > 0) {
            requestAnimationFrame(() => {
                callbacks.scrollToIndex(totalMatches - 1, { align: 'end' });
            });
        }
    }, [totalMatches, isAutoScrollPaused, atBottom, callbacks]);

    // Track Shift key for sync scrolling and overrides
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.repeat) return;
            if (e.key === 'Shift') {
                shiftPressedRef.current = true;
                setIsShiftDown(true);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                shiftPressedRef.current = false;
                setIsShiftDown(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Initial Scroll Handling
    const hasInitialScrolled = useRef(false);

    useEffect(() => {
        // Reset scroll tracking when file changes
        hasInitialScrolled.current = false;
    }, [fileName]);

    useEffect(() => {
        if (!hasInitialScrolled.current && workerReady && initialScrollIndex !== undefined && totalMatches > 0) {
            const relative = initialScrollIndex - absoluteOffset;
            if (relative >= 0 && relative < totalMatches) {
                hasInitialScrolled.current = true;

                requestAnimationFrame(() => {
                    setTimeout(() => {
                        const target = Math.max(0, relative - 5);
                        callbacks.scrollToIndex(target, { align: 'start' });
                    }, 100);
                });
            }
        }
    }, [workerReady, initialScrollIndex, absoluteOffset, totalMatches, callbacks]);

    return {
        atBottom,
        setAtBottom,
        isAutoScrollPaused,
        setIsAutoScrollPaused,
        dynamicOverscan,
        handleAtBottomChange,
        handleScroll,
        scrollTopRef,
        isShiftDown,
        shiftPressedRef,
        ignoreSyncRef,
        hasInitialScrolled
    };
}
