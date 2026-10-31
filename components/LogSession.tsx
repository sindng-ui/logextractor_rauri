import React from 'react';
import { AnimatePresence } from 'framer-motion';
import * as Lucide from 'lucide-react';
import LogViewerPane, { LogViewerHandle } from './LogViewer/LogViewerPane';
import ConfigurationPanel from './LogViewer/ConfigurationPanel';
import TizenConnectionModal from './TizenConnectionModal';
import { useLogContext } from './LogViewer/LogContext';
import { MAX_SEGMENT_SIZE } from '../hooks/useLogExtractorLogic';
import TopBar from './LogViewer/TopBar';
import LoadingOverlay from './ui/LoadingOverlay';
import { BookmarksModal } from './BookmarksModal';
import GoToLineModal from './GoToLineModal';
import { SpamAnalyzerPanel } from './LogViewer/SpamAnalyzerPanel';
import { LatencySpotlightPanel } from './LogViewer/LatencySpotlightPanel';
import { SplitAnalyzerPanel } from './LogViewer/SplitAnalyzerPanel';
import { useSplitAnalysis, SplitAnalysisResult } from '../hooks/useSplitAnalysis';
import { SplitRawContextViewer } from './LogViewer/SplitRawContextViewer';
import { LogHistogramPanel } from './LogViewer/LogHistogramPanel';

import { useLogSelection } from './LogArchive/hooks/useLogSelection';
import { useLogArchiveContext } from './LogArchive/LogArchiveProvider';
import { useContextMenu } from './ContextMenu';
import { useToast } from '../contexts/ToastContext';
import { useHappyTool } from '../contexts/HappyToolContext';
import TransactionDrawer from './LogViewer/TransactionDrawer';
import { extractTransactionIds } from '../utils/transactionAnalysis';

import { RawContextViewer } from './LogViewer/RawContextViewer';
import { executeQuickCommand } from './LogViewer/ConfigSections/QuickCommandSection';
import { PromptDialog } from './ui/CommonDialogs';
import FindInAllModal from './LogViewer/FindInAllModal';
import FindInAllResultPanel from './LogViewer/FindInAllResultPanel';

const { X, Eraser, ChevronLeft, ChevronRight, GripHorizontal } = Lucide;



interface LogSessionProps {
    isActive: boolean;
    currentTitle?: string;
    onTitleChange?: (title: string) => void;
    /** 전체 찾기 시스템 (useFindInAll 훅 반환값) */
    findInAll?: any;
    tabId?: string; // 🐧⚡ 추가: 현재 탭 ID
}

const LogSession: React.FC<LogSessionProps> = ({
    isActive,
    currentTitle,
    onTitleChange,
    findInAll,
    tabId, // 🐧⚡ 추가
}) => {
    const leftFileInputRef = React.useRef<HTMLInputElement>(null);
    const rightFileInputRef = React.useRef<HTMLInputElement>(null);
    const { isFocusMode } = useHappyTool(); // ✅ Use global focus mode state

    const defaultLogCommand = 'dlogutil -c;logger-mgr --filter $(TAGS); dlogutil -v kerneltime $(TAGS) &';

    // ✅ Resize Detection for Smart Transitions
    const [isResizing, setIsResizing] = React.useState(false);
    React.useEffect(() => {
        let timeout: NodeJS.Timeout;
        const handleResize = () => {
            setIsResizing(true);
            clearTimeout(timeout);
            timeout = setTimeout(() => setIsResizing(false), 200);
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(timeout);
        };
    }, []);


    // Bookmark Modal States
    const [isLeftBookmarksOpen, setLeftBookmarksOpen] = React.useState(false);
    const [isRightBookmarksOpen, setRightBookmarksOpen] = React.useState(false);

    const {
        leftFileName, isDualView, rightFileName,
        setIsTizenModalOpen, isTizenModalOpen, handleTizenStreamStart,
        isTizenQuickConnect, setIsTizenQuickConnect, // Added for Quick Connect
        rawContextOpen, rawContextTargetLine, rawContextHeight, rawContextSourcePane,
        setRawContextOpen, handleRawContextResizeStart,
        leftTotalLines, rightTotalLines, requestLeftRawLines, requestRightRawLines,
        rawViewerRef,
        currentConfig,
        appliedConfig,

        leftViewerRef, leftWorkerReady, leftFilteredCount, requestLeftLines, setActiveLineIndexLeft,
        handleLineDoubleClickAction, activeLineIndexLeft, selectedIndicesLeft, setSelectedIndicesLeft, handleLeftFileChange, handleLeftReset, leftIndexingProgress, handlePasteClipboard,

        rightViewerRef, rightWorkerReady, rightFilteredCount, requestRightLines, setActiveLineIndexRight,
        activeLineIndexRight, selectedIndicesRight, setSelectedIndicesRight, handleRightFileChange, handleRightReset, rightIndexingProgress,
        handleCopyLogs, handleSaveLogs, handleCopyAsConfluenceTable, handleSelectAllLogs,
        leftBookmarks, rightBookmarks, toggleLeftBookmark, toggleRightBookmark,
        clearLeftBookmarks, clearRightBookmarks,
        jumpToHighlight, requestBookmarkedLines, jumpToGlobalLine,
        tizenSocket, sendTizenCommand, sendSerialSpecialKey, handleClearLogs, handleTizenDisconnect,
        handleLineClick,

        // Segmentation
        leftSegmentIndex, setLeftSegmentIndex, leftTotalSegments, leftCurrentSegmentLines,
        rightSegmentIndex, setRightSegmentIndex, rightTotalSegments, rightCurrentSegmentLines,
        isGoToLineModalOpen, setIsGoToLineModalOpen,
        searchInputRef,
        logViewPreferences, // Added
        isPanelOpen, setIsPanelOpen, updateLogViewPreferences, // Added for shortcuts
        isSearchFocused, // Added for Focus Mode
        leftPerformanceHeatmap,
        rightPerformanceHeatmap,
        // Performance Analysis (New)
        leftPerfAnalysisResult, rightPerfAnalysisResult,
        isAnalyzingPerformanceLeft, isAnalyzingPerformanceRight,
        handleAnalyzePerformanceLeft, handleAnalyzePerformanceRight,
        handleJumpToLineLeft, handleJumpToLineRight,
        leftLineHighlightRanges, rightLineHighlightRanges,
        handleJumpToRangeLeft, handleJumpToRangeRight,
        handleViewRawRangeLeft, handleViewRawRangeRight,
        handleCopyRawRangeLeft, handleCopyRawRangeRight,
        rawViewHighlightRange,
        perfDashboardHeight, setPerfDashboardHeight,
        // Transaction Analyzer
        transactionResults, transactionIdentity, transactionSourcePane, isAnalyzingTransaction, isTransactionDrawerOpen,
        setIsTransactionDrawerOpen, analyzeTransactionAction,
        handleZoomIn, handleZoomOut, // ✅ Consumed
        quickFilter, setQuickFilter,
        isSpamAnalyzerOpen, setIsSpamAnalyzerOpen,
        isAnalyzingSpam, spamResultsLeft, requestSpamAnalysisLeft,
        isLatencySpotlightOpen, setIsLatencySpotlightOpen,
        isLogging, setIsLogging, connectionMode, // ✅ Added for Serial mode and logging state
        clearCacheTick,
        leftSharedBuffers, rightSharedBuffers,
        leftWorkerRef, rightWorkerRef,
        splitRatio, setSplitRatio, // ✅ Expose split states
        splitAnalyzerHeight, setSplitAnalyzerHeight, // ✅ Penguin! Added split analyzer height adjustment state
        onAddTab, // ✅ New Tab Callback
        addQuickFilter, // ✅ Smart entity filter addition callback
        addQuickHighlight,
        clearQuickHighlights,
        rules,
        selectedRuleId,
        leftHistogramData, rightHistogramData,
        isHistogramOpen, setIsHistogramOpen
    } = useLogContext();

    const [promptConfig, setPromptConfig] = React.useState<any>(null);

    // 🐧⚡ Global Quick Command Hotkeys (Alt+1 ~ Alt+9)
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Alt + Number (1-9)
            if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
                const num = parseInt(e.key, 10);
                if (isNaN(num) || num < 1 || num > 9) return;
                
                const saved = localStorage.getItem('quickCommands');
                if (saved) {
                    try {
                        const cmds = JSON.parse(saved);
                        const cmdToRun = cmds[num - 1];
                        if (cmdToRun && cmdToRun.cmd) {
                            e.preventDefault();
                            
                            const handlePrompt = (msg: string): Promise<string | null> => {
                                return new Promise((resolve) => {
                                    setPromptConfig({
                                        title: 'Quick Command Input',
                                        description: msg,
                                        onConfirm: (val: string) => resolve(val),
                                        onCancel: () => resolve(null)
                                    });
                                });
                            };

                            // Execute the command via Tizen socket/serial
                            executeQuickCommand(cmdToRun.cmd, sendTizenCommand, handlePrompt);
                        }
                    } catch (err) {
                        console.error('Failed to parse quick commands for hotkey', err);
                    }
                }
            }
        };

        // Register as a global event in the capture phase (to avoid interference from input fields, etc.)
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [sendTizenCommand]);

    // ⏱️ Ctrl+Shift+H: Latency Spotlight Toggle
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyH') {
                e.preventDefault();
                setIsSpamAnalyzerOpen(false);
                setIsLatencySpotlightOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setIsSpamAnalyzerOpen, setIsLatencySpotlightOpen]);

    const [isAnimatingSplit, setIsAnimatingSplit] = React.useState(false);
    const splitAnimTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    const handleSplitAnimateStart = React.useCallback(() => {
        setIsAnimatingSplit(true);
        if (splitAnimTimeoutRef.current) clearTimeout(splitAnimTimeoutRef.current);
        splitAnimTimeoutRef.current = setTimeout(() => {
            setIsAnimatingSplit(false);
        }, 500); // Animation duration match
    }, []);

    const {
        isAnalyzing: isSplitAnalyzing,
        analysisProgress: splitAnalysisProgress,
        analysisResults: splitAnalysisResults,
        performAnalysis: handleSplitAnalysis,
        closeAnalysis: handleCloseSplitAnalysis
    } = useSplitAnalysis(leftWorkerRef, rightWorkerRef, isDualView);

    const [splitRawOpen, setSplitRawOpen] = React.useState(false);
    const [splitRawResult, setSplitRawResult] = React.useState<SplitAnalysisResult | null>(null);

    const handleViewRawSplit = React.useCallback((res: SplitAnalysisResult) => {
        setSplitRawResult(res);
        setSplitRawOpen(true);
    }, []);

    // 🐧⚡ Analyze Diff Resize Logic
    const [isResizingAnalyzer, setIsResizingAnalyzer] = React.useState(false);
    const analyzerResizeRef = React.useRef<{ startY: number, startHeight: number } | null>(null);

    const handleAnalyzerResizeStart = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizingAnalyzer(true);
        analyzerResizeRef.current = {
            startY: e.clientY,
            startHeight: splitAnalyzerHeight
        };
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    }, [splitAnalyzerHeight]);

    React.useEffect(() => {
        if (!isResizingAnalyzer) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!analyzerResizeRef.current) return;
            const deltaY = e.clientY - analyzerResizeRef.current.startY;
            const newHeight = Math.max(150, Math.min(window.innerHeight * 0.8, analyzerResizeRef.current.startHeight + deltaY));
            setSplitAnalyzerHeight(newHeight);
        };

        const handleMouseUp = () => {
            setIsResizingAnalyzer(false);
            analyzerResizeRef.current = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingAnalyzer, setSplitAnalyzerHeight]);

    const handleGoToLineClose = React.useCallback(() => setIsGoToLineModalOpen(false), [setIsGoToLineModalOpen]);
    const handleGoToLineGo = React.useCallback((lineIndex: number, pane: 'left' | 'right') => {
        jumpToGlobalLine(lineIndex, pane);
    }, [jumpToGlobalLine]);

    // Log Archive: Text Selection
    // Log Archive: Text Selection & Line Selection
    const { openSaveDialog, isSaveDialogOpen, isViewerOpen } = useLogArchiveContext();
    // Track latest value with ref: For accessing in useEffect closures without re-renders
    const archiveDialogOpenRef = React.useRef(isSaveDialogOpen);
    const archiveViewerOpenRef = React.useRef(isViewerOpen);
    React.useEffect(() => { archiveDialogOpenRef.current = isSaveDialogOpen; }, [isSaveDialogOpen]);
    React.useEffect(() => { archiveViewerOpenRef.current = isViewerOpen; }, [isViewerOpen]);
    const { showContextMenu, ContextMenuComponent } = useContextMenu();
    const { addToast } = useToast(); // ✅ Use Toast for copy feedback
    const logContentRef = React.useRef<HTMLDivElement>(null);
    const { selection: nativeSelection, handleSave: handleNativeSave } = useLogSelection(
        logContentRef,
        isDualView ? undefined : (leftFileName || undefined)
    );

    // === ARCHIVE SAVE (full file) === //
    const MAX_ARCHIVE_LINES = 300_000; // ~30MB @ ~100 bytes/line
    const isLeftArchiveEnabled = leftWorkerReady && leftFilteredCount > 0 && leftFilteredCount <= MAX_ARCHIVE_LINES && !tizenSocket;
    const isRightArchiveEnabled = rightWorkerReady && rightFilteredCount > 0 && rightFilteredCount <= MAX_ARCHIVE_LINES;

    const onArchiveSaveLeft = React.useCallback(async () => {
        if (!leftWorkerReady || leftFilteredCount === 0) return;
        try {
            const lines = await requestLeftLines(0, leftFilteredCount);
            const content = lines.map(l => l.content).join('\n');
            openSaveDialog({
                content,
                sourceFile: leftFileName || undefined,
                startLine: 1,
                endLine: leftFilteredCount,
            });
        } catch (e) {
            console.error('[LogSession] Failed to fetch lines for archive', e);
        }
    }, [leftWorkerReady, leftFilteredCount, requestLeftLines, leftFileName, openSaveDialog]);

    const onArchiveSaveRight = React.useCallback(async () => {
        if (!rightWorkerReady || rightFilteredCount === 0) return;
        try {
            const lines = await requestRightLines(0, rightFilteredCount);
            const content = lines.map(l => l.content).join('\n');
            openSaveDialog({
                content,
                sourceFile: rightFileName || undefined,
                startLine: 1,
                endLine: rightFilteredCount,
            });
        } catch (e) {
            console.error('[LogSession] Failed to fetch lines for archive', e);
        }
    }, [rightWorkerReady, rightFilteredCount, requestRightLines, rightFileName, openSaveDialog]);

    // === NEW CONTEXT MENU LOGIC === //
    const handleUnifiedSave = async () => {
        // 1. Check the browser's current text selection first (handles Alt+Drag)
        const currentSel = window.getSelection();
        const browserText = currentSel && !currentSel.isCollapsed ? currentSel.toString().trim() : null;

        if (browserText || nativeSelection) {
            const content = browserText || nativeSelection?.text || '';
            const sourceFile = isDualView ? undefined : (leftFileName || undefined);

            openSaveDialog({
                content,
                sourceFile,
                // Keep as undefined since exact line numbers are hard to determine for text selection
                startLine: undefined,
                endLine: undefined,
            });
        } else {
            // 2. Line-based selection (click/drag) save logic
            const targetIsLeft = (selectedIndicesLeft && selectedIndicesLeft.size > 0);
            const indices = targetIsLeft ? selectedIndicesLeft : selectedIndicesRight;
            const requestFn = targetIsLeft ? requestLeftLines : requestRightLines;
            const fName = targetIsLeft ? leftFileName : rightFileName;

            if (!indices || indices.size === 0) return;

            const sorted = Array.from(indices).sort((a, b) => a - b);
            const min = sorted[0];
            const max = sorted[sorted.length - 1];
            const count = max - min + 1;

            try {
                const lines = await requestFn(min, count);
                const content = lines
                    .filter((_, idx) => indices.has(min + idx))
                    .map(l => l.content)
                    .join('\n');

                if (content) {
                    openSaveDialog({
                        content,
                        sourceFile: fName,
                        startLine: min + 1,
                        endLine: max + 1
                    });
                }
            } catch (e) {
                console.error('[LogSession] Failed to retrieve selected lines', e);
            }
        }
    };
 
    const handleOpenInNewTab = async () => {
        // Extract text selection or line selection
        const currentSel = window.getSelection();
        const browserText = currentSel && !currentSel.isCollapsed ? currentSel.toString().trim() : null;
 
        let content = '';
        let title = 'Selection';
 
        if (browserText || nativeSelection) {
            content = browserText || nativeSelection?.text || '';
        } else {
            const targetIsLeft = (selectedIndicesLeft && selectedIndicesLeft.size > 0);
            const indices = targetIsLeft ? selectedIndicesLeft : selectedIndicesRight;
            const requestFn = targetIsLeft ? requestLeftLines : requestRightLines;
 
            if (!indices || indices.size === 0) return;
 
            const sorted = Array.from(indices).sort((a, b) => a - b);
            const min = sorted[0];
            const max = sorted[sorted.length - 1];
            const count = max - min + 1;
 
            try {
                const lines = await requestFn(min, count);
                content = lines
                    .filter((_, idx) => indices.has(min + idx))
                    .map(l => l.content)
                    .join('\n');
                title = `Lines ${min + 1}-${max + 1}`;
            } catch (e) {
                console.error('[LogSession] Failed to retrieve selected lines for new tab', e);
                return;
            }
        }
 
        if (content && onAddTab) {
            onAddTab(title, content);
            addToast('Opened in new tab', 'success');
        }
    };
 
    const handleContextMenu = React.useCallback(async (e: React.MouseEvent) => {
        if (e.altKey) {
            e.preventDefault();
            return;
        }
        // ✅ Prevent default immediately to ensure custom menu works correctly even with async logic
        e.preventDefault();
 
        // Check the browser's real-time selection area.
        const currentSelection = window.getSelection();
        const hasTextSelection = currentSelection && !currentSelection.isCollapsed && currentSelection.toString().trim().length > 0;
 
        const hasNative = !!nativeSelection || hasTextSelection;
        const hasLeftLine = selectedIndicesLeft && selectedIndicesLeft.size > 0;
        const hasRightLine = isDualView && selectedIndicesRight && selectedIndicesRight.size > 0;
 
        const menuItems = [];
 
        // Determine which pane we are clicking on (best effort)
        const targetPane: 'left' | 'right' = (e.currentTarget as HTMLElement).closest('[data-pane-id="right"]') ? 'right' : 'left';
 
        const hasSelectionInTarget = targetPane === 'left' ? hasLeftLine : hasRightLine;
 
        if (hasNative || hasLeftLine || hasRightLine) {
            menuItems.push({
                label: 'Save Selection to Archive',
                icon: <Lucide.Archive size={16} />,
                action: handleUnifiedSave
            });
 
            menuItems.push({
                label: 'Open in New Tab',
                icon: <Lucide.ExternalLink size={16} />,
                action: handleOpenInNewTab
            });
        }

        // --- Transaction Analysis Entry Point ---
        try {
            const indices = targetPane === 'left' ? selectedIndicesLeft : selectedIndicesRight;
            console.log(`[ContextMenu] Checking selection for ${targetPane}:`, {
                indicesCount: indices?.size || 0,
                indices: Array.from(indices || [])
            });

            if (indices && indices.size >= 1) {
                const activeIdx = targetPane === 'left' ? activeLineIndexLeft : activeLineIndexRight;
                const lineIdx = indices.has(activeIdx) ? activeIdx : Array.from(indices)[0];
                const requestFn = targetPane === 'left' ? requestLeftLines : requestRightLines;

                const lines = await requestFn(lineIdx, 1);
                console.log(`[ContextMenu] Requested line content for idx ${lineIdx}:`, lines?.[0]?.content);

                if (lines && lines.length > 0) {
                    const content = lines[0].content;
                    const extractedIds = extractTransactionIds(content);
                    console.log(`[ContextMenu] IDs extracted from line:`, extractedIds);

                    if (extractedIds.length > 0) {
                        menuItems.push({ type: 'separator' });
                        extractedIds.forEach(id => {
                            const label = id.type === 'tag' ? `Analyze TAG: ${id.value}` : 
                                         id.type === 'pid' ? `Analyze PID: ${id.value}` :
                                         `Analyze TID: ${id.value}`;
                            menuItems.push({
                                label,
                                icon: <Lucide.Activity size={16} />,
                                action: () => analyzeTransactionAction(id, targetPane)
                            });
                        });
                    }
                }
            }
        } catch (err) {
            console.error('[LogSession] Context menu analysis check failed', err);
        }

        if (menuItems.length > 0) {
            showContextMenu(e, menuItems);
        }
    }, [nativeSelection, selectedIndicesLeft, selectedIndicesRight, activeLineIndexLeft, activeLineIndexRight, isDualView, showContextMenu, requestLeftLines, requestRightLines, analyzeTransactionAction]);

    // --- Line Selection Logic (Fallback for when native selection is blocked) ---
    const mousePosRef = React.useRef({ x: 0, y: 0 });
    const [lineSelection, setLineSelection] = React.useState<{ text: string, x: number, y: number } | null>(null);

    // Track Mouse Position
    React.useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            mousePosRef.current = { x: e.clientX, y: e.clientY };
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);


    // --- Log Time Difference Calculation ---
    const [leftSelectionDuration, setLeftSelectionDuration] = React.useState<string | null>(null);
    const [rightSelectionDuration, setRightSelectionDuration] = React.useState<string | null>(null);

    // Calculate Duration when selection changes
    React.useEffect(() => {
        const calculateDuration = async () => {
            // Helper to calculation duration for a specific pane
            const calc = async (indices: Set<number>, requestFn: (start: number, count: number) => Promise<any[]>) => {
                if (!indices || indices.size < 2) return null;

                const sorted = Array.from(indices).sort((a, b) => a - b);
                const firstIdx = sorted[0];
                const lastIdx = sorted[sorted.length - 1];

                try {
                    const [firstLine, lastLine] = await Promise.all([
                        requestFn(firstIdx, 1),
                        requestFn(lastIdx, 1)
                    ]);

                    if (firstLine && firstLine.length > 0 && lastLine && lastLine.length > 0) {
                        const { extractTimestamp, formatDuration } = await import('../utils/logTime');
                        const startTime = extractTimestamp(firstLine[0].content);
                        const endTime = extractTimestamp(lastLine[0].content);

                        if (startTime !== null && endTime !== null) {
                            const diff = Math.abs(endTime - startTime);
                            return formatDuration(diff);
                        }
                    }
                } catch (e) {
                    console.warn('Failed to calculate time difference', e);
                }
                return null;
            };

            // Left Pane
            if (selectedIndicesLeft && selectedIndicesLeft.size > 1) {
                setLeftSelectionDuration(await calc(selectedIndicesLeft, requestLeftLines));
            } else {
                setLeftSelectionDuration(null);
            }

            // Right Pane
            if (isDualView && selectedIndicesRight && selectedIndicesRight.size > 1) {
                setRightSelectionDuration(await calc(selectedIndicesRight, requestRightLines));
            } else {
                setRightSelectionDuration(null);
            }
        };

        const timer = setTimeout(calculateDuration, 200); // Debounce
        return () => clearTimeout(timer);
    }, [selectedIndicesLeft, selectedIndicesRight, isDualView, requestLeftLines, requestRightLines]);

    // Native Selection Logic reused (no lineSelection state needed anymore)
    const activeSelection = nativeSelection; // Keep simple reference if needed, or remove usage



    const handleUnifiedSave_Legacy = async () => {
        if (nativeSelection) {
            handleNativeSave();
        } else {
            // Line Selection Save
            const targetIsLeft = (selectedIndicesLeft && selectedIndicesLeft.size > 0);
            const indices = targetIsLeft ? selectedIndicesLeft : selectedIndicesRight;
            const requestFn = targetIsLeft ? requestLeftLines : requestRightLines;
            const fName = targetIsLeft ? leftFileName : rightFileName;

            if (!indices || indices.size === 0) return;

            const sorted = Array.from(indices).sort((a, b) => a - b);
            const min = sorted[0];
            const max = sorted[sorted.length - 1];
            const count = max - min + 1;

            try {
                const lines = await requestFn(min, count);
                const content = lines
                    .filter((_, idx) => indices.has(min + idx))
                    .map(l => l.content)
                    .join('\n');

                if (content) {
                    openSaveDialog({
                        content,
                        sourceFile: fName,
                        startLine: min + 1,
                        endLine: max + 1
                    });
                }
            } catch (e) {
                console.error('[LogSession] Failed to retrieve selected lines', e);
            }
        }
    };

    const rowHeight = logViewPreferences?.rowHeight || 24; // Use preference or default

    const requestLeftBookmarkedLines = React.useCallback((indices: number[]) => requestBookmarkedLines(indices, 'left', false), [requestBookmarkedLines]);
    const requestRightBookmarkedLines = React.useCallback((indices: number[]) => requestBookmarkedLines(indices, 'right', false), [requestBookmarkedLines]);

    // Track latest state for global shortcuts
    const stateRef = React.useRef({ activeLineIndexLeft, activeLineIndexRight, selectedIndicesLeft, selectedIndicesRight, leftBookmarks, rightBookmarks });
    React.useEffect(() => {
        stateRef.current = { activeLineIndexLeft, activeLineIndexRight, selectedIndicesLeft, selectedIndicesRight, leftBookmarks, rightBookmarks };
    });

    // Update Tab Title based on file name
    React.useEffect(() => {
        if (onTitleChange) {
            const newTitle = leftFileName || 'New Log';
            // Only update if title actually changed to prevent loops
            if (newTitle !== currentTitle) {
                onTitleChange(newTitle);
            }
        }
    }, [leftFileName, onTitleChange, currentTitle]);

    const handleFocusPaneRequest = (direction: 'left' | 'right', visualY?: number) => {
        const targetRef = direction === 'left' ? leftViewerRef : rightViewerRef;
        const targetSetter = direction === 'left' ? setActiveLineIndexLeft : setActiveLineIndexRight;
        const targetSelectionSetter = direction === 'left' ? setSelectedIndicesLeft : setSelectedIndicesRight;
        const targetCount = direction === 'left' ? leftFilteredCount : rightFilteredCount;
        const targetOffset = direction === 'left' ? leftSegmentIndex * MAX_SEGMENT_SIZE : rightSegmentIndex * MAX_SEGMENT_SIZE;

        targetRef.current?.focus();

        if (visualY !== undefined && targetRef.current && targetCount > 0) {
            const targetScrollTop = targetRef.current.getScrollTop();
            const targetAbsY = targetScrollTop + visualY;
            const targetLocalIndex = Math.floor(targetAbsY / rowHeight);
            const targetGlobalIndex = targetLocalIndex + targetOffset;

            const clampedIndex = Math.max(0, Math.min(targetGlobalIndex, targetCount - 1));
            targetSetter(clampedIndex);
            targetSelectionSetter(new Set([clampedIndex]));
        }
    };

    const handleSyncScroll = React.useCallback((scrollTop: number, source: 'left' | 'right') => {
        if (!isDualView) return;
        const targetRef = source === 'left' ? rightViewerRef : leftViewerRef;
        if (targetRef.current) {
            // ✅ Only sync if the difference is significant (> 1px) to avoid jitter/rounding loops
            const currentTop = targetRef.current.getScrollTop();
            if (Math.abs(currentTop - scrollTop) >= 1) {
                targetRef.current.scrollTo(scrollTop);
            }
        }
    }, [isDualView]);

    // Memoized handlers for Left Pane
    const onLineClickLeft = React.useCallback((index: number, isShift?: boolean, isCtrl?: boolean) => handleLineClick('left', index, !!isShift, !!isCtrl), [handleLineClick]);
    const onLineDoubleClickLeft = React.useCallback((index: number) => handleLineDoubleClickAction(index, 'left'), [handleLineDoubleClickAction]);
    const onBrowseLeft = React.useCallback(() => leftFileInputRef.current?.click(), []);
    const onCopyLeft = React.useCallback((ignoreSelection?: boolean) => handleCopyLogs('left', ignoreSelection), [handleCopyLogs]);
    const onCopyAsConfluenceTableLeft = React.useCallback(() => handleCopyAsConfluenceTable('left', true), [handleCopyAsConfluenceTable]);
    const onSaveLeft = React.useCallback((ignoreSelection?: boolean) => handleSaveLogs('left', ignoreSelection), [handleSaveLogs]);
    const onSyncScrollLeft = React.useCallback((dy: number) => handleSyncScroll(dy, 'left'), [handleSyncScroll]);
    const onHighlightJumpLeft = React.useCallback((idx: number) => jumpToHighlight(idx, 'left'), [jumpToHighlight]);
    const onShowBookmarksLeft = React.useCallback(() => setLeftBookmarksOpen(true), []);

    // Helper to generate consistent colors from strings
    const stringToColor = (str: string): string => {
        // 1. Better Hashing (Shift-Add-Xor hash)
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
            hash = hash & hash; // Convert to 32bit integer
        }

        // 2. Use Golden Ratio to spread Hue more evenly
        // 0.618033988749895 is the conjugate of the golden ratio
        const goldenRatioConjugate = 0.618033988749895;
        let h = (Math.abs(hash) * goldenRatioConjugate * 360) % 360;

        // 3. Dynamic Saturation and Lightness for variety
        // Use hash to slightly vary Saturation (65-95%) and Lightness (45-65%)
        const s = 65 + (Math.abs(hash >> 8) % 30);
        const l = 45 + (Math.abs(hash >> 16) % 20);

        // HSL to RGB conversion
        const c = (1 - Math.abs(2 * l / 100 - 1)) * (s / 100);
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l / 100 - c / 2;
        let r_ = 0, g_ = 0, b_ = 0;

        if (0 <= h && h < 60) { r_ = c; g_ = x; b_ = 0; }
        else if (60 <= h && h < 120) { r_ = x; g_ = c; b_ = 0; }
        else if (120 <= h && h < 180) { r_ = 0; g_ = c; b_ = x; }
        else if (180 <= h && h < 240) { r_ = 0; g_ = x; b_ = c; }
        else if (240 <= h && h < 300) { r_ = x; g_ = 0; b_ = c; }
        else if (300 <= h && h < 360) { r_ = c; g_ = 0; b_ = x; }

        const r = Math.round((r_ + m) * 255).toString(16).padStart(2, '0');
        const g = Math.round((g_ + m) * 255).toString(16).padStart(2, '0');
        const b = Math.round((b_ + m) * 255).toString(16).padStart(2, '0');

        return `#${r}${g}${b}`;
    };

    // Prepare Effective Highlights (Explicit + Auto-generated Highlighting for Happy Combos)
    // Prepare Effective Highlights (Explicit + Auto-generated Highlighting for Happy Combos)
    const effectiveHighlights = React.useMemo(() => {
        const baseHighlights = [...(appliedConfig?.highlights || [])];



        // Determine case sensitivity for deduplication
        // Hyungnim, if either is enabled, perform case-sensitive checks during deduplication.
        const isCaseSensitive = !!appliedConfig?.happyCombosCaseSensitive || !!appliedConfig?.colorHighlightsCaseSensitive;

        // Only classify highlights with ACTUAL color as "existing/colliding"
        // Deduplicate based on case sensitivity setting
        const validExistingKeywords = new Set(
            baseHighlights
                .filter(h => h.color && h.color.trim().length > 0)
                .map(h => isCaseSensitive ? h.keyword : h.keyword.toLowerCase())
        );

        const autoHighlights: any[] = [];
        const termsToHighlight = new Set<string>();

        // Collect terms from Happy Groups (Current Config)
        if (appliedConfig?.happyGroups) {
            appliedConfig.happyGroups.forEach(group => {
                if (group.enabled !== false) {
                    group.tags.forEach(tag => {
                        if (tag && tag.trim()) termsToHighlight.add(tag.trim());
                    });
                }
            });
        }



        // Legacy Support (Current Config)
        if (appliedConfig?.includeGroups) {
            appliedConfig.includeGroups.forEach(group => {
                group.forEach(tag => {
                    if (tag && tag.trim()) termsToHighlight.add(tag.trim());
                });
            });
        }



        termsToHighlight.forEach(term => {
            const checkTerm = isCaseSensitive ? term : term.toLowerCase();
            // Only add auto-highlight if NO manual highlight exists for this term
            if (!validExistingKeywords.has(checkTerm)) {
                const color = stringToColor(term);
                autoHighlights.push({
                    id: `auto-${term}`,
                    keyword: term,
                    color: color,
                    lineEffect: false,
                    enabled: true // EXPLICITLY ENABLE
                });
            }
        });

        // Precedence: Manual Updates > Auto Generated
        return [...baseHighlights, ...autoHighlights];
    }, [appliedConfig, rules]);

    // Memoized handlers for Right Pane
    const onLineClickRight = React.useCallback((index: number, isShift?: boolean, isCtrl?: boolean) => handleLineClick('right', index, !!isShift, !!isCtrl), [handleLineClick]);
    const onLineDoubleClickRight = React.useCallback((index: number) => handleLineDoubleClickAction(index, 'right'), [handleLineDoubleClickAction]);
    const onBrowseRight = React.useCallback(() => rightFileInputRef.current?.click(), []);
    const onCopyRight = React.useCallback((ignoreSelection?: boolean) => handleCopyLogs('right', ignoreSelection), [handleCopyLogs]);
    const onCopyAsConfluenceTableRight = React.useCallback(() => handleCopyAsConfluenceTable('right', true), [handleCopyAsConfluenceTable]);
    const onSaveRight = React.useCallback((ignoreSelection?: boolean) => handleSaveLogs('right', ignoreSelection), [handleSaveLogs]);
    const onSyncScrollRight = React.useCallback((dy: number) => handleSyncScroll(dy, 'right'), [handleSyncScroll]);
    const onHighlightJumpRight = React.useCallback((idx: number) => jumpToHighlight(idx, 'right'), [jumpToHighlight]);
    const onShowBookmarksRight = React.useCallback(() => setRightBookmarksOpen(true), []);

    const onBookmarkJumpLeft = React.useCallback((index: number) => {
        setActiveLineIndexLeft(index);
        setSelectedIndicesLeft(new Set([index]));
        leftViewerRef.current?.scrollToIndex(index);
    }, [setActiveLineIndexLeft, setSelectedIndicesLeft]);

    const onBookmarkJumpRight = React.useCallback((index: number) => {
        setActiveLineIndexRight(index);
        setSelectedIndicesRight(new Set([index]));
        rightViewerRef.current?.scrollToIndex(index);
    }, [setActiveLineIndexRight, setSelectedIndicesRight]);

    const handleSelectRangeLeft = React.useCallback((start: number, end: number) => {
        handleFocusPaneRequest('left');
        setActiveLineIndexLeft(start);
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        const range = new Set<number>();
        for (let i = min; i <= max; i++) range.add(i);
        setSelectedIndicesLeft(range);
        leftViewerRef.current?.scrollToIndex(min, { align: 'center' });
    }, [handleFocusPaneRequest, setActiveLineIndexLeft, setSelectedIndicesLeft]);

    const handleSelectRangeRight = React.useCallback((start: number, end: number) => {
        handleFocusPaneRequest('right');
        setActiveLineIndexRight(start);
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        const range = new Set<number>();
        for (let i = min; i <= max; i++) range.add(i);
        setSelectedIndicesRight(range);
        rightViewerRef.current?.scrollToIndex(min, { align: 'center' });
    }, [handleFocusPaneRequest, setActiveLineIndexRight, setSelectedIndicesRight]);

    // Page Navigation Handlers
    const handlePageNavRequestLeft = React.useCallback((direction: 'next' | 'prev') => {
        if (direction === 'next') {
            if (leftSegmentIndex < leftTotalSegments - 1) {
                // Jump to the START of the NEXT page
                const target = (leftSegmentIndex + 1) * MAX_SEGMENT_SIZE;
                console.log(`[LogSession] PageDown (Left): Jumping to start of next segment (Index ${target})`);
                jumpToGlobalLine(target, 'left', 'start');
            }
        } else {
            if (leftSegmentIndex > 0) {
                // Jump to the END of the PREVIOUS page
                const target = (leftSegmentIndex * MAX_SEGMENT_SIZE) - 1;
                console.log(`[LogSession] PageUp (Left): Jumping to end of prev segment (Index ${target})`);
                jumpToGlobalLine(target, 'left', 'end');
            }
        }
    }, [leftSegmentIndex, leftTotalSegments, jumpToGlobalLine]);

    const handlePageNavRequestRight = React.useCallback((direction: 'next' | 'prev') => {
        if (direction === 'next') {
            if (rightSegmentIndex < rightTotalSegments - 1) {
                const target = (rightSegmentIndex + 1) * MAX_SEGMENT_SIZE;
                console.log(`[LogSession] PageDown (Right): Jumping to start of next segment (Index ${target})`);
                jumpToGlobalLine(target, 'right', 'start');
            }
        } else {
            if (rightSegmentIndex > 0) {
                const target = (rightSegmentIndex * MAX_SEGMENT_SIZE) - 1;
                console.log(`[LogSession] PageUp (Right): Jumping to end of prev segment (Index ${target})`);
                jumpToGlobalLine(target, 'right', 'end');
            }
        }
    }, [rightSegmentIndex, rightTotalSegments, jumpToGlobalLine]);

    // Scroll To Bottom Handlers
    const handleScrollToBottomRequestLeft = React.useCallback(() => {
        // Jump to very last global line
        if (leftFilteredCount > 0) {
            jumpToGlobalLine(leftFilteredCount - 1, 'left', 'end');
        }
    }, [leftFilteredCount, jumpToGlobalLine]);

    const handleScrollToBottomRequestRight = React.useCallback(() => {
        if (rightFilteredCount > 0) {
            jumpToGlobalLine(rightFilteredCount - 1, 'right', 'end');
        }
    }, [rightFilteredCount, jumpToGlobalLine]);

    // ✅ Ctrl + Wheel Zoom Support (Uses shared logic)
    // We use a native Ref and event listener because React's onWheel is passive by default in some browsers/versions
    // and might not reliably prevent the native browser zoom (Ctrl+Wheel).
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!isActive) return;

        const onWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                // ✅ Hyungnim, yielding to Perf Dashboard zoom when it's active instead of font zoom.
                const target = e.target as HTMLElement;
                if (!target || typeof target.closest !== 'function') return;

                const logPane = target.closest('.log-viewer-pane');
                const targetPaneId = logPane?.getAttribute('data-pane-id');
                const isOverDashboard = !!target.closest('.perf-dashboard-container');

                // ✅ Hyungnim, font zoom is yielded only when the pane under the mouse has analysis results.
                let shouldSkipForPerf = false;
                if (targetPaneId === 'left') {
                    shouldSkipForPerf = !!(leftPerfAnalysisResult || isAnalyzingPerformanceLeft);
                } else if (targetPaneId === 'right') {
                    shouldSkipForPerf = !!(rightPerfAnalysisResult || isAnalyzingPerformanceRight);
                } else if (isOverDashboard) {
                    // Always yield if over the dashboard (handled by the dashboard's own zoom)
                    shouldSkipForPerf = true;
                } else if (!targetPaneId && (leftPerfAnalysisResult || rightPerfAnalysisResult)) {
                    // Single view mode, etc.
                    shouldSkipForPerf = true;
                }

                if (shouldSkipForPerf) {
                    return;
                }

                // ✅ Aggressively prevent default at the window level during capture phase
                e.preventDefault();
                e.stopPropagation();

                const delta = e.deltaY; // Negative is UP (Zoom In), Positive is DOWN (Zoom Out)

                if (delta < 0) {
                    handleZoomIn('mouse');
                } else {
                    handleZoomOut('mouse');
                }
            }
        };

        // ✅ Use 'capture: true' to intercept the event before it reaches any children or the browser
        window.addEventListener('wheel', onWheel, { passive: false, capture: true });

        return () => {
            window.removeEventListener('wheel', onWheel, { capture: true });
        };
    }, [isActive, handleZoomIn, handleZoomOut, leftPerfAnalysisResult, rightPerfAnalysisResult, isAnalyzingPerformanceLeft, isAnalyzingPerformanceRight]);

    return (
        <div
            ref={containerRef}
            className="flex h-full flex-col font-sans overflow-hidden relative"
            style={{ display: isActive ? 'flex' : 'none' }}
        >

            {/* Header Area with Hide Animation in Focus Mode */}
            {/* Header Area with Hide Animation in Focus Mode */}
            <div className={`transition-[margin-top] duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] z-50 will-change-[margin-top] ${(isFocusMode && !isPanelOpen && !isSearchFocused) ? '-mt-16 delay-100 pointer-events-none' : 'mt-0 delay-0 pointer-events-auto'}`}>
                <TopBar onReturnFocus={() => {
                    // Logic to determine which pane to focus
                    if (isDualView) {
                        // If Right has selection and Left doesn't, focus Right
                        if (selectedIndicesRight?.size > 0 && (!selectedIndicesLeft || selectedIndicesLeft.size === 0)) {
                            handleFocusPaneRequest('right');
                            return;
                        }
                    }
                    handleFocusPaneRequest('left');
                }}
                    onSplitAnalyze={() => {
                        console.log('[LogSession] Analyze Diff button clicked');
                        if (splitAnalysisResults || isSplitAnalyzing) {
                            console.log('[LogSession] Closing analysis');
                            handleCloseSplitAnalysis();
                        } else {
                            console.log('[LogSession] Starting analysis');
                            handleSplitAnalysis();
                        }
                    }}
                    isSplitAnalyzing={isSplitAnalyzing}
                    isSplitAnalyzerOpen={!!splitAnalysisResults || isSplitAnalyzing}
                />
            </div>

            {/* Main Content Area */}
            {/* Added transition-all to synchronize with header movement */}
            {/* Main Content Area - Placeholder for transition if needed, but real content is below */}


            {/* Global Shortcut Handler for Ctrl+B */}
            {React.createElement(
                React.Fragment,
                null,
                // Inline effect for global shortcut
                (() => {
                    React.useEffect(() => {
                        const handleGlobalKeyDown = (e: KeyboardEvent) => {
                            // 1. ESC: Close Transaction Drawer - Handled by useLogShortcuts
                            // 2. F3/F4: Bookmark Navigation - Handled by useLogShortcuts
                            // 3. Space: Bookmark Toggle - Handled by useLogShortcuts

                            // If Save Dialog or Archive Viewer is open, disable all shortcuts to allow typing/local shortcuts
                            if (archiveDialogOpenRef.current || archiveViewerOpenRef.current) return;


                            if (e.key === 'PageDown' || e.key === 'PageUp') {
                                if (!isActive) return;

                                let targetPane = 'left';
                                if (isDualView) {
                                    const activeEl = document.activeElement;
                                    if (activeEl && activeEl.closest('[data-pane-id="right"]')) {
                                        targetPane = 'right';
                                    }
                                }

                                const viewer = targetPane === 'left' ? leftViewerRef.current : rightViewerRef.current;
                                if (!viewer) return;

                                if (e.key === 'PageDown') {
                                    if (viewer.isAtBottom()) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const handler = targetPane === 'left' ? handlePageNavRequestLeft : handlePageNavRequestRight;
                                        // We need to access the LATEST callback.
                                        // Since we are inside useEffect with deps...
                                        // We must depend on handlePageNavRequestLeft/Right in useEffect
                                        // OR use stateRef approach?
                                        // But handlePageNavRequestLeft depends on state.
                                        // Adding handlePageNavRequestLeft to dependency array is correct.
                                        if (targetPane === 'left') handlePageNavRequestLeft('next');
                                        else handlePageNavRequestRight('next');
                                    }
                                } else {
                                    if (viewer.isAtTop()) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (targetPane === 'left') handlePageNavRequestLeft('prev');
                                        else handlePageNavRequestRight('prev');
                                    }
                                }
                                return;
                            }

                            if (e.ctrlKey || e.metaKey) {
                                // Check if we are in this session (should be active)
                                if (!isActive) return;

                                // Ctrl + Shift + X: Clear Logs (SSH/SDB connection only)
                                if (e.shiftKey && (e.key === 'x' || e.key === 'X')) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (tizenSocket) {
                                        handleClearLogs();
                                    }
                                    return;
                                }

                                // Ctrl + ` : Toggle Configuration Panel
                                if (e.key === '`' || e.key === '~') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsPanelOpen(prev => !prev);
                                    return;
                                }

                                // ✅ Ctrl + L (Show Line Numbers Toggle)
                                if (e.key === 'l' || e.key === 'L' || e.key === 'ㅣ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const nextState = !(logViewPreferences.showLineNumbers !== false);
                                    updateLogViewPreferences({ showLineNumbers: nextState });
                                    addToast(`Line numbers ${nextState ? 'Shown' : 'Hidden'}`, 'info');
                                    return;
                                }

                                // Ctrl + B: View Bookmarks
                                if (e.key === 'b' || e.key === 'B') {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    // Determine target based on focus or default to left
                                    let target = 'left';
                                    if (isDualView) {
                                        const activeEl = document.activeElement;
                                        if (activeEl && activeEl.closest('[data-pane-id="right"]')) {
                                            target = 'right';
                                        }
                                    }

                                    if (target === 'right') onShowBookmarksRight();
                                    else onShowBookmarksLeft();
                                }

                                // Ctrl + 1~5: Jump to Highlight #N
                                if (['1', '2', '3', '4', '5'].includes(e.key)) {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    const highlightIdx = parseInt(e.key, 10) - 1;

                                    let targetPath = 'left';
                                    if (isDualView) {
                                        const activeEl = document.activeElement;
                                        if (activeEl && activeEl.closest('[data-pane-id="right"]')) {
                                            targetPath = 'right';
                                        }
                                    }

                                    jumpToHighlight(highlightIdx, targetPath as 'left' | 'right');
                                }

                                // Ctrl + F (Find) - Ensure Shift is NOT pressed so we don't trap Ctrl+Shift+F
                                if ((e.key === 'f' || e.key === 'F') && !e.shiftKey) {
                                    // If PerfDashboard is open, let PerfDashboard handle Ctrl+F
                                    if (leftPerfAnalysisResult || rightPerfAnalysisResult || isAnalyzingPerformanceLeft || isAnalyzingPerformanceRight) {
                                        return; // Don't intercept - PerfDashboard's listener will handle it
                                    }
                                    e.preventDefault();
                                    e.stopPropagation();
                                    
                                    // 🐧⚡ Ctrl+Shift+F와 동일한 UI의 대형 모달을 띄워 현재 탭 범위에서 찾기 실행!
                                    if (findInAll && tabId) {
                                        findInAll.openModal(tabId, currentTitle || '');
                                    }
                                }

                                // Ctrl + Shift + F (Find in All Open Files)
                                if (e.shiftKey && (e.code === 'KeyF' || e.key === 'f' || e.key === 'F')) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    findInAll?.openModal();
                                    return;
                                }

                                // Ctrl + V: Paste from Clipboard (Empty Pane only)
                                if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V' || e.key === 'ㅍ')) {
                                    // Determine active or focused pane
                                    let targetPane: 'left' | 'right' = 'left';
                                    if (isDualView) {
                                        const activeEl = document.activeElement;
                                        if (activeEl && activeEl.closest('[data-pane-id="right"]')) {
                                            targetPane = 'right';
                                        }
                                    }
                                    
                                    const targetHasFile = targetPane === 'left' ? !!leftFileName : !!rightFileName;
                                    const targetReady = targetPane === 'left' ? leftWorkerReady : rightWorkerReady;
                                    
                                    // Only trigger if target pane does not have a loaded log file
                                    if (!targetHasFile && !targetReady) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handlePasteClipboard(targetPane);
                                    }
                                }

                                // Ctrl + G (Go To Line)
                                if ((e.key === 'g' || e.key === 'G') && !e.shiftKey) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsGoToLineModalOpen((prev: boolean) => !prev);
                                }

                                // ✅ Ctrl + C (Copy) - Explicit Handling
                                if (e.key === 'c' || e.key === 'C') {
                                    // 1. Check native text selection first
                                    const selection = window.getSelection()?.toString();
                                    if (selection && selection.length > 0) {
                                        // 🔥 Log Copy Precision: Remove trailing newline from native selection
                                        navigator.clipboard.writeText(selection.replace(/\r?\n$/, ''));
                                        addToast('Selection copied!', 'success'); // ✅ Hyungnim, added feedback for Alt+Drag copy!
                                        e.preventDefault();
                                        e.stopPropagation();
                                        return;
                                    }

                                    // 2. If no text selection, try copying selected lines (Custom Logic)
                                    // Determine pane
                                    let targetPane = 'left';
                                    if (isDualView) {
                                        const activeEl = document.activeElement;
                                        if (activeEl && activeEl.closest('[data-pane-id="right"]')) {
                                            targetPane = 'right';
                                        }
                                    }

                                    // Check if lines are selected
                                    const st = stateRef.current;
                                    const selectedIndices = targetPane === 'right' ? st.selectedIndicesRight : st.selectedIndicesLeft;

                                    if (selectedIndices.size > 0) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleCopyLogs(targetPane as 'left' | 'right', false);
                                    }
                                }

                                // ✅ Ctrl + Shift + Arrow: Split Ratio Adjustment (Smart Step)
                                if (e.shiftKey && isDualView) {
                                    if (e.key === 'ArrowLeft') {
                                        e.preventDefault();
                                        handleSplitAnimateStart();
                                        // 🐧🎯 Right(0.9) -> Mid(0.5) -> Left(0.1)
                                        setSplitRatio(prev => (prev > 0.51 ? 0.5 : 0.1));
                                    } else if (e.key === 'ArrowRight') {
                                        e.preventDefault();
                                        handleSplitAnimateStart();
                                        // 🐧🎯 Left(0.1) -> Mid(0.5) -> Right(0.9)
                                        setSplitRatio(prev => (prev < 0.49 ? 0.5 : 0.9));
                                    }
                                }

                                // Ctrl + Shift + G: Toggle Log Histogram Chart
                                if (e.shiftKey && (e.code === 'KeyG' || e.key === 'g' || e.key === 'G')) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsHistogramOpen(prev => !prev);
                                    return;
                                }
                            }
                        };

                        // ✅ Global copy event detection (enhancing feedback for context menu copies, etc.)
                        const handleGlobalCopy = () => {
                            const selection = window.getSelection()?.toString();
                            if (selection && selection.length > 0) {
                                // However, since the Ctrl+C handler already shows a toast, to avoid duplication
                                // logic can be considered to exclude cases where activeElement is an input or textarea.
                                // Here, it only shows if there is a simple text selection.
                                // (Since preventDefault is called in the Ctrl+C handler, this event might not be triggered)
                                console.log('[LogSession] Native copy detected');
                                if (!document.activeElement?.matches('input, textarea')) {
                                    addToast('Selection copied to clipboard!', 'success'); // ✅ Provide feedback even for context menu copies
                                }
                            }
                        };

                        window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
                        window.addEventListener('copy', handleGlobalCopy);
                        return () => {
                            window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
                            window.removeEventListener('copy', handleGlobalCopy);
                        };
                    }, [isActive, isDualView, onShowBookmarksLeft, onShowBookmarksRight, jumpToHighlight, handlePageNavRequestLeft, handlePageNavRequestRight, toggleLeftBookmark, toggleRightBookmark, setIsGoToLineModalOpen, setIsPanelOpen, updateLogViewPreferences, logViewPreferences, handleCopyLogs, tizenSocket, handleClearLogs, isTransactionDrawerOpen, setIsTransactionDrawerOpen, addToast, leftPerfAnalysisResult, rightPerfAnalysisResult, isAnalyzingPerformanceLeft, isAnalyzingPerformanceRight, setSplitRatio, handleSplitAnimateStart, setIsHistogramOpen]);
                    return null;
                })()
            )}

            {/* Hidden File Inputs for Click-to-Upload */}
            <input type="file" ref={leftFileInputRef} className="hidden" onChange={(e) => { if (e.target.files?.[0]) { handleLeftFileChange(e.target.files[0]); e.target.value = ''; } }} />
            <input type="file" ref={rightFileInputRef} className="hidden" onChange={(e) => { if (e.target.files?.[0]) { handleRightFileChange(e.target.files[0]); e.target.value = ''; } }} />

            {/* ── Find in All Modal - Ctrl+Shift+F ── */}
            {findInAll && (
                <FindInAllModal
                    isOpen={findInAll.isModalOpen}
                    onClose={findInAll.closeModal}
                    onSearch={findInAll.executeFindInAll}
                    isSearching={findInAll.isSearching}
                    lastSearchRule={findInAll.lastSearchRule}
                    targetTabId={findInAll.targetTabId}
                    targetTabTitle={findInAll.targetTabTitle}
                />
            )}


            {/* Tizen Connection Modal */}
            <TizenConnectionModal
                isOpen={isTizenModalOpen}
                onClose={() => setIsTizenModalOpen(false)}
                onStreamStart={handleTizenStreamStart}
                isConnected={!!tizenSocket}
                onDisconnect={handleTizenDisconnect}
                currentConnectionInfo={leftFileName}
                isQuickConnect={isTizenQuickConnect}
                tags={currentConfig?.logTags || []}
                logCommand={(() => {
                    if (!currentConfig) return undefined;
                    const cmd = currentConfig.logCommand ?? defaultLogCommand;
                    const tags = (currentConfig.logTags || []).join(' ');
                    // Explicitly substitute tags client-side to ensure server gets the final command
                    // especially for SDB reconnects where server-side substitution might be flaky or unimplemented
                    return cmd.replace(/\$\(TAGS\)/g, tags);
                })()}
            />

            {/* Hidden File Inputs for Click-to-Upload */}
            <input type="file" ref={leftFileInputRef} className="hidden" onChange={(e) => { if (e.target.files?.[0]) { handleLeftFileChange(e.target.files[0]); e.target.value = ''; } }} />
            <input type="file" ref={rightFileInputRef} className="hidden" onChange={(e) => { if (e.target.files?.[0]) { handleRightFileChange(e.target.files[0]); e.target.value = ''; } }} />

            <div ref={logContentRef} className="flex-1 flex overflow-hidden h-full relative group/layout">
                {/* 1. Left Sidebar (Configuration) */}
                <div className="block h-full flex-none">
                    <ConfigurationPanel />
                </div>

                {/* 2. Main Content Area (Spam Analyzer + Log Viewer) */}
                <div className={`flex-1 flex flex-col overflow-hidden relative z-0 transition-[padding-top] duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${isFocusMode ? 'pt-0' : 'pt-8'}`}>
                    {/* Integrated Spam Analyzer Panel */}
                    <SpamAnalyzerPanel />
                    {/* Integrated Latency Spotlight Panel */}
                    <LatencySpotlightPanel />
                    {/* Integrated Log Histogram Panel */}
                    {isHistogramOpen && (
                        <div className="px-4 py-2 shrink-0 flex gap-4">
                            <div className="flex-1" style={{ width: isDualView ? `${splitRatio * 100}%` : '100%', flexGrow: isDualView ? splitRatio : 1 }}>
                                <LogHistogramPanel
                                    data={leftHistogramData}
                                    paneId="left"
                                    onJump={jumpToGlobalLine}
                                    onClose={() => setIsHistogramOpen(false)}
                                />
                            </div>
                            {isDualView && (
                                <div className="flex-1" style={{ width: `${(1 - splitRatio) * 100}%`, flexGrow: 1 - splitRatio }}>
                                    <LogHistogramPanel
                                        data={rightHistogramData}
                                        paneId="right"
                                        onJump={jumpToGlobalLine}
                                        onClose={() => setIsHistogramOpen(false)}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                    <AnimatePresence>
                        {(splitAnalysisResults || isSplitAnalyzing) && isDualView && (
                            <>
                                <SplitAnalyzerPanel
                                    results={splitAnalysisResults}
                                    isLoading={isSplitAnalyzing}
                                    progress={splitAnalysisProgress}
                                    onClose={handleCloseSplitAnalysis}
                                    height={splitAnalyzerHeight} // ✅ Pass variable height
                                    onJumpToRange={(pane, start, end) => {
                                        handleFocusPaneRequest(pane);
                                        if (pane === 'left') {
                                            handleJumpToRangeLeft(start, end);
                                        } else {
                                            handleJumpToRangeRight(start, end);
                                        }
                                    }}
                                    onViewRawSplit={handleViewRawSplit}
                                />
                                {/* 🐧⚡ Draggable divider area */}
                                <div
                                    onMouseDown={handleAnalyzerResizeStart}
                                    className={`h-1.5 w-full bg-slate-900 border-y border-blue-500/20 hover:bg-blue-500/40 cursor-row-resize z-50 transition-colors flex items-center justify-center group/resize`}
                                >
                                    <div className="w-12 h-1 bg-slate-700 rounded-full group-hover/resize:bg-blue-400 transition-colors" />
                                </div>
                            </>
                        )}
                    </AnimatePresence>

                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex w-full flex-1 overflow-hidden">
                            {/* Left Pane */}
                            <div
                                className={`flex flex-col h-full min-w-0 relative transition-[width] duration-500 ease-[cubic-bezier(0.19,1,0.22,1)] will-change-[width] ${isDualView ? '' : 'w-full'}`}
                                style={{ width: isDualView ? `${splitRatio * 100}%` : undefined }}
                            >
                                <LoadingOverlay
                                    isVisible={!!leftFileName && !leftWorkerReady && leftIndexingProgress < 100}
                                    fileName={leftFileName || ''}
                                    progress={leftIndexingProgress}
                                />
                                <LogViewerPane
                                    key={`left-pane-${leftFileName || 'empty'}-${leftSegmentIndex}`}
                                    ref={leftViewerRef}
                                    onQuickHighlight={addQuickHighlight}
                                    onClearQuickHighlights={clearQuickHighlights}

                                    workerReady={leftWorkerReady}
                                    totalMatches={leftCurrentSegmentLines}
                                    onScrollRequest={requestLeftLines}
                                    absoluteOffset={leftSegmentIndex * MAX_SEGMENT_SIZE}
                                    placeholderText={leftFileName || (isDualView ? "Drag log file here" : "Drop a log file to start")}
                                    highlights={effectiveHighlights}
                                    highlightCaseSensitive={!!currentConfig?.happyCombosCaseSensitive || !!currentConfig?.colorHighlightsCaseSensitive}
                                    onLineClick={onLineClickLeft}
                                    onLineDoubleClick={onLineDoubleClickLeft}
                                    selectedRuleId={selectedRuleId}
                                    activeLineIndex={activeLineIndexLeft}
                                    selectedIndices={selectedIndicesLeft}
                                    onDrop={handleLeftFileChange}
                                    onBrowse={onBrowseLeft}
                                    onPasteClipboard={() => handlePasteClipboard('left')}
                                    paneId="left"
                                    fileName={leftFileName || undefined}
                                    onReset={handleLeftReset}
                                    onCopy={onCopyLeft}
                                    onSelectAll={() => handleSelectAllLogs('left')}
                                    onCopyAsConfluenceTable={onCopyAsConfluenceTableLeft}
                                    onSave={onSaveLeft}
                                    bookmarks={leftBookmarks}
                                    onToggleBookmark={toggleLeftBookmark}
                                    onFocusPaneRequest={handleFocusPaneRequest}
                                    onSyncScroll={onSyncScrollLeft}
                                    onHighlightJump={onHighlightJumpLeft}
                                    isActive={isActive}
                                    onShowBookmarks={onShowBookmarksLeft}
                                    onAnalyzeSpam={() => setIsSpamAnalyzerOpen(true)}
                                    performanceHeatmap={leftPerformanceHeatmap}
                                    onAnalyzePerformance={handleAnalyzePerformanceLeft}
                                    perfAnalysisResult={leftPerfAnalysisResult}
                                    isAnalyzingPerformance={isAnalyzingPerformanceLeft}
                                    onJumpToLine={handleJumpToLineLeft}
                                    onJumpToRange={handleJumpToRangeLeft}
                                    onViewRawRange={handleViewRawRangeLeft}
                                    onCopyRawRange={handleCopyRawRangeLeft}
                                    dashboardHeight={perfDashboardHeight}
                                    onDashboardHeightChange={setPerfDashboardHeight}
                                    lineHighlightRanges={leftLineHighlightRanges}
                                    onPageNavRequest={handlePageNavRequestLeft}
                                    onScrollToBottomRequest={handleScrollToBottomRequestLeft}
                                    preferences={logViewPreferences}
                                    onContextMenu={handleContextMenu}
                                    onArchiveSave={onArchiveSaveLeft}
                                    isArchiveSaveEnabled={isLeftArchiveEnabled}
                                    clearCacheTick={clearCacheTick}
                                    sharedBuffers={leftSharedBuffers}
                                />
                                {(leftTotalSegments > 1 || leftSelectionDuration) && (
                                    <div className="h-8 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between px-3 py-1 text-[10px] font-mono select-none z-30 shrink-0 shadow-inner">
                                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                            <span className="font-bold text-indigo-600 dark:text-indigo-400">PAGE {leftSegmentIndex + 1}/{leftTotalSegments}</span>
                                            <span className="text-slate-300 dark:text-slate-700 mx-1">|</span>
                                            <span className="font-medium">{(leftSegmentIndex * MAX_SEGMENT_SIZE + 1).toLocaleString()} - {Math.min((leftSegmentIndex + 1) * MAX_SEGMENT_SIZE, leftFilteredCount).toLocaleString()}</span>
                                            <span className="text-slate-300 dark:text-slate-700 mx-1">|</span>
                                            <span className="opacity-70">Total: {leftFilteredCount.toLocaleString()}</span>
                                            {leftSelectionDuration && (
                                                <>
                                                    <span className="text-slate-300 dark:text-slate-700 mx-1">|</span>
                                                    <span className="text-amber-600 dark:text-amber-400 font-bold bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                                                        ⏱ {leftSelectionDuration}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                disabled={leftSegmentIndex === 0}
                                                onClick={() => setLeftSegmentIndex(Math.max(0, leftSegmentIndex - 1))}
                                                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 dark:text-slate-300 transition-colors"
                                            >
                                                <ChevronLeft size={14} />
                                            </button>
                                            <button
                                                disabled={leftSegmentIndex >= leftTotalSegments - 1}
                                                onClick={() => setLeftSegmentIndex(Math.min(leftTotalSegments - 1, leftSegmentIndex + 1))}
                                                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 dark:text-slate-300 transition-colors"
                                            >
                                                <ChevronRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Divider Between Panes */}
                            {isDualView && (
                                <div className="w-1 bg-slate-900 border-x border-slate-800/10 hover:bg-indigo-500 transition-colors cursor-col-resize z-30 shadow-xl self-stretch" title="Split divider" />
                            )}

                            {/* Right Pane */}
                            <div
                                className={`flex flex-col h-full min-w-0 bg-slate-950 relative transition-[width] duration-500 ease-[cubic-bezier(0.19,1,0.22,1)] will-change-[width] ${isDualView ? 'flex' : 'hidden'}`}
                                data-pane-id="right"
                                style={{ width: isDualView ? `${(1 - splitRatio) * 100}%` : undefined }}
                            >
                                <LoadingOverlay
                                    isVisible={!!rightFileName && !rightWorkerReady && rightIndexingProgress < 100}
                                    fileName={rightFileName}
                                    progress={rightIndexingProgress}
                                />
                                <div className="flex-1 h-full min-w-0 flex flex-col">
                                    <LogViewerPane
                                        key={`right-pane-${rightFileName || 'empty'}-${rightSegmentIndex}`}
                                        ref={rightViewerRef}
                                        onQuickHighlight={addQuickHighlight}
                                        onClearQuickHighlights={clearQuickHighlights}

                                        workerReady={rightWorkerReady}
                                        totalMatches={rightCurrentSegmentLines}
                                        onScrollRequest={requestRightLines}
                                        absoluteOffset={rightSegmentIndex * MAX_SEGMENT_SIZE}
                                        placeholderText={rightFileName || "Drag log file here"}
                                        highlights={effectiveHighlights}
                                        highlightCaseSensitive={!!currentConfig?.happyCombosCaseSensitive || !!currentConfig?.colorHighlightsCaseSensitive}
                                        hotkeyScope="alt"
                                        onLineClick={onLineClickRight}
                                        onLineDoubleClick={onLineDoubleClickRight}
                                        selectedRuleId={selectedRuleId}
                                        activeLineIndex={activeLineIndexRight}
                                        selectedIndices={selectedIndicesRight}
                                        onDrop={handleRightFileChange}
                                        onBrowse={onBrowseRight}
                                        onPasteClipboard={() => handlePasteClipboard('right')}
                                        paneId="right"
                                        fileName={rightFileName || undefined}
                                        onReset={handleRightReset}
                                        onCopy={onCopyRight}
                                    onSelectAll={() => handleSelectAllLogs('right')}
                                        onCopyAsConfluenceTable={onCopyAsConfluenceTableRight}
                                        onSave={onSaveRight}
                                        bookmarks={rightBookmarks}
                                        onToggleBookmark={toggleRightBookmark}
                                        onFocusPaneRequest={handleFocusPaneRequest}
                                        onSyncScroll={onSyncScrollRight}
                                        onHighlightJump={onHighlightJumpRight}
                                        isActive={isActive}
                                        onShowBookmarks={onShowBookmarksRight}
                                        onAnalyzeSpam={() => setIsSpamAnalyzerOpen(true)}
                                        performanceHeatmap={rightPerformanceHeatmap}
                                        onAnalyzePerformance={handleAnalyzePerformanceRight}
                                        perfAnalysisResult={rightPerfAnalysisResult}
                                        isAnalyzingPerformance={isAnalyzingPerformanceRight}
                                        onJumpToLine={handleJumpToLineRight}
                                        onJumpToRange={handleJumpToRangeRight}
                                        onViewRawRange={handleViewRawRangeRight}
                                        lineHighlightRanges={rightLineHighlightRanges}
                                        onPageNavRequest={handlePageNavRequestRight}
                                        onScrollToBottomRequest={handleScrollToBottomRequestRight}
                                        preferences={logViewPreferences}
                                        onContextMenu={handleContextMenu}
                                        onArchiveSave={onArchiveSaveRight}
                                        isArchiveSaveEnabled={isRightArchiveEnabled}
                                        clearCacheTick={clearCacheTick}
                                        sharedBuffers={rightSharedBuffers}
                                    />
                                    {(rightTotalSegments > 1 || rightSelectionDuration) && (
                                        <div className="h-8 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between px-3 py-1 text-[10px] font-mono select-none z-30 shrink-0 shadow-inner">
                                            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                                <span className="font-bold text-indigo-600 dark:text-indigo-400">PAGE {rightSegmentIndex + 1}/{rightTotalSegments}</span>
                                                <span className="text-slate-300 dark:text-slate-700 mx-1">|</span>
                                                <span className="font-medium">{(rightSegmentIndex * MAX_SEGMENT_SIZE + 1).toLocaleString()} - {Math.min((rightSegmentIndex + 1) * MAX_SEGMENT_SIZE, rightFilteredCount).toLocaleString()}</span>
                                                <span className="text-slate-300 dark:text-slate-700 mx-1">|</span>
                                                <span className="opacity-70">Total: {rightFilteredCount.toLocaleString()}</span>
                                                {rightSelectionDuration && (
                                                    <>
                                                        <span className="text-slate-300 dark:text-slate-700 mx-1">|</span>
                                                        <span className="text-amber-600 dark:text-amber-400 font-bold bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                                                            ⏱ {rightSelectionDuration}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    disabled={rightSegmentIndex === 0}
                                                    onClick={() => setRightSegmentIndex(Math.max(0, rightSegmentIndex - 1))}
                                                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 dark:text-slate-300 transition-colors"
                                                >
                                                    <ChevronLeft size={14} />
                                                </button>
                                                <button
                                                    disabled={rightSegmentIndex >= rightTotalSegments - 1}
                                                    onClick={() => setRightSegmentIndex(Math.min(rightTotalSegments - 1, rightSegmentIndex + 1))}
                                                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 dark:text-slate-300 transition-colors"
                                                >
                                                    <ChevronRight size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        {/* 🐧⚡ FindInAllResultPanel: 단 한 번만 렌더(싱글/듀얼뷰 전환, 탭 클릭 시 하이트 초기화 방지) */}
                        {findInAll && (
                            <FindInAllResultPanel
                                isVisible={findInAll.isResultPanelOpen}
                                results={findInAll.snapshotResults}
                                isSearching={findInAll.isSearching}
                                lastSearchRule={findInAll.lastSearchRule}
                                onClose={findInAll.closeResultPanel}
                                onReSearch={findInAll.reExecuteLastSearch}
                                onJumpToTabLine={findInAll.handleJumpToTabLine}
                            />
                        )}
                    </div>
                    {/* Tizen Command Input */}

                    {tizenSocket && (
                        <div className="h-10 bg-slate-950 border-t border-slate-800 flex items-center px-4 gap-3 shrink-0 z-30">
                            <span className="text-indigo-400 font-bold text-xs whitespace-nowrap flex items-center gap-1"><Lucide.Terminal size={12} /> SHELL &gt;</span>
                            <input
                                className="flex-1 bg-transparent text-slate-200 text-sm focus:outline-none font-mono placeholder-slate-600"
                                placeholder={connectionMode === 'serial' ? "Type serial command (e.g. ls, help)..." : "Type sdb shell command..."}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const val = e.currentTarget.value;
                                        const cmd = val.trim();
                                        
                                        // 🐧 Added history save logic
                                        if (cmd) {
                                            try {
                                                const historyJson = localStorage.getItem('recentShellCommands') || '[]';
                                                let history = JSON.parse(historyJson);
                                                // Remove duplicates and prepend to the front
                                                history = history.filter((c: string) => c !== cmd);
                                                history.unshift(cmd);
                                                // Keep up to 20 entries
                                                if (history.length > 20) history = history.slice(0, 20);
                                                localStorage.setItem('recentShellCommands', JSON.stringify(history));
                                                // 🐧 Dispatch event for real-time synchronization
                                                window.dispatchEvent(new Event('recentCommandsUpdated'));
                                            } catch (err) {
                                                console.error('Failed to save recent command', err);
                                            }
                                        }

                                        // 🐧🎯 Hyungnim! Serial shells typically expect \r or \r\n. 
                                        const ending = connectionMode === 'serial' ? '\r' : '\n';
                                        sendTizenCommand(val + ending);
                                        e.currentTarget.value = '';
                                    }
                                }}
                            />
                            <button
                                onClick={handleClearLogs}
                                className="p-1.5 text-slate-500 hover:text-red-400 rounded-md hover:bg-white/5 transition-colors"
                                title="Clear Logs"
                            >
                                <Eraser size={16} />
                            </button>
                        </div>
                    )}
                </div>
            </div>


        {/* Go To Line Modal */}
        <GoToLineModal
            isOpen={isGoToLineModalOpen}
            onClose={handleGoToLineClose}
            onGo={handleGoToLineGo}
            isDualView={isDualView}
            leftTotalLines={leftFilteredCount || 0}
            rightTotalLines={rightFilteredCount || 0}
            leftFileName={leftFileName || 'Left'}
            rightFileName={rightFileName || 'Right'}
        />

            {/* Bookmarks Modal - Left */}
            <BookmarksModal
                isOpen={isLeftBookmarksOpen}
                onClose={() => setLeftBookmarksOpen(false)}
                bookmarks={leftBookmarks}
                onJump={(index) => {
                    handleFocusPaneRequest('left');
                    jumpToGlobalLine(index, 'left');
                }}
                onSelectRange={handleSelectRangeLeft}
                requestLines={requestLeftBookmarkedLines}
                title={`Bookmarks - ${leftFileName || 'Left Pane'}`}
                onClearAll={clearLeftBookmarks}
                onDeleteBookmark={toggleLeftBookmark}
                highlights={effectiveHighlights}
                caseSensitive={currentConfig?.colorHighlightsCaseSensitive}
            />

            {/* Bookmarks Modal - Right */}
            {isDualView && (
                <BookmarksModal
                    isOpen={isRightBookmarksOpen}
                    onClose={() => setRightBookmarksOpen(false)}
                    bookmarks={rightBookmarks}
                    onJump={(index) => {
                        handleFocusPaneRequest('right');
                        jumpToGlobalLine(index, 'right');
                    }}
                    onSelectRange={handleSelectRangeRight}
                    requestLines={requestRightBookmarkedLines}
                    title={`Bookmarks - ${rightFileName || 'Right Pane'}`}
                    onClearAll={clearRightBookmarks}
                    onDeleteBookmark={toggleRightBookmark}
                    highlights={effectiveHighlights}
                    caseSensitive={currentConfig?.colorHighlightsCaseSensitive}
                />
            )}


            {ContextMenuComponent}

            {/* Transaction Analysis Drawer */}
            <TransactionDrawer
                isOpen={isTransactionDrawerOpen}
                onClose={() => setIsTransactionDrawerOpen(false)}
                identity={transactionIdentity}
                logs={transactionResults}
                isLoading={isAnalyzingTransaction}
                onJumpToLine={(lineNum, visualIndex) => {
                    handleFocusPaneRequest(transactionSourcePane);
                    jumpToGlobalLine(visualIndex, transactionSourcePane);
                }}
            />

            {/* Raw Context View */}
            {rawContextOpen && rawContextTargetLine && (
                <RawContextViewer
                    sourcePane={rawContextSourcePane}
                    leftFileName={leftFileName || ''}
                    rightFileName={rightFileName || ''}
                    targetLine={rawContextTargetLine}
                    onClose={() => setRawContextOpen(false)}
                    heightPercent={rawContextHeight}
                    onResizeStart={handleRawContextResizeStart}
                    leftTotalLines={leftTotalLines}
                    rightTotalLines={rightTotalLines}
                    requestLeftRawLines={requestLeftRawLines}
                    requestRightRawLines={requestRightRawLines}
                    preferences={logViewPreferences}
                    highlightRange={rawViewHighlightRange}
                    clearCacheTick={clearCacheTick}
                    onApplyFilter={(val) => {
                        addQuickFilter(val);
                    }}
                    onAddHighlight={(val) => {
                        addQuickHighlight(val);
                    }}
                />
            )}

            {splitRawOpen && splitRawResult && (
                <SplitRawContextViewer
                    leftFileName={leftFileName || ''}
                    rightFileName={rightFileName || ''}
                    leftTargetLine={{
                        lineNum: splitRawResult.leftOrigLineNum,
                        content: splitRawResult.preview
                    }}
                    rightTargetLine={{
                        lineNum: splitRawResult.rightOrigLineNum,
                        content: splitRawResult.preview
                    }}
                    onClose={() => setSplitRawOpen(false)}
                    heightPercent={rawContextHeight}
                    onResizeStart={handleRawContextResizeStart}
                    leftTotalLines={leftTotalLines}
                    rightTotalLines={rightTotalLines}
                    requestLeftRawLines={requestLeftRawLines}
                    requestRightRawLines={requestRightRawLines}
                    preferences={logViewPreferences}
                    leftHighlightRange={{
                        start: splitRawResult.leftPrevOrigLineNum,
                        end: splitRawResult.leftOrigLineNum
                    }}
                    rightHighlightRange={{
                        start: splitRawResult.rightPrevOrigLineNum,
                        end: splitRawResult.rightOrigLineNum
                    }}
                    clearCacheTick={clearCacheTick}
                />
            )}

            {promptConfig && (
                <PromptDialog 
                    isOpen={true}
                    onClose={() => {
                        promptConfig.onCancel();
                        setPromptConfig(null);
                    }}
                    title={promptConfig.title}
                    description={promptConfig.description}
                    onConfirm={(val) => {
                        promptConfig.onConfirm(val);
                        setPromptConfig(null);
                    }}
                />
            )}
        </div>
    );
};

export default LogSession;
