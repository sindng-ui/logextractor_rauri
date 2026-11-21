/// <reference types="vite/client" />

interface ElectronAPI {
    readFile: (path: string) => Promise<string>;
    getFileSize: (path: string) => Promise<number>;
    readFileSegment: (args: { path: string, start: number, end: number }) => Promise<Uint8Array>;
    readFileSegmentsBatch?: (args: { path: string, ranges: [number, number][] }) => Promise<Uint8Array>;
    indexLogFile?: (args: { path: string }) => Promise<Uint8Array>;
    indexLogFileMeta?: (args: { path: string }) => Promise<{ totalLines: number; fileSize: number }>;
    evictLogCache?: (args: { path?: string | null }) => Promise<void>;
    readLocalLinesByIndices?: (args: { path: string; indices: number[]; stripAnsi: boolean }) => Promise<Uint8Array>;
    readLocalLineRange?: (args: { path: string; startLine: number; count: number; stripAnsi: boolean }) => Promise<Uint8Array>;
    findHighlightNative?: (args: {
        path: string;
        filterKey?: string | null;
        bookmarks?: number[] | null;
        keyword: string;
        startVisualIdx: number;
        direction: 'next' | 'prev';
        caseSensitive: boolean;
    }) => Promise<{ supported: boolean; foundIndex?: number; originalLineNum?: number }>;
    filterLogFile?: (args: {
        path: string;
        rule: any;
        snapshotKey: string;
        parentKey?: string | null;
    }) => Promise<Uint8Array>;
    streamReadFile: (path: string, requestId: string, options?: { start?: number }) => Promise<{ status: string; requestId: string }>;
    cancelStream: (requestId: string) => Promise<{ status: string; requestId: string }>;
    onFileChunk: (callback: (data: { chunk: string; requestId: string }) => void) => () => void;
    onFileStreamComplete: (callback: (data: { requestId: string }) => void) => () => void;
    onFileStreamError: (callback: (data: { error: string; requestId: string }) => void) => () => void;
    setZoomFactor: (factor: number) => void;
    getZoomFactor: () => number;
    copyToClipboard: (text: string) => Promise<void>;
    copyImageToClipboard?: (
        width: number,
        height: number,
        rgba: Uint8ClampedArray | Uint8Array
    ) => Promise<{ status: string; error?: string }>;
    readImageFromClipboard?: () => Promise<{
        width: number;
        height: number;
        rgba: Uint8ClampedArray;
    } | null>;
    saveFile: (content: string) => Promise<{ status: string, filePath?: string }>;
    saveBinaryFile?: (
        data: Uint8Array,
        options?: { defaultName?: string; filterName?: string; extensions?: string[] }
    ) => Promise<{ status: string; filePath?: string; error?: string }>;
    openExternal: (url: string) => Promise<{ status: string, error?: string }>;
    getAppPath: () => Promise<string>;
    toggleFullscreen: (flag: boolean) => Promise<void>;
    getStartupStatus: () => Promise<any>;
    splashReady: () => void;
    saveFileDirect: (data: Uint8Array, filePath: string) => Promise<{ status: string; filePath?: string; error?: string }>;
    appendFileDirect?: (data: Uint8Array, filePath: string) => Promise<{ status: string; filePath?: string; error?: string }>;

    // Loading events
    on?: (channel: 'loading-progress' | 'loading-log' | 'loading-complete', callback: (...args: any[]) => void) => (() => void) | undefined;
    off?: (channel: 'loading-progress' | 'loading-log' | 'loading-complete', callback: (...args: any[]) => void) => void;
    // File Path Helper
    getFilePath?: (file: File) => string;
    selectLogFile?: () => Promise<string | null>;

    // --- CLI IPC ---
    onCliCommand: (callback: (data: any) => void) => () => void;
    cliReady: () => void;
    cliStdout: (msg: string) => void;
    cliStderr: (msg: string) => void;
    cliExit: (code: number) => void;

    // --- Settings Sync ---
    saveSettingsToFile: (settings: any) => Promise<{ status: string }>;
    getCliSettings: () => Promise<any>;

    // --- SDB Helper ---
    runSdbCommand: (cmd: string) => Promise<{ stdout?: string; error?: boolean; message?: string }>;
    listSdbDevices?: (sdbPath?: string) => Promise<{ id: string; type: string }[]>;
    captureSdbScreen?: (options?: {
        deviceId?: string;
        sdbPath?: string;
        customCommand?: string;
        autoConnectIp?: string;
    }) => Promise<{ deviceId: string; mime: string; bytes: Uint8Array }>;
}

interface Window {
    electronAPI?: ElectronAPI;
}

declare const __APP_VERSION__: string;

declare module '*.png' {
    const value: string;
    export default value;
}

declare module '*.jpg' {
    const value: string;
    export default value;
}

declare module '*.svg' {
    import React = require('react');
    export const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>;
    const src: string;
    export default src;
}
