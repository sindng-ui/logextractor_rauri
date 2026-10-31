import { useState, useRef } from 'react';
import { AnalysisResult, AnalysisSegment } from '../../../../utils/perfAnalysis';

interface MousePos {
    x: number;
    y: number;
    time: number;
}

interface UsePerfFlameInteractionProps {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    flameSegments: AnalysisSegment[];
    zoomRef: React.MutableRefObject<{ startTime: number; endTime: number; } | null>;
    trimRange: { startTime: number; endTime: number; } | null;
    result: AnalysisResult | null;
    isShiftPressed: boolean;
    applyZoom: (zoom: { startTime: number; endTime: number; } | null) => void;
    setSelectedSegmentId: (id: string | null) => void;
    setMultiSelectedIds: (ids: string[]) => void;
    onJumpToRange?: (start: number, end: number) => void;
    onViewRawRange?: (start: number, end: number, highlight?: number) => void;
}

export const usePerfFlameInteraction = ({
    canvasRef, flameSegments, zoomRef, trimRange, result,
    isShiftPressed, applyZoom, setSelectedSegmentId, setMultiSelectedIds,
    onJumpToRange, onViewRawRange
}: UsePerfFlameInteractionProps) => {
    const [mousePos, setMousePos] = useState<MousePos | null>(null);
    const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
    const panStartRef = useRef<{ clientX: number; viewStart: number; viewEnd: number } | null>(null);

    const findSegmentAtMouse = (mouseX: number, mouseY: number, viewStart: number, viewDuration: number, width: number) => {
        let found = null;
        let globalFallback = null;

        for (let i = flameSegments.length - 1; i >= 0; i--) {
            const s = flameSegments[i];
            const x = ((s.startTime - viewStart) / viewDuration) * width;
            const w = Math.max(s.duration === 0 ? 3 : 0.5, (s.duration / viewDuration) * width);
            const y = s.lane * 24 + 40;

            if (mouseX >= x && mouseX <= x + w && mouseY >= y && mouseY <= y + 22) {
                if (s.tid === 'Global') {
                    globalFallback = s;
                } else {
                    found = s;
                    break;
                }
            }
        }
        return found || globalFallback;
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isShiftPressed || !result) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const viewStart = zoomRef.current?.startTime ?? (trimRange?.startTime ?? result.startTime);
        const viewEnd = zoomRef.current?.endTime ?? (trimRange?.endTime ?? result.endTime);
        const viewDuration = Math.max(1, viewEnd - viewStart);
        const width = rect.width;

        if (panStartRef.current) {
            const dx = e.clientX - panStartRef.current.clientX;
            const { viewStart: pStart, viewEnd: pEnd } = panStartRef.current;
            const dur = pEnd - pStart;
            const panAmount = -(dx / width) * dur;
            let newStart = pStart + panAmount;
            let newEnd = pEnd + panAmount;
            const boundStart = trimRange?.startTime ?? result.startTime;
            const boundEnd = trimRange?.endTime ?? result.endTime;

            if (newStart < boundStart) { newStart = boundStart; newEnd = newStart + dur; }
            if (newEnd > boundEnd) { newEnd = boundEnd; newStart = newEnd - dur; }
            applyZoom({ startTime: newStart, endTime: newEnd });
        }

        const target = findSegmentAtMouse(mouseX, mouseY, viewStart, viewDuration, width);
        if (target?.id !== hoveredSegmentId) {
            setHoveredSegmentId(target?.id || null);
        }

        const time = viewStart + (mouseX / width) * viewDuration;
        setMousePos({ x: mouseX, y: mouseY, time });
    };

    const handleMouseLeave = () => {
        setMousePos(null);
        setHoveredSegmentId(null);
        panStartRef.current = null;
    };

    const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isShiftPressed || !result) return;
        if (hoveredSegmentId) {
            setSelectedSegmentId(hoveredSegmentId);
            setMultiSelectedIds([]);
            const s = result.segments.find(seg => seg.id === hoveredSegmentId);
            if (s && onJumpToRange) onJumpToRange(s.startLine, s.endLine);
        } else {
            setSelectedSegmentId(null);
            setMultiSelectedIds([]);
        }
    };

    const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isShiftPressed || !result || !hoveredSegmentId) return;
        const s = result.segments.find(seg => seg.id === hoveredSegmentId);
        if (s && onViewRawRange) {
            onViewRawRange(s.originalStartLine || s.startLine, s.originalEndLine || s.endLine, s.startLine + 1);
        }
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (e.button !== 0 || isShiftPressed || !result) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const viewStart = zoomRef.current?.startTime ?? (trimRange?.startTime ?? result.startTime);
        const viewEnd = zoomRef.current?.endTime ?? (trimRange?.endTime ?? result.endTime);
        const viewDuration = Math.max(1, viewEnd - viewStart);
        const width = rect.width;

        const target = findSegmentAtMouse(mouseX, mouseY, viewStart, viewDuration, width);
        if (!target) {
            panStartRef.current = { clientX: e.clientX, viewStart, viewEnd };
            canvas.style.cursor = 'grabbing';
        }
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (panStartRef.current) {
            panStartRef.current = null;
            const canvas = canvasRef.current;
            if (canvas) canvas.style.cursor = 'default';
        }
    };

    return {
        mousePos,
        hoveredSegmentId,
        handleMouseMove,
        handleMouseLeave,
        handleClick,
        handleDoubleClick,
        handleMouseDown,
        handleMouseUp,
        isPanning: !!panStartRef.current
    };
};
