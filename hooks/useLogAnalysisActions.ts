import { useState, useCallback, useRef, useEffect } from 'react';
import { LogRule, LogWorkerResponse, SpamLogResult, LatencySpot, HistogramData } from '../types';
import { LogViewerHandle } from '../components/LogViewer/LogViewerPane';

export interface UseLogAnalysisActionsProps {
    leftWorkerRef: React.MutableRefObject<Worker | null>;
    rightWorkerRef: React.MutableRefObject<Worker | null>;
    leftViewerRef: React.RefObject<LogViewerHandle | null>;
    rightViewerRef: React.RefObject<LogViewerHandle | null>;
    rawViewerRef: React.RefObject<LogViewerHandle | null>;
    currentConfig: LogRule | undefined;
    leftSegmentIndex: number;
    rightSegmentIndex: number;
    setLeftSegmentIndex: (idx: number) => void;
    setRightSegmentIndex: (idx: number) => void;
    leftFilteredCount: number;
    rightFilteredCount: number;
    activeLineIndexLeft: number;
    activeLineIndexRight: number;
    setActiveLineIndexLeft: (idx: number) => void;
    setActiveLineIndexRight: (idx: number) => void;
    setSelectedIndicesLeft: (indices: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
    setSelectedIndicesRight: (indices: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
    setRawContextOpen: (open: boolean) => void;
    setRawContextTargetLine: (line: any) => void;
    setRawContextSourcePane: (pane: 'left' | 'right') => void;
    setRawViewHighlightRange: (range: { start: number; end: number } | null) => void;
    showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
    addToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
    leftPendingRequests: React.MutableRefObject<Map<string, (data: any) => void>>;
    rightPendingRequests: React.MutableRefObject<Map<string, (data: any) => void>>;
    pendingJumpLineLeft: React.MutableRefObject<{ index: number, align?: 'start' | 'center' | 'end' } | null>;
    pendingJumpLineRight: React.MutableRefObject<{ index: number, align?: 'start' | 'center' | 'end' } | null>;
    MAX_SEGMENT_SIZE: number;
    leftWorkerReady: boolean;
    rightWorkerReady: boolean;
    setLeftWorkerReady: (ready: boolean) => void;
    setRightWorkerReady: (ready: boolean) => void;
}

export const useLogAnalysisActions = (props: UseLogAnalysisActionsProps) => {
    const {
        leftWorkerRef, rightWorkerRef, leftViewerRef, rightViewerRef, rawViewerRef,
        currentConfig, leftSegmentIndex, rightSegmentIndex,
        setLeftSegmentIndex, setRightSegmentIndex,
        leftFilteredCount, rightFilteredCount,
        activeLineIndexLeft, activeLineIndexRight,
        setActiveLineIndexLeft, setActiveLineIndexRight,
        setSelectedIndicesLeft, setSelectedIndicesRight,
        setRawContextOpen, setRawContextTargetLine, setRawContextSourcePane,
        setRawViewHighlightRange, showToast,
        leftPendingRequests, rightPendingRequests,
        pendingJumpLineLeft, pendingJumpLineRight,
        MAX_SEGMENT_SIZE,
        setLeftWorkerReady, setRightWorkerReady
    } = props;

    // --- State: Transaction Analysis ---
    const [transactionResults, setTransactionResults] = useState<{ lineNum: number, content: string, visualIndex: number }[]>([]);
    const [transactionIdentity, setTransactionIdentity] = useState<{ type: string, value: string } | null>(null);
    const [transactionSourcePane, setTransactionSourcePane] = useState<'left' | 'right'>('left');
    const [isAnalyzingTransaction, setIsAnalyzingTransaction] = useState(false);
    const [isTransactionDrawerOpen, setIsTransactionDrawerOpen] = useState(false);

    // --- State: Performance Analysis ---
    const [leftPerfAnalysisResult, setLeftPerfAnalysisResult] = useState<any>(null);
    const [rightPerfAnalysisResult, setRightPerfAnalysisResult] = useState<any>(null);
    const [isAnalyzingPerformanceLeft, setIsAnalyzingPerformanceLeft] = useState(false);
    const [isAnalyzingPerformanceRight, setIsAnalyzingPerformanceRight] = useState(false);
    const [leftLineHighlightRanges, setLeftLineHighlightRanges] = useState<{ start: number, end: number, color: string }[]>([]);
    const [rightLineHighlightRanges, setRightLineHighlightRanges] = useState<{ start: number, end: number, color: string }[]>([]);

    // --- State: Spam Analysis ---
    const [isAnalyzingSpam, setIsAnalyzingSpam] = useState(false);
    const [spamResultsLeft, setSpamResultsLeft] = useState<SpamLogResult[]>([]);

    // --- State: Latency Spotlight ---
    const [isAnalyzingLatency, setIsAnalyzingLatency] = useState(false);
    const [latencyResults, setLatencyResults] = useState<LatencySpot[]>([]);

    // --- State: Log Histogram ---
    const [leftHistogramData, setLeftHistogramData] = useState<HistogramData | null>(null);
    const [rightHistogramData, setRightHistogramData] = useState<HistogramData | null>(null);

    // --- Effects ---
    // Clear transaction results when drawer is closed
    useEffect(() => {
        if (!isTransactionDrawerOpen) {
            setTransactionResults([]);
            setTransactionIdentity(null);
        }
    }, [isTransactionDrawerOpen]);

    // --- Core Navigation ---
    const jumpToGlobalLine = useCallback((globalIndex: number, paneId: 'left' | 'right' = 'left', align: 'start' | 'center' | 'end' = 'center') => {
        const seg = Math.floor(globalIndex / MAX_SEGMENT_SIZE);
        const rel = globalIndex % MAX_SEGMENT_SIZE;

        if (paneId === 'left') {
            if (seg !== leftSegmentIndex) {
                setLeftSegmentIndex(seg);
                pendingJumpLineLeft.current = { index: rel, align };
            } else {
                leftViewerRef.current?.scrollToIndex(rel, { align });
            }
            setActiveLineIndexLeft(globalIndex);
            setSelectedIndicesLeft(new Set([globalIndex]));
        } else {
            if (seg !== rightSegmentIndex) {
                setRightSegmentIndex(seg);
                pendingJumpLineRight.current = { index: rel, align };
            } else {
                rightViewerRef.current?.scrollToIndex(rel, { align });
            }
            setActiveLineIndexRight(globalIndex);
            setSelectedIndicesRight(new Set([globalIndex]));
        }
    }, [leftSegmentIndex, rightSegmentIndex, MAX_SEGMENT_SIZE, setLeftSegmentIndex, setRightSegmentIndex, setActiveLineIndexLeft, setActiveLineIndexRight, setSelectedIndicesLeft, setSelectedIndicesRight, leftViewerRef, rightViewerRef]);

    const jumpToAbsoluteLine = useCallback(async (absoluteIndex: number, paneId: 'left' | 'right' = 'left') => {
        const worker = paneId === 'left' ? leftWorkerRef.current : rightWorkerRef.current;
        const requestMap = paneId === 'left' ? leftPendingRequests : rightPendingRequests;

        if (!worker) return;

        const result: any = await new Promise((resolve) => {
            const reqId = Math.random().toString(36).substring(7);
            requestMap.current.set(reqId, resolve);
            worker.postMessage({
                type: 'FIND_VISUAL_INDEX',
                payload: { absoluteIndex },
                requestId: reqId
            });
        });

        if (result && result.foundIndex !== -1) {
            jumpToGlobalLine(result.foundIndex, paneId);
        } else {
            showToast('Selected line is not visible in current filter', 'info');
        }
    }, [jumpToGlobalLine, showToast, leftWorkerRef, rightWorkerRef, leftPendingRequests, rightPendingRequests]);

    // --- Analysis Actions ---
    const findText = useCallback(async (text: string, direction: 'next' | 'prev', paneId: 'left' | 'right', startOffset?: number, isWrapRetry = false, silent = false) => {
        const worker = paneId === 'left' ? leftWorkerRef.current : rightWorkerRef.current;
        const viewer = paneId === 'left' ? leftViewerRef.current : rightViewerRef.current;
        const currentLineIdx = paneId === 'left' ? activeLineIndexLeft : activeLineIndexRight;
        const totalCount = paneId === 'left' ? leftFilteredCount : rightFilteredCount;
        const requestMap = paneId === 'left' ? leftPendingRequests : rightPendingRequests;
        if (!worker) return;

        let startIdx = currentLineIdx !== -1 ? currentLineIdx : (viewer?.getScrollTop() ? Math.floor(viewer.getScrollTop() / 24) : 0);
        if (startOffset !== undefined) startIdx = startOffset;

        const result: any = await new Promise((resolve) => {
            const reqId = Math.random().toString(36).substring(7);
            requestMap.current.set(reqId, resolve);
            worker.postMessage({
                type: 'FIND_HIGHLIGHT',
                payload: { keyword: text, startIndex: startIdx, direction },
                requestId: reqId
            });
        });

        if (result && result.foundIndex !== -1 && viewer) {
            jumpToGlobalLine(result.foundIndex, paneId);
            const lineNumDisplay = result.originalLineNum ? result.originalLineNum : (result.foundIndex + 1);
            if (!silent) {
                if (isWrapRetry) showToast(`Found "${text}" at line ${lineNumDisplay} (Wrapped)`, 'success');
                else showToast(`Found "${text}" at line ${lineNumDisplay}`, 'success');
            }
        } else {
            if (!isWrapRetry && totalCount > 0) {
                const wrapStart = direction === 'next' ? -1 : totalCount;
                findText(text, direction, paneId, wrapStart, true, silent);
            } else {
                if (!silent) showToast(`"${text}" not found`, 'info');
            }
        }
    }, [activeLineIndexLeft, activeLineIndexRight, leftFilteredCount, rightFilteredCount, showToast, jumpToGlobalLine, leftWorkerRef, rightWorkerRef, leftViewerRef, rightViewerRef, leftPendingRequests, rightPendingRequests]);

    const jumpToHighlight = useCallback(async (highlightIndex: number, paneId: 'left' | 'right') => {
        if (!currentConfig || !currentConfig.highlights || !currentConfig.highlights[highlightIndex]) return;
        const keyword = currentConfig.highlights[highlightIndex].keyword;
        findText(keyword, 'next', paneId, undefined, false, true);
    }, [currentConfig, findText]);

    const analyzeTransactionAction = useCallback(async (identity: { type: string, value: string }, paneId: 'left' | 'right') => {
        const worker = paneId === 'left' ? leftWorkerRef.current : rightWorkerRef.current;
        const requestMap = paneId === 'left' ? leftPendingRequests : rightPendingRequests;
        if (!worker) return;

        setTransactionIdentity(identity);
        setTransactionSourcePane(paneId);
        setIsTransactionDrawerOpen(true);
        setIsAnalyzingTransaction(true);
        setTransactionResults([]);

        const reqId = Math.random().toString(36).substring(7);
        const result: any = await new Promise((resolve) => {
            requestMap.current.set(reqId, resolve);
            worker.postMessage({
                type: 'ANALYZE_TRANSACTION',
                payload: { identity },
                requestId: reqId
            });
        });

        if (Array.isArray(result)) {
            setTransactionResults(result);
        } else {
            console.warn(`[TransactionAction] Worker returned unexpected result format:`, result);
        }
        setIsAnalyzingTransaction(false);
    }, [leftWorkerRef, rightWorkerRef, leftPendingRequests, rightPendingRequests]);

    const handleAnalyzePerformanceLeft = useCallback(() => {
        if (leftPerfAnalysisResult || isAnalyzingPerformanceLeft) {
            setLeftPerfAnalysisResult(null);
            setIsAnalyzingPerformanceLeft(false);
            return;
        }
        setIsAnalyzingPerformanceLeft(true);
        const threshold = currentConfig?.perfThreshold ?? 1000;
        leftWorkerRef.current?.postMessage({
            type: 'PERF_ANALYSIS',
            payload: { targetTime: threshold, updatedRule: currentConfig }
        });
    }, [leftPerfAnalysisResult, isAnalyzingPerformanceLeft, currentConfig, leftWorkerRef]);

    const handleAnalyzePerformanceRight = useCallback(() => {
        if (rightPerfAnalysisResult || isAnalyzingPerformanceRight) {
            setRightPerfAnalysisResult(null);
            setIsAnalyzingPerformanceRight(false);
            return;
        }
        setIsAnalyzingPerformanceRight(true);
        const threshold = currentConfig?.perfThreshold ?? 1000;
        rightWorkerRef.current?.postMessage({
            type: 'PERF_ANALYSIS',
            payload: { targetTime: threshold, updatedRule: currentConfig }
        });
    }, [rightPerfAnalysisResult, isAnalyzingPerformanceRight, currentConfig, rightWorkerRef]);

    const requestSpamAnalysisLeft = useCallback(() => {
        if (!leftWorkerRef.current || leftFilteredCount === 0) return;
        setIsAnalyzingSpam(true);
        leftWorkerRef.current.postMessage({ type: 'ANALYZE_SPAM' });
    }, [leftFilteredCount, leftWorkerRef]);

    const requestLatencyAnalysis = useCallback((thresholdMs?: number) => {
        if (!leftWorkerRef.current || leftFilteredCount === 0) return;
        setIsAnalyzingLatency(true);
        leftWorkerRef.current.postMessage({
            type: 'ANALYZE_LATENCY',
            payload: { thresholdMs }
        });
    }, [leftFilteredCount, leftWorkerRef]);

    const handleJumpToLineLeft = useCallback((lineNum: number) => {
        jumpToGlobalLine(lineNum, 'left', 'center');
    }, [jumpToGlobalLine]);

    const handleJumpToLineRight = useCallback((lineNum: number) => {
        jumpToGlobalLine(lineNum, 'right', 'center');
    }, [jumpToGlobalLine]);

    const handleJumpToRangeLeft = useCallback((start: number, end: number) => {
        setLeftLineHighlightRanges([{ start, end, color: 'rgba(99, 102, 241, 0.3)' }]);
        jumpToGlobalLine(start, 'left', 'center'); // 🐧⚡ 중앙 정렬!

        const newSelection = new Set<number>();
        for (let i = start; i <= end; i++) newSelection.add(i);
        setSelectedIndicesLeft(newSelection);
    }, [jumpToGlobalLine, setSelectedIndicesLeft]);

    const handleJumpToRangeRight = useCallback((start: number, end: number) => {
        setRightLineHighlightRanges([{ start, end, color: 'rgba(99, 102, 241, 0.3)' }]);
        jumpToGlobalLine(start, 'right', 'center'); // 🐧⚡ 중앙 정렬!

        const newSelection = new Set<number>();
        for (let i = start; i <= end; i++) newSelection.add(i);
        setSelectedIndicesRight(newSelection);
    }, [jumpToGlobalLine, setSelectedIndicesRight]);

    // --- Message Handling Delegation ---
    const handleAnalysisMessage = useCallback((pane: 'left' | 'right', type: string, payload: any) => {
        if (pane === 'left') {
            switch (type) {
                case 'PERF_ANALYSIS_RESULT':
                    setLeftPerfAnalysisResult(payload);
                    setIsAnalyzingPerformanceLeft(false);
                    return true;
                case 'SPAM_ANALYSIS_RESULT':
                    setSpamResultsLeft(payload.results || []);
                    setIsAnalyzingSpam(false);
                    return true;
                case 'LATENCY_ANALYSIS_RESULT':
                    setLatencyResults(payload.results || []);
                    setIsAnalyzingLatency(false);
                    return true;
                case 'HISTOGRAM_DATA':
                    setLeftHistogramData(payload);
                    return true;
            }
        } else {
            switch (type) {
                case 'PERF_ANALYSIS_RESULT':
                    setRightPerfAnalysisResult(payload);
                    setIsAnalyzingPerformanceRight(false);
                    return true;
                case 'HISTOGRAM_DATA':
                    setRightHistogramData(payload);
                    return true;
            }
        }
        return false;
    }, []);

    return {
        // Functions
        jumpToGlobalLine,
        jumpToAbsoluteLine,
        findText,
        jumpToHighlight,
        analyzeTransactionAction,
        handleAnalyzePerformanceLeft,
        handleAnalyzePerformanceRight,
        requestSpamAnalysisLeft,
        handleJumpToLineLeft,
        handleJumpToLineRight,
        handleJumpToRangeLeft,
        handleJumpToRangeRight,
        handleAnalysisMessage,

        // State & Getters
        transactionResults,
        transactionIdentity,
        transactionSourcePane,
        isAnalyzingTransaction,
        isTransactionDrawerOpen,
        setIsTransactionDrawerOpen,

        leftPerfAnalysisResult,
        rightPerfAnalysisResult,
        isAnalyzingPerformanceLeft,
        isAnalyzingPerformanceRight,
        leftLineHighlightRanges,
        rightLineHighlightRanges,
        setLeftLineHighlightRanges,
        setRightLineHighlightRanges,

        isAnalyzingSpam,
        spamResultsLeft,
        setSpamResultsLeft,

        isAnalyzingLatency,
        latencyResults,
        setLatencyResults,
        requestLatencyAnalysis,

        leftHistogramData,
        rightHistogramData,
        setLeftHistogramData,
        setRightHistogramData
    };
};
