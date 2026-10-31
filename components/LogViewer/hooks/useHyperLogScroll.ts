import React, { useState, useRef, useLayoutEffect, useCallback, useEffect } from 'react';

export interface UseHyperLogScrollProps {
    rowHeight: number;
    onAtBottomChange?: (isAtBottom: boolean) => void;
    onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
    renderTarget: () => void;
}

export const useHyperLogScroll = ({ rowHeight, onAtBottomChange, onScroll, renderTarget }: UseHyperLogScrollProps) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [stableScrollWidth, setStableScrollWidth] = useState(0);
    const [stableScrollTop, setStableScrollTop] = useState(0);
    const [stableScrollLeft, setStableScrollLeft] = useState(0);

    const scrollTopRef = useRef(0);
    const scrollLeftRef = useRef(0);
    const frameId = useRef<number | null>(null);
    const scrollTaskRef = useRef<number | null>(null);

    // Zoom Compensation: Keeps center item stable when font size changes (rowHeight changes)
    const prevRowHeightRef = useRef(rowHeight);
    useLayoutEffect(() => {
        if (prevRowHeightRef.current !== rowHeight) {
            if (scrollContainerRef.current && viewportHeight > 0) {
                const prevRH = prevRowHeightRef.current;
                const currentScrollTop = scrollTopRef.current;

                const centerAbsY = currentScrollTop + viewportHeight / 2;
                const MathFloor = Math.floor;
                const centerFractionalIndex = centerAbsY / prevRH;

                const newCenterAbsY = centerFractionalIndex * rowHeight;
                const newScrollTop = Math.max(0, newCenterAbsY - viewportHeight / 2);

                scrollContainerRef.current.scrollTop = newScrollTop;
                scrollTopRef.current = newScrollTop;
            }
            prevRowHeightRef.current = rowHeight;
            renderTarget(); // force redraw with new scroll
        }
    }, [rowHeight, viewportHeight, renderTarget]);

    // Track viewport resizes
    useEffect(() => {
        if (!scrollContainerRef.current) return;
        const observer = new ResizeObserver(entries => {
            const h = entries[0].contentRect.height;
            if (h !== viewportHeight) {
                setViewportHeight(h);
                renderTarget();
            }
        });
        observer.observe(scrollContainerRef.current);
        return () => observer.disconnect();
    }, [viewportHeight, renderTarget]);

    // Throttled / debounced scroll handler using RAF for smooth canvas paints
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const currentTop = target.scrollTop;
        const currentLeft = target.scrollLeft;
        const isAtBottom = target.scrollHeight - currentTop - target.clientHeight < 2;

        if (onScroll) onScroll(currentTop, target.scrollHeight, target.clientHeight);

        scrollTopRef.current = currentTop;
        scrollLeftRef.current = currentLeft;

        if (frameId.current) cancelAnimationFrame(frameId.current);
        frameId.current = requestAnimationFrame(() => {
            renderTarget();
            frameId.current = null;
        });

        if (scrollTaskRef.current) clearTimeout(scrollTaskRef.current);
        scrollTaskRef.current = window.setTimeout(() => {
            setStableScrollTop(currentTop);
            setStableScrollLeft(currentLeft);
            if (onAtBottomChange) onAtBottomChange(isAtBottom);
        }, 16);
    }, [onAtBottomChange, onScroll, renderTarget]);

    const scrollToTop = useCallback((top: number) => {
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = top;
    }, []);

    const scrollByDelta = useCallback((top: number) => {
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop += top;
    }, []);

    const scrollToIndex = useCallback((index: number, options?: { align: 'start' | 'center' | 'end' }) => {
        if (!scrollContainerRef.current) return;
        let targetTop = index * rowHeight;
        if (options?.align === 'center') targetTop -= viewportHeight / 2 - rowHeight / 2;
        else if (options?.align === 'end') targetTop -= viewportHeight - rowHeight;

        scrollContainerRef.current.scrollTop = Math.max(0, targetTop);
    }, [rowHeight, viewportHeight]);

    const getCenterLineInfo = useCallback(() => {
        const centerAbsY = scrollTopRef.current + viewportHeight / 2;
        const index = Math.floor(centerAbsY / rowHeight);
        const offset = centerAbsY % rowHeight;
        return { index, offset, viewportHeight };
    }, [rowHeight, viewportHeight]);

    return {
        scrollContainerRef,
        viewportHeight,
        stableScrollWidth,
        setStableScrollWidth,
        stableScrollTop,
        stableScrollLeft,
        scrollTopRef,
        scrollLeftRef,
        handleScroll,
        scrollToTop,
        scrollByDelta,
        scrollToIndex,
        getCenterLineInfo
    };
}
