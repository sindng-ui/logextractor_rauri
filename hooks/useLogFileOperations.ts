import { useEffect, useCallback, useRef, useState } from 'react';
import { getStoredValue, setStoredValue } from '../utils/db';
import { LogViewerHandle } from '../components/LogViewer/LogViewerPane';
import { Socket } from 'socket.io-client';
import { workerRegistry } from './LogWorkerRegistry';
import { isTauriEnvironment } from '../utils/tauriBridge';
import { TAURI_DROP_RIGHT_EVENT } from './useTauriFileDrop';
import {
    persistBrowserFileForReload,
    pickBrowserFileWithHandle,
    requestAndOpenPendingHandle,
    restoreBrowserFile,
} from '../utils/browserFilePersistence';

export interface UseLogFileOperationsProps {
    tabId: string;
    initialFilePath?: string;
    fileOpenToken?: number;
    initialFile?: File | null;
    isActive?: boolean;
    onFileChange?: (path: string) => void;
    leftWorkerRef: React.MutableRefObject<Worker | null>;
    rightWorkerRef: React.MutableRefObject<Worker | null>;
    leftViewerRef: React.MutableRefObject<LogViewerHandle | null>;
    rightViewerRef: React.MutableRefObject<LogViewerHandle | null>; // ✅ Added
    tizenSocket: Socket | null;
    activeStreamRequestIdLeft: React.MutableRefObject<string | null>;
    activeStreamRequestIdRight: React.MutableRefObject<string | null>;
    pendingScrollTop: React.MutableRefObject<number | null>;
    // Left Setters
    setLeftFileName: (name: string | null) => void;
    setLeftFilePath: (path: string) => void;
    setLeftWorkerReady: (ready: boolean) => void;
    setLeftIndexingProgress: (prog: number) => void;
    setLeftTotalLines: (lines: number) => void;
    setLeftFilteredCount: (count: number) => void;
    setActiveLineIndexLeft: (idx: number) => void;
    setSelectedIndicesLeft: (indices: Set<number>) => void;
    setLeftBookmarks: (bookmarks: Set<number>) => void;
    lastFilterHashLeft: React.MutableRefObject<string>;
    // Right Setters
    setRightFileName: (name: string) => void;
    setRightFilePath: (path: string) => void; // ✅ Added
    setRightWorkerReady: (ready: boolean) => void;
    setRightIndexingProgress: (prog: number) => void;
    setRightTotalLines: (lines: number) => void;
    setRightFilteredCount: (count: number) => void;
    setRightBookmarks: (bookmarks: Set<number>) => void;
    lastFilterHashRight: React.MutableRefObject<string>;
    // Persistence
    leftFilePath: string;
    rightFilePath: string; // ✅ Added
    activeLineIndexLeft: number;
    isDualView: boolean; // ✅ Added
    setIsDualView: (val: boolean) => void; // ✅ Added
    onOpenFile?: (file: File) => void; // 🎯 전역 파일 오픈 위임
    onOpenFilePath?: (filePath: string) => void;
    addToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const useLogFileOperations = (props: UseLogFileOperationsProps) => {
    const {
        tabId, initialFilePath, fileOpenToken, initialFile, isActive = true, onFileChange,
        leftWorkerRef, rightWorkerRef, leftViewerRef, rightViewerRef, tizenSocket,
        activeStreamRequestIdLeft, activeStreamRequestIdRight, pendingScrollTop,
        setLeftFileName, setLeftFilePath, setLeftWorkerReady, setLeftIndexingProgress,
        setLeftTotalLines, setLeftFilteredCount, setActiveLineIndexLeft, setSelectedIndicesLeft,
        setLeftBookmarks, lastFilterHashLeft,
        setRightFileName, setRightFilePath, setRightWorkerReady, setRightIndexingProgress,
        setRightTotalLines, setRightFilteredCount, setRightBookmarks, lastFilterHashRight,
        leftFilePath, rightFilePath, activeLineIndexLeft,
        isDualView, setIsDualView,
        onOpenFile, onOpenFilePath, addToast
    } = props;

    // Use a ref to track staleness (similar to original code's isStale)
    const isComponentStale = useRef(false);
    const lastLoadingPathRefLeft = useRef<string | null>(null);
    const lastLoadingPathRefRight = useRef<string | null>(null);
    const isLoadedRef = useRef(false); // ✅ Prevent persistence before loadState completes
    const leftFilePathRef = useRef(leftFilePath);
    const rightFilePathRef = useRef(rightFilePath);
    const isDualViewRef = useRef(isDualView);
    const activeLineLeftRef = useRef(activeLineIndexLeft);
    leftFilePathRef.current = leftFilePath;
    rightFilePathRef.current = rightFilePath;
    isDualViewRef.current = isDualView;
    activeLineLeftRef.current = activeLineIndexLeft;

    const [pendingRestoreLeft, setPendingRestoreLeft] = useState<{ fileName: string; handle: FileSystemFileHandle } | null>(null);
    const [pendingRestoreRight, setPendingRestoreRight] = useState<{ fileName: string; handle: FileSystemFileHandle } | null>(null);

    useEffect(() => {
        isComponentStale.current = false;
        return () => {
            isComponentStale.current = true;
            // 💡 We keep the path cache now because workers are persistent via Registry. 🐧🛡️
            // Removing the reset ensures we skip redundant loadFile on remount.
            // lastLoadingPathRefLeft.current = null;
            // lastLoadingPathRefRight.current = null;
        };
    }, []);

    // ✅ Register listeners ONCE to prevent duplication
    useEffect(() => {
        if (!window.electronAPI) return;

        let unsubChunk: (() => void) | undefined;
        let unsubComplete: (() => void) | undefined;

        if (window.electronAPI.onFileChunk) {
            unsubChunk = window.electronAPI.onFileChunk((data: any) => {
                if (isComponentStale.current) return;
                if (data.requestId === activeStreamRequestIdLeft.current) {
                    leftWorkerRef.current?.postMessage({ type: 'PROCESS_CHUNK', payload: data.chunk });
                } else if (data.requestId === activeStreamRequestIdRight.current) {
                    rightWorkerRef.current?.postMessage({ type: 'PROCESS_CHUNK', payload: data.chunk });
                }
            });
        }

        if (window.electronAPI.onFileStreamComplete) {
            unsubComplete = window.electronAPI.onFileStreamComplete((data: any) => {
                if (isComponentStale.current) return;
                if (data?.requestId === activeStreamRequestIdLeft.current) {
                    leftWorkerRef.current?.postMessage({ type: 'STREAM_DONE' });
                } else if (data?.requestId === activeStreamRequestIdRight.current) {
                    rightWorkerRef.current?.postMessage({ type: 'STREAM_DONE' });
                }
            });
        }

        return () => {
            if (unsubChunk) unsubChunk();
            if (unsubComplete) unsubComplete();
        };
    }, [leftWorkerRef, rightWorkerRef]); // Need refs in deps or handle dynamically

    const loadFile = useCallback(async (
        targetPath: string,
        pane: 'left' | 'right' = 'left',
        options?: { persist?: boolean; force?: boolean }
    ) => {
        if (window.electronAPI) {
            const lastLoadingPathRef = pane === 'left' ? lastLoadingPathRefLeft : lastLoadingPathRefRight;
            const workerRef = pane === 'left' ? leftWorkerRef : rightWorkerRef;
            const setFileName = pane === 'left' ? setLeftFileName : setRightFileName;
            const setFilePath = pane === 'left' ? setLeftFilePath : setRightFilePath;
            const setWorkerReady = pane === 'left' ? setLeftWorkerReady : setRightWorkerReady;
            const setIndexingProgress = pane === 'left' ? setLeftIndexingProgress : setRightIndexingProgress;
            const setTotalLines = pane === 'left' ? setLeftTotalLines : setRightTotalLines;
            const setFilteredCount = pane === 'left' ? setLeftFilteredCount : setRightFilteredCount;
            const lastFilterHash = pane === 'left' ? lastFilterHashLeft : lastFilterHashRight;

            if (options?.force) {
                lastLoadingPathRef.current = null;
            }

            // 중복 로딩 방지 (동일 파일이 이미 로딩 중인 경우 무시)
            if (lastLoadingPathRef.current === targetPath && !tizenSocket) {
                console.log(`[useLog-${pane}] Skip redundant loadFile for:`, targetPath);
                return;
            }
            lastLoadingPathRef.current = targetPath;

            const fileName = targetPath.split(/[/\\]/).pop() || 'log_file.log';
            if (pane === 'left') setPendingRestoreLeft(null);
            else setPendingRestoreRight(null);

            setFileName(fileName);
            setFilePath(targetPath);
            workerRegistry.updateState(tabId, pane, { path: targetPath });

            if (pane === 'left' && onFileChange) {
                onFileChange(targetPath);
            }

            if (options?.persist !== false) {
                isLoadedRef.current = true;
                const statePayload = JSON.stringify({
                    filePath: pane === 'left' ? targetPath : leftFilePathRef.current,
                    rightFilePath: pane === 'right' ? targetPath : rightFilePathRef.current,
                    isDualView: isDualViewRef.current,
                    selectedLine: pane === 'left' ? -1 : activeLineLeftRef.current,
                    scrollTop: pane === 'left' ? 0 : (leftViewerRef.current?.getScrollTop() || 0),
                });
                lastSavedState.current = statePayload;
                setStoredValue(`tabState_${tabId}`, statePayload);
            }

            setWorkerReady(false);
            setIndexingProgress(0);
            setTotalLines(0);
            setFilteredCount(0);
            // 필터 캐시 강제 무효화를 위해 해시 리셋
            lastFilterHash.current = '';

            // ✅ OOM-Safe Local File Loading Route + Native Rust Engine!
            if (window.electronAPI.getFileSize) {
                try {
                    const size = await window.electronAPI.getFileSize(targetPath);
                    if (isComponentStale.current) return;
                    console.log(`[useLog-${pane}] Initiating LOCAL_FILE_STREAM for ${fileName}, size: ${Math.round(size / 1024 / 1024)}MB`);
                    workerRef.current?.postMessage({
                        type: 'INIT_LOCAL_FILE_STREAM',
                        payload: {
                            path: targetPath,
                            size,
                            hasNativeEngine: Boolean(
                                window.electronAPI.indexLogFile && window.electronAPI.filterLogFile
                            ),
                        }
                    });
                    return; // 🚀 Use the new efficient route instead of string buffers!
                } catch (e) {
                    console.error(`[useLog-${pane}] Failed to get file size, falling back to string mode`, e);
                }
            }

            // Fallback (old memory-heavy way)
            if (pane === 'left' && window.electronAPI.streamReadFile) {
                const requestId = `stream-${Date.now()}-${Math.random().toString(36).substring(7)}`;
                activeStreamRequestIdLeft.current = requestId;

                workerRef.current?.postMessage({ type: 'INIT_STREAM', payload: { isLive: false } });
                window.electronAPI.streamReadFile(targetPath, requestId).catch(() => {
                    if (isComponentStale.current) return;
                    window.electronAPI!.readFile(targetPath).then(content => {
                        if (isComponentStale.current) return;
                        const file = new File([content], fileName);
                        (file as any).path = targetPath;
                        workerRef.current?.postMessage({ type: 'INIT_FILE', payload: file });
                    }).catch((readErr) => {
                        console.error(`[useLog-${pane}] Failed to restore file:`, targetPath, readErr);
                        if (!isComponentStale.current) {
                            setWorkerReady(true);
                            addToast?.(`파일을 다시 열 수 없습니다: ${fileName}`, 'warning');
                        }
                    });
                });
            } else {
                const requestId = `read-${Date.now()}-${Math.random().toString(36).substring(7)}`;
                if (pane === 'left') activeStreamRequestIdLeft.current = requestId;
                else activeStreamRequestIdRight.current = requestId;

                window.electronAPI.readFile(targetPath).then(content => {
                    if (isComponentStale.current) return;
                    const file = new File([content], fileName);
                    (file as any).path = targetPath;
                    workerRef.current?.postMessage({ type: 'INIT_FILE', payload: file });
                }).catch((readErr) => {
                    console.error(`[useLog-${pane}] Failed to load file:`, targetPath, readErr);
                    if (!isComponentStale.current) {
                        setWorkerReady(true);
                        addToast?.(`파일을 다시 열 수 없습니다: ${fileName}`, 'warning');
                    }
                });
            }
        }
    }, [tabId, onFileChange, tizenSocket, addToast]);

    const initWorkerFromBrowserFile = useCallback((pane: 'left' | 'right', file: File) => {
        const isLeft = pane === 'left';
        const setFileName = isLeft ? setLeftFileName : setRightFileName;
        const setWorkerReady = isLeft ? setLeftWorkerReady : setRightWorkerReady;
        const setProgress = isLeft ? setLeftIndexingProgress : setRightIndexingProgress;
        const setTotal = isLeft ? setLeftTotalLines : setRightTotalLines;
        const setCount = isLeft ? setLeftFilteredCount : setRightFilteredCount;
        const workerRef = isLeft ? leftWorkerRef : rightWorkerRef;
        const lastHashRef = isLeft ? lastFilterHashLeft : lastFilterHashRight;

        setFileName(file.name);
        setWorkerReady(false);
        setProgress(0);
        setTotal(0);
        setCount(0);
        lastHashRef.current = '';
        workerRef.current?.postMessage({ type: 'INIT_FILE', payload: file });
    }, []);

    const loadState = useCallback(async () => {
        // Priority 1: Direct File Object
        if (initialFile) {
            console.log('[useLog] Loading from initialFile object:', initialFile.name);
            const path = window.electronAPI?.getFilePath?.(initialFile) || (initialFile as any).path || '';
            setPendingRestoreLeft(null);
            setLeftFileName(initialFile.name);
            setLeftFilePath(path);
            setLeftWorkerReady(false);
            setLeftIndexingProgress(0);
            setLeftTotalLines(0);
            setLeftFilteredCount(0);
            workerRegistry.updateState(tabId, 'left', { path });
            if (path) {
                const statePayload = JSON.stringify({
                    filePath: path,
                    rightFilePath: rightFilePathRef.current,
                    isDualView: isDualViewRef.current,
                    selectedLine: -1,
                    scrollTop: 0,
                });
                lastSavedState.current = statePayload;
                setStoredValue(`tabState_${tabId}`, statePayload);
            } else {
                persistBrowserFileForReload(tabId, 'left', initialFile);
            }
            isLoadedRef.current = true;
            leftWorkerRef.current?.postMessage({ type: 'INIT_FILE', payload: initialFile });
            return;
        }

        // Priority 2: Saved State
        const savedStateStr = await getStoredValue(`tabState_${tabId}`);
        if (isComponentStale.current) return;

        let leftTargetPath = initialFilePath;
        let rightTargetPath = '';
        let savedIsDualView = false;
        let savedScrollTopLeft = 0;
        let savedSelectedLineLeft = -1;

        if (savedStateStr) {
            try {
                const saved = JSON.parse(savedStateStr);
                if (saved.scrollTop) savedScrollTopLeft = saved.scrollTop;
                if (saved.selectedLine) savedSelectedLineLeft = saved.selectedLine;
                if (saved.filePath && !initialFilePath) leftTargetPath = saved.filePath;
                if (saved.rightFilePath) rightTargetPath = saved.rightFilePath;
                if (saved.isDualView) savedIsDualView = saved.isDualView;
            } catch (e) { }
        }

        if (isComponentStale.current) return;

        if (savedScrollTopLeft > 0) pendingScrollTop.current = savedScrollTopLeft;
        if (savedSelectedLineLeft >= 0) {
            setActiveLineIndexLeft(savedSelectedLineLeft);
            setSelectedIndicesLeft(new Set([savedSelectedLineLeft]));
        }

        if (savedIsDualView) {
            setIsDualView(true);
        }

        if (leftTargetPath) {
            loadFile(leftTargetPath, 'left', { persist: false });
        } else if (!isTauriEnvironment()) {
            const restoredLeft = await restoreBrowserFile(tabId, 'left');
            if (isComponentStale.current) return;
            if (restoredLeft.file) {
                setPendingRestoreLeft(null);
                initWorkerFromBrowserFile('left', restoredLeft.file);
            } else if (restoredLeft.pendingHandle) {
                setPendingRestoreLeft(restoredLeft.pendingHandle);
            }
        }

        if (savedIsDualView) {
            if (rightTargetPath) {
                loadFile(rightTargetPath, 'right', { persist: false });
            } else if (!isTauriEnvironment()) {
                const restoredRight = await restoreBrowserFile(tabId, 'right');
                if (isComponentStale.current) return;
                if (restoredRight.file) {
                    setPendingRestoreRight(null);
                    initWorkerFromBrowserFile('right', restoredRight.file);
                } else if (restoredRight.pendingHandle) {
                    setPendingRestoreRight(restoredRight.pendingHandle);
                }
            }
        }

        isLoadedRef.current = true; // ✅ Mark loaded to allow persistence
    }, [tabId, initialFile, initialFilePath, loadFile, setIsDualView, initWorkerFromBrowserFile]);

    const handleLeftFileChange = useCallback((file: File) => {
        // 🎯 [Notepad++ 전역 위임] onOpenFile 허브가 활성화되어 있으면 전권을 전역 위임 처리합니다.
        if (onOpenFile) {
            onOpenFile(file);
            return;
        }

        if (!leftWorkerRef.current) return;
        let path = '';
        if (window.electronAPI && window.electronAPI.getFilePath) {
            path = window.electronAPI.getFilePath(file);
        } else {
            path = ('path' in file && (file as any).path) || '';
        }

        // 동일 파일명일 경우 새로고침(Reload)을 강제하기 위해 캐시 무효화
        const isDifferentFile = (path && leftFilePath && path !== leftFilePath) || (file.name !== (leftFilePath.split(/[/\\]/).pop() || ''));
        if (leftFilePath && !isDifferentFile) {
            console.log('[useLogFileOperations] Same file dropped on Left. Triggering forced reload.');
            lastLoadingPathRefLeft.current = null;
        }

        if (path) {
            setLeftFilePath(path);
            workerRegistry.updateState(tabId, 'left', { path });
            setStoredValue(`tabState_${tabId}`, JSON.stringify({
                filePath: path,
                rightFilePath: rightFilePath,
                isDualView: isDualView,
                selectedLine: -1,
                scrollTop: 0
            }));
            if (onFileChange) onFileChange(path);
        }

        setPendingRestoreLeft(null);
        if (!path) {
            persistBrowserFileForReload(tabId, 'left', file);
        }

        setLeftFileName(file.name);
        setLeftWorkerReady(false);
        setLeftIndexingProgress(0);
        setLeftTotalLines(0);
        setLeftFilteredCount(0);
        setActiveLineIndexLeft(-1);
        setSelectedIndicesLeft(new Set());
        setLeftBookmarks(new Set());
        lastFilterHashLeft.current = '';
        leftWorkerRef.current.postMessage({ type: 'INIT_FILE', payload: file });
    }, [tabId, onFileChange, rightFilePath, isDualView, leftFilePath, onOpenFile]);

    const handleRightFileChange = useCallback((file: File) => {
        if (!rightWorkerRef.current) return;
        let path = '';
        if (window.electronAPI && window.electronAPI.getFilePath) {
            path = window.electronAPI.getFilePath(file);
        } else {
            path = ('path' in file && (file as any).path) || '';
        }

        // 동일 파일명일 경우 새로고침(Reload)을 강제하기 위해 캐시 무효화 (Right Pane)
        const isDifferentRightFile = (path && rightFilePath && path !== rightFilePath) || (file.name !== (rightFilePath.split(/[/\\]/).pop() || ''));
        if (rightFilePath && !isDifferentRightFile) {
            console.log('[useLogFileOperations] Same file dropped on Right. Triggering forced reload.');
            lastLoadingPathRefRight.current = null;
        }

        if (path) {
            setRightFilePath(path);
            workerRegistry.updateState(tabId, 'right', { path });
            setStoredValue(`tabState_${tabId}`, JSON.stringify({
                filePath: leftFilePath,
                rightFilePath: path,
                isDualView: isDualView,
                selectedLine: activeLineIndexLeft,
                scrollTop: leftViewerRef.current?.getScrollTop() || 0
            }));
        }

        setPendingRestoreRight(null);
        if (!path) {
            persistBrowserFileForReload(tabId, 'right', file);
        }

        setRightFileName(file.name);
        setRightWorkerReady(false);
        setRightIndexingProgress(0);
        setRightTotalLines(0);
        setRightFilteredCount(0);
        setRightBookmarks(new Set());
        lastFilterHashRight.current = '';
        rightWorkerRef.current.postMessage({ type: 'INIT_FILE', payload: file });
    }, [tabId, leftFilePath, isDualView, activeLineIndexLeft, rightFilePath]);

    const lastSavedState = useRef<string>('');

    // Periodic Persistence
    useEffect(() => {
        if (tizenSocket) return;

        const timer = setInterval(() => {
            if (!isLoadedRef.current) return; // ✅ Exit if loadState hasn't finished to avoid overwriting with defaults

            const scrollTop = leftViewerRef.current?.getScrollTop() || 0;
            const state = {
                filePath: leftFilePath,
                rightFilePath: rightFilePath,
                isDualView: isDualView,
                selectedLine: activeLineIndexLeft,
                scrollTop
            };

            const newStateStr = JSON.stringify(state);
            if (lastSavedState.current !== newStateStr) {
                lastSavedState.current = newStateStr;
                setStoredValue(`tabState_${tabId}`, newStateStr);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [tabId, leftFilePath, rightFilePath, isDualView, activeLineIndexLeft, tizenSocket]);

    const prevInitialFileRef = useRef<File | null | undefined>(initialFile);

    // 🎯 initialFile이 동적으로 갱신되었을 때(예: 동일 파일 드롭으로 인한 리로드 요청) 로딩 재기동
    // 최초 마운트 시점의 1회 로딩은 loadState()가 전담하므로 스킵하여 2중 중복 로드를 차단합니다 🐧🛡️
    useEffect(() => {
        if (initialFile && initialFile !== prevInitialFileRef.current) {
            console.log('[useLogOperations] Dynamic initialFile changed, trigger forced reload:', initialFile.name);
            prevInitialFileRef.current = initialFile; // 레프 업데이트
            
            setLeftFileName(initialFile.name);
            const path = (initialFile as any).path || '';
            setLeftFilePath(path);
            setLeftWorkerReady(false);
            setLeftIndexingProgress(0);
            setLeftTotalLines(0);
            setLeftFilteredCount(0);
            setActiveLineIndexLeft(-1);
            setSelectedIndicesLeft(new Set());
            setLeftBookmarks(new Set());
            lastFilterHashLeft.current = '';
            
            // 캐시 무효화로 재로딩 보장
            lastLoadingPathRefLeft.current = null;
            setPendingRestoreLeft(null);
            if (!path) {
                persistBrowserFileForReload(tabId, 'left', initialFile);
            }
            workerRegistry.updateState(tabId, 'left', { path });
            leftWorkerRef.current?.postMessage({ type: 'INIT_FILE', payload: initialFile });
        } else if (!initialFile) {
            prevInitialFileRef.current = initialFile;
        }
    }, [initialFile]);

    const prevOpenKeyRef = useRef<string>(`${initialFilePath || ''}::${fileOpenToken || 0}`);

    useEffect(() => {
        const nextKey = `${initialFilePath || ''}::${fileOpenToken || 0}`;
        if (nextKey === prevOpenKeyRef.current) return;
        prevOpenKeyRef.current = nextKey;

        if (initialFilePath) {
            loadFile(initialFilePath, 'left', { persist: true, force: true });
        }
    }, [initialFilePath, fileOpenToken, loadFile]);

    useEffect(() => {
        const handleRightDrop = (e: Event) => {
            if (!isActive) return;
            const customEvent = e as CustomEvent<{ path?: string }>;
            const droppedPath = customEvent.detail?.path;
            if (!droppedPath) return;
            loadFile(droppedPath, 'right', { persist: true, force: true });
        };

        window.addEventListener(TAURI_DROP_RIGHT_EVENT, handleRightDrop);
        return () => window.removeEventListener(TAURI_DROP_RIGHT_EVENT, handleRightDrop);
    }, [isActive, loadFile]);

    const handleBrowseNative = useCallback(async (pane: 'left' | 'right'): Promise<boolean> => {
        if (isTauriEnvironment() && window.electronAPI?.selectLogFile) {
            try {
                const selectedPath = await window.electronAPI.selectLogFile();
                if (!selectedPath) return true; // Native dialog shown & cancelled cleanly
                if (pane === 'left' && onOpenFilePath) {
                    onOpenFilePath(selectedPath);
                } else {
                    await loadFile(selectedPath, pane, { persist: true, force: true });
                }
                return true;
            } catch (err) {
                console.warn('[useLogFileOperations] Native selectLogFile failed, falling back:', err);
                return false;
            }
        }

        if (!isTauriEnvironment()) {
            const { file, cancelled } = await pickBrowserFileWithHandle();
            if (cancelled) return true;
            if (file) {
                if (pane === 'left') handleLeftFileChange(file);
                else handleRightFileChange(file);
                return true;
            }
        }

        return false;
    }, [onOpenFilePath, loadFile, handleLeftFileChange, handleRightFileChange]);

    const handleRestorePendingFile = useCallback(async (pane: 'left' | 'right') => {
        const pending = pane === 'left' ? pendingRestoreLeft : pendingRestoreRight;
        if (!pending) return;

        try {
            const file = await requestAndOpenPendingHandle(tabId, pane, pending.handle);
            if (!file) {
                addToast?.('브라우저 파일 읽기 권한이 거부되었습니다.', 'warning');
                return;
            }
            if (pane === 'left') {
                setPendingRestoreLeft(null);
            } else {
                setPendingRestoreRight(null);
            }
            initWorkerFromBrowserFile(pane, file);
        } catch (err) {
            console.error('[useLogFileOperations] Failed to reopen handle:', err);
            addToast?.('이전 파일을 다시 열 수 없습니다.', 'warning');
        }
    }, [tabId, pendingRestoreLeft, pendingRestoreRight, initWorkerFromBrowserFile, addToast]);

    return {
        loadState,
        loadFile,
        handleLeftFileChange,
        handleRightFileChange,
        handleBrowseNative,
        pendingRestoreLeft,
        pendingRestoreRight,
        handleRestorePendingFile,
    };
};
