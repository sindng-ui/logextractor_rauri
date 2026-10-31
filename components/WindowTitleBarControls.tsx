import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauriEnvironment } from '../utils/tauriBridge';

interface WindowTitleBarControlsProps {
    isFocusMode?: boolean;
}

/**
 * Replicates Electron's `titleBarOverlay: { color: '#0f172a', symbolColor: '#94a3b8', height: 32 }`
 * in the exact top-right 138x32px reserved region (`pr-[140px]` / `pr-36`).
 */
export const WindowTitleBarControls: React.FC<WindowTitleBarControlsProps> = React.memo(({
    isFocusMode = false,
}) => {
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        if (!isTauriEnvironment()) return;
        const win = getCurrentWindow();
        win.isMaximized()
            .then(setIsMaximized)
            .catch(() => {});

        let unlisten: (() => void) | null = null;
        win.onResized(() => {
            win.isMaximized()
                .then(setIsMaximized)
                .catch(() => {});
        })
            .then((fn) => {
                unlisten = fn;
            })
            .catch(() => {});

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    const handleMinimize = useCallback(() => {
        if (isTauriEnvironment()) {
            invoke('window_minimize').catch(() => {
                getCurrentWindow().minimize().catch(() => {});
            });
        }
    }, []);

    const handleToggleMaximize = useCallback(() => {
        if (isTauriEnvironment()) {
            invoke<boolean>('window_toggle_maximize')
                .then((max) => setIsMaximized(max))
                .catch(() => {
                    getCurrentWindow().toggleMaximize().catch(() => {});
                });
        }
    }, []);

    const handleClose = useCallback(() => {
        if (isTauriEnvironment()) {
            invoke('window_close').catch(() => {
                getCurrentWindow().close().catch(() => {});
            });
        }
    }, []);

    if (isFocusMode) return null;

    return (
        <div
            className="fixed top-0 right-0 h-8 w-[138px] z-[99999] flex items-center select-none no-drag"
            style={{ backgroundColor: '#0f172a', color: '#94a3b8' }}
            data-testid="window-titlebar-controls"
        >
            <button
                type="button"
                onClick={handleMinimize}
                className="w-[46px] h-8 flex items-center justify-center hover:bg-slate-800 hover:text-slate-100 transition-colors"
                title="Minimize"
                aria-label="Minimize"
            >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 5H9" stroke="currentColor" strokeWidth="1.2" />
                </svg>
            </button>

            <button
                type="button"
                onClick={handleToggleMaximize}
                className="w-[46px] h-8 flex items-center justify-center hover:bg-slate-800 hover:text-slate-100 transition-colors"
                title={isMaximized ? 'Restore' : 'Maximize'}
                aria-label={isMaximized ? 'Restore' : 'Maximize'}
            >
                {isMaximized ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M3 1.5H8.5V7" stroke="currentColor" strokeWidth="1.1" />
                        <rect x="1.5" y="3" width="5.5" height="5.5" stroke="currentColor" strokeWidth="1.1" />
                    </svg>
                ) : (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                )}
            </button>

            <button
                type="button"
                onClick={handleClose}
                className="w-[46px] h-8 flex items-center justify-center hover:bg-[#e81123] hover:text-white transition-colors"
                title="Close"
                aria-label="Close"
            >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
            </button>
        </div>
    );
});

WindowTitleBarControls.displayName = 'WindowTitleBarControls';
export default WindowTitleBarControls;
