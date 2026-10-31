import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AnalysisResult, AnalysisSegment } from '../../utils/perfAnalysis';
import { usePerfZoomLogic } from './PerfDashboard/hooks/usePerfZoomLogic';

export interface PerfDashboardStateProps {
    result: AnalysisResult | null;
    isAnalyzing: boolean;
    isActive: boolean;
    isOpen: boolean;
    paneId?: string;
    activeTags?: string[];
    onJumpToRange?: (start: number, end: number) => void;
}

export function usePerfDashboardState({
    result,
    isAnalyzing,
    isActive,
    isOpen,
    paneId,
    activeTags = [],
    onJumpToRange
}: PerfDashboardStateProps) {
    const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'chart' | 'list'>('chart');
    const [minimized, setMinimized] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const flameChartContainerRef = useRef<HTMLDivElement>(null);

    const [isInitialDrawComplete, setIsInitialDrawComplete] = useState(false);
    const [trimRange, setTrimRange] = useState<{ startTime: number; endTime: number } | null>(null);

    const { flameZoom, zoomRef, applyZoom, handleWheelZoom, handleWheelPan, jumpToNavSegmentZoom } = usePerfZoomLogic({
        resultStartTime: result?.startTime ?? 0,
        resultEndTime: result?.endTime ?? 0,
        trimRange,
        onZoomChange: () => { }
    });

    const [measureRange, setMeasureRange] = useState<{ startTime: number, endTime: number } | null>(null);
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const [showOnlyFail, setShowOnlyFail] = useState(false);
    const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
    const [lockedTid, setLockedTid] = useState<string | null>(null);
    const [perfThreshold, setPerfThreshold] = useState<number>(result?.perfThreshold || 1000);
    const [highlightName, setHighlightName] = useState<string | null>(null);

    // --- Milestone Logic ---
    const [milestoneKeywords, setMilestoneKeywords] = useState<string[]>(['OnCreate', 'OnResume', 'OnPause', 'Finished', 'AppStart', 'PageTransitions']);
    const [userMilestones, setUserMilestones] = useState<{ time: number; label: string; color: string }[]>([]);
    const [selectedMilestoneTime, setSelectedMilestoneTime] = useState<number | null>(null);

    const deleteUserMilestone = useCallback((time: number) => {
        setUserMilestones(prev => prev.filter(m => m.time !== time));
        if (selectedMilestoneTime === time) setSelectedMilestoneTime(null);
    }, [selectedMilestoneTime]);

    const updateUserMilestone = useCallback((time: number, newLabel: string) => {
        setUserMilestones(prev => prev.map(m => m.time === time ? { ...m, label: newLabel } : m));
    }, []);

    const addUserMilestone = useCallback((time: number, label: string) => {
        const colors = ['#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#3b82f6'];
        const newMilestone = {
            time,
            label,
            color: colors[(milestoneKeywords.length + userMilestones.length) % colors.length]
        };
        setUserMilestones(prev => [...prev, newMilestone].sort((a, b) => a.time - b.time));
    }, [milestoneKeywords.length, userMilestones.length]);

    // --- Search Token (Tags) Logic ---
    const [searchTerms, setSearchTerms] = useState<string[]>([]);

    const addSearchTerm = useCallback((term: string) => {
        const trimmed = term.trim();
        const lower = trimmed.toLowerCase();
        if (trimmed && !searchTerms.some(t => t.toLowerCase() === lower)) {
            setSearchTerms(prev => [...prev, trimmed]);
        }
    }, [searchTerms]);

    const removeSearchTerm = useCallback((term: string) => {
        const lower = term.toLowerCase();
        setSearchTerms(prev => prev.filter(t => t.toLowerCase() !== lower));
    }, []);

    const checkSegmentMatch = useCallback((s: AnalysisSegment, currentActiveTags: string[]) => {
        // 1. Plugin Active Tags (OR)
        const isTagMatch = currentActiveTags.length === 0 || currentActiveTags.some(tag => {
            const t = tag.toLowerCase();
            return (
                s.name.toLowerCase().includes(t) ||
                (s.fileName && s.fileName.toLowerCase().includes(t)) ||
                (s.functionName && s.functionName.toLowerCase().includes(t)) ||
                (s.logs && s.logs.some(log => log.toLowerCase().includes(t)))
            );
        });
        if (!isTagMatch) return false;

        // 2. Search Box Terms (OR)
        if (searchTerms.length === 0) return true;

        return searchTerms.some(term => {
            const t = term.toLowerCase();
            if (t.startsWith('tid:')) {
                const val = t.substring(4).trim();
                return s.tid?.toLowerCase().includes(val) ?? false;
            }
            if (t.startsWith('file:')) {
                const val = t.substring(5).trim();
                return s.fileName?.toLowerCase().includes(val) ?? false;
            }
            if (t.startsWith('func:')) {
                const val = t.substring(5).trim();
                return s.functionName?.toLowerCase().includes(val) ?? false;
            }

            return (
                s.name.toLowerCase().includes(t) ||
                (s.tid?.toLowerCase().includes(t)) ||
                (s.fileName?.toLowerCase().includes(t)) ||
                (s.functionName?.toLowerCase().includes(t)) ||
                (s.logs?.some(log => log.toLowerCase().includes(t)))
            );
        });
    }, [searchTerms]);

    const navSegments = useMemo(() => {
        if (!result) return [];
        let filtered = [...result.segments];

        if (lockedTid) {
            filtered = filtered.filter(s => s.tid === lockedTid);
        }
        if (searchTerms.length > 0 || activeTags.length > 0) {
            filtered = filtered.filter(s => checkSegmentMatch(s, activeTags));
        }
        if (showOnlyFail) {
            filtered = filtered.filter(s => s.duration >= perfThreshold);
        }
        if (trimRange) {
            filtered = filtered.filter(s =>
                s.startTime < trimRange.endTime && s.endTime > trimRange.startTime
            );
        }
        filtered = filtered.filter(s => s.tid !== 'Global');

        if (lockedTid) {
            return filtered.sort((a, b) => a.startTime - b.startTime);
        }
        if (showOnlyFail) return filtered.sort((a, b) => a.startTime - b.startTime);

        return filtered.sort((a, b) => b.duration - a.duration).slice(0, 500);
    }, [result, showOnlyFail, searchTerms, activeTags, trimRange, lockedTid, checkSegmentMatch, perfThreshold]);

    const currentNavIndex = useMemo(() => {
        if (!selectedSegmentId || navSegments.length === 0) return -1;
        return navSegments.findIndex(s => s.id === selectedSegmentId);
    }, [selectedSegmentId, navSegments]);

    const jumpToNavSegment = useCallback((direction: -1 | 1) => {
        if (!result || navSegments.length === 0) return;

        let targetIndex = currentNavIndex + direction;
        if (targetIndex < 0) targetIndex = navSegments.length - 1;
        if (targetIndex >= navSegments.length) targetIndex = 0;

        const target = navSegments[targetIndex];
        setSelectedSegmentId(target.id);
        setMultiSelectedIds([]);

        jumpToNavSegmentZoom({ startTime: target.startTime, endTime: target.endTime });

        if (onJumpToRange) {
            onJumpToRange(target.startLine, target.endLine);
        }
    }, [result, navSegments, currentNavIndex, onJumpToRange, jumpToNavSegmentZoom]);

    // Keyboard Shortcuts
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Shift') setIsShiftPressed(true);
            if (e.key === 'Escape') {
                setSelectedSegmentId(null);
                setMultiSelectedIds([]);
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                if (isOpen) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (minimized) setMinimized(false);
                    setTimeout(() => {
                        searchRef.current?.focus();
                    }, 50);
                }
            }
        };
        const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setIsShiftPressed(false); };

        if (isActive) {
            window.addEventListener('keydown', onKeyDown);
            window.addEventListener('keyup', onKeyUp);
        }

        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, [isOpen, isActive, minimized]);

    useEffect(() => {
        const handleKeyDownNav = (e: KeyboardEvent) => {
            if (!isActive || !isOpen) return;
            if (e.key === 'F3') {
                e.preventDefault();
                e.stopPropagation();
                jumpToNavSegment(-1);
            } else if (e.key === 'F4') {
                e.preventDefault();
                e.stopPropagation();
                jumpToNavSegment(1);
            }
        };
        window.addEventListener('keydown', handleKeyDownNav);
        return () => window.removeEventListener('keydown', handleKeyDownNav);
    }, [jumpToNavSegment, isActive, isOpen]);

    const dragCleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        return () => {
            if (dragCleanupRef.current) dragCleanupRef.current();
        };
    }, []);

    useEffect(() => {
        if (result) {
            setIsInitialDrawComplete(false);
            if (result.perfThreshold) {
                setPerfThreshold(result.perfThreshold);
            }
        }
    }, [result]);

    const [isScanningStatus, setIsScanningStatus] = useState(isAnalyzing);
    const minScanTimeMs = 1000;
    const scanStartTimeRef = useRef<number>(0);
    const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isAnalyzing) {
            setIsScanningStatus(true);
            setIsInitialDrawComplete(false);
            scanStartTimeRef.current = Date.now();
            if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
        } else {
            const elapsed = Date.now() - scanStartTimeRef.current;
            if (elapsed < minScanTimeMs) {
                scanTimeoutRef.current = setTimeout(() => {
                    setIsScanningStatus(false);
                }, minScanTimeMs - elapsed);
            } else {
                setIsScanningStatus(false);
            }
        }

        return () => {
            if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
        };
    }, [isAnalyzing]);

    // Handle Wheel Events
    useEffect(() => {
        if (!result) return;

        const onGlobalWheel = (e: WheelEvent) => {
            if (!isActive) return;

            const target = e.target as HTMLElement;
            if (!target || typeof target.closest !== 'function') return;

            const dashboard = target.closest('.perf-dashboard-container');
            const logPane = target.closest('.log-viewer-pane');

            let belongsToMe = false;
            if (paneId) {
                belongsToMe = (dashboard?.getAttribute('data-pane-id') === paneId) ||
                    (logPane?.getAttribute('data-pane-id') === paneId);
            } else {
                belongsToMe = !!dashboard || !!logPane;
            }

            if (!belongsToMe) return;

            const currentZoom = zoomRef.current;
            const defaultStart = trimRange?.startTime ?? result.startTime;
            const defaultEnd = trimRange?.endTime ?? result.endTime;
            const currentStart = currentZoom?.startTime ?? defaultStart;
            const currentEnd = currentZoom?.endTime ?? defaultEnd;
            const duration = currentEnd - currentStart;

            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();

                const chartRect = canvasRef.current?.getBoundingClientRect();
                if (!chartRect) return;

                const pointerX = e.clientX - chartRect.left;
                const fractionalPos = Math.max(0, Math.min(1, pointerX / chartRect.width));

                handleWheelZoom(e.deltaY, fractionalPos);
            } else if (!!dashboard && (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey)) {
                e.preventDefault();
                e.stopPropagation();

                const chartRect = canvasRef.current?.getBoundingClientRect();
                if (!chartRect) return;

                const delta = e.deltaX || e.deltaY;
                const panAmount = (delta / chartRect.width) * duration;

                handleWheelPan(panAmount);
            }
        };

        window.addEventListener('wheel', onGlobalWheel, { passive: false });
        return () => window.removeEventListener('wheel', onGlobalWheel);
    }, [result, isActive, paneId, trimRange, handleWheelZoom, handleWheelPan, zoomRef]);

    useEffect(() => {
        if (!isActive) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMilestoneTime !== null) {
                // Check if not in input
                if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
                deleteUserMilestone(selectedMilestoneTime);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive, selectedMilestoneTime, deleteUserMilestone]);

    const milestones = useMemo(() => {
        if (!result) return [];
        return [...userMilestones].sort((a, b) => a.time - b.time);
    }, [result, userMilestones]);


    return {
        selectedSegmentId, setSelectedSegmentId,
        viewMode, setViewMode,
        minimized, setMinimized,
        searchInput, setSearchInput,
        searchTerms, addSearchTerm, removeSearchTerm,
        searchRef, canvasRef, flameChartContainerRef, dragCleanupRef,
        isInitialDrawComplete, setIsInitialDrawComplete,
        trimRange, setTrimRange,
        flameZoom, applyZoom,
        measureRange, setMeasureRange,
        isShiftPressed, showOnlyFail, setShowOnlyFail,
        multiSelectedIds, setMultiSelectedIds,
        lockedTid, setLockedTid,
        perfThreshold, setPerfThreshold,
        navSegments, currentNavIndex, jumpToNavSegment,
        checkSegmentMatch,
        isScanningStatus,
        highlightName, setHighlightName,
        milestones, milestoneKeywords, setMilestoneKeywords,
        addUserMilestone, userMilestones, setUserMilestones,
        selectedMilestoneTime, setSelectedMilestoneTime,
        deleteUserMilestone, updateUserMilestone
    };
}
