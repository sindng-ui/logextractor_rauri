import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { checkUpdateViaBrowserFetch } from './appUpdater';

const filePathWeakMap = new WeakMap<File, string>();
const fileSignatureMap = new Map<string, string>();

let currentZoomFactor = 1.0;
const channelListeners = new Map<string, Map<(...args: any[]) => void, UnlistenFn>>();

function getFileSignature(file: Pick<File, 'name' | 'size' | 'lastModified'>): string {
    return `${file.name}::${file.size}::${file.lastModified}`;
}

export function registerTauriFilePath(file: File, filePath: string): void {
    if (!file || !filePath) return;
    filePathWeakMap.set(file, filePath);
    fileSignatureMap.set(getFileSignature(file), filePath);
    try {
        Object.defineProperty(file, 'path', {
            value: filePath,
            writable: true,
            configurable: true,
        });
    } catch {
        (file as any).path = filePath;
    }
}

export function isTauriEnvironment(): boolean {
    return (
        typeof window !== 'undefined' &&
        ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
    );
}

function subscribeTauriEvent(
    eventName: string,
    callback: (payload: any) => void
): () => void {
    let unlisten: UnlistenFn | null = null;
    let isCancelled = false;

    if (isTauriEnvironment()) {
        listen(eventName, (event) => {
            if (!isCancelled) {
                callback(event.payload);
            }
        })
            .then((fn) => {
                if (isCancelled) {
                    fn();
                } else {
                    unlisten = fn;
                }
            })
            .catch((err) => {
                console.warn(`[TauriBridge] Failed to listen on ${eventName}:`, err);
            });
    }

    return () => {
        isCancelled = true;
        if (unlisten) {
            unlisten();
            unlisten = null;
        }
    };
}

function setupTitleBarDragDelegation(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const isInteractiveTarget = (el: HTMLElement | null): boolean => {
        if (!el) return true;
        if (document.querySelector('.focus-mode')) return true;
        if (!el.closest('.title-drag')) return true;
        if (
            el.closest(
                '.no-drag, button, input, select, textarea, a, [role="button"], [draggable="true"]'
            )
        ) {
            return true;
        }
        return false;
    };

    document.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 0 || e.detail > 1) return;
        const target = e.target as HTMLElement | null;
        if (isInteractiveTarget(target)) return;

        if (isTauriEnvironment()) {
            try {
                getCurrentWindow().startDragging();
            } catch (err) {
                console.warn('[TauriBridge] startDragging failed:', err);
            }
        }
    });

    document.addEventListener('dblclick', (e: MouseEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement | null;
        if (isInteractiveTarget(target)) return;

        if (isTauriEnvironment()) {
            invoke('window_toggle_maximize').catch((err) => {
                console.warn('[TauriBridge] window_toggle_maximize failed:', err);
            });
        }
    });
}

function toUint8Array(raw: ArrayBuffer | Uint8Array | number[]): Uint8Array {
    if (raw instanceof Uint8Array) return raw;
    if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
    if (ArrayBuffer.isView(raw)) {
        return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    }
    return new Uint8Array(raw as number[]);
}

export function createTauriElectronAPI() {
    // Load initial zoom from saved settings if present
    try {
        const saved = localStorage.getItem('devtool_suite_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (typeof parsed.zoomFactor === 'number' && parsed.zoomFactor >= 0.3 && parsed.zoomFactor <= 5.0) {
                currentZoomFactor = parsed.zoomFactor;
            }
        }
    } catch {
        // ignore
    }

    return {
        // --- File System API ---
        readFile: async (filePath: string): Promise<string> => {
            return await invoke<string>('read_file', { filePath });
        },

        getFileSize: async (filePath: string): Promise<number> => {
            return await invoke<number>('get_file_size', { filePath });
        },

        readFileSegment: async ({
            path,
            start,
            end,
        }: {
            path: string;
            start: number;
            end: number;
        }): Promise<Uint8Array> => {
            const raw = await invoke<ArrayBuffer | Uint8Array | number[]>('read_file_segment', {
                path,
                start,
                end,
            });
            return toUint8Array(raw);
        },

        readFileSegmentsBatch: async ({
            path,
            ranges,
        }: {
            path: string;
            ranges: [number, number][];
        }): Promise<Uint8Array> => {
            const raw = await invoke<ArrayBuffer | Uint8Array | number[]>(
                'read_file_segments_batch',
                { path, ranges }
            );
            return toUint8Array(raw);
        },

        indexLogFile: async ({ path }: { path: string }): Promise<Uint8Array> => {
            const raw = await invoke<ArrayBuffer | Uint8Array | number[]>('index_log_file', {
                path,
            });
            return toUint8Array(raw);
        },

        indexLogFileMeta: async ({
            path,
        }: {
            path: string;
        }): Promise<{ totalLines: number; fileSize: number }> => {
            return await invoke<{ totalLines: number; fileSize: number }>('index_log_file_meta', {
                path,
            });
        },

        evictLogCache: async ({ path }: { path?: string | null }): Promise<void> => {
            await invoke('evict_log_cache', { path: path ?? null });
        },

        readLocalLinesByIndices: async ({
            path,
            indices,
            stripAnsi,
        }: {
            path: string;
            indices: number[];
            stripAnsi: boolean;
        }): Promise<Uint8Array> => {
            const raw = await invoke<ArrayBuffer | Uint8Array | number[]>(
                'read_local_lines_by_indices',
                { path, indices, stripAnsi }
            );
            return toUint8Array(raw);
        },

        readLocalLineRange: async ({
            path,
            startLine,
            count,
            stripAnsi,
        }: {
            path: string;
            startLine: number;
            count: number;
            stripAnsi: boolean;
        }): Promise<Uint8Array> => {
            const raw = await invoke<ArrayBuffer | Uint8Array | number[]>(
                'read_local_line_range',
                { path, startLine, count, stripAnsi }
            );
            return toUint8Array(raw);
        },

        findHighlightNative: async ({
            path,
            filterKey,
            bookmarks,
            keyword,
            startVisualIdx,
            direction,
            caseSensitive,
        }: {
            path: string;
            filterKey?: string | null;
            bookmarks?: number[] | null;
            keyword: string;
            startVisualIdx: number;
            direction: 'next' | 'prev';
            caseSensitive: boolean;
        }): Promise<{ supported: boolean; foundIndex?: number; originalLineNum?: number }> => {
            return await invoke('find_highlight_native', {
                path,
                filterKey: filterKey ?? null,
                bookmarks: bookmarks ?? null,
                keyword,
                startVisualIdx,
                direction,
                caseSensitive,
            });
        },

        filterLogFile: async ({
            path,
            rule,
            snapshotKey,
            parentKey,
        }: {
            path: string;
            rule: any;
            snapshotKey: string;
            parentKey?: string | null;
        }): Promise<Uint8Array> => {
            const raw = await invoke<ArrayBuffer | Uint8Array | number[]>('filter_log_file', {
                path,
                rule,
                snapshotKey,
                parentKey: parentKey ?? null,
            });
            return toUint8Array(raw);
        },

        streamReadFile: async (
            filePath: string,
            requestId: string,
            options?: { start?: number }
        ) => {
            return await invoke('stream_read_file', {
                filePath,
                requestId,
                start: options?.start ?? 0,
            });
        },

        cancelStream: async (requestId: string) => {
            return await invoke('cancel_stream', { requestId });
        },

        onFileChunk: (callback: (data: { chunk: string; requestId: string }) => void) => {
            return subscribeTauriEvent('file-chunk', callback);
        },

        onFileStreamComplete: (callback: (data: { requestId: string }) => void) => {
            return subscribeTauriEvent('file-stream-complete', callback);
        },

        onFileStreamError: (callback: (data: { error: string; requestId: string }) => void) => {
            return subscribeTauriEvent('file-stream-error', callback);
        },

        // --- Zoom API (Synchronous getter + Native WebView2 setter) ---
        setZoomFactor: (factor: number) => {
            const clamped = Math.min(Math.max(factor, 0.3), 5.0);
            currentZoomFactor = clamped;
            if (isTauriEnvironment()) {
                invoke('set_zoom_factor', { factor: clamped }).catch((err) => {
                    console.warn('[TauriBridge] set_zoom_factor error:', err);
                });
            }
        },

        getZoomFactor: (): number => {
            return currentZoomFactor;
        },

        // --- Export / Utility API ---
        copyToClipboard: async (text: string) => {
            if (isTauriEnvironment()) {
                try {
                    return await invoke('copy_to_clipboard', { text });
                } catch {
                    // Fallback to navigator.clipboard
                }
            }
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            }
            return { status: 'success' };
        },

        copyImageToClipboard: async (
            width: number,
            height: number,
            rgba: Uint8ClampedArray | Uint8Array
        ): Promise<{ status: string; error?: string }> => {
            if (isTauriEnvironment()) {
                const payload = new Uint8Array(8 + rgba.byteLength);
                const view = new DataView(payload.buffer);
                view.setUint32(0, width, true);
                view.setUint32(4, height, true);
                payload.set(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength), 8);
                return await invoke<{ status: string; error?: string }>(
                    'copy_image_to_clipboard',
                    payload
                );
            }
            return { status: 'fallback' };
        },

        readImageFromClipboard: async (): Promise<{
            width: number;
            height: number;
            rgba: Uint8ClampedArray;
        } | null> => {
            if (!isTauriEnvironment()) return null;
            const raw = await invoke<ArrayBuffer | Uint8Array | number[]>(
                'read_image_from_clipboard'
            );
            const bytes = toUint8Array(raw);
            if (bytes.byteLength < 8) return null;
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const width = view.getUint32(0, true);
            const height = view.getUint32(4, true);
            const expected = width * height * 4;
            if (width === 0 || height === 0 || bytes.byteLength < 8 + expected) return null;
            const rgba = new Uint8ClampedArray(
                bytes.buffer.slice(bytes.byteOffset + 8, bytes.byteOffset + 8 + expected)
            );
            return { width, height, rgba };
        },

        saveFile: async (content: string) => {
            return await invoke('save_file', { content });
        },

        saveBinaryFile: async (
            data: Uint8Array,
            options?: { defaultName?: string; filterName?: string; extensions?: string[] }
        ) => {
            return await invoke<{ status: string; filePath?: string; error?: string }>('save_binary_file', {
                data: Array.from(data),
                defaultName: options?.defaultName ?? null,
                filterName: options?.filterName ?? null,
                extensions: options?.extensions ?? null,
            });
        },

        saveFileDirect: async (data: Uint8Array | string | number[], filePath: string) => {
            let bytes: number[];
            if (typeof data === 'string') {
                bytes = Array.from(new TextEncoder().encode(data));
            } else if (data instanceof Uint8Array) {
                bytes = Array.from(data);
            } else {
                bytes = Array.from(data);
            }
            return await invoke('save_file_direct', { data: bytes, filePath });
        },

        appendFileDirect: async (data: Uint8Array | string | number[], filePath: string) => {
            let bytes: number[];
            if (typeof data === 'string') {
                bytes = Array.from(new TextEncoder().encode(data));
            } else if (data instanceof Uint8Array) {
                bytes = Array.from(data);
            } else {
                bytes = Array.from(data);
            }
            return await invoke('append_file_direct', { data: bytes, filePath });
        },

        openExternal: async (url: string) => {
            return await invoke('open_external', { target: url });
        },

        getAppPath: async (): Promise<string> => {
            return await invoke<string>('get_app_path');
        },

        // --- Window Control API ---
        toggleFullscreen: async (flag?: boolean): Promise<boolean> => {
            return await invoke<boolean>('toggle_fullscreen', {
                flag: typeof flag === 'boolean' ? flag : null,
            });
        },

        // --- Startup Events ---
        getStartupStatus: async () => {
            if (!isTauriEnvironment()) {
                return {
                    progress: 100,
                    message: 'Ready!',
                    logs: [],
                    isComplete: true,
                };
            }
            return await invoke('get_startup_status');
        },

        splashReady: () => {
            if (isTauriEnvironment()) {
                invoke('splash_ready').catch(() => {});
            }
        },

        on: (channel: string, callback: (...args: any[]) => void) => {
            const validChannels = ['loading-progress', 'loading-log', 'loading-complete'];
            if (!validChannels.includes(channel)) return () => {};

            const unsub = subscribeTauriEvent(channel, (payload) => {
                callback(payload);
            });

            if (!channelListeners.has(channel)) {
                channelListeners.set(channel, new Map());
            }
            channelListeners.get(channel)!.set(callback, unsub);
            return unsub;
        },

        off: (channel: string, callback: (...args: any[]) => void) => {
            const map = channelListeners.get(channel);
            if (map && map.has(callback)) {
                const unsub = map.get(callback)!;
                unsub();
                map.delete(callback);
            }
        },

        // --- File Path Helper ---
        getFilePath: (file: File): string => {
            if (!file) return '';
            if ((file as any).path) return (file as any).path;
            const mapped = filePathWeakMap.get(file);
            if (mapped) return mapped;
            const bySig = fileSignatureMap.get(getFileSignature(file));
            if (bySig) return bySig;
            return '';
        },

        selectLogFile: async (): Promise<string | null> => {
            if (!isTauriEnvironment()) return null;
            return await invoke<string | null>('select_log_file');
        },

        // --- CLI IPC ---
        onCliCommand: (callback: (data: any) => void) => {
            const unsub1 = subscribeTauriEvent('cli-run-command', callback);
            const unsub2 = subscribeTauriEvent('cli-command', callback);
            return () => {
                unsub1();
                unsub2();
            };
        },

        cliReady: () => {
            if (isTauriEnvironment()) {
                invoke('cli_ready').catch(() => {});
            }
        },

        cliStdout: (msg: string) => {
            if (isTauriEnvironment()) {
                invoke('cli_stdout', { msg }).catch(() => {});
            }
        },

        cliStderr: (msg: string) => {
            if (isTauriEnvironment()) {
                invoke('cli_stderr', { msg }).catch(() => {});
            }
        },

        cliExit: (code: number) => {
            if (isTauriEnvironment()) {
                invoke('cli_exit', { code }).catch(() => {});
            }
        },

        // --- Settings Sync ---
        saveSettingsToFile: async (settings: any) => {
            if (!isTauriEnvironment()) return { status: 'success' };
            return await invoke('save_settings_file', { settings });
        },

        getCliSettings: async () => {
            if (!isTauriEnvironment()) return null;
            return await invoke('get_cli_settings');
        },

        // --- SDB Helper ---
        runSdbCommand: async (cmd: string) => {
            return await invoke('run_sdb_command', { cmd });
        },

        listSdbDevices: async (sdbPath?: string): Promise<{ id: string; type: string }[]> => {
            if (!isTauriEnvironment()) return [];
            const res = await invoke<{ id: string; type: string }[]>('native_list_sdb_devices', {
                sdbPath: sdbPath?.trim() ? sdbPath.trim() : null,
            });
            return Array.isArray(res) ? res : [];
        },

        captureSdbScreen: async (options?: {
            deviceId?: string;
            sdbPath?: string;
            customCommand?: string;
            autoConnectIp?: string;
        }): Promise<{ deviceId: string; mime: string; bytes: Uint8Array }> => {
            if (!isTauriEnvironment()) {
                throw new Error('SDB device capture is only available in the Tauri desktop app.');
            }
            const raw = await invoke<ArrayBuffer | Uint8Array | number[]>('sdb_capture_screen', {
                deviceId: options?.deviceId?.trim() ? options.deviceId.trim() : null,
                sdbPath: options?.sdbPath?.trim() ? options.sdbPath.trim() : null,
                customCommand: options?.customCommand?.trim() ? options.customCommand.trim() : null,
                autoConnectIp: options?.autoConnectIp?.trim() ? options.autoConnectIp.trim() : null,
            });
            const frame = toUint8Array(raw);
            if (frame.byteLength < 8) {
                throw new Error('Invalid binary capture response from SDB.');
            }
            const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
            const metaLen = view.getUint32(0, true);
            if (metaLen === 0 || 4 + metaLen >= frame.byteLength) {
                throw new Error('Corrupted capture metadata frame.');
            }
            const metaJson = new TextDecoder().decode(frame.subarray(4, 4 + metaLen));
            const meta = JSON.parse(metaJson) as { deviceId?: string; mime?: string };
            const imageBytes = frame.subarray(4 + metaLen);
            return {
                deviceId: meta.deviceId || 'SDB',
                mime: meta.mime || 'image/png',
                bytes: imageBytes,
            };
        },

        // --- App Updater ---
        getAppVersion: async (): Promise<string> => {
            if (!isTauriEnvironment()) {
                return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.2.2';
            }
            return await invoke<string>('get_app_version');
        },

        checkAppUpdate: async (etag?: string | null): Promise<AppUpdateCheckResult> => {
            if (!isTauriEnvironment()) {
                const fallbackVer =
                    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.2.2';
                return await checkUpdateViaBrowserFetch(fallbackVer, etag);
            }
            return await invoke<AppUpdateCheckResult>('check_app_update', {
                etag: etag?.trim() ? etag.trim() : null,
            });
        },

        downloadAndInstallUpdate: async (args: {
            downloadUrl: string;
            assetName: string;
            expectedSize?: number | null;
        }): Promise<AppUpdateInstallResult> => {
            if (!isTauriEnvironment()) {
                if (typeof window !== 'undefined' && args.downloadUrl) {
                    window.open(args.downloadUrl, '_blank', 'noopener,noreferrer');
                }
                return {
                    status: 'browser_opened',
                    message: 'Opened release download in browser.',
                };
            }
            return await invoke<AppUpdateInstallResult>('download_and_install_update', {
                downloadUrl: args.downloadUrl,
                assetName: args.assetName,
                expectedSize: args.expectedSize ?? null,
            });
        },

        cancelAppUpdate: async (): Promise<void> => {
            if (!isTauriEnvironment()) return;
            await invoke('cancel_app_update');
        },

        onUpdateDownloadProgress: (
            callback: (progress: AppUpdateDownloadProgress) => void
        ): (() => void) => {
            return subscribeTauriEvent('update-download-progress', callback);
        },
    };
}

export function initTauriBridge(): void {
    if (typeof window === 'undefined') return;

    // Only inject if native Electron preload has not already defined window.electronAPI
    if (!window.electronAPI) {
        (window as any).electronAPI = createTauriElectronAPI();
    }

    setupTitleBarDragDelegation();
}
