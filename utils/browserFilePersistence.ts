import { deleteStoredValue, getStoredValue, setStoredValue } from './db';
import { isTauriEnvironment } from './tauriBridge';

export const MAX_BROWSER_BLOB_PERSIST_BYTES = 250 * 1024 * 1024; // 250MB safe IndexedDB limit

const pendingHandlePromiseMap = new WeakMap<File, Promise<FileSystemFileHandle | null>>();
const directHandleMap = new WeakMap<File, FileSystemFileHandle>();

const getHandleKey = (tabId: string, pane: 'left' | 'right') => `browserHandle_${tabId}_${pane}`;
const getBlobKey = (tabId: string, pane: 'left' | 'right') => `browserBlob_${tabId}_${pane}`;

export interface RestoredBrowserFileResult {
    file: File | null;
    pendingHandle?: {
        fileName: string;
        handle: FileSystemFileHandle;
    };
}

export function registerBrowserFileHandle(file: File, handle: FileSystemFileHandle): void {
    if (!file || !handle) return;
    directHandleMap.set(file, handle);
}

/**
 * Synchronously captures a Chromium `FileSystemFileHandle` from `DataTransfer`
 * before async yields clear the drag payload.
 */
export function captureBrowserDropHandle(file: File, dataTransfer: DataTransfer | null): void {
    if (!file || !dataTransfer || isTauriEnvironment()) return;
    const item = dataTransfer.items?.[0] as (DataTransferItem & {
        getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
    }) | undefined;

    if (!item || typeof item.getAsFileSystemHandle !== 'function') return;

    try {
        const promise = item
            .getAsFileSystemHandle()
            .then((handle) => (handle && handle.kind === 'file' ? (handle as FileSystemFileHandle) : null))
            .catch(() => null);
        pendingHandlePromiseMap.set(file, promise);
    } catch {
        // Ignore unsupported drag items
    }
}

export async function pickBrowserFileWithHandle(): Promise<{ file: File | null; cancelled: boolean }> {
    const picker = (window as any)?.showOpenFilePicker;
    if (typeof picker !== 'function') {
        return { file: null, cancelled: false };
    }

    try {
        const handles: FileSystemFileHandle[] = await picker({ multiple: false });
        const handle = handles?.[0];
        if (!handle) return { file: null, cancelled: true };

        const file = await handle.getFile();
        registerBrowserFileHandle(file, handle);
        return { file, cancelled: false };
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            return { file: null, cancelled: true };
        }
        return { file: null, cancelled: false };
    }
}

export async function persistBrowserFileForReload(
    tabId: string,
    pane: 'left' | 'right',
    file: File
): Promise<void> {
    if (!file || isTauriEnvironment()) return;

    let handle = directHandleMap.get(file) || null;
    if (!handle) {
        const pending = pendingHandlePromiseMap.get(file);
        if (pending) {
            handle = await pending;
        }
    }

    if (handle) {
        await setStoredValue(getHandleKey(tabId, pane), handle);
    } else {
        await deleteStoredValue(getHandleKey(tabId, pane));
    }

    if (file.size <= MAX_BROWSER_BLOB_PERSIST_BYTES) {
        await setStoredValue(getBlobKey(tabId, pane), file);
    } else {
        await deleteStoredValue(getBlobKey(tabId, pane));
    }
}

export async function restoreBrowserFile(
    tabId: string,
    pane: 'left' | 'right'
): Promise<RestoredBrowserFileResult> {
    if (isTauriEnvironment()) {
        return { file: null };
    }

    try {
        const handle = (await getStoredValue(getHandleKey(tabId, pane))) as
            | (FileSystemFileHandle & {
                queryPermission?: (desc: { mode: 'read' }) => Promise<PermissionState>;
            })
            | null;

        if (handle && typeof handle.getFile === 'function') {
            let perm: PermissionState = 'granted';
            if (typeof handle.queryPermission === 'function') {
                perm = await handle.queryPermission({ mode: 'read' });
            }
            if (perm === 'granted') {
                const file = await handle.getFile();
                registerBrowserFileHandle(file, handle);
                return { file };
            }

            // If permission reset on browser reload, prefer auto-loading cached small/medium blob
            const cachedBlob = (await getStoredValue(getBlobKey(tabId, pane))) as File | null;
            if (cachedBlob instanceof File || (cachedBlob && typeof (cachedBlob as Blob).arrayBuffer === 'function')) {
                return { file: cachedBlob as File };
            }

            return {
                file: null,
                pendingHandle: {
                    fileName: handle.name || 'Previous Log File',
                    handle,
                },
            };
        }

        const cachedBlob = (await getStoredValue(getBlobKey(tabId, pane))) as File | null;
        if (cachedBlob && typeof (cachedBlob as Blob).slice === 'function') {
            return { file: cachedBlob };
        }
    } catch (err) {
        console.warn('[browserFilePersistence] Failed to restore browser file:', err);
    }

    return { file: null };
}

export async function requestAndOpenPendingHandle(
    tabId: string,
    pane: 'left' | 'right',
    handle: FileSystemFileHandle
): Promise<File | null> {
    const h = handle as FileSystemFileHandle & {
        requestPermission?: (desc: { mode: 'read' }) => Promise<PermissionState>;
    };
    if (typeof h.requestPermission === 'function') {
        const state = await h.requestPermission({ mode: 'read' });
        if (state !== 'granted') return null;
    }
    const file = await h.getFile();
    registerBrowserFileHandle(file, handle);
    await persistBrowserFileForReload(tabId, pane, file);
    return file;
}

export async function clearBrowserFilePersistence(
    tabId: string,
    pane?: 'left' | 'right'
): Promise<void> {
    if (pane) {
        await deleteStoredValue(getHandleKey(tabId, pane));
        await deleteStoredValue(getBlobKey(tabId, pane));
    } else {
        await deleteStoredValue(getHandleKey(tabId, 'left'));
        await deleteStoredValue(getBlobKey(tabId, 'left'));
        await deleteStoredValue(getHandleKey(tabId, 'right'));
        await deleteStoredValue(getBlobKey(tabId, 'right'));
    }
}
