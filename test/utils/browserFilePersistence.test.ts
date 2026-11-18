import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    MAX_BROWSER_BLOB_PERSIST_BYTES,
    registerBrowserFileHandle,
    persistBrowserFileForReload,
    restoreBrowserFile,
    requestAndOpenPendingHandle,
    clearBrowserFilePersistence,
} from '../../utils/browserFilePersistence';
import { deleteStoredValue, getStoredValue, setStoredValue } from '../../utils/db';

vi.mock('../../utils/db', () => ({
    getStoredValue: vi.fn(),
    setStoredValue: vi.fn(),
    deleteStoredValue: vi.fn(),
}));

describe('browserFilePersistence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete (window as any).__TAURI_INTERNALS__;
        (getStoredValue as any).mockResolvedValue(null);
    });

    afterEach(() => {
        delete (window as any).__TAURI_INTERNALS__;
    });

    it('persists and auto-restores a <= 250MB browser File without requiring a handle', async () => {
        const store = new Map<string, any>();
        (setStoredValue as any).mockImplementation(async (k: string, v: any) => {
            store.set(k, v);
        });
        (getStoredValue as any).mockImplementation(async (k: string) => store.get(k) ?? null);
        (deleteStoredValue as any).mockImplementation(async (k: string) => {
            store.delete(k);
        });

        const file = new File(['line1\nline2\n'], 'small_browser.log', { type: 'text/plain' });
        await persistBrowserFileForReload('tab-1', 'left', file);

        expect(store.get('browserBlob_tab-1_left')).toBe(file);
        expect(store.has('browserHandle_tab-1_left')).toBe(false);

        const restored = await restoreBrowserFile('tab-1', 'left');
        expect(restored.file).toBe(file);
        expect(restored.pendingHandle).toBeUndefined();
    });

    it('persists only FileSystemFileHandle (skips IndexedDB blob copy) for > 250MB files and auto-restores if granted', async () => {
        const store = new Map<string, any>();
        (setStoredValue as any).mockImplementation(async (k: string, v: any) => {
            store.set(k, v);
        });
        (getStoredValue as any).mockImplementation(async (k: string) => store.get(k) ?? null);
        (deleteStoredValue as any).mockImplementation(async (k: string) => {
            store.delete(k);
        });

        const largeFile = new File(['x'], 'test_1G1.log');
        Object.defineProperty(largeFile, 'size', { value: MAX_BROWSER_BLOB_PERSIST_BYTES + 1024 });

        const grantedHandle = {
            kind: 'file',
            name: 'test_1G1.log',
            queryPermission: vi.fn().mockResolvedValue('granted'),
            requestPermission: vi.fn().mockResolvedValue('granted'),
            getFile: vi.fn().mockResolvedValue(largeFile),
        } as unknown as FileSystemFileHandle;

        registerBrowserFileHandle(largeFile, grantedHandle);
        await persistBrowserFileForReload('tab-1', 'left', largeFile);

        expect(store.get('browserHandle_tab-1_left')).toBe(grantedHandle);
        expect(store.has('browserBlob_tab-1_left')).toBe(false);

        const restored = await restoreBrowserFile('tab-1', 'left');
        expect(restored.file).toBe(largeFile);
        expect(restored.pendingHandle).toBeUndefined();
    });

    it('returns pendingHandle when > 250MB handle resets permission to prompt on hard reload, and reopens via requestAndOpenPendingHandle', async () => {
        const store = new Map<string, any>();
        (setStoredValue as any).mockImplementation(async (k: string, v: any) => {
            store.set(k, v);
        });
        (getStoredValue as any).mockImplementation(async (k: string) => store.get(k) ?? null);
        (deleteStoredValue as any).mockImplementation(async (k: string) => {
            store.delete(k);
        });

        const largeFile = new File(['x'], 'test_1G1.log');
        Object.defineProperty(largeFile, 'size', { value: MAX_BROWSER_BLOB_PERSIST_BYTES + 4096 });

        const promptHandle = {
            kind: 'file',
            name: 'test_1G1.log',
            queryPermission: vi.fn().mockResolvedValue('prompt'),
            requestPermission: vi.fn().mockResolvedValue('granted'),
            getFile: vi.fn().mockResolvedValue(largeFile),
        } as unknown as FileSystemFileHandle;

        registerBrowserFileHandle(largeFile, promptHandle);
        await persistBrowserFileForReload('tab-2', 'right', largeFile);

        const restored = await restoreBrowserFile('tab-2', 'right');
        expect(restored.file).toBeNull();
        expect(restored.pendingHandle).toEqual({
            fileName: 'test_1G1.log',
            handle: promptHandle,
        });

        const reopened = await requestAndOpenPendingHandle('tab-2', 'right', promptHandle);
        expect(reopened).toBe(largeFile);
        expect((promptHandle as any).requestPermission).toHaveBeenCalledWith({ mode: 'read' });
    });

    it('clears persisted handle and blob keys cleanly', async () => {
        await clearBrowserFilePersistence('tab-3', 'left');
        expect(deleteStoredValue).toHaveBeenCalledWith('browserHandle_tab-3_left');
        expect(deleteStoredValue).toHaveBeenCalledWith('browserBlob_tab-3_left');

        vi.clearAllMocks();
        await clearBrowserFilePersistence('tab-4');
        expect(deleteStoredValue).toHaveBeenCalledWith('browserHandle_tab-4_left');
        expect(deleteStoredValue).toHaveBeenCalledWith('browserBlob_tab-4_left');
        expect(deleteStoredValue).toHaveBeenCalledWith('browserHandle_tab-4_right');
        expect(deleteStoredValue).toHaveBeenCalledWith('browserBlob_tab-4_right');
    });
});
