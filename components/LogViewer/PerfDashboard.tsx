import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Lucide from 'lucide-react';
import { PerfHeavyHitters } from './PerfDashboard/PerfHeavyHitters';
import { AnalysisResult, AnalysisSegment } from '../../utils/perfAnalysis';
import { formatDuration } from '../../utils/logTime';
import { useToast } from '../../contexts/ToastContext';
import { usePerfZoomLogic } from './PerfDashboard/hooks/usePerfZoomLogic';
import { PerfMinimap } from './PerfDashboard/PerfMinimap';
import { PerfFlameGraph } from './PerfDashboard/PerfFlameGraph';
import { PerfTopBar } from './PerfDashboard/PerfTopBar';
import { PerfBottleneckList } from './PerfDashboard/PerfBottleneckList';
import { PerfSegmentDetail } from './PerfDashboard/PerfSegmentDetail';
import { PerfChartLayout } from './PerfDashboard/PerfChartLayout';
import { usePerfDashboardState } from './usePerfDashboardState';
import { PerfDashboardOverlay } from './PerfDashboard/PerfDashboardOverlay';
import { PerfDashboardScanner } from './PerfDashboard/PerfDashboardScanner';
import { PerfDashboardSummary } from './PerfDashboard/PerfDashboardSummary';
import { PerfDashboardHeaderBar } from './PerfDashboard/PerfDashboardHeaderBar';
import { usePerfFlameData } from './usePerfFlameData';

interface PerfDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    result: AnalysisResult | null;
    isAnalyzing: boolean;
    onJumpToLine?: (lineNum: number) => void;
    onJumpToRange?: (start: number, end: number) => void;
    onViewRawRange?: (originalStart: number, originalEnd: number, filteredIndex?: number) => void;
    onCopyRawRange?: (start: number, end: number) => void;
    targetTime: number;
    height?: number;
    onHeightChange?: (height: number) => void;
    isFullScreen?: boolean;
    showTidColumn?: boolean;
    useCompactDetail?: boolean;
    isActive: boolean;
    activeTags?: string[];
    paneId?: 'left' | 'right' | 'single';
}


// --- Sub-components for Premium Cockpit ---

const EMPTY_TAGS: string[] = [];

const PerfDashboardBase: React.FC<PerfDashboardProps> = ({
    isOpen, onClose, result, isAnalyzing,
    onJumpToLine, onJumpToRange, onViewRawRange, onCopyRawRange,
    targetTime, height = 400, onHeightChange = () => { }, isFullScreen = false,
    showTidColumn = true,
    useCompactDetail = false,
    isActive = true,
    activeTags = EMPTY_TAGS,
    paneId
}) => {
    const {
        selectedSegmentId, setSelectedSegmentId,
        viewMode, setViewMode,
        minimized, setMinimized,
        searchInput, setSearchInput,
        searchTerms, addSearchTerm, removeSearchTerm,
        searchRef, canvasRef, flameChartContainerRef, dragCleanupRef,
        isInitialDrawComplete, setIsInitialDrawComplete,
        trimRange, setTrimRange,
        flameZoom, applyZoom,
        measureRange, setMeasureRange,
        isShiftPressed, showOnlyFail, setShowOnlyFail,
        multiSelectedIds, setMultiSelectedIds,
        lockedTid, setLockedTid,
        perfThreshold, setPerfThreshold,
        navSegments, currentNavIndex, jumpToNavSegment,
        checkSegmentMatch,
        isScanningStatus,
        highlightName, setHighlightName,
        milestones, addUserMilestone,
        selectedMilestoneTime, setSelectedMilestoneTime,
        deleteUserMilestone, updateUserMilestone
    } = usePerfDashboardState({
        result,
        isAnalyzing,
        isActive,
        isOpen,
        paneId,
        activeTags,
        onJumpToRange
    });

    const { addToast } = useToast();
    const [isFlashing, setIsFlashing] = useState(false);

    const handleExportImage = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        try {
            // Visual feedback
            setIsFlashing(true);
            setTimeout(() => setIsFlashing(false), 300);

            // Create a temporary link
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            link.download = `happytool_perf_${timestamp}.png`;
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            addToast('Screenshot saved successfully!', 'success');
        } catch (err) {
            console.error('Failed to export image:', err);
            addToast('Failed to save screenshot.', 'error');
        }
    };

    // Constants for coloring
    const palette = ['#6366f1', '#ec4899', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];

    // Helper for Axis Ticks
    const generateTicks = (start: number, end: number, minTicks: number = 5) => {
        const duration = Math.max(1, end - start);
        const rawInterval = duration / minTicks;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
        let interval = magnitude;
        if (rawInterval / magnitude >= 5) interval = magnitude * 5;
        else if (rawInterval / magnitude >= 2) interval = magnitude * 2;
        if (interval < 1) interval = 1;

        const firstTick = Math.ceil(start / interval) * interval;
        const ticks = [];
        for (let t = firstTick; t <= end; t += interval) {
            ticks.push(t);
        }
        return ticks;
    };

    const { flameSegments, maxLane, laneTidMap } = usePerfFlameData({
        result,
        showOnlyFail,
        activeTags,
        trimRange
    });

    const selectedTid = useMemo(() => {
        if (!selectedSegmentId) return null;
        return result?.segments.find(s => s.id === selectedSegmentId)?.tid || null;
    }, [result, selectedSegmentId]);

    return (
        <div
            className={`w-full z-10 flex flex-col transition-all duration-300 ease-in-out relative group/dashboard perf-dashboard-container overflow-hidden max-h-full min-h-0 ${isFullScreen ? 'h-full flex-1' : 'border-b-[6px] border-[#080b14] shadow-[0_8px_16px_rgba(0,0,0,0.6)]'}`}
            style={isFullScreen ? { backgroundColor: '#0f172a' } : {
                height: minimized ? '40px' : `${height}px`,
                backgroundColor: '#0f172a' // Slate-950 distinct bg
            }}
            data-pane-id={paneId}
        >
            {/* Flash Effect Overlay */}
            <AnimatePresence>
                {isFlashing && (
                    <motion.div
                        initial={{ opacity: 0.8 }}
                        animate={{ opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 z-[1000] bg-white pointer-events-none"
                    />
                )}
            </AnimatePresence>

            {/* Loading Overlay (Persist until canvas is ready) */}
            <AnimatePresence>
                {(isScanningStatus || (result && !isInitialDrawComplete)) && (
                    <PerfDashboardOverlay
                        isAnalyzing={isAnalyzing}
                        isScanningStatus={isScanningStatus}
                        isInitialDrawComplete={isInitialDrawComplete}
                        result={result}
                    />
                )}
            </AnimatePresence>

            {/* Resizer Handle (Bottom) - Refined Pill Design */}
            {!minimized && !isFullScreen && (
                <div
                    className="absolute -bottom-2 left-0 right-0 h-4 cursor-ns-resize z-[100] flex justify-end px-12 group/resizer"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        const startY = e.clientY;
                        const startH = height;
                        const onMove = (mv: MouseEvent) => {
                            onHeightChange(Math.max(200, Math.min(800, startH + (mv.clientY - startY))));
                        };
                        const onUp = () => {
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                            dragCleanupRef.current = null;
                        };
                        dragCleanupRef.current = onUp;
                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                    }}
                >
                    {/* Visual Pill Tab */}
                    <div className="w-10 h-3 bg-gradient-to-b from-indigo-500 to-indigo-700 rounded-b-full flex items-center justify-center shadow-[0_4px_10px_rgba(0,0,0,0.5)] border-x border-b border-white/20 group-hover/resizer:h-4 group-hover/resizer:from-indigo-400 group-hover/resizer:to-indigo-600 transition-all duration-200 origin-top">
                        <div className="flex gap-0.5">
                            <div className="w-0.5 h-0.5 bg-white/80 rounded-full shadow-sm" />
                            <div className="w-0.5 h-0.5 bg-white/80 rounded-full shadow-sm" />
                            <div className="w-0.5 h-0.5 bg-white/80 rounded-full shadow-sm" />
                        </div>
                    </div>
                </div>
            )}

            {/* Header Bar */}
            <PerfDashboardHeaderBar
                result={result}
                isScanningStatus={isScanningStatus}
                trimRange={trimRange}
                setTrimRange={setTrimRange}
                applyZoom={applyZoom}
                activeTags={activeTags}
                isFullScreen={isFullScreen}
                multiSelectedIds={multiSelectedIds}
                setMultiSelectedIds={setMultiSelectedIds}
                setSelectedSegmentId={setSelectedSegmentId}
                showOnlyFail={showOnlyFail}
                setShowOnlyFail={setShowOnlyFail}
                navSegments={navSegments}
                currentNavIndex={currentNavIndex}
                jumpToNavSegment={jumpToNavSegment}
                searchInput={searchInput}
                setSearchInput={setSearchInput}
                searchTerms={searchTerms}
                addSearchTerm={addSearchTerm}
                removeSearchTerm={removeSearchTerm}
                searchRef={searchRef}
                viewMode={viewMode}
                setViewMode={setViewMode}
                handleExportImage={handleExportImage}
                minimized={minimized}
                setMinimized={setMinimized}
                onClose={onClose}
                perfThreshold={perfThreshold}
                setPerfThreshold={setPerfThreshold}
            />

            {/* Content Body */}
            <AnimatePresence mode="wait">
                {isScanningStatus ? (
                    <PerfDashboardScanner
                        minimized={minimized}
                        isAnalyzing={isAnalyzing}
                        result={result}
                    />
                ) : !minimized && result ? (
                    <motion.div
                        key="content"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 flex min-h-0 h-full overflow-hidden"
                    >
                        {/* Summary & Controls Panel (Left) - Hidden in FullScreen */}
                        <PerfDashboardSummary
                            result={result}
                            flameSegments={flameSegments}
                            isFullScreen={isFullScreen}
                            useCompactDetail={useCompactDetail}
                            selectedSegmentId={selectedSegmentId}
                            setSelectedSegmentId={setSelectedSegmentId}
                            onViewRawRange={onViewRawRange}
                            onCopyRawRange={onCopyRawRange}
                            perfThreshold={perfThreshold}
                        />

                        {/* Main View Area (Right) */}
                        <div className="flex-1 bg-black/20 relative overflow-hidden flex flex-col min-h-0">
                            {/* 🔥 Heavy Hitters Insight Panel: Top Bottlenecks by Self-Time */}
                            {!isScanningStatus && result && viewMode === 'chart' && (
                                <PerfHeavyHitters 
                                    result={result} 
                                    highlightName={highlightName}
                                    onToggleHighlight={(name) => {
                                        setHighlightName(prev => prev === name ? null : name);
                                    }}
                                />
                            )}

                            {/* FullScreen Top Bar Utility */}
                            {isFullScreen && (
                                <PerfTopBar
                                    result={result}
                                    viewMode={viewMode}
                                    setViewMode={setViewMode}
                                    showOnlyFail={showOnlyFail}
                                    setShowOnlyFail={setShowOnlyFail}
                                    multiSelectedIds={multiSelectedIds}
                                    setMultiSelectedIds={setMultiSelectedIds}
                                    setSelectedSegmentId={setSelectedSegmentId}
                                    navSegments={navSegments}
                                    currentNavIndex={currentNavIndex}
                                    jumpToNavSegment={jumpToNavSegment}
                                    searchInput={searchInput}
                                    setSearchInput={setSearchInput}
                                    searchTerms={searchTerms}
                                    addSearchTerm={addSearchTerm}
                                    removeSearchTerm={removeSearchTerm}
                                    searchRef={searchRef}
                                    onClose={onClose}
                                    minimized={minimized}
                                    setMinimized={setMinimized}
                                    perfThreshold={perfThreshold}
                                    setPerfThreshold={setPerfThreshold}
                                />
                            )}
                            {viewMode === 'chart' && flameZoom && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        applyZoom(null);
                                    }}
                                    className="absolute bottom-16 right-8 z-[60] px-3.5 py-1.5 bg-slate-900/80  border border-white/10 rounded-full text-[10px] font-bold text-indigo-400 hover:text-white hover:bg-indigo-600 shadow-2xl transition-all flex items-center gap-1.5 animate-in fade-in zoom-in duration-300"
                                    title="Reset View"
                                >
                                    <Lucide.Maximize2 size={12} />
                                    <span>RESET VIEW</span>
                                </button>
                            )}

                            {/* Trim Controls - appears when measureRange is set */}
                            {viewMode === 'chart' && measureRange && !trimRange && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const start = Math.min(measureRange.startTime, measureRange.endTime);
                                        const end = Math.max(measureRange.startTime, measureRange.endTime);
                                        if (end > start) {
                                            setTrimRange({ startTime: start, endTime: end });
                                            applyZoom({ startTime: start, endTime: end });
                                            setMeasureRange(null);
                                        }
                                    }}
                                    className="absolute bottom-28 right-8 z-[60] px-3.5 py-1.5 bg-indigo-600/90  border border-indigo-400/30 rounded-full text-[10px] font-bold text-white shadow-2xl hover:bg-indigo-500 transition-all flex items-center gap-1.5 animate-in fade-in zoom-in duration-300"
                                    title="Trim to Selected Range"
                                >
                                    <Lucide.Scissors size={12} />
                                    <span>TRIM TO SELECTION</span>
                                </button>
                            )}
                            {viewMode === 'chart' && trimRange && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setTrimRange(null);
                                        applyZoom(null);
                                    }}
                                    className="absolute bottom-28 right-8 z-[60] px-3.5 py-1.5 bg-amber-500/90  border border-amber-400/30 rounded-full text-[10px] font-bold text-white shadow-2xl hover:bg-amber-400 transition-all flex items-center gap-1.5 animate-in fade-in zoom-in duration-300"
                                    title="Reset Trim"
                                >
                                    <Lucide.RotateCcw size={12} />
                                    <span>RESET TRIM</span>
                                </button>
                            )}

                            {/* 📦 Constrained Middle Container: Chart or List area */}
                            <div className="flex-[1_1_0%] flex flex-col min-h-0 overflow-hidden relative">
                                {/* Flame Chart Canvas Area (Replaced by PerfChartLayout) */}
                                {viewMode === 'chart' && result && (
                                    <PerfChartLayout
                                        result={result}
                                        flameSegments={flameSegments}
                                        maxLane={maxLane}
                                        laneTidMap={laneTidMap}
                                        palette={palette}
                                        trimRange={trimRange}
                                        flameZoom={flameZoom}
                                        applyZoom={applyZoom}
                                        showTidColumn={showTidColumn}
                                        lockedTid={lockedTid}
                                        setLockedTid={setLockedTid}
                                        selectedTid={selectedTid}
                                        measureRange={measureRange}
                                        setMeasureRange={setMeasureRange}
                                        isShiftPressed={isShiftPressed}
                                        searchTerms={searchTerms}
                                        checkSegmentMatch={checkSegmentMatch}
                                        showOnlyFail={showOnlyFail}
                                        selectedSegmentId={selectedSegmentId}
                                        setSelectedSegmentId={setSelectedSegmentId}
                                        multiSelectedIds={multiSelectedIds}
                                        setMultiSelectedIds={setMultiSelectedIds}
                                        onJumpToRange={onJumpToRange}
                                        onViewRawRange={onViewRawRange}
                                        isActive={true} // Assuming it's active when rendered
                                        isOpen={true} // Assuming it's open when rendered
                                        setIsInitialDrawComplete={setIsInitialDrawComplete}
                                        exportCanvasRef={canvasRef}
                                        generateTicks={generateTicks}
                                        flameChartContainerRef={flameChartContainerRef}
                                        dragCleanupRef={dragCleanupRef}
                                        perfThreshold={perfThreshold}
                                        highlightName={highlightName}
                                        milestones={milestones}
                                        addUserMilestone={addUserMilestone}
                                        selectedMilestoneTime={selectedMilestoneTime}
                                        setSelectedMilestoneTime={(time) => {
                                            setSelectedMilestoneTime(time);
                                        }}
                                        deleteUserMilestone={deleteUserMilestone}
                                        updateUserMilestone={updateUserMilestone}
                                    />
                                )}

                                {viewMode === 'list' && (
                                    <PerfBottleneckList
                                        result={result}
                                        showOnlyFail={showOnlyFail}
                                        searchTerms={searchTerms}
                                        checkSegmentMatch={checkSegmentMatch}
                                        selectedSegmentId={selectedSegmentId}
                                        setSelectedSegmentId={setSelectedSegmentId}
                                        setMultiSelectedIds={setMultiSelectedIds}
                                        onJumpToRange={onJumpToRange}
                                        onViewRawRange={onViewRawRange}
                                        perfThreshold={perfThreshold}
                                    />
                                )}
                            </div>

                            {/* 🗺️ Minimap: Outside flex-1 and shrink-0 to preserve space */}
                            {viewMode === 'chart' && flameSegments.length > 0 && (
                                <PerfMinimap
                                    result={result}
                                    flameSegments={flameSegments}
                                    maxLane={maxLane}
                                    searchTerms={searchTerms}
                                    palette={palette}
                                    trimRange={trimRange}
                                    flameZoom={flameZoom}
                                    applyZoom={applyZoom}
                                    checkSegmentMatch={checkSegmentMatch}
                                />
                            )}

                            {/* 📄 Docked Detail Panel: Always at the bottom */}
                            <PerfSegmentDetail
                                useCompactDetail={useCompactDetail!}
                                selectedSegmentId={selectedSegmentId}
                                result={result}
                                setSelectedSegmentId={setSelectedSegmentId}
                                onViewRawRange={onViewRawRange}
                            />
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            {
                !result && !minimized && !isScanningStatus && (
                    <div className="flex-1 flex items-center justify-center text-slate-600 gap-2">
                        <Lucide.Activity size={20} className="opacity-20" />
                        <span className="text-xs font-bold uppercase tracking-widest opacity-50">
                            Ready to Analyze
                        </span>
                    </div>
                )
            }
        </div >
    );
};

export const PerfDashboard = React.memo(PerfDashboardBase);
