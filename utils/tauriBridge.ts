import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

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
            if (raw instanceof Uint8Array) return raw;
            if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
            if (ArrayBuffer.isView(raw)) {
                return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
            }
            return new Uint8Array(raw as number[]);
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

        saveFile: async (content: string) => {
            return await invoke('save_file', { content });
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
