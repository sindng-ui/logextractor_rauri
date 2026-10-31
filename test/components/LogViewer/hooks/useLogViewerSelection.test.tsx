import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useLogViewerSelection } from '../../../../components/LogViewer/hooks/useLogViewerSelection';
import React from 'react';

describe('useLogViewerSelection', () => {
    let mockOnLineClick: any;
    let mockOnDrop: any;
    let containerRef: any;

    beforeEach(() => {
        mockOnLineClick = vi.fn();
        mockOnDrop = vi.fn();
        containerRef = { current: { focus: vi.fn() } };
    });

    it('initializes with default drag status', () => {
        const { result } = renderHook(() => useLogViewerSelection({
            onLineClick: mockOnLineClick,
            onDrop: mockOnDrop,
            containerRef
        }));

        expect(result.current.dragActive).toBe(false);
    });

    it('handles line mouse down and clears native selection', () => {
        const { result } = renderHook(() => useLogViewerSelection({
            onLineClick: mockOnLineClick,
            onDrop: mockOnDrop,
            containerRef
        }));

        const mockEvent = {
            button: 0,
            altKey: false,
            ctrlKey: false,
            metaKey: false,
            shiftKey: false,
            preventDefault: vi.fn(),
        } as unknown as React.MouseEvent;

        // Mock window.getSelection
        const mockRemoveAllRanges = vi.fn();
        vi.stubGlobal('getSelection', () => ({ removeAllRanges: mockRemoveAllRanges }));

        act(() => {
            result.current.handleLineMouseDown(10, mockEvent);
        });

        expect(containerRef.current.focus).toHaveBeenCalledWith({ preventScroll: true });
        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(mockRemoveAllRanges).toHaveBeenCalled();
        expect(mockOnLineClick).toHaveBeenCalledWith(10, false, false);

        vi.unstubAllGlobals();
    });

    it('ignores non-left clicks', () => {
        const { result } = renderHook(() => useLogViewerSelection({
            onLineClick: mockOnLineClick,
            onDrop: mockOnDrop,
            containerRef
        }));

        const mockEvent = {
            button: 2, // Right click
        } as unknown as React.MouseEvent;

        act(() => {
            result.current.handleLineMouseDown(10, mockEvent);
        });

        expect(mockOnLineClick).not.toHaveBeenCalled();
    });

    it('handles Alt+Click for native text selection', () => {
        const { result } = renderHook(() => useLogViewerSelection({
            onLineClick: mockOnLineClick,
            onDrop: mockOnDrop,
            containerRef
        }));

        const mockEvent = {
            button: 0,
            altKey: true,
            preventDefault: vi.fn(),
        } as unknown as React.MouseEvent;

        act(() => {
            result.current.handleLineMouseDown(10, mockEvent);
        });

        // Should disable formatting (pass -1)
        expect(mockOnLineClick).toHaveBeenCalledWith(-1, false, false);
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('drags lines when mouse enters after mouse down', () => {
        const { result } = renderHook(() => useLogViewerSelection({
            onLineClick: mockOnLineClick,
            onDrop: mockOnDrop,
            containerRef
        }));

        const downEvent = {
            button: 0,
            ctrlKey: true,
            preventDefault: vi.fn()
        } as unknown as React.MouseEvent;

        act(() => {
            result.current.handleLineMouseDown(10, downEvent);
        });

        const enterEvent = {} as unknown as React.MouseEvent;

        act(() => {
            result.current.handleLineMouseEnter(15, enterEvent);
        });

        // onLineClick(index, isShift, isCtrl)
        // isShift is true during drag (range select), isCtrl maintains initial state
        expect(mockOnLineClick).toHaveBeenCalledWith(15, true, true);
    });

    it('stops dragging after mouse up', () => {
        const { result } = renderHook(() => useLogViewerSelection({
            onLineClick: mockOnLineClick,
            onDrop: mockOnDrop,
            containerRef
        }));

        const downEvent = { button: 0, preventDefault: vi.fn() } as unknown as React.MouseEvent;

        act(() => {
            result.current.handleLineMouseDown(10, downEvent);
        });

        mockOnLineClick.mockClear();

        // Simulate global mouseup
        act(() => {
            window.dispatchEvent(new MouseEvent('mouseup'));
        });

        const enterEvent = {} as unknown as React.MouseEvent;

        act(() => {
            result.current.handleLineMouseEnter(15, enterEvent);
        });

        expect(mockOnLineClick).not.toHaveBeenCalled();
    });

    it('handles file drag and drop', () => {
        const { result } = renderHook(() => useLogViewerSelection({
            onLineClick: mockOnLineClick,
            onDrop: mockOnDrop,
            containerRef
        }));

        const dragEnterEvent = {
            type: 'dragenter',
            preventDefault: vi.fn(),
            stopPropagation: vi.fn()
        } as unknown as React.DragEvent;

        act(() => {
            result.current.handleDrag(dragEnterEvent);
        });

        expect(result.current.dragActive).toBe(true);

        const dropEvent = {
            type: 'drop',
            dataTransfer: { files: [new File([''], 'test.log')] },
            preventDefault: vi.fn(),
            stopPropagation: vi.fn()
        } as unknown as React.DragEvent;

        act(() => {
            result.current.handleDropEvent(dropEvent);
        });

        expect(result.current.dragActive).toBe(false);
        expect(mockOnDrop).toHaveBeenCalled();
    });
});
