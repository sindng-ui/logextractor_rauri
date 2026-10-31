import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useHyperLogScroll } from '../../../../components/LogViewer/hooks/useHyperLogScroll';

describe('useHyperLogScroll', () => {
    it('initializes layout and provides imperative scroll features', () => {
        const renderTargetMock = vi.fn();
        const { result } = renderHook(() => useHyperLogScroll({ rowHeight: 20, renderTarget: renderTargetMock }));

        expect(result.current.scrollTopRef.current).toBe(0);

        // Mock scrollContainerRef
        const mockContainer = {
            scrollTop: 0,
            clientHeight: 800,
            scrollHeight: 2000
        } as unknown as HTMLDivElement;

        // Need to simulate a ref attachment directly
        (result.current.scrollContainerRef as any).current = mockContainer;

        act(() => {
            result.current.scrollToIndex(10, { align: 'start' });
        });

        // Since viewport is 0 right now in the state, target top for start align is index * 20 = 200
        expect(mockContainer.scrollTop).toBe(200);
    });
});
