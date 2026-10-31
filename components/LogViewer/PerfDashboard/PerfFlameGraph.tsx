import React, { useRef, useEffect } from 'react';
import { AnalysisResult, AnalysisSegment } from '../../../utils/perfAnalysis';
import { usePerfFlameInteraction } from './hooks/usePerfFlameInteraction';
import { PerfFlameGraphRenderer } from './utils/PerfFlameGraphRenderer';

interface PerfFlameGraphProps {
    result: AnalysisResult;
    flameSegments: AnalysisSegment[];
    maxLane: number;
    laneTidMap: Map<number, string>;
    palette: string[];
    trimRange: { startTime: number; endTime: number; } | null;
    flameZoom: { startTime: number; endTime: number; } | null;
    applyZoom: (zoom: { startTime: number; endTime: number; } | null) => void;

    isShiftPressed: boolean;
    searchTerms: string[];
    checkSegmentMatch: (s: AnalysisSegment, currentActiveTags: string[]) => boolean;
    showOnlyFail: boolean;
    lockedTid: string | null;
    selectedTid: string | null;
    activeTags?: string[];

    selectedSegmentId: string | null;
    setSelectedSegmentId: (id: string | null) => void;
    multiSelectedIds: string[];
    setMultiSelectedIds: (ids: string[]) => void;

    onJumpToRange?: (startLine: number, endLine: number) => void;
    onViewRawRange?: (startLine: number, endLine: number, highlightLine?: number) => void;

    isActive: boolean;
    isOpen: boolean;
    setIsInitialDrawComplete: (complete: boolean) => void;
    exportCanvasRef?: React.RefObject<HTMLCanvasElement>;
    perfThreshold: number;
    generateTicks: (start: number, end: number, minTicks?: number) => number[];
    highlightName: string | null;
    milestones: { time: number; label: string; color: string }[];
}

export const PerfFlameGraph: React.FC<PerfFlameGraphProps> = ({
    result,
    flameSegments,
    maxLane,
    laneTidMap,
    palette,
    trimRange,
    flameZoom,
    applyZoom,
    isShiftPressed,
    searchTerms,
    checkSegmentMatch,
    showOnlyFail,
    lockedTid,
    selectedTid,
    activeTags = [],
    selectedSegmentId,
    setSelectedSegmentId,
    multiSelectedIds,
    setMultiSelectedIds,
    onJumpToRange,
    onViewRawRange,
    isActive,
    isOpen,
    setIsInitialDrawComplete,
    exportCanvasRef,
    perfThreshold,
    generateTicks,
    highlightName,
    milestones
}) => {
    const internalCanvasRef = useRef<HTMLCanvasElement>(null);
    const canvasRef = exportCanvasRef || internalCanvasRef;
    const rectCacheRef = useRef<DOMRect | null>(null);
    const isDirtyRef = useRef(true);
    const zoomRef = useRef(flameZoom);
    const isActiveRef = useRef(isActive);

    useEffect(() => { zoomRef.current = flameZoom; }, [flameZoom]);
    useEffect(() => {
        isActiveRef.current = isActive;
        if (isActive) isDirtyRef.current = true;
    }, [isActive]);

    useEffect(() => {
        if (!canvasRef.current) return;
        let resizeTimer: ReturnType<typeof setTimeout> | null = null;
        let isFirstRender = true;

        const observer = new ResizeObserver(() => {
            const applyResize = () => {
                rectCacheRef.current = null;
                isDirtyRef.current = true;
            };

            if (isFirstRender) {
                isFirstRender = false;
                applyResize();
            } else {
                if (resizeTimer) clearTimeout(resizeTimer);
                resizeTimer = setTimeout(applyResize, 100);
            }
        });
        observer.observe(canvasRef.current);
        return () => {
            if (resizeTimer) clearTimeout(resizeTimer);
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        if (result) setIsInitialDrawComplete(false);
    }, [result, setIsInitialDrawComplete]);

    useEffect(() => {
        if (isOpen) {
            rectCacheRef.current = null;
            isDirtyRef.current = true;
        }
    }, [isOpen]);

    useEffect(() => {
        rectCacheRef.current = null;
        isDirtyRef.current = true;
    }, [showOnlyFail, maxLane, trimRange]);

    const resultRef = useRef(result);
    useEffect(() => { resultRef.current = result; }, [result]);

    const {
        mousePos,
        hoveredSegmentId,
        handleMouseMove,
        handleMouseLeave,
        handleClick,
        handleDoubleClick,
        handleMouseDown,
        handleMouseUp,
        isPanning
    } = usePerfFlameInteraction({
        canvasRef,
        flameSegments,
        zoomRef,
        trimRange,
        result,
        isShiftPressed,
        applyZoom,
        setSelectedSegmentId,
        setMultiSelectedIds,
        onJumpToRange,
        onViewRawRange
    });

    useEffect(() => {
        isDirtyRef.current = true;
    }, [
        result, flameZoom, selectedSegmentId, hoveredSegmentId, mousePos,
        searchTerms, multiSelectedIds, lockedTid, isShiftPressed, activeTags,
        showOnlyFail, perfThreshold, highlightName, milestones
    ]);

    const drawFlameChart = (): boolean => {
        const canvas = canvasRef.current;
        if (!canvas || !resultRef.current) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;

        const currentResult = resultRef.current;
        const dpr = window.devicePixelRatio || 1;
        const rect = rectCacheRef.current ?? canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            rectCacheRef.current = rect;
        } else {
            requestAnimationFrame(() => { isDirtyRef.current = true; });
            return false;
        }

        const targetW = Math.round(rect.width * dpr);
        const targetH = Math.round(rect.height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const viewStart = zoomRef.current?.startTime ?? (trimRange?.startTime ?? currentResult.startTime);
        const viewDuration = Math.max(1, (zoomRef.current?.endTime ?? (trimRange?.endTime ?? currentResult.endTime)) - viewStart);

        PerfFlameGraphRenderer.drawFlameChart(ctx, currentResult, flameSegments, {
            viewStart,
            viewDuration,
            width: rect.width,
            height: rect.height,
            palette,
            searchTerms,
            checkSegmentMatch,
            showOnlyFail,
            lockedTid,
            selectedTid,
            selectedSegmentId,
            multiSelectedIds,
            hoveredSegmentId,
            perfThreshold,
            activeTags,
            mousePos,
            ticks: generateTicks(viewStart, viewStart + viewDuration, 8),
            highlightName,
            milestones
        });

        return true;
    };

    const drawFlameChartRef = useRef<() => boolean>(() => true);
    drawFlameChartRef.current = drawFlameChart;

    useEffect(() => {
        let frameId: number;
        let running = true;

        const render = () => {
            if (!running) return;

            if (isActiveRef.current && isDirtyRef.current && resultRef.current) {
                const flameSuccess = drawFlameChartRef.current();
                if (flameSuccess !== false) {
                    isDirtyRef.current = false;
                    setIsInitialDrawComplete(true);
                }
            }

            frameId = requestAnimationFrame(render);
        };

        frameId = requestAnimationFrame(render);
        return () => {
            running = false;
            cancelAnimationFrame(frameId);
        };
    }, [setIsInitialDrawComplete]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            style={{
                pointerEvents: isShiftPressed ? 'none' : 'auto',
                cursor: isPanning ? 'grabbing' : 'default'
            }}
        />
    );
};

