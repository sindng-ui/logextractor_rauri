import { useState, useRef, useCallback } from 'react';

interface UsePerfZoomLogicProps {
    resultStartTime: number;
    resultEndTime: number;
    trimRange: { startTime: number; endTime: number } | null;
    onZoomChange?: (newZoom: { startTime: number; endTime: number } | null) => void;
}

export const usePerfZoomLogic = ({
    resultStartTime,
    resultEndTime,
    trimRange,
    onZoomChange,
}: UsePerfZoomLogicProps) => {
    // flameZoom is the JSX-driven state
    const [flameZoom, setFlameZoom] = useState<{ startTime: number; endTime: number } | null>(null);
    // zoomRef acts as instantaneous source-of-truth without triggering immediate re-renders
    const zoomRef = useRef<{ startTime: number; endTime: number } | null>(null);

    const zoomFlushPendingRef = useRef(false);

    const applyZoom = useCallback((newZoom: { startTime: number; endTime: number } | null) => {
        zoomRef.current = newZoom;

        if (!zoomFlushPendingRef.current) {
            zoomFlushPendingRef.current = true;
            requestAnimationFrame(() => {
                setFlameZoom(zoomRef.current);
                zoomFlushPendingRef.current = false;
            });
        }

        if (onZoomChange) {
            onZoomChange(newZoom);
        }
    }, [onZoomChange]);

    const handleWheelZoom = useCallback((deltaY: number, fractionalPos: number) => {
        const defaultStart = trimRange?.startTime ?? resultStartTime;
        const defaultEnd = trimRange?.endTime ?? resultEndTime;

        const currentStart = zoomRef.current?.startTime ?? defaultStart;
        const currentEnd = zoomRef.current?.endTime ?? defaultEnd;
        const duration = currentEnd - currentStart;

        const zoomFactor = deltaY > 0 ? 1.1 : 0.9;
        const newDuration = duration * zoomFactor;

        // Where is the cursor currently mapped in time?
        const timeAtPointer = currentStart + duration * fractionalPos;

        // Calculate new start/end keeping the pointer stationary
        let newStart = timeAtPointer - newDuration * fractionalPos;
        let newEnd = newStart + newDuration;

        const boundStart = defaultStart;
        const boundEnd = defaultEnd;

        // Boundary adjustments
        if (newStart < boundStart) {
            newEnd += (boundStart - newStart);
            newStart = boundStart;
        }
        if (newEnd > boundEnd) {
            newStart -= (newEnd - boundEnd);
            newEnd = boundEnd;
        }
        if (newStart < boundStart) newStart = boundStart;
        if (newEnd > boundEnd) newEnd = boundEnd;

        applyZoom({ startTime: newStart, endTime: newEnd });
    }, [resultStartTime, resultEndTime, trimRange, applyZoom]);

    const handleWheelPan = useCallback((panAmount: number) => {
        const defaultStart = trimRange?.startTime ?? resultStartTime;
        const defaultEnd = trimRange?.endTime ?? resultEndTime;

        const currentStart = zoomRef.current?.startTime ?? defaultStart;
        const currentEnd = zoomRef.current?.endTime ?? defaultEnd;
        const duration = currentEnd - currentStart;

        let newStart = currentStart + panAmount;
        let newEnd = currentEnd + panAmount;

        const boundStart = defaultStart;
        const boundEnd = defaultEnd;

        if (newStart < boundStart) {
            newStart = boundStart;
            newEnd = newStart + duration;
        }
        if (newEnd > boundEnd) {
            newEnd = boundEnd;
            newStart = newEnd - duration;
        }

        applyZoom({ startTime: newStart, endTime: newEnd });
    }, [resultStartTime, resultEndTime, trimRange, applyZoom]);

    const jumpToNavSegmentZoom = useCallback((target: { startTime: number, endTime: number }) => {
        const defaultStart = trimRange?.startTime ?? resultStartTime;
        const defaultEnd = trimRange?.endTime ?? resultEndTime;

        const currentStart = zoomRef.current?.startTime ?? defaultStart;
        const currentEnd = zoomRef.current?.endTime ?? defaultEnd;
        const currentDuration = currentEnd - currentStart;

        const targetStart = target.startTime;
        const targetEnd = target.endTime;

        // Already fully in view
        if (targetStart >= currentStart && targetEnd <= currentEnd) {
            return;
        }

        let newStart = currentStart;
        let newEnd = currentEnd;

        if ((targetEnd - targetStart) >= currentDuration) {
            newStart = targetStart;
            newEnd = newStart + currentDuration;
        } else {
            const targetCenter = (targetStart + targetEnd) / 2;
            newStart = targetCenter - currentDuration / 2;
            newEnd = targetCenter + currentDuration / 2;
        }

        const boundStart = defaultStart;
        const boundEnd = defaultEnd;

        if (newStart < boundStart) {
            newStart = boundStart;
            newEnd = Math.min(boundEnd, newStart + currentDuration);
        }
        if (newEnd > boundEnd) {
            newEnd = boundEnd;
            newStart = Math.max(boundStart, newEnd - currentDuration);
        }

        applyZoom({ startTime: newStart, endTime: newEnd });
    }, [resultStartTime, resultEndTime, trimRange, applyZoom]);

    return {
        flameZoom,
        zoomRef,
        applyZoom,
        handleWheelZoom,
        handleWheelPan,
        jumpToNavSegmentZoom
    };
};
