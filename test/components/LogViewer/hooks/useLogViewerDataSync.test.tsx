import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useLogViewerDataSync } from '../../../../components/LogViewer/hooks/useLogViewerDataSync';

describe('useLogViewerDataSync', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('clears cache when fileName or clearCacheTick changes', () => {
        const { result, rerender } = renderHook((props: any) => useLogViewerDataSync(props), {
            initialProps: {
                workerReady: true,
                totalMatches: 100,
                onScrollRequest: vi.fn(),
                fileName: 'log1.txt'
            }
        });

        // Manually pollute cache
        act(() => {
            result.current.cachedLinesRef.current.set(0, { lineNum: 1, content: 'test' });
        });

        expect(result.current.cachedLinesRef.current.size).toBe(1);

        rerender({
            workerReady: true,
            totalMatches: 100,
            onScrollRequest: vi.fn(),
            fileName: 'log2.txt'
        });

        expect(result.current.cachedLinesRef.current.size).toBe(0);
    });

    it('fetches required missing lines and caches them', async () => {
        const mockFetch = vi.fn().mockResolvedValue([
            { lineNum: 1, content: 'line 1' },
            { lineNum: 2, content: 'line 2' }
        ]);

        const { result } = renderHook(() => useLogViewerDataSync({
            workerReady: true,
            totalMatches: 100,
            onScrollRequest: mockFetch,
            fileName: 'log1.txt'
        }));

        act(() => {
            result.current.loadMoreItems(0, 1);
        });

        // fast-forward debounce
        act(() => {
            vi.advanceTimersByTime(20);
        });

        expect(mockFetch).toHaveBeenCalledWith(0, 2);

        // await promise resolution
        await vi.runAllTimersAsync();

        expect(result.current.cachedLinesRef.current.size).toBe(2);
        expect(result.current.cachedLinesRef.current.get(0)).toEqual({ lineNum: 1, content: 'line 1' });
    });

    it('does not re-fetch already cached or pending lines', () => {
        const mockFetch = vi.fn().mockReturnValue(new Promise(() => { })); // pending forever

        const { result } = renderHook(() => useLogViewerDataSync({
            workerReady: true,
            totalMatches: 100,
            onScrollRequest: mockFetch,
            fileName: 'log1.txt'
        }));

        act(() => {
            result.current.loadMoreItems(0, 1);
        });

        act(() => vi.advanceTimersByTime(20));

        expect(mockFetch).toHaveBeenCalledTimes(1);

        act(() => {
            result.current.loadMoreItems(0, 1);
        });

        act(() => vi.advanceTimersByTime(20));

        // Still 1 because they are pending
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });
});
