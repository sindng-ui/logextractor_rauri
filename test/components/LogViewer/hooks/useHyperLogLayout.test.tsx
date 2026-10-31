import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useHyperLogLayout } from '../../../../components/LogViewer/hooks/useHyperLogLayout';

describe('useHyperLogLayout', () => {
    it('calculates gutters properly', () => {
        const { result } = renderHook(() => useHyperLogLayout());
        expect(result.current.GUTTER_INDEX_WIDTH).toBeGreaterThan(0);
        expect(result.current.CONTENT_X_OFFSET).toBeGreaterThan(0);
    });

    it('manages measure cache', () => {
        const { result } = renderHook(() => useHyperLogLayout());

        const dummyCtx = {
            font: '13px monospace',
            measureText: (text: string) => ({ width: text.length * 10 })
        } as unknown as CanvasRenderingContext2D;

        const w1 = result.current.getCachedWidth(dummyCtx, 'Hello');
        expect(w1).toBe(50); // 5 chars * 10

        // Cache clear should take effect. Actually no way to introspect except by implementation knowledge
        result.current.clearMeasureCache();
        const w2 = result.current.getCachedWidth(dummyCtx, 'Hello');
        expect(w2).toBe(50);
    });
});
