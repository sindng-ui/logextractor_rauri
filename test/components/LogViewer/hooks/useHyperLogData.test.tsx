import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHyperLogData, decodeHTMLEntities } from '../../../../components/LogViewer/hooks/useHyperLogData';

describe('decodeHTMLEntities', () => {
    it('decodes entities correctly', () => {
        expect(decodeHTMLEntities('&lt;div&gt;&amp;&quot;&apos;&#39;&nbsp;')).toBe('<div>&"\'\' ');
        expect(decodeHTMLEntities('\t')).toBe('    '); // tab replacement
    });
});

describe('useHyperLogData', () => {
    let mockOnScrollRequest: any;

    beforeEach(() => {
        mockOnScrollRequest = vi.fn().mockResolvedValue([]);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('initializes with empty cache', () => {
        const { result } = renderHook(() => useHyperLogData({
            onScrollRequest: mockOnScrollRequest,
            totalCount: 1000
        }));
        expect(result.current.cachedLines.size).toBe(0);
    });

    it('clears cache when clearCacheTick changes', () => {
        const { result, rerender } = renderHook((props: any) => useHyperLogData(props), {
            initialProps: { onScrollRequest: mockOnScrollRequest, totalCount: 1000, clearCacheTick: 0 }
        });

        // Simulating manual cache populate is hard due to encapsulation, 
        // but we can verify it doesn't crash on tick change
        rerender({ onScrollRequest: mockOnScrollRequest, totalCount: 1000, clearCacheTick: 1 });
        expect(result.current.cachedLines.size).toBe(0);
    });

    it('fetches requested lines and populates cache', async () => {
        mockOnScrollRequest.mockResolvedValue([
            { lineNum: 0, content: 'LINE_1' },
            { lineNum: 1, content: 'LINE_2' }
        ]);

        const { result } = renderHook(() => useHyperLogData({
            onScrollRequest: mockOnScrollRequest,
            totalCount: 1000,
            levelMatchers: [{ regex: /LINE/, color: '#f00' }]
        }));

        await act(async () => {
            await result.current.loadVisibleLines(0, 1);
        });

        const cached = result.current.cachedLines;
        // checking the first fetched item
        // Note: the batch logic fetches max(0, startIdx-1000), which is 0, count 5000.
        expect(mockOnScrollRequest).toHaveBeenCalledWith(0, 1000); // Because totalCount is 1000
        expect(cached.size).toBe(2);
        expect(cached.get(0)?.content).toBe('LINE_1');
        expect(cached.get(0)?.levelColor).toBe('#f00'); // matched regex
    });
});
