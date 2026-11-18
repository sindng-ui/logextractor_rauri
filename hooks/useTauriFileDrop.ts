import { useEffect, useRef } from 'react';
import { isTauriEnvironment } from '../utils/tauriBridge';

export const TAURI_DROP_RIGHT_EVENT = 'happytool-tauri-drop-right';

interface UseTauriFileDropOptions {
    isActive: boolean;
    onOpenFilePath: (filePath: string) => void;
}

const resolveDroppedPane = (position?: { x: number; y: number }): 'left' | 'right' => {
    if (!position || typeof document === 'undefined') return 'left';

    const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    const candidates = [
        { x: position.x / dpr, y: position.y / dpr },
        { x: position.x, y: position.y },
    ];

    for (const pt of candidates) {
        const el = document.elementFromPoint(pt.x, pt.y) as HTMLElement | null;
        const paneEl = el?.closest('[data-pane-id]') as HTMLElement | null;
        const pane = paneEl?.getAttribute('data-pane-id');
        if (pane === 'right' || pane === 'left') {
            return pane;
        }
    }

    return 'left';
};

/**
 * Listen for Tauri native OS file drag-and-drop events so dropped log files retain
 * their full OS path (required for native Rust engine and restart auto-restore).
 */
export function useTauriFileDrop({ isActive, onOpenFilePath }: UseTauriFileDropOptions): void {
    const onOpenFilePathRef = useRef(onOpenFilePath);
    onOpenFilePathRef.current = onOpenFilePath;

    const isActiveRef = useRef(isActive);
    isActiveRef.current = isActive;

    useEffect(() => {
        if (!isTauriEnvironment()) return;

        let unlisten: (() => void) | null = null;
        let cancelled = false;

        import('@tauri-apps/api/webview')
            .then(({ getCurrentWebview }) =>
                getCurrentWebview().onDragDropEvent((event) => {
                    if (cancelled || !isActiveRef.current) return;
                    const payload = event.payload;
                    if (payload.type !== 'drop' || !payload.paths || payload.paths.length === 0) {
                        return;
                    }

                    const targetPane = resolveDroppedPane(payload.position);
                    if (targetPane === 'right') {
                        window.dispatchEvent(
                            new CustomEvent(TAURI_DROP_RIGHT_EVENT, {
                                detail: { path: payload.paths[0] },
                            })
                        );
                        return;
                    }

                    for (const droppedPath of payload.paths) {
                        if (droppedPath) {
                            onOpenFilePathRef.current(droppedPath);
                        }
                    }
                })
            )
            .then((fn) => {
                if (cancelled) {
                    fn();
                } else {
                    unlisten = fn;
                }
            })
            .catch((err) => {
                console.warn('[useTauriFileDrop] Failed to attach native drag-drop listener:', err);
            });

        return () => {
            cancelled = true;
            if (unlisten) {
                unlisten();
                unlisten = null;
            }
        };
    }, []);
}
