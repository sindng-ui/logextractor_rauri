import { useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { convertToConfluenceTable } from '../utils/confluenceUtils';

export interface UseLogExportActionsProps {
    leftWorkerRef: React.MutableRefObject<Worker | null>;
    rightWorkerRef: React.MutableRefObject<Worker | null>;
    leftPendingRequests: React.MutableRefObject<Map<string, (data: any) => void>>;
    rightPendingRequests: React.MutableRefObject<Map<string, (data: any) => void>>;
    leftFilteredCount: number;
    rightFilteredCount: number;
    selectedIndicesLeft: Set<number>;
    selectedIndicesRight: Set<number>;
    setRawContextTargetLine: (target: any) => void;
    setRawContextSourcePane: (pane: 'left' | 'right') => void;
    setRawViewHighlightRange: (range: { start: number; end: number } | null) => void;
    setRawContextOpen: (open: boolean) => void;
    showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
    requestLinesLeft: (start: number, count: number) => Promise<any[]>;
    requestLinesRight: (start: number, count: number) => Promise<any[]>;
}

export const useLogExportActions = (props: UseLogExportActionsProps) => {
    const {
        leftWorkerRef, rightWorkerRef,
        leftPendingRequests, rightPendingRequests,
        leftFilteredCount, rightFilteredCount,
        selectedIndicesLeft, selectedIndicesRight,
        setRawContextTargetLine, setRawContextSourcePane,
        setRawViewHighlightRange, setRawContextOpen,
        showToast,
        requestLinesLeft, requestLinesRight
    } = props;

    const { addToast } = useToast();

    // --- Internal Helpers: Request Full Text ---
    const requestLeftFullText = useCallback(() => {
        return new Promise<string>((resolve) => {
            if (!leftWorkerRef.current) return resolve('');
            const reqId = Math.random().toString(36).substring(7);
            leftPendingRequests.current.set(reqId, (payload: any) => {
                if (payload.buffer) {
                    const decoder = new TextDecoder();
                    resolve(decoder.decode(payload.buffer));
                } else {
                    resolve(payload.text || '');
                }
            });
            leftWorkerRef.current.postMessage({ type: 'GET_FULL_TEXT', requestId: reqId });
        });
    }, [leftWorkerRef, leftPendingRequests]);

    const requestRightFullText = useCallback(() => {
        return new Promise<string>((resolve) => {
            if (!rightWorkerRef.current) return resolve('');
            const reqId = Math.random().toString(36).substring(7);
            rightPendingRequests.current.set(reqId, (payload: any) => {
                if (payload.buffer) {
                    const decoder = new TextDecoder();
                    resolve(decoder.decode(payload.buffer));
                } else {
                    resolve(payload.text || '');
                }
            });
            rightWorkerRef.current.postMessage({ type: 'GET_FULL_TEXT', requestId: reqId });
        });
    }, [rightWorkerRef, rightPendingRequests]);

    const requestBookmarkedLines = useCallback((indices: number[], paneId: 'left' | 'right', isAbsolute: boolean = false) => {
        return new Promise<any[]>((resolve) => {
            const worker = paneId === 'left' ? leftWorkerRef.current : rightWorkerRef.current;
            const requestMap = paneId === 'left' ? leftPendingRequests.current : rightPendingRequests.current;

            if (!worker || indices.length === 0) return resolve([]);

            const reqId = Math.random().toString(36).substring(7);
            requestMap.set(reqId, resolve);
            worker.postMessage({ type: 'GET_LINES_BY_INDICES', payload: { indices, isAbsolute }, requestId: reqId });
        });
    }, [leftWorkerRef, rightWorkerRef, leftPendingRequests, rightPendingRequests]);


    // --- Raw Line Utilities ---
    const requestLeftRawLines = useCallback((startLine: number, count: number) => {
        return new Promise<{ lineNum: number; content: string }[]>((resolve) => {
            if (!leftWorkerRef.current) return resolve([]);
            const reqId = Math.random().toString(36).substring(7);
            leftPendingRequests.current.set(reqId, resolve);
            leftWorkerRef.current.postMessage({ type: 'GET_RAW_LINES', payload: { startLine, count }, requestId: reqId });
        });
    }, [leftWorkerRef, leftPendingRequests]);

    const requestRightRawLines = useCallback((startLine: number, count: number) => {
        return new Promise<{ lineNum: number; content: string }[]>((resolve) => {
            if (!rightWorkerRef.current) return resolve([]);
            const reqId = crypto.randomUUID();
            rightPendingRequests.current.set(reqId, resolve);
            rightWorkerRef.current.postMessage({ type: 'GET_RAW_LINES', payload: { startLine, count }, requestId: reqId });
        });
    }, [rightWorkerRef, rightPendingRequests]);

    const handleViewRawRangeLeft = useCallback(async (start: number, end: number, filteredIndex?: number) => {
        const relativeIndex = start - 1;
        try {
            const lines = await requestLeftRawLines(relativeIndex, 1);
            if (lines && lines.length > 0) {
                setRawContextTargetLine({ ...lines[0], formattedLineIndex: filteredIndex ?? '?' } as any);
                setRawContextSourcePane('left');
                setRawViewHighlightRange({ start, end });
                setRawContextOpen(true);
            }
        } catch (e) {
            console.error('[Export] Failed to view raw range', e);
        }
    }, [requestLeftRawLines, setRawContextTargetLine, setRawContextSourcePane, setRawViewHighlightRange, setRawContextOpen]);

    const handleViewRawRangeRight = useCallback(async (start: number, end: number, filteredIndex?: number) => {
        const relativeIndex = start - 1;
        try {
            const lines = await requestRightRawLines(relativeIndex, 1);
            if (lines && lines.length > 0) {
                setRawContextTargetLine({ ...lines[0], formattedLineIndex: filteredIndex ?? '?' } as any);
                setRawContextSourcePane('right');
                setRawViewHighlightRange({ start, end });
                setRawContextOpen(true);
            }
        } catch (e) {
            console.error('[Export] Failed to view raw range', e);
        }
    }, [requestRightRawLines, setRawContextTargetLine, setRawContextSourcePane, setRawViewHighlightRange, setRawContextOpen]);

    const handleCopyRawRangeLeft = useCallback(async (start: number, end: number) => {
        const count = end - start + 1;
        if (count <= 0) return;
        try {
            const lines = await requestLeftRawLines(start - 1, count);
            if (lines && lines.length > 0) {
                const text = lines.map(l => l.content).join('\n');
                await navigator.clipboard.writeText(text);
                showToast(`${lines.length} lines copied to clipboard!`, 'success');
            }
        } catch (e) {
            console.error('[Export] Failed to copy logs', e);
            showToast('Failed to copy logs.', 'error');
        }
    }, [requestLeftRawLines, showToast]);

    const handleCopyRawRangeRight = useCallback(async (start: number, end: number) => {
        const count = end - start + 1;
        if (count <= 0) return;
        try {
            const lines = await requestRightRawLines(start - 1, count);
            if (lines && lines.length > 0) {
                const text = lines.map(l => l.content).join('\n');
                await navigator.clipboard.writeText(text);
                showToast(`${lines.length} lines copied to clipboard!`, 'success');
            }
        } catch (e) {
            console.error('[Export] Failed to copy logs', e);
            showToast('Failed to copy logs.', 'error');
        }
    }, [requestRightRawLines, showToast]);


    // --- Main Export Actions ---
    const handleCopyLogs = useCallback(async (paneId: 'left' | 'right', ignoreSelection: boolean = true) => {
        const selectedIndices = paneId === 'left' ? selectedIndicesLeft : selectedIndicesRight;
        const hasSelection = !ignoreSelection && selectedIndices.size > 0;
        const count = hasSelection ? selectedIndices.size : (paneId === 'left' ? leftFilteredCount : rightFilteredCount);
        const requestFullText = paneId === 'left' ? requestLeftFullText : requestRightFullText;

        if (count <= 0) {
            showToast('No logs to copy.', 'info');
            return;
        }

        try {
            console.time('copy-fetch');
            let content = '';

            if (hasSelection) {
                // 선택된 라인만 가져오기 🐧🎯
                const sortedIndices = Array.from(selectedIndices).sort((a, b) => a - b);
                const lines = await requestBookmarkedLines(sortedIndices, paneId);
                content = lines.map(l => l.content).join('\n');
            } else if (ignoreSelection) {
                // 버튼 클릭 등으로 인한 '무시 설정'인 경우에만 전체 복사
                content = await requestFullText();
            } else {
                // 단축키인데 아무것도 선택 안된 경우 -> 아무 작업 안 함 (브라우저 기본 동작 등에 맡김)
                return;
            }
            console.timeEnd('copy-fetch');

            content = content.replace(/\r?\n$/, '');

            if (!content && count > 0) {
                showToast('Failed to retrieve log content.', 'error');
                return;
            }

            if ((window as any).electronAPI?.copyToClipboard) {
                await (window as any).electronAPI.copyToClipboard(content);
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(content);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = content;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                } catch (e) {
                    console.error('Fallback copy failed', e);
                    showToast('Failed to copy logs (Fallback error).', 'error');
                    document.body.removeChild(textArea);
                    return;
                }
                document.body.removeChild(textArea);
            }

            const label = hasSelection ? 'selected lines' : 'lines';
            showToast(`Copied ${count.toLocaleString()} ${label}!`, 'success');

        } catch (e) {
            console.error('[Copy] Failed', e);
            showToast('Failed to copy logs.', 'error');
        }
    }, [leftFilteredCount, rightFilteredCount, requestLeftFullText, requestRightFullText, requestBookmarkedLines, selectedIndicesLeft, selectedIndicesRight, showToast]);

    const handleSaveLogs = useCallback(async (paneId: 'left' | 'right', ignoreSelection: boolean = true) => {
        const selectedIndices = paneId === 'left' ? selectedIndicesLeft : selectedIndicesRight;
        const hasSelection = !ignoreSelection && selectedIndices.size > 0;
        const count = hasSelection ? selectedIndices.size : (paneId === 'left' ? leftFilteredCount : rightFilteredCount);
        const requestFullText = paneId === 'left' ? requestLeftFullText : requestRightFullText;

        if (count <= 0) {
            showToast('No logs to save.', 'info');
            return;
        }

        try {
            console.time('save-fetch');
            let content = '';
            if (hasSelection) {
                const sortedIndices = Array.from(selectedIndices).sort((a, b) => a - b);
                const lines = await requestBookmarkedLines(sortedIndices, paneId);
                content = lines.map(l => l.content).join('\n');
            } else if (ignoreSelection) {
                content = await requestFullText();
            } else {
                return;
            }
            console.timeEnd('save-fetch');

            if (!content && count > 0) {
                showToast('Failed to retrieve log content.', 'error');
                return;
            }

            if ((window as any).electronAPI?.saveFile) {
                const result = await (window as any).electronAPI.saveFile(content);
                if (result.status === 'success') {
                    showToast(`Saved to ${result.filePath}`, 'success');
                } else if (result.status === 'error') {
                    showToast(`Save failed: ${result.error}`, 'error');
                }
            } else {
                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `logs_${paneId}_${new Date().getTime()}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('Download triggered (Web)', 'success');
            }
        } catch (e) {
            console.error('[Save] Failed', e);
            showToast('Failed to save logs.', 'error');
        }
    }, [leftFilteredCount, rightFilteredCount, requestLeftFullText, requestRightFullText, requestBookmarkedLines, selectedIndicesLeft, selectedIndicesRight, showToast]);

    const handleCopyAsConfluenceTable = useCallback(async (paneId: 'left' | 'right', forceIgnoreSelection: boolean = false) => {
        const selectedIndices = paneId === 'left' ? selectedIndicesLeft : selectedIndicesRight;
        const hasSelection = !forceIgnoreSelection && selectedIndices.size > 0;
        const count = hasSelection ? selectedIndices.size : (paneId === 'left' ? leftFilteredCount : rightFilteredCount);
        const requestLines = paneId === 'left' ? requestLinesLeft : requestLinesRight;

        if (count <= 0) {
            showToast('No logs to copy.', 'info');
            return;
        }

        if (count > 50000) {
            showToast('Large amount of logs. Processing might take a few seconds...', 'info');
        }

        try {
            console.time('confluence-copy-fetch');
            let lines: any[] = [];
            if (hasSelection) {
                const sortedIndices = Array.from(selectedIndices).sort((a, b) => a - b);
                lines = await requestBookmarkedLines(sortedIndices, paneId);
            } else {
                lines = await requestLines(0, count);
            }
            console.timeEnd('confluence-copy-fetch');

            if (!lines || lines.length === 0) {
                showToast('Failed to retrieve log content.', 'error');
                return;
            }

            const confluenceTable = convertToConfluenceTable(lines);

            if ((window as any).electronAPI?.copyToClipboard) {
                await (window as any).electronAPI.copyToClipboard(confluenceTable);
            } else {
                await navigator.clipboard.writeText(confluenceTable);
            }

            const label = hasSelection ? 'selected lines' : 'lines';
            showToast(`Copied ${count.toLocaleString()} ${label} as Confluence Table!`, 'success');
        } catch (e) {
            console.error('[Confluence Copy] Failed', e);
            showToast('Failed to copy Confluence table.', 'error');
        }
    }, [leftFilteredCount, rightFilteredCount, requestLinesLeft, requestLinesRight, requestBookmarkedLines, selectedIndicesLeft, selectedIndicesRight, showToast]);

    return {
        handleCopyLogs,
        handleSaveLogs,
        handleCopyAsConfluenceTable,
        handleViewRawRangeLeft,
        handleViewRawRangeRight,
        handleCopyRawRangeLeft,
        handleCopyRawRangeRight,
        requestLeftRawLines,
        requestRightRawLines,
        requestBookmarkedLines
    };
};
