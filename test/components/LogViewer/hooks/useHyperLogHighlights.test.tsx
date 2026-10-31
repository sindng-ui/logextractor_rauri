import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useHyperLogHighlights, mapHighlightColor } from '../../../../components/LogViewer/hooks/useHyperLogHighlights';

describe('useHyperLogHighlights', () => {
    it('compiles regular expressions and colors', () => {
        const textHighlights = [{ id: '1', keyword: 'error', color: 'red-500', enabled: true }];
        const lineHighlights = [{ id: '2', keyword: 'warn', color: 'yellow-400', enabled: true }];

        const { result } = renderHook(() => useHyperLogHighlights(textHighlights, lineHighlights, false));

        expect(result.current.compiledTextHighlights.length).toBe(1);
        expect(result.current.compiledTextHighlights[0].regex).toEqual(/error/gi);
        expect(result.current.compiledTextHighlights[0].canvasColor).toContain('rgba(239, 68, 68');

        expect(result.current.compiledLineHighlights.length).toBe(1);
        expect(result.current.compiledLineHighlights[0].canvasColor).toContain('rgba(250, 204, 21');
    });

    it('respects case sensitivity flag', () => {
        const textHighlights = [{ id: '1', keyword: 'Error', color: 'red-500', enabled: true }];

        const { result } = renderHook(() => useHyperLogHighlights(textHighlights, [], true));

        expect(result.current.compiledTextHighlights[0].regex).toEqual(/Error/g); // 'g' instead of 'gi'
    });
});
