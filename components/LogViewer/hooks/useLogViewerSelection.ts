import { useState, useRef, useEffect, useCallback } from 'react';

interface UseLogViewerSelectionProps {
    onLineClick?: (index: number, isShift?: boolean, isCtrl?: boolean) => void;
    onDrop?: (file: File) => void;
    containerRef: React.RefObject<HTMLElement | null>;
}

export function useLogViewerSelection({
    onLineClick,
    onDrop,
    containerRef
}: UseLogViewerSelectionProps) {
    // Drag and Drop (File)
    const [dragActive, setDragActive] = useState(false);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
        else if (e.type === 'dragleave') setDragActive(false);
    }, []);

    const handleDropEvent = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0] && onDrop) {
            onDrop(e.dataTransfer.files[0]);
        }
    }, [onDrop]);

    // Line Selection (Mouse Drag)
    const isDraggingSelection = useRef(false);
    const dragStartCtrlKey = useRef(false);

    useEffect(() => {
        const handleGlobalMouseUp = () => {
            isDraggingSelection.current = false;
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    const handleLineMouseDown = useCallback((index: number, e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left click

        containerRef.current?.focus({ preventScroll: true });

        // Text Selection Mode (Alt + Click/Drag ONLY)
        if (e.altKey) {
            onLineClick && onLineClick(-1, false, false); // Deselect
            return;
        }

        e.preventDefault();

        // Clear native text selection
        if (window.getSelection) {
            window.getSelection()?.removeAllRanges();
        }

        isDraggingSelection.current = true;
        dragStartCtrlKey.current = e.ctrlKey || e.metaKey;

        onLineClick && onLineClick(index, e.shiftKey, e.ctrlKey || e.metaKey);
    }, [onLineClick, containerRef]);

    const handleLineMouseEnter = useCallback((index: number, e: React.MouseEvent) => {
        if (isDraggingSelection.current && onLineClick) {
            onLineClick(index, true, dragStartCtrlKey.current);
        }
    }, [onLineClick]);

    return {
        dragActive,
        handleDrag,
        handleDropEvent,
        handleLineMouseDown,
        handleLineMouseEnter
    };
}
