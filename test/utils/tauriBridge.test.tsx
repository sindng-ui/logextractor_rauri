import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
    createTauriElectronAPI,
    registerTauriFilePath,
    initTauriBridge,
} from '../../utils/tauriBridge';
import WindowTitleBarControls from '../../components/WindowTitleBarControls';

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(async (cmd: string, args?: any) => {
        if (cmd === 'read_file') return `content:${args.filePath}`;
        if (cmd === 'get_file_size') return 1048576;
        if (cmd === 'read_file_segment') {
            const buf = new Uint8Array([72, 65, 80, 80, 89]).buffer;
            return buf;
        }
        if (cmd === 'get_app_path') return 'K:/Antigravity_Projects/gitbase/happytool_tauri';
        if (cmd === 'toggle_fullscreen') return Boolean(args?.flag ?? true);
        if (cmd === 'window_toggle_maximize') return true;
        return { status: 'success' };
    }),
}));

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(async () => () => {}),
}));

vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: vi.fn(() => ({
        isMaximized: vi.fn(async () => false),
        onResized: vi.fn(async () => () => {}),
        minimize: vi.fn(async () => {}),
        toggleMaximize: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        startDragging: vi.fn(async () => {}),
    })),
}));

describe('Tauri Bridge & Window Controls', () => {
    beforeEach(() => {
        (window as any).__TAURI_INTERNALS__ = {};
        delete (window as any).electronAPI;
        localStorage.clear();
    });

    it('injects window.electronAPI via initTauriBridge and supports all core methods', async () => {
        initTauriBridge();
        expect(window.electronAPI).toBeDefined();

        const content = await window.electronAPI!.readFile('/tmp/a.log');
        expect(content).toBe('content:/tmp/a.log');

        const size = await window.electronAPI!.getFileSize('/tmp/a.log');
        expect(size).toBe(1048576);

        // Zero-copy ArrayBuffer -> Uint8Array conversion check
        const segment = await window.electronAPI!.readFileSegment({
            path: '/tmp/a.log',
            start: 0,
            end: 5,
        });
        expect(segment).toBeInstanceOf(Uint8Array);
        expect(Array.from(segment)).toEqual([72, 65, 80, 80, 89]);
    });

    it('provides synchronous getZoomFactor and clamps setZoomFactor', () => {
        const api = createTauriElectronAPI();
        expect(api.getZoomFactor()).toBe(1.0);

        api.setZoomFactor(1.5);
        expect(api.getZoomFactor()).toBe(1.5);

        api.setZoomFactor(99.0);
        expect(api.getZoomFactor()).toBe(5.0);
    });

    it('resolves local file paths via registerTauriFilePath and getFilePath', () => {
        const api = createTauriElectronAPI();
        const file = new File(['hello'], 'sample.log', { type: 'text/plain' });

        registerTauriFilePath(file, 'C:\\logs\\sample.log');
        expect(api.getFilePath(file)).toBe('C:\\logs\\sample.log');
    });

    it('renders WindowTitleBarControls when not in focus mode and hides in focus mode', () => {
        const { rerender } = render(<WindowTitleBarControls isFocusMode={false} />);
        expect(screen.getByTestId('window-titlebar-controls')).toBeInTheDocument();
        expect(screen.getByTitle('Minimize')).toBeInTheDocument();
        expect(screen.getByTitle('Maximize')).toBeInTheDocument();
        expect(screen.getByTitle('Close')).toBeInTheDocument();

        fireEvent.click(screen.getByTitle('Minimize'));
        fireEvent.click(screen.getByTitle('Maximize'));

        rerender(<WindowTitleBarControls isFocusMode={true} />);
        expect(screen.queryByTestId('window-titlebar-controls')).toBeNull();
    });
});
