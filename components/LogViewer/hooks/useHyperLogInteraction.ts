import { useRef, useCallback, useEffect } from 'react';

export interface UseHyperLogInteractionProps {
    absoluteOffset?: number;
    onLineClick?: (index: number, isShift?: boolean, isCtrl?: boolean) => void;
    onLineDoubleClick?: (index: number) => void;
    selectedIndices?: Set<number>;
    scrollContainerRef: React.RefObject<HTMLDivElement>;
}

export const useHyperLogInteraction = ({
    absoluteOffset = 0,
    onLineClick,
    onLineDoubleClick,
    selectedIndices,
    scrollContainerRef
}: UseHyperLogInteractionProps) => {
    const isDraggingRef = useRef(false);

    const handleLineAction = useCallback((e: React.MouseEvent, index: number, type: 'click' | 'dbclick' | 'enter') => {
        if (e.altKey) {
            // Browser native text selection allowed
            return;
        }

        if (e.button === 0 && (type !== 'enter' || isDraggingRef.current)) {
            window.getSelection()?.removeAllRanges();
        }

        if (type === 'click' && scrollContainerRef.current) {
            scrollContainerRef.current.focus({ preventScroll: true });
        }

        const globalIndex = index + absoluteOffset;

        if (type === 'click') {
            if (onLineClick) {
                const sel = window.getSelection();
                const hasText = sel && !sel.isCollapsed && sel.toString().trim().length > 0;

                if (e.button === 2 && (hasText || selectedIndices?.has(globalIndex))) {
                    return;
                }

                if (e.button === 0) {
                    e.preventDefault();
                    isDraggingRef.current = true;
                }
                onLineClick(globalIndex, e.shiftKey, e.ctrlKey || e.metaKey);
            }
        } else if (type === 'enter' && isDraggingRef.current && onLineClick) {
            onLineClick(globalIndex, true, false);
        } else if (type === 'dbclick' && onLineDoubleClick) {
            onLineDoubleClick(globalIndex);
        }
    }, [absoluteOffset, onLineClick, onLineDoubleClick, selectedIndices, scrollContainerRef]);

    const handleMouseUp = useCallback(() => {
        isDraggingRef.current = false;
    }, []);

    useEffect(() => {
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseUp]);

    return { handleLineAction, isDraggingRef };
};
