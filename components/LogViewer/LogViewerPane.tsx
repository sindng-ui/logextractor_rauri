import React, { useState, useMemo, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { LogHighlight, LogViewPreferences } from '../../types';
import { HyperLogRenderer, HyperLogHandle } from './HyperLogRenderer';
import { PerfDashboard } from './PerfDashboard';
import { AnalysisResult } from '../../utils/perfAnalysis';
import { LOG_VIEW_CONFIG } from '../../constants/logViewUI';

import { useLogViewerScroll } from './hooks/useLogViewerScroll';
import { useLogViewerDataSync } from './hooks/useLogViewerDataSync';
import { useLogViewerSelection } from './hooks/useLogViewerSelection';
import { useLogViewerKeyboard } from './hooks/useLogViewerKeyboard';
import { LogViewerToolbar } from './LogViewerToolbar';
import { LogViewerEmptyState } from './LogViewerEmptyState';
import { GlobalSearchResultView, TabSearchResult } from './GlobalSearchResultView';

const DEFAULT_ROW_HEIGHT = LOG_VIEW_CONFIG.DEFAULT_ROW_HEIGHT;
const OVERSCAN_COUNT = LOG_VIEW_CONFIG.OVERSCAN_COUNT;

export interface LogViewerPaneProps {
    workerReady: boolean;
    totalMatches: number;
    onScrollRequest: (startIndex: number, count: number) => Promise<{ lineNum: number; content: string }[]>;
    placeholderText: string;
    hotkeyScope?: 'ctrl' | 'alt' | 'none';
    onSyncScroll?: (deltaY: number) => void;
    isRawMode?: boolean;
    highlights?: LogHighlight[];
    highlightCaseSensitive?: boolean;
    activeLineIndex?: number;
    selectedIndices?: Set<number>;
    onLineClick?: (index: number, isShift?: boolean, isCtrl?: boolean) => void;
    onLineDoubleClick?: (index: number) => void;
    onDrop?: (file: File) => void;
    onBrowse?: () => void;
    onPasteClipboard?: () => void;
    paneId?: 'left' | 'right' | 'single';
    fileName?: string;
    onViewBookmarks?: () => void;
    onReset?: () => void;
    onCopy?: (ignoreSelection?: boolean) => void;
    onCopyAsConfluenceTable?: () => void;
    onSave?: (ignoreSelection?: boolean) => void;
    bookmarks?: Set<number>;
    onToggleBookmark?: (index: number) => void;
    onFocusPaneRequest?: (direction: 'left' | 'right', visualY?: number) => void;
    onHighlightJump?: (index: number) => void;
    onShowBookmarks?: () => void;
    absoluteOffset?: number;
    initialScrollIndex?: number;
    onPageNavRequest?: (direction: 'next' | 'prev') => void;
    onScrollToBottomRequest?: () => void;
    preferences?: LogViewPreferences;
    onContextMenu?: (e: React.MouseEvent) => void;
    onArchiveSave?: () => void;
    isArchiveSaveEnabled?: boolean;
    lineHighlightRanges?: { start: number; end: number; color: string }[];
    performanceHeatmap?: number[];
    onAnalyzePerformance?: () => void;
    perfAnalysisResult?: AnalysisResult | null;
    isAnalyzingPerformance?: boolean;
    isActive: boolean;
    onJumpToLine?: (lineNum: number) => void;
    onJumpToRange?: (start: number, end: number) => void;
    onViewRawRange?: (originalStart: number, originalEnd: number, filteredIndex?: number) => void;
    onCopyRawRange?: (start: number, end: number) => void;
    dashboardHeight?: number;
    onDashboardHeightChange?: (height: number) => void;
    clearCacheTick?: number;
    sharedBuffers?: any;
    onAnalyzeSpam?: () => void; // Added
    onQuickHighlight?: (keyword: string) => void;
    onClearQuickHighlights?: () => void;
    onSelectAll?: () => void;

    selectedRuleId?: string;
}

export interface LogViewerHandle {
    scrollBy: (deltaY: number) => void;
    scrollByLines: (count: number) => void;
    scrollByPage: (direction: number) => void;
    scrollTo: (scrollTop: number) => void;
    scrollToIndex: (index: number, options?: { align: 'start' | 'center' | 'end' }) => void;
    jumpToNextBookmark: () => void;
    jumpToPrevBookmark: () => void;
    focus: () => void;
    getScrollTop: () => number;
    getCenterLineInfo: () => { index: number; offset: number; viewportHeight: number };
    isAtTop: () => boolean;
    isAtBottom: () => boolean;
}

const LogViewerPane = React.memo(forwardRef<LogViewerHandle, LogViewerPaneProps>((props, ref) => {
    const {
        workerReady, totalMatches, onScrollRequest, placeholderText, onSyncScroll, isRawMode = false,
        highlights, highlightCaseSensitive = false, activeLineIndex = -1, selectedIndices,
        onLineClick, onLineDoubleClick, onDrop, onBrowse, onPasteClipboard, paneId = 'single', fileName, onViewBookmarks, onCopy, onSave, onCopyAsConfluenceTable,
        bookmarks = new Set(), onToggleBookmark, onFocusPaneRequest, onShowBookmarks, absoluteOffset = 0,
        initialScrollIndex, onPageNavRequest, onScrollToBottomRequest, preferences, onContextMenu, onArchiveSave,
        isArchiveSaveEnabled = false, lineHighlightRanges, performanceHeatmap, onAnalyzePerformance,
        perfAnalysisResult, isAnalyzingPerformance = false, isActive, onJumpToLine, onJumpToRange,
        onViewRawRange, onCopyRawRange, dashboardHeight: propDashboardHeight, onDashboardHeightChange,
        clearCacheTick, sharedBuffers, onAnalyzeSpam, onHighlightJump, onReset, onQuickHighlight, onClearQuickHighlights,
        onSelectAll,
        selectedRuleId
    } = props;

    const rowHeight = preferences?.rowHeight || DEFAULT_ROW_HEIGHT;
    const [localDashboardHeight, setLocalDashboardHeight] = useState(320);
    const dashboardHeight = propDashboardHeight !== undefined ? propDashboardHeight : localDashboardHeight;
    const setDashboardHeight = onDashboardHeightChange || setLocalDashboardHeight;

    const containerRef = useRef<HTMLDivElement>(null);
    const hyperRef = useRef<HyperLogHandle>(null);

    const levelMatchers = useMemo(() => {
        if (!preferences?.levelStyles) return [];
        return preferences.levelStyles
            .filter(style => style.enabled)
            .map(style => ({
                regex: new RegExp(`(^|\\s|/)${style.level}(/|\\s|:)`),
                color: style.color
            }));
    }, [preferences?.levelStyles]);

    const callbacks = useMemo(() => ({
        scrollToIndex: (index: number, options?: { align: 'start' | 'center' | 'end' }) => hyperRef.current?.scrollToIndex(index, options),
        scrollBy: (top: number) => hyperRef.current?.scrollBy({ top }),
        scrollTo: (top: number) => hyperRef.current?.scrollTo({ top }),
        getScrollTop: () => hyperRef.current?.getScrollTop() || 0
    }), []);

    const scrollHook = useLogViewerScroll({
        totalMatches, workerReady, initialScrollIndex, absoluteOffset, fileName, onSyncScroll, callbacks
    });

    const selectionHook = useLogViewerSelection({
        onLineClick, onDrop, containerRef
    });

    const keyboardHook = useLogViewerKeyboard({
        activeLineIndex, totalMatches, absoluteOffset, rowHeight,
        setIsAutoScrollPaused: scrollHook.setIsAutoScrollPaused,
        onLineClick, onLineDoubleClick,
        toggleBookmark: (idx) => onToggleBookmark && onToggleBookmark(idx),
        onCopy, onShowBookmarks, onFocusPaneRequest, isRawMode, onSelectAll,
        cachedLines: undefined, callbacks,
        getPageHeight: () => containerRef.current?.clientHeight || 800
    });

    useImperativeHandle(ref, () => ({
        focus: () => hyperRef.current?.focus(),
        getScrollTop: () => hyperRef.current?.getScrollTop() || 0,
        getCenterLineInfo: () => hyperRef.current?.getCenterLineInfo() || { index: 0, offset: 0, viewportHeight: 0 },
        scrollBy: (deltaY: number) => {
            scrollHook.ignoreSyncRef.current = true;
            callbacks.scrollBy(deltaY);
        },
        scrollByLines: (count: number) => {
            scrollHook.ignoreSyncRef.current = true;
            callbacks.scrollBy(count * rowHeight);
        },
        scrollByPage: (direction: number) => {
            scrollHook.ignoreSyncRef.current = true;
            const pageHeight = containerRef.current?.clientHeight || 800;
            callbacks.scrollBy(direction * pageHeight);
        },
        scrollTo: (top: number) => {
            scrollHook.ignoreSyncRef.current = true;
            callbacks.scrollTo(top);
        },
        scrollToIndex: (index: number, options?: { align: 'start' | 'center' | 'end' }) => {
            scrollHook.ignoreSyncRef.current = true;
            callbacks.scrollToIndex(index, options);
        },
        jumpToNextBookmark: () => {
            const viewportTopIdx = Math.floor(scrollHook.scrollTopRef.current / rowHeight) + (absoluteOffset || 0);
            const currentIdx = activeLineIndex >= 0 ? activeLineIndex : viewportTopIdx;
            const sorted = (Array.from(bookmarks)).sort((a, b) => a - b);
            const next = sorted.find((b) => b > currentIdx);
            const target = next !== undefined ? next : (sorted.length > 0 ? sorted[0] : -1);

            if (target !== -1) {
                if (target >= (absoluteOffset || 0) && target < (absoluteOffset || 0) + totalMatches) {
                    callbacks.scrollToIndex(target - (absoluteOffset || 0), { align: 'center' });
                    if (onLineClick) onLineClick(target);
                } else if (onJumpToLine) {
                    onJumpToLine(target);
                }
            }
        },
        jumpToPrevBookmark: () => {
            const viewportTopIdx = Math.floor(scrollHook.scrollTopRef.current / rowHeight) + (absoluteOffset || 0);
            const currentIdx = activeLineIndex >= 0 ? activeLineIndex : viewportTopIdx;
            const sorted = (Array.from(bookmarks)).sort((a, b) => b - a);
            const prev = sorted.find((b) => b < currentIdx);
            const target = prev !== undefined ? prev : (sorted.length > 0 ? sorted[0] : -1);

            if (target !== -1) {
                if (target >= (absoluteOffset || 0) && target < (absoluteOffset || 0) + totalMatches) {
                    callbacks.scrollToIndex(target - (absoluteOffset || 0), { align: 'center' });
                    if (onLineClick) onLineClick(target);
                } else if (onJumpToLine) {
                    onJumpToLine(target);
                }
            }
        },
        isAtTop: () => (hyperRef.current?.getScrollTop() || 0) === 0,
        isAtBottom: () => scrollHook.atBottom
    }));

    const EMPTY_ARRAY = useMemo(() => [], []);
    const { textHighlights, lineHighlights } = useMemo(() => {
        if (!highlights || highlights.length === 0) return { textHighlights: EMPTY_ARRAY, lineHighlights: EMPTY_ARRAY };
        return {
            textHighlights: highlights.filter(h => !h.lineEffect),
            lineHighlights: highlights.filter(h => h.lineEffect)
        };
    }, [highlights, EMPTY_ARRAY]);

    // Handle shift+scroll via explicit event listener for passive: false
    useEffect(() => {
        if (!scrollHook.isShiftDown) return;
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e: WheelEvent) => {
            if (e.shiftKey !== scrollHook.shiftPressedRef.current) {
                scrollHook.shiftPressedRef.current = e.shiftKey;
            }
            if (e.shiftKey) {
                e.preventDefault();
                let delta = e.deltaY;
                if (delta === 0 && e.deltaX !== 0) delta = e.deltaX;
                if (delta !== 0) callbacks.scrollBy(delta);
            }
        };
        container.addEventListener('wheel', onWheel, { passive: false });
        return () => container.removeEventListener('wheel', onWheel);
    }, [scrollHook.isShiftDown, scrollHook.shiftPressedRef, callbacks]);

    const showScrollToBottom = (!scrollHook.atBottom || scrollHook.isAutoScrollPaused) && totalMatches > 0;

    return (
        <div
            ref={containerRef}
            className={`flex-1 flex flex-col relative overflow-hidden transition-colors duration-300 outline-none h-full 
                ${selectionHook.dragActive
                    ? 'bg-indigo-500/10 ring-4 ring-inset ring-indigo-500/50'
                    : isRawMode
                        ? 'bg-slate-100 dark:bg-slate-900'
                        : 'bg-white dark:bg-slate-950'
                }
                border-r border-slate-200 dark:border-white/5 last:border-r-0
            `}
            onDragEnter={selectionHook.handleDrag} onDragOver={selectionHook.handleDrag} onDragLeave={selectionHook.handleDrag} onDrop={selectionHook.handleDropEvent}
            onContextMenu={onContextMenu}
        >
            <LogViewerToolbar
                isRawMode={isRawMode}
                workerReady={workerReady}
                placeholderText={placeholderText}
                fileName={fileName}
                onArchiveSave={onArchiveSave}
                isArchiveSaveEnabled={isArchiveSaveEnabled}
                onShowBookmarks={onShowBookmarks}
                bookmarksSize={bookmarks.size}
                onCopy={onCopy}
                onCopyAsConfluenceTable={onCopyAsConfluenceTable}
                onSave={onSave}
                onAnalyzePerformance={onAnalyzePerformance}
                perfAnalysisResult={perfAnalysisResult}
                isAnalyzingPerformance={isAnalyzingPerformance}
                onAnalyzeSpam={onAnalyzeSpam}
                onReset={onReset}
            />

            <div className="flex-1 relative flex flex-col log-viewer-pane" data-pane-id={paneId}>
                {workerReady ? (
                    <>
                        <AnimatePresence>
                            {(perfAnalysisResult || isAnalyzingPerformance) && (
                                <motion.div
                                    key="perf-dashboard-wrapper"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                                    className="w-full relative z-20 shrink-0"
                                >
                                    <PerfDashboard
                                        isOpen={true}
                                        isActive={isActive}
                                        result={perfAnalysisResult || null}
                                        isAnalyzing={isAnalyzingPerformance}
                                        onClose={() => { if (onAnalyzePerformance) onAnalyzePerformance(); }}
                                        targetTime={1000}
                                        onJumpToLine={onJumpToLine!}
                                        onJumpToRange={onJumpToRange!}
                                        onViewRawRange={onViewRawRange!}
                                        onCopyRawRange={onCopyRawRange!}
                                        height={dashboardHeight}
                                        onHeightChange={setDashboardHeight}
                                        showTidColumn={false}
                                        useCompactDetail={true}
                                        paneId={paneId}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex-1 relative overflow-hidden">
                            <HyperLogRenderer
                                ref={hyperRef}
                                isActive={isActive}
                                totalCount={totalMatches || 0}
                                rowHeight={rowHeight}
                                onScrollRequest={onScrollRequest}
                                preferences={preferences}
                                activeLineIndex={activeLineIndex}
                                selectedIndices={selectedIndices}
                                bookmarks={bookmarks}
                                textHighlights={textHighlights}
                                lineHighlights={lineHighlights}
                                lineHighlightRanges={lineHighlightRanges}
                                highlightCaseSensitive={highlightCaseSensitive}
                                levelMatchers={levelMatchers}
                                onLineClick={onLineClick}
                                onLineDoubleClick={onLineDoubleClick}
                                onQuickHighlight={onQuickHighlight}
                                onClearQuickHighlights={onClearQuickHighlights}

                                onAtBottomChange={scrollHook.handleAtBottomChange}
                                absoluteOffset={absoluteOffset}
                                isRawMode={isRawMode}
                                performanceHeatmap={performanceHeatmap}
                                onKeyDown={keyboardHook.handleKeyDown}
                                onScroll={scrollHook.handleScroll}
                                clearCacheTick={clearCacheTick}
                                sharedBuffers={sharedBuffers}
                            />
                            {showScrollToBottom && (
                                <button
                                    className="absolute bottom-8 right-10 z-[60] p-4 bg-indigo-600 text-white rounded-full shadow-lg border border-white/10 transition-all duration-200 hover:bg-indigo-500 active:scale-90 group/jump overflow-hidden"
                                    onClick={() => {
                                        if (onScrollToBottomRequest) {
                                            onScrollToBottomRequest();
                                        } else {
                                            scrollHook.setIsAutoScrollPaused(false);
                                            callbacks.scrollToIndex(totalMatches - 1, { align: 'end' });
                                        }
                                    }}
                                    title="Jump to Bottom (Ctrl+End)"
                                >
                                    <ArrowDown size={24} className="relative z-10 group-hover/jump:translate-y-0.5 transition-transform" />
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <LogViewerEmptyState fileName={fileName} onBrowse={onBrowse} onPasteClipboard={onPasteClipboard} />
                )}
            </div>

            {workerReady && (
                <div className="h-7 border-t border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-950 px-3 flex items-center justify-between text-[10px] text-slate-500 font-medium select-none">
                    <div className="flex gap-4"><span>Matches: <span className="text-slate-700 dark:text-slate-300">{totalMatches.toLocaleString()}</span></span></div>
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"></span>
                        <span className="text-slate-600 dark:text-slate-400">Ready</span>
                    </div>
                </div>
            )}
        </div>
    );
}));

LogViewerPane.displayName = 'LogViewerPane';

export default LogViewerPane;
export { OVERSCAN_COUNT };
