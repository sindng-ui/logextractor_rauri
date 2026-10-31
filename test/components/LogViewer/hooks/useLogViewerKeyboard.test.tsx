import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLogViewerKeyboard } from '../../../../components/LogViewer/hooks/useLogViewerKeyboard';

describe('useLogViewerKeyboard', () => {
    let mockProps: any;

    beforeEach(() => {
        mockProps = {
            activeLineIndex: 10,
            totalMatches: 100,
            absoluteOffset: 0,
            rowHeight: 20,
            setIsAutoScrollPaused: vi.fn(),
            onLineClick: vi.fn(),
            onLineDoubleClick: vi.fn(),
            toggleBookmark: vi.fn(),
            onCopy: vi.fn(),
            onShowBookmarks: vi.fn(),
            onFocusPaneRequest: vi.fn(),
            onSelectAll: vi.fn(),
            isRawMode: false,
            callbacks: {
                scrollBy: vi.fn(),
                scrollToIndex: vi.fn()
            },
            getPageHeight: vi.fn().mockReturnValue(800)
        };
        vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(true) } });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('handles Enter for double click', () => {
        const { result } = renderHook(() => useLogViewerKeyboard(mockProps));
        const event = { key: 'Enter', preventDefault: vi.fn(), target: { tagName: 'DIV' } } as unknown as React.KeyboardEvent;

        act(() => {
            result.current.handleKeyDown(event);
        });

        expect(event.preventDefault).toHaveBeenCalled();
        expect(mockProps.onLineDoubleClick).toHaveBeenCalledWith(10);
    });

    it('ignores Enter if target is a BUTTON', () => {
        const { result } = renderHook(() => useLogViewerKeyboard(mockProps));
        const event = { key: 'Enter', preventDefault: vi.fn(), target: { tagName: 'BUTTON' } } as unknown as React.KeyboardEvent;

        act(() => {
            result.current.handleKeyDown(event);
        });

        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(mockProps.onLineDoubleClick).not.toHaveBeenCalled();
    });



    it('handles Shift+S for auto-scroll toggle', () => {
        const { result } = renderHook(() => useLogViewerKeyboard(mockProps));
        const event = { key: 'S', shiftKey: true, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;

        act(() => {
            result.current.handleKeyDown(event);
        });

        expect(event.preventDefault).toHaveBeenCalled();
        expect(mockProps.setIsAutoScrollPaused).toHaveBeenCalled();
    });

    it('handles Ctrl+C for copy', () => {
        const { result } = renderHook(() => useLogViewerKeyboard(mockProps));
        const event = { key: 'c', ctrlKey: true, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;

        act(() => {
            result.current.handleKeyDown(event);
        });

        expect(event.preventDefault).toHaveBeenCalled();
        expect(mockProps.onCopy).toHaveBeenCalled();
    });

    it('handles Ctrl+B for bookmarks', () => {
        const { result } = renderHook(() => useLogViewerKeyboard(mockProps));
        const event = { key: 'b', ctrlKey: true, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;

        act(() => {
            result.current.handleKeyDown(event);
        });

        expect(event.preventDefault).toHaveBeenCalled();
        expect(mockProps.onShowBookmarks).toHaveBeenCalled();
    });

    it('handles Ctrl+A for select all', () => {
        const { result } = renderHook(() => useLogViewerKeyboard(mockProps));
        const event = { key: 'a', ctrlKey: true, shiftKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.KeyboardEvent;

        act(() => {
            result.current.handleKeyDown(event);
        });

        expect(event.preventDefault).toHaveBeenCalled();
        expect(event.stopPropagation).toHaveBeenCalled();
        expect(mockProps.onSelectAll).toHaveBeenCalled();
    });

    it('ignores Ctrl+A if Shift is pressed (conflict prevention for Ctrl+Shift+A)', () => {
        const { result } = renderHook(() => useLogViewerKeyboard(mockProps));
        const event = { key: 'A', ctrlKey: true, shiftKey: true, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.KeyboardEvent;

        act(() => {
            result.current.handleKeyDown(event);
        });

        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(mockProps.onSelectAll).not.toHaveBeenCalled();
    });

    it('handles ArrowDown for navigation', () => {
        const { result } = renderHook(() => useLogViewerKeyboard(mockProps));
        const event = { code: 'ArrowDown', ctrlKey: false, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;

        act(() => {
            result.current.handleKeyDown(event);
        });

        expect(event.preventDefault).toHaveBeenCalled();
        expect(mockProps.onLineClick).toHaveBeenCalledWith(11); // 10 + 1
        expect(mockProps.callbacks.scrollToIndex).toHaveBeenCalledWith(11, { align: 'center' });
    });

    it('handles PageDown for pagination', () => {
        const { result } = renderHook(() => useLogViewerKeyboard(mockProps));
        const event = { code: 'PageDown', ctrlKey: false, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;

        act(() => {
            result.current.handleKeyDown(event);
        });

        expect(event.preventDefault).toHaveBeenCalled();
        // Page height 800 / row height 20 = 40 lines per page. Target = 10 + 40 = 50.
        expect(mockProps.onLineClick).toHaveBeenCalledWith(50);
        expect(mockProps.callbacks.scrollToIndex).toHaveBeenCalledWith(50, { align: 'center' });
    });
});
