import { useCallback } from 'react';

interface UseLogViewerKeyboardProps {
    activeLineIndex?: number;
    totalMatches: number;
    absoluteOffset: number;
    rowHeight: number;
    setIsAutoScrollPaused: React.Dispatch<React.SetStateAction<boolean>>;
    onLineClick?: (index: number) => void;
    onLineDoubleClick?: (index: number) => void;
    toggleBookmark: (index: number) => void;
    onCopy?: (ignoreSelection?: boolean) => void;
    onShowBookmarks?: () => void;
    onFocusPaneRequest?: (direction: 'left' | 'right', visualY?: number) => void;
    onSelectAll?: () => void;
    isRawMode: boolean;
    cachedLines?: Map<number, { lineNum: number, content: string }>;
    callbacks: {
        scrollBy: (top: number) => void;
        scrollToIndex: (index: number, options?: { align: 'start' | 'center' | 'end' }) => void;
        getScrollTop: () => number;
    };
    getPageHeight: () => number;
}

export function useLogViewerKeyboard({
    activeLineIndex,
    totalMatches,
    absoluteOffset,
    rowHeight,
    setIsAutoScrollPaused,
    onLineClick,
    onLineDoubleClick,
    toggleBookmark,
    onCopy,
    onShowBookmarks,
    onFocusPaneRequest,
    onSelectAll,
    isRawMode,
    cachedLines,
    callbacks,
    getPageHeight
}: UseLogViewerKeyboardProps) {
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Enter Key => Double Click (e.g., Raw View/Transaction)
        if (e.key === 'Enter') {
            if (activeLineIndex !== undefined && activeLineIndex >= 0 && onLineDoubleClick) {
                if ((e.target as HTMLElement).tagName === 'BUTTON') return;
                e.preventDefault();
                onLineDoubleClick(activeLineIndex);
                return;
            }
        }

        // Space => Bookmark (Removed: handled globally by useLogShortcuts)

        // Ctrl+C => Copy
        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) {
                // If there's a browser text selection, allow the default behavior
                return;
            }

            if (onCopy) {
                e.preventDefault();
                onCopy(false); // Keyboard copy should respect line selection if it exists
                return;
            }
            if (activeLineIndex !== undefined && activeLineIndex >= 0 && cachedLines) {
                const line = cachedLines.get(activeLineIndex);
                if (line && (window as any).electronAPI?.copyToClipboard) {
                    (window as any).electronAPI.copyToClipboard(line.content);
                } else if (line && navigator.clipboard) {
                    navigator.clipboard.writeText(line.content).catch(console.error);
                }
            }
        }

        // Ctrl+A => Select All (Only works when Shift is not pressed to avoid conflict with Ctrl+Shift+A)
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'a' || e.key === 'A')) {
            if (onSelectAll) {
                e.preventDefault();
                e.stopPropagation();
                onSelectAll();
                return;
            }
        }

        // Ctrl+B => Bookmarks dialog
        if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
            if (onShowBookmarks) {
                e.preventDefault();
                onShowBookmarks();
            }
        }

        // Ctrl + Arrows => Viewport pan / Pane Focus Shift
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                callbacks.scrollBy(-rowHeight);
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                callbacks.scrollBy(rowHeight);
            }
            if (e.key === 'ArrowLeft' && onFocusPaneRequest) {
                e.preventDefault();
                const relativeActive = (activeLineIndex ?? 0) - absoluteOffset;
                const visualY = (relativeActive >= 0) ? (relativeActive * rowHeight) - callbacks.getScrollTop() : undefined;
                onFocusPaneRequest('left', visualY);
            }
            if (e.key === 'ArrowRight' && onFocusPaneRequest) {
                e.preventDefault();
                const relativeActive = (activeLineIndex ?? 0) - absoluteOffset;
                const visualY = (relativeActive >= 0) ? (relativeActive * rowHeight) - callbacks.getScrollTop() : undefined;
                onFocusPaneRequest('right', visualY);
            }
        }

        // Auto-scroll toggle & Navigation
        if (!e.ctrlKey && !e.metaKey) {
            if (e.shiftKey && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                setIsAutoScrollPaused(prev => {
                    const newState = !prev;
                    if (!newState) {
                        callbacks.scrollToIndex(totalMatches - 1, { align: 'end' });
                    }
                    return newState;
                });
                return;
            }

            const activeIdx = activeLineIndex ?? 0;
            const relativeActive = activeIdx - absoluteOffset;
            const isFocusedOnPage = relativeActive >= 0 && relativeActive < totalMatches;

            if (e.code === 'ArrowDown' && onLineClick) {
                e.preventDefault();
                const nextRel = isFocusedOnPage ? Math.min(totalMatches - 1, relativeActive + 1) : 0;
                onLineClick(nextRel + absoluteOffset);
                callbacks.scrollToIndex(nextRel, { align: 'center' });
            }
            if (e.code === 'ArrowUp' && onLineClick) {
                e.preventDefault();
                const prevRel = isFocusedOnPage ? Math.max(0, relativeActive - 1) : 0;
                onLineClick(prevRel + absoluteOffset);
                callbacks.scrollToIndex(prevRel, { align: 'center' });
            }
            if (e.code === 'Home' && onLineClick) {
                e.preventDefault();
                onLineClick(0 + absoluteOffset);
                callbacks.scrollToIndex(0, { align: 'start' });
            }
            if (e.code === 'End' && onLineClick) {
                e.preventDefault();
                const lastRel = totalMatches - 1;
                onLineClick(lastRel + absoluteOffset);
                callbacks.scrollToIndex(lastRel, { align: 'end' });
            }
            if ((e.code === 'PageUp' || e.code === 'PageDown') && onLineClick) {
                e.preventDefault();
                const direction = e.code === 'PageUp' ? -1 : 1;
                const pageHeight = getPageHeight() || 800;
                const linesPerPage = Math.floor(pageHeight / rowHeight);

                let targetRel = 0;
                if (isFocusedOnPage) {
                    targetRel = Math.max(0, Math.min(totalMatches - 1, relativeActive + (direction * linesPerPage)));
                } else {
                    targetRel = direction === 1 ? Math.min(totalMatches - 1, linesPerPage) : 0;
                }

                onLineClick(targetRel + absoluteOffset);
                callbacks.scrollToIndex(targetRel, { align: 'center' });
            }
        }
    }, [activeLineIndex, totalMatches, absoluteOffset, rowHeight, setIsAutoScrollPaused, onLineClick, onLineDoubleClick, toggleBookmark, onCopy, onShowBookmarks, onFocusPaneRequest, onSelectAll, cachedLines, callbacks, getPageHeight]);

    return { handleKeyDown };
}
