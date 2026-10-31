import { useEffect } from 'react';
import { LogViewerHandle } from '../components/LogViewer/LogViewerPane';
import { LogViewPreferences } from '../types';

interface UseLogShortcutsProps {
    isActive: boolean;
    isDualView: boolean;
    leftViewerRef: React.RefObject<LogViewerHandle>;
    rightViewerRef: React.RefObject<LogViewerHandle>;
    activeLineIndexLeft: number;
    activeLineIndexRight: number;
    setSelectedIndicesLeft: (indices: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
    setSelectedIndicesRight: (indices: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
    activeLineIndexAnchorLeft: number; // For Shift+C naming consistency
    activeLineIndexAnchorRight: number;
    selectedIndicesLeft: Set<number>;
    selectedIndicesRight: Set<number>;
    leftTotalLines: number;
    rightTotalLines: number;
    rawContextOpen: boolean;
    setRawContextOpen: (open: boolean) => void;
    isTransactionDrawerOpen: boolean;
    setIsTransactionDrawerOpen: (open: boolean) => void;
    handleZoomIn: (source?: any) => void;
    handleZoomOut: (source?: any) => void;
    logViewPreferences: LogViewPreferences;
    setActiveLineIndexLeft: (idx: number) => void;
    setActiveLineIndexRight: (idx: number) => void;
    isPerfOpenLeft?: boolean;
    isPerfOpenRight?: boolean;
    toggleLeftBookmark: (idx: number) => void;
    toggleRightBookmark: (idx: number) => void;
}

export function useLogShortcuts({
    isActive,
    isDualView,
    leftViewerRef,
    rightViewerRef,
    activeLineIndexLeft,
    activeLineIndexRight,
    setSelectedIndicesLeft,
    setSelectedIndicesRight,
    selectedIndicesLeft,
    selectedIndicesRight,
    leftTotalLines,
    rightTotalLines,
    rawContextOpen,
    setRawContextOpen,
    isTransactionDrawerOpen,
    setIsTransactionDrawerOpen,
    handleZoomIn,
    handleZoomOut,
    logViewPreferences,
    setActiveLineIndexLeft,
    setActiveLineIndexRight,
    isPerfOpenLeft,
    isPerfOpenRight,
    toggleLeftBookmark,
    toggleRightBookmark
}: UseLogShortcutsProps) {
    // Global Keyboard Event Listener
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (!isActive) return;

            // Sync Scroll (Shift + Arrow Up/Down)
            if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                const direction = e.key === 'ArrowUp' ? -1 : 1;
                if (isDualView) {
                    leftViewerRef.current?.scrollByLines(direction);
                    rightViewerRef.current?.scrollByLines(direction);
                } else {
                    leftViewerRef.current?.scrollByLines(direction);
                }
                return;
            }

            // Page Up / Down
            if (e.key === 'PageUp' || e.key === 'PageDown') {
                e.preventDefault();
                const direction = e.key === 'PageUp' ? -1 : 1;
                const targetRef = isDualView && activeLineIndexRight !== -1 ? rightViewerRef : leftViewerRef;
                targetRef.current?.scrollByPage(direction);
                return;
            }

            // Focus Switch (Ctrl + Arrow Left/Right)
            if (e.ctrlKey && isDualView) {
                if (e.key === 'ArrowLeft') {
                    setActiveLineIndexRight(-1);
                    setSelectedIndicesRight(new Set());
                } else if (e.key === 'ArrowRight') {
                    setActiveLineIndexLeft(-1);
                    setSelectedIndicesLeft(new Set());
                }
            }

            // Bookmark Navigation (Disabled when any Perf Dashboard is active for the target pane)
            if (e.key === 'F3') {
                const targetPerfActive = (e.shiftKey && isDualView) ? isPerfOpenRight : isPerfOpenLeft;
                if (!targetPerfActive) {
                    e.preventDefault();
                    if (e.shiftKey && isDualView) {
                        rightViewerRef.current?.jumpToPrevBookmark();
                    } else {
                        leftViewerRef.current?.jumpToPrevBookmark();
                    }
                } else {
                    // Let PerfDashboard handle it
                    console.log('[useLogShortcuts] F3 Ignored - Perf Dashboard Active');
                }
            }
            if (e.key === 'F4') {
                const targetPerfActive = (e.shiftKey && isDualView) ? isPerfOpenRight : isPerfOpenLeft;
                if (!targetPerfActive) {
                    e.preventDefault();
                    if (e.shiftKey && isDualView) {
                        rightViewerRef.current?.jumpToNextBookmark();
                    } else {
                        leftViewerRef.current?.jumpToNextBookmark();
                    }
                } else {
                    // Let PerfDashboard handle it
                    console.log('[useLogShortcuts] F4 Ignored - Perf Dashboard Active');
                }
            }
            if (e.key === 'Escape') {
                if (rawContextOpen) {
                    e.preventDefault();
                    setRawContextOpen(false);
                }
                if (isTransactionDrawerOpen) {
                    e.preventDefault();
                    setIsTransactionDrawerOpen(false);
                }
            }

            // Space => Bookmark Toggle (Global)
            if (e.key === ' ' || e.code === 'Space') {
                // Ignore if typing in an input
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                    return;
                }

                e.preventDefault();

                // Determine active pane based on focus
                let targetPane: 'left' | 'right' = 'left';
                if (isDualView) {
                    const activeEl = document.activeElement;
                    if (activeEl && activeEl.closest('[data-pane-id="right"]')) {
                        targetPane = 'right';
                    }
                }

                const currentIndex = targetPane === 'right' ? activeLineIndexRight : activeLineIndexLeft;

                if (currentIndex !== -1) {
                    if (targetPane === 'right') toggleRightBookmark(currentIndex);
                    else toggleLeftBookmark(currentIndex);
                }
            }

            // Custom Zoom Handling (Electron Window Zoom)
            if (e.ctrlKey) {
                if (e.shiftKey) {
                    if (e.key === '+' || e.key === '=') {
                        e.preventDefault();
                        const current = (window as any).electronAPI?.getZoomFactor ? (window as any).electronAPI.getZoomFactor() : 1;
                        (window as any).electronAPI?.setZoomFactor && (window as any).electronAPI.setZoomFactor(current + 0.05);
                    } else if (e.key === '-' || e.key === '_') {
                        e.preventDefault();
                        const current = (window as any).electronAPI?.getZoomFactor ? (window as any).electronAPI.getZoomFactor() : 1;
                        (window as any).electronAPI?.setZoomFactor && (window as any).electronAPI.setZoomFactor(Math.max(0.5, current - 0.05));
                    }
                } else {
                    if (e.key === '-') {
                        e.preventDefault();
                    }
                }
                if (e.key === '0') {
                    e.preventDefault();
                    (window as any).electronAPI?.setZoomFactor && (window as any).electronAPI.setZoomFactor(1);
                }

                if (e.key === ']' || e.key === 'BracketRight') {
                    e.preventDefault();
                    handleZoomIn('keyboard');
                }
                if (e.key === '[' || e.key === 'BracketLeft') {
                    e.preventDefault();
                    handleZoomOut('keyboard');
                }
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [isDualView, rawContextOpen, activeLineIndexRight, activeLineIndexLeft, logViewPreferences, isActive, handleZoomIn, handleZoomOut, isTransactionDrawerOpen, setRawContextOpen, setIsTransactionDrawerOpen, setActiveLineIndexLeft, setActiveLineIndexRight, setSelectedIndicesLeft, setSelectedIndicesRight, leftViewerRef, rightViewerRef, isPerfOpenLeft, isPerfOpenRight, toggleLeftBookmark, toggleRightBookmark]);

    // Handle Shift+C (Global Selection Extension)
    useEffect(() => {
        const handleShiftC = (e: KeyboardEvent) => {
            if (e.shiftKey && (e.key === 'c' || e.key === 'C')) {
                const targetPane = (isDualView && activeLineIndexRight !== -1) ? 'right' : 'left';
                const currentSelection = targetPane === 'left' ? selectedIndicesLeft : selectedIndicesRight;
                const setSelection = targetPane === 'left' ? setSelectedIndicesLeft : setSelectedIndicesRight;
                const totalLines = targetPane === 'left' ? leftTotalLines : rightTotalLines;

                if (currentSelection.size > 0) {
                    const sorted = Array.from(currentSelection).sort((a, b) => a - b);
                    const last = sorted[sorted.length - 1];
                    const next = last + 1;

                    if (next < totalLines) {
                        setSelection(prev => {
                            const nextSet = new Set(prev);
                            nextSet.add(next);
                            return nextSet;
                        });
                        const viewer = targetPane === 'left' ? leftViewerRef.current : rightViewerRef.current;
                        viewer?.scrollToIndex(next, { align: 'center' });
                    }
                }
            }
        };

        window.addEventListener('keydown', handleShiftC);
        return () => window.removeEventListener('keydown', handleShiftC);
    }, [isDualView, activeLineIndexRight, activeLineIndexLeft, selectedIndicesLeft, selectedIndicesRight, leftTotalLines, rightTotalLines, setSelectedIndicesLeft, setSelectedIndicesRight, leftViewerRef, rightViewerRef]);
}
