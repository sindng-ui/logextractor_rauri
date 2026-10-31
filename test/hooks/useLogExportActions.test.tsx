import { renderHook, act } from '@testing-library/react';
import { useLogExportActions } from '../../hooks/useLogExportActions';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// --- Mocks ---
const mockedAddToast = vi.fn();

// Mock useToast to avoid context issues
vi.mock('../../contexts/ToastContext', () => ({
    useToast: () => ({ addToast: mockedAddToast }),
}));

// Mock Navigator Clipboard
if (typeof navigator === 'undefined') {
    (global as any).navigator = {
        clipboard: {
            writeText: vi.fn().mockResolvedValue(undefined),
        },
    };
} else {
    Object.assign(navigator, {
        clipboard: {
            writeText: vi.fn().mockResolvedValue(undefined),
        },
    });
}

describe('useLogExportActions (Unit Test)', () => {
    const mockWorker = {
        current: {
            postMessage: vi.fn(),
        }
    };
    const mockPendingRequests = {
        current: new Map()
    };

    const defaultProps: any = {
        leftWorkerRef: mockWorker,
        rightWorkerRef: mockWorker,
        leftPendingRequests: mockPendingRequests,
        rightPendingRequests: mockPendingRequests,
        leftFilteredCount: 35,
        rightFilteredCount: 0,
        selectedIndicesLeft: new Set([1, 2, 3]),
        selectedIndicesRight: new Set(),
        showToast: mockedAddToast,
        setRawContextTargetLine: vi.fn(),
        setRawContextSourcePane: vi.fn(),
        setRawViewHighlightRange: vi.fn(),
        setRawContextOpen: vi.fn(),
        requestLinesLeft: vi.fn(),
        requestLinesRight: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockWorker.current.postMessage.mockClear();
        mockPendingRequests.current.clear();
    });

    it('should initialize correctly', () => {
        const { result } = renderHook(() => useLogExportActions(defaultProps));
        expect(result.current).not.toBeNull();
        expect(result.current.handleCopyLogs).toBeDefined();
    });

    it('should respect selection when ignoreSelection is false (Ctrl+C mode)', async () => {
        const { result } = renderHook(() => useLogExportActions(defaultProps));

        // We don't need to finish the whole async cycle just to see if postMessage was called correctly
        act(() => {
            result.current.handleCopyLogs('left', false);
        });

        // Verify that it sent GET_LINES_BY_INDICES to the worker with indices [1, 2, 3]
        expect(mockWorker.current.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'GET_LINES_BY_INDICES',
                payload: expect.objectContaining({
                    indices: [1, 2, 3]
                })
            })
        );
    });

    it('should copy all when ignoreSelection is true (Button mode)', async () => {
        const { result } = renderHook(() => useLogExportActions(defaultProps));

        act(() => {
            result.current.handleCopyLogs('left', true);
        });

        // Verify that it sent GET_FULL_TEXT instead of indices
        expect(mockWorker.current.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'GET_FULL_TEXT'
            })
        );
    });

    it('should do nothing when ignoreSelection is false but size is 0', async () => {
        const propsWithNoSelection = { ...defaultProps, selectedIndicesLeft: new Set() };
        const { result } = renderHook(() => useLogExportActions(propsWithNoSelection));

        act(() => {
            result.current.handleCopyLogs('left', false);
        });

        // Should NOT have sent any message if size is 0 and it's a shortcut copy
        expect(mockWorker.current.postMessage).not.toHaveBeenCalled();
    });
});
