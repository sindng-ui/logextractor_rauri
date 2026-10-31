import { renderHook, act } from '@testing-library/react';
import { usePerfZoomLogic } from '../../components/LogViewer/PerfDashboard/hooks/usePerfZoomLogic';
import { describe, it, expect, vi } from 'vitest';

describe('usePerfZoomLogic', () => {
    const resultStartTime = 0;
    const resultEndTime = 10000;
    const trimRange = null;

    it('should initialize with null zoom state', () => {
        const { result } = renderHook(() => usePerfZoomLogic({
            resultStartTime,
            resultEndTime,
            trimRange,
            onZoomChange: vi.fn()
        }));

        expect(result.current.zoomRef.current).toBeNull();
    });

    it('should apply custom zoom range within bounds', () => {
        const { result } = renderHook(() => usePerfZoomLogic({
            resultStartTime,
            resultEndTime,
            trimRange,
            onZoomChange: vi.fn()
        }));

        act(() => {
            result.current.applyZoom({ startTime: 1000, endTime: 5000 });
        });

        expect(result.current.zoomRef.current).toEqual({ startTime: 1000, endTime: 5000 });
    });

    it('should handle wheel zoom in at the center', () => {
        const { result } = renderHook(() => usePerfZoomLogic({
            resultStartTime,
            resultEndTime,
            trimRange,
            onZoomChange: vi.fn()
        }));

        act(() => {
            // base zoom: 10000. center pointer = 0.5.
            result.current.handleWheelZoom(-1, 0.5);
        });

        // if negative, multiply by 0.9.
        const newDuration = 10000 * 0.9; // 9000
        const newStart = 5000 - 4500; // 500
        const newEnd = 5000 + 4500; // 9500

        expect(result.current.zoomRef.current).toEqual({ startTime: newStart, endTime: newEnd });
    });

    it('should navigate to segment seamlessly maintaining zoom duration', () => {
        const { result } = renderHook(() => usePerfZoomLogic({
            resultStartTime,
            resultEndTime,
            trimRange,
            onZoomChange: vi.fn()
        }));

        act(() => {
            result.current.applyZoom({ startTime: 1000, endTime: 3000 }); // duration = 2000
        });

        act(() => {
            result.current.jumpToNavSegmentZoom({ startTime: 8000, endTime: 8500 });
        });

        expect(result.current.zoomRef.current).toEqual({ startTime: 7250, endTime: 9250 });
    });
});
