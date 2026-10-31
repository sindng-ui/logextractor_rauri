import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useLogViewerScroll } from '../../../../components/LogViewer/hooks/useLogViewerScroll';
import { LOG_VIEW_CONFIG } from '../../../../constants/logViewUI';

describe('useLogViewerScroll', () => {
    let mockScrollToIndex: any;

    beforeEach(() => {
        mockScrollToIndex = vi.fn();
        vi.useFakeTimers();
    });

    it('initializes with default values', () => {
        const { result } = renderHook(() => useLogViewerScroll({
            totalMatches: 100,
            workerReady: true,
            callbacks: { scrollToIndex: mockScrollToIndex },
        }));

        expect(result.current.atBottom).toBe(true);
        expect(result.current.isAutoScrollPaused).toBe(false);
        expect(result.current.dynamicOverscan).toBe(LOG_VIEW_CONFIG.OVERSCAN_COUNT_LOW);
    });

    it('changes overscan dynamically when manually scrolling up', () => {
        const { result } = renderHook(() => useLogViewerScroll({
            totalMatches: 100,
            workerReady: true,
            callbacks: { scrollToIndex: mockScrollToIndex },
        }));

        act(() => {
            result.current.handleAtBottomChange(false);
        });

        expect(result.current.atBottom).toBe(false);
        expect(result.current.dynamicOverscan).toBe(LOG_VIEW_CONFIG.OVERSCAN_COUNT);
    });

    it('triggers auto-scroll when atBottom is true and new matches arrive', () => {
        const { result, rerender } = renderHook((props: any) => useLogViewerScroll(props), {
            initialProps: {
                totalMatches: 100,
                workerReady: true,
                callbacks: { scrollToIndex: mockScrollToIndex },
            }
        });

        mockScrollToIndex.mockClear();

        // Simulate receiving new lines
        rerender({
            totalMatches: 150,
            workerReady: true,
            callbacks: { scrollToIndex: mockScrollToIndex },
        });

        // Effect uses requestAnimationFrame, we need to advance timers
        act(() => {
            vi.runAllTimers();
        });

        expect(mockScrollToIndex).toHaveBeenCalledWith(149, { align: 'end' });
    });

    it('does not auto-scroll if auto-scroll is paused', () => {
        const { result, rerender } = renderHook((props: any) => useLogViewerScroll(props), {
            initialProps: {
                totalMatches: 100,
                workerReady: true,
                callbacks: { scrollToIndex: mockScrollToIndex },
            }
        });

        act(() => {
            vi.runAllTimers(); // flush initial
        });

        act(() => {
            result.current.setIsAutoScrollPaused(true);
        });

        mockScrollToIndex.mockClear();

        rerender({
            totalMatches: 150,
            workerReady: true,
            callbacks: { scrollToIndex: mockScrollToIndex },
        });

        act(() => {
            vi.runAllTimers();
        });

        expect(mockScrollToIndex).not.toHaveBeenCalled();
    });

    it('sync scrolling ignores when ignoreSyncRef is true', () => {
        const mockSyncScroll = vi.fn();
        const { result } = renderHook(() => useLogViewerScroll({
            totalMatches: 100,
            onSyncScroll: mockSyncScroll,
            workerReady: true,
            callbacks: { scrollToIndex: mockScrollToIndex },
        }));

        // Simulate Shift key pressed artificially
        result.current.shiftPressedRef.current = true;
        result.current.ignoreSyncRef.current = true;

        act(() => {
            result.current.handleScroll(200);
        });

        expect(mockSyncScroll).not.toHaveBeenCalled();
        expect(result.current.ignoreSyncRef.current).toBe(false); // Should reset
        expect(result.current.scrollTopRef.current).toBe(200);
    });
});
