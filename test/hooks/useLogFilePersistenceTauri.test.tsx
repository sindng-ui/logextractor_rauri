import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLogFileOperations } from '../../hooks/useLogFileOperations';
import { TAURI_DROP_RIGHT_EVENT } from '../../hooks/useTauriFileDrop';
import { useTabPointerDrag } from '../../hooks/useTabPointerDrag';
import { useCommandPointerReorder } from '../../hooks/useCommandPointerReorder';
import { getStoredValue, setStoredValue } from '../../utils/db';
import { workerRegistry } from '../../hooks/LogWorkerRegistry';

vi.mock('../../utils/db', () => ({
    getStoredValue: vi.fn(),
    setStoredValue: vi.fn(),
    deleteStoredValue: vi.fn(),
}));

describe('Tauri Log File Open, Native Drop, Native Engine & Persistence', () => {
    const createMockWorkerRef = () => ({
        current: { postMessage: vi.fn() } as unknown as Worker,
    });

    const createProps = (overrides: Partial<Parameters<typeof useLogFileOperations>[0]> = {}) => ({
        tabId: 'tab-1',
        initialFilePath: undefined as string | undefined,
        fileOpenToken: 0,
        initialFile: null as File | null,
        isActive: true,
        onFileChange: vi.fn(),
        leftWorkerRef: createMockWorkerRef(),
        rightWorkerRef: createMockWorkerRef(),
        leftViewerRef: { current: { getScrollTop: () => 120 } as any },
        rightViewerRef: { current: { getScrollTop: () => 0 } as any },
        tizenSocket: null,
        activeStreamRequestIdLeft: { current: null },
        activeStreamRequestIdRight: { current: null },
        pendingScrollTop: { current: null },
        setLeftFileName: vi.fn(),
        setLeftFilePath: vi.fn(),
        setLeftWorkerReady: vi.fn(),
        setLeftIndexingProgress: vi.fn(),
        setLeftTotalLines: vi.fn(),
        setLeftFilteredCount: vi.fn(),
        setActiveLineIndexLeft: vi.fn(),
        setSelectedIndicesLeft: vi.fn(),
        setLeftBookmarks: vi.fn(),
        lastFilterHashLeft: { current: '' },
        setRightFileName: vi.fn(),
        setRightFilePath: vi.fn(),
        setRightWorkerReady: vi.fn(),
        setRightIndexingProgress: vi.fn(),
        setRightTotalLines: vi.fn(),
        setRightFilteredCount: vi.fn(),
        setRightBookmarks: vi.fn(),
        lastFilterHashRight: { current: '' },
        leftFilePath: '',
        rightFilePath: '',
        activeLineIndexLeft: -1,
        isDualView: false,
        setIsDualView: vi.fn(),
        onOpenFile: vi.fn(),
        onOpenFilePath: vi.fn(),
        addToast: vi.fn(),
        ...overrides,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        workerRegistry.clearAll();
        (getStoredValue as any).mockResolvedValue(null);
        delete (window as any).__TAURI_INTERNALS__;
        vi.stubGlobal('electronAPI', {
            readFile: vi.fn().mockResolvedValue('line1\n'),
            getFileSize: vi.fn().mockResolvedValue(2048),
            indexLogFile: vi.fn().mockResolvedValue(new Uint8Array(8)),
            filterLogFile: vi.fn().mockResolvedValue(new Uint8Array(0)),
            selectLogFile: vi.fn().mockResolvedValue('K:\\logs\\selected.log'),
            getFilePath: vi.fn((f: any) => f?.path || ''),
            onFileChunk: vi.fn(() => () => {}),
            onFileStreamComplete: vi.fn(() => () => {}),
        });
    });

    afterEach(() => {
        delete (window as any).__TAURI_INTERNALS__;
    });

    it('uses native selectLogFile in Tauri environment and handles cancel cleanly without fallback dialog', async () => {
        (window as any).__TAURI_INTERNALS__ = {};
        const props = createProps();
        const { result } = renderHook(() => useLogFileOperations(props));

        let handled = false;
        await act(async () => {
            handled = await result.current.handleBrowseNative('left');
        });

        expect(handled).toBe(true);
        expect(window.electronAPI?.selectLogFile).toHaveBeenCalledTimes(1);
        expect(props.onOpenFilePath).toHaveBeenCalledWith('K:\\logs\\selected.log');

        (window.electronAPI!.selectLogFile as any).mockResolvedValueOnce(null);
        await act(async () => {
            handled = await result.current.handleBrowseNative('left');
        });
        expect(handled).toBe(true);
        expect(props.onOpenFilePath).toHaveBeenCalledTimes(1);
    });

    it('falls back to browser input when NOT in Tauri environment', async () => {
        const props = createProps();
        const { result } = renderHook(() => useLogFileOperations(props));

        let handled = true;
        await act(async () => {
            handled = await result.current.handleBrowseNative('left');
        });

        expect(handled).toBe(false);
        expect(props.onOpenFilePath).not.toHaveBeenCalled();
    });

    it('persists immediately on loadFile and sets isLoadedRef during Priority 1 initialFile loadState', async () => {
        const fileWithPath = new File(['hello'], 'dropped.log');
        (fileWithPath as any).path = 'K:\\logs\\dropped.log';

        const props = createProps({ initialFile: fileWithPath });
        const { result } = renderHook(() => useLogFileOperations(props));

        await act(async () => {
            await result.current.loadState();
        });

        expect(setStoredValue).toHaveBeenCalledWith(
            'tabState_tab-1',
            expect.stringContaining('K:\\\\logs\\\\dropped.log')
        );
    });

    it('advertises hasNativeEngine in INIT_LOCAL_FILE_STREAM when Rust indexLogFile & filterLogFile exist', async () => {
        const baseProps = createProps({
            initialFilePath: 'K:\\logs\\restored.log',
            fileOpenToken: 0,
        });

        const { result, rerender } = renderHook(
            (p) => useLogFileOperations(p),
            { initialProps: baseProps }
        );

        expect(baseProps.leftWorkerRef.current?.postMessage).not.toHaveBeenCalled();

        await act(async () => {
            await result.current.loadState();
        });
        expect(baseProps.leftWorkerRef.current?.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'INIT_LOCAL_FILE_STREAM',
                payload: expect.objectContaining({
                    path: 'K:\\logs\\restored.log',
                    hasNativeEngine: true,
                }),
            })
        );

        rerender({ ...baseProps, fileOpenToken: 1 });
        await waitFor(() => {
            expect(baseProps.leftWorkerRef.current?.postMessage).toHaveBeenCalledTimes(2);
        });
    });

    it('loads right pane only for the active tab on Tauri right-pane native drop event', async () => {
        const activeProps = createProps({ isActive: true, tabId: 'tab-active', isDualView: true });
        const inactiveProps = createProps({ isActive: false, tabId: 'tab-inactive', isDualView: true });

        renderHook(() => useLogFileOperations(activeProps));
        renderHook(() => useLogFileOperations(inactiveProps));

        await act(async () => {
            window.dispatchEvent(
                new CustomEvent(TAURI_DROP_RIGHT_EVENT, {
                    detail: { path: 'K:\\logs\\right_side.log' },
                })
            );
        });

        await waitFor(() => {
            expect(activeProps.rightWorkerRef.current?.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'INIT_LOCAL_FILE_STREAM',
                    payload: expect.objectContaining({ path: 'K:\\logs\\right_side.log' }),
                })
            );
        });
        expect(inactiveProps.rightWorkerRef.current?.postMessage).not.toHaveBeenCalled();
    });

    it('reorders tabs and quick commands with pointer hooks without triggering drags under click threshold', () => {
        let currentTabs = [{ id: 't1' }, { id: 't2' }];
        const setTabs = vi.fn((updater: any) => {
            currentTabs = typeof updater === 'function' ? updater(currentTabs) : updater;
        });

        const { result: tabHook } = renderHook(() => useTabPointerDrag(setTabs));
        const { result: cmdHook } = renderHook(() => useCommandPointerReorder(vi.fn(), ''));

        expect(tabHook.current.draggedTabId).toBeNull();
        expect(cmdHook.current.draggedId).toBeNull();

        act(() => {
            const btn = document.createElement('div');
            tabHook.current.handleTabPointerDown(
                { button: 0, clientX: 100, clientY: 10, target: btn } as any,
                't1'
            );
            window.dispatchEvent(new MouseEvent('pointermove', { clientX: 102, clientY: 10 }));
            window.dispatchEvent(new MouseEvent('pointerup', { clientX: 102, clientY: 10 }));
        });
        expect(tabHook.current.draggedTabId).toBeNull();
        expect(setTabs).not.toHaveBeenCalled();
    });

    it('uses browser showOpenFilePicker when available in non-Tauri mode and restores pending browser handles on demand', async () => {
        const pickedFile = new File(['browser line\n'], 'picked_browser.log');
        const mockHandle = {
            kind: 'file',
            name: 'picked_browser.log',
            getFile: vi.fn().mockResolvedValue(pickedFile),
            queryPermission: vi.fn().mockResolvedValue('prompt'),
            requestPermission: vi.fn().mockResolvedValue('granted'),
        } as unknown as FileSystemFileHandle;

        (window as any).showOpenFilePicker = vi.fn().mockResolvedValue([mockHandle]);
        (getStoredValue as any).mockImplementation(async (key: string) => {
            if (key === 'browserHandle_tab-1_left') return mockHandle;
            return null;
        });

        try {
            const props = createProps();
            const { result } = renderHook(() => useLogFileOperations(props));

            let handled = false;
            await act(async () => {
                handled = await result.current.handleBrowseNative('left');
            });

            expect(handled).toBe(true);
            expect((window as any).showOpenFilePicker).toHaveBeenCalledTimes(1);
            expect(props.onOpenFile).toHaveBeenCalledWith(pickedFile);

            await act(async () => {
                await result.current.loadState();
            });

            expect(result.current.pendingRestoreLeft?.fileName).toBe('picked_browser.log');

            await act(async () => {
                await result.current.handleRestorePendingFile('left');
            });

            expect(mockHandle.requestPermission).toHaveBeenCalledWith({ mode: 'read' });
            expect(result.current.pendingRestoreLeft).toBeNull();
            expect(props.leftWorkerRef.current?.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'INIT_FILE',
                    payload: pickedFile,
                })
            );
        } finally {
            delete (window as any).showOpenFilePicker;
        }
    });
});
