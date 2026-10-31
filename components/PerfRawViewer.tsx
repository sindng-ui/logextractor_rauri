import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import LogViewerPane, { LogViewerHandle } from './LogViewer/LogViewerPane';
import { X, Loader2, ChevronUp, ChevronDown, CheckCircle2 } from 'lucide-react';
import { LogWorkerResponse } from '../types';
import LogProcessorWorker from '../workers/LogProcessor.worker.ts?worker';

interface PerfRawViewerProps {
    filePath: string;
    fileName: string;
    fileObject?: File | null;
    isOpen: boolean;
    onClose: () => void;
    targetRange?: { startLine: number; endLine: number; type: 'step' | 'combo' | 'manual' };
    jumpLocations?: number[];
}

export const PerfRawViewer: React.FC<PerfRawViewerProps> = ({ filePath, fileName, fileObject, isOpen, onClose, targetRange, jumpLocations = [] }) => {
    const workerRef = useRef<Worker | null>(null);
    const [workerReady, setWorkerReady] = useState(false);
    const [totalLines, setTotalLines] = useState(0);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const viewerRef = useRef<LogViewerHandle>(null);
    const pendingRequests = useRef<Map<string, (data: any) => void>>(new Map());
    const activeStreamRequestId = useRef<string | null>(null);
    const [currentJumpIndex, setCurrentJumpIndex] = useState(-1);

    const handleJump = useCallback((direction: 'next' | 'prev') => {
        if (!jumpLocations.length) {
            console.warn('RawViewer: No jump locations available');
            return;
        }
        if (!viewerRef.current) {
            console.warn('RawViewer: Viewer ref not ready');
            return;
        }

        let nextIndex = direction === 'next' ? currentJumpIndex + 1 : currentJumpIndex - 1;

        // Wrap around logic
        if (nextIndex >= jumpLocations.length) nextIndex = 0;
        if (nextIndex < 0) nextIndex = jumpLocations.length - 1;

        console.log(`RawViewer: Jumping to ${nextIndex + 1}/${jumpLocations.length} (Line ${jumpLocations[nextIndex]})`);
        setCurrentJumpIndex(nextIndex);
        const targetLine = jumpLocations[nextIndex];

        // Scroll to line (convert 1-based to 0-based), align 'center' or 'start'
        viewerRef.current.scrollToIndex(targetLine - 1, { align: 'center' });
    }, [jumpLocations, currentJumpIndex]);

    // Focus Management
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            // Focus the container to ensure keyboard events are captured contextually if needed
            // though window listener should catch them regardless.
            setTimeout(() => containerRef.current?.focus(), 50);
            console.log('RawViewer: Open with Jump Locations:', jumpLocations);
        }
    }, [isOpen, jumpLocations]);

    // Handle Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Debugging
            if (e.key === 'F3' || e.key === 'F4') {
                console.log(`RawViewer: Key Pressed ${e.key}`);
            }

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            } else if (e.key === 'F3') {
                e.preventDefault();
                e.stopPropagation();
                handleJump('prev');
            } else if (e.key === 'F4') {
                e.preventDefault();
                e.stopPropagation();
                handleJump('next');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, handleJump]);

    // Initialize Worker
    useEffect(() => {
        if (!isOpen) {
            workerRef.current?.terminate();
            workerRef.current = null;
            return;
        }

        let isStale = false;
        // Adjust path based on location: components/PerfRawViewer.tsx -> ../workers/LogProcessor.worker.ts
        workerRef.current = new LogProcessorWorker();

        const cleanupListeners: (() => void)[] = [];

        workerRef.current.onmessage = (e: MessageEvent<LogWorkerResponse>) => {
            if (isStale) return;
            const { type, payload, requestId } = e.data;

            if (requestId && pendingRequests.current.has(requestId)) {
                const resolve = pendingRequests.current.get(requestId);
                if (type === 'LINES_DATA') resolve && resolve(payload.lines);
                pendingRequests.current.delete(requestId);
                return;
            }

            switch (type) {
                case 'STATUS_UPDATE':
                    if (payload.status === 'indexing') setLoadingProgress(payload.progress);
                    if (payload.status === 'ready') setWorkerReady(true);
                    break;
                case 'INDEX_COMPLETE':
                case 'FILTER_COMPLETE':
                    setTotalLines(payload.totalLines || 0);
                    setWorkerReady(true);
                    setLoadingProgress(100);
                    break;
                case 'ERROR':
                    console.error('RawViewer Worker Error:', payload.error);
                    break;
            }
        };

        const initFile = () => {
            // 1. Try File Object (Fastest)
            if (fileObject) {
                console.log('[RawViewer] Loading from File object');
                workerRef.current?.postMessage({ type: 'INIT_FILE', payload: fileObject });
                return;
            }

            // 2. Stream from Disk
            if (window.electronAPI?.streamReadFile) {
                console.log('[RawViewer] Streaming from disk:', filePath);
                const requestId = `raw-${Date.now()}`;
                activeStreamRequestId.current = requestId;

                const unsubChunk = window.electronAPI.onFileChunk((data) => {
                    if (isStale || data.requestId !== activeStreamRequestId.current) return;
                    workerRef.current?.postMessage({ type: 'PROCESS_CHUNK', payload: data.chunk });
                });

                cleanupListeners.push(unsubChunk);

                workerRef.current?.postMessage({ type: 'INIT_STREAM', payload: { isLive: false } });
                window.electronAPI.streamReadFile(filePath, requestId).catch(err => {
                    console.error('[RawViewer] Stream failed', err);
                });
            } else {
                console.error('[RawViewer] No suitable loading method');
            }
        };

        initFile();

        return () => {
            isStale = true;
            workerRef.current?.terminate();
            cleanupListeners.forEach(fn => fn());
        };
    }, [isOpen, filePath, fileObject]);

    // Handle Scroll Request
    const handleScrollRequest = useCallback((startIndex: number, count: number) => {
        return new Promise<{ lineNum: number; content: string }[]>((resolve) => {
            if (!workerRef.current) return resolve([]);
            const requestId = Math.random().toString(36);
            pendingRequests.current.set(requestId, resolve);
            // Request RAW lines (0-based index from viewer -> 0-based index to worker)
            // LogProcessor getRawLines takes startLineNum (0-based) and count
            workerRef.current.postMessage({
                type: 'GET_RAW_LINES',
                payload: { startLine: startIndex, count },
                requestId
            });
        });
    }, []);

    // Initial Jump Logic is now handled centrally by LogViewerPane via initialScrollIndex prop
    // to ensure instant anchoring without visual delay.🐧

    const highlightRanges = useMemo(() => {
        const ranges = [];

        // 1. Base Range Highlight (Amber)
        if (targetRange) {
            ranges.push({
                start: targetRange.startLine - 1,
                end: targetRange.endLine - 1,
                color: 'rgba(251, 191, 36, 0.15)' // Amber-400/15
            });
        }

        // 2. Current Jump Location Highlight (Cyan/Blue - Distinct)
        if (currentJumpIndex !== -1 && jumpLocations.length > 0) {
            const activeLine = jumpLocations[currentJumpIndex];
            ranges.push({
                start: activeLine - 1,
                end: activeLine - 1,
                color: 'rgba(6, 182, 212, 0.3)' // Cyan-500/30
            });
        }

        return ranges;
    }, [targetRange, currentJumpIndex, jumpLocations]);

    if (!isOpen) return null;

    return (
        <div ref={containerRef} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60  animate-in fade-in duration-200 outline-none">
            <div className="w-[90vw] h-[90vh] bg-white dark:bg-[#0b0f19] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-700">
                {/* Header */}
                <div className="h-12 border-b border-slate-200 dark:border-white/10 flex items-center justify-between px-5 bg-slate-50 dark:bg-slate-900/80">
                    <div className="flex items-center gap-3">
                        <span className="bg-amber-500/10 text-amber-500 px-2 py-1 rounded-md text-xs font-black uppercase">Raw View</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">{fileName}</span>
                        {targetRange && (
                            <span className="text-xs text-slate-500 font-mono">
                                (L{targetRange.startLine} - L{targetRange.endLine})
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Jump Controls */}
                        {jumpLocations.length > 0 && (
                            <div className="flex items-center bg-slate-200 dark:bg-white/5 rounded-lg p-0.5 border border-transparent dark:border-white/5">
                                <button
                                    onClick={() => handleJump('prev')}
                                    className="p-1 hover:bg-white/50 dark:hover:bg-white/10 rounded-md transition-colors text-slate-500 dark:text-slate-400"
                                    title="Prev Key Point (F3)"
                                >
                                    <ChevronUp size={14} />
                                </button>
                                <span className="text-[10px] font-mono px-2 min-w-[60px] text-center text-slate-600 dark:text-slate-300 font-bold select-none">
                                    {currentJumpIndex === -1 ? 'Jump' : `${currentJumpIndex + 1} / ${jumpLocations.length}`}
                                </span>
                                <button
                                    onClick={() => handleJump('next')}
                                    className="p-1 hover:bg-white/50 dark:hover:bg-white/10 rounded-md transition-colors text-slate-500 dark:text-slate-400"
                                    title="Next Key Point (F4)"
                                >
                                    <ChevronDown size={14} />
                                </button>
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            {(!workerReady || loadingProgress < 100) && (
                                <div className="flex items-center gap-2 text-xs text-indigo-400 mr-4">
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>Loading {Math.round(loadingProgress)}%</span>
                                </div>
                            )}
                            <button onClick={onClose} className="rounded-full w-8 h-8 p-0 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 relative bg-white dark:bg-[#0b0f19]">
                    <LogViewerPane
                        ref={viewerRef}
                        workerReady={workerReady}
                        totalMatches={totalLines}
                        onScrollRequest={handleScrollRequest}
                        placeholderText="Loading Raw Log..."
                        isRawMode={true}
                        lineHighlightRanges={highlightRanges}
                        initialScrollIndex={targetRange ? Math.max(0, targetRange.startLine - 5) : undefined}
                        preferences={{
                            rowHeight: 20,
                            fontSize: 12,
                            fontFamily: 'Consolas, monospace',
                            levelStyles: [],
                            logLevelOpacity: 20
                        }}
                        isActive={true}
                    />
                </div>
            </div>
        </div>
    );
};
