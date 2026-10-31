import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, AlertTriangle, ArrowRight, ArrowDown, ArrowUp, RefreshCw, List, LayoutDashboard, TrendingUp, TrendingDown, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { SplitAnalysisResult, PointAnalysisResult } from '../../hooks/useSplitAnalysis';

interface SplitAnalyzerPanelProps {
    results: { results: SplitAnalysisResult[], pointResults: PointAnalysisResult[] } | null;
    isLoading?: boolean;
    progress?: number;
    onClose: () => void;
    onJumpToRange?: (side: 'left' | 'right', startLine: number, endLine: number) => void;
    onViewRawSplit?: (res: SplitAnalysisResult) => void;
    height?: number; // ✅ Support variable height
}

type AnalysisTab = 'summary' | 'timeline';

export const SplitAnalyzerPanel: React.FC<SplitAnalyzerPanelProps> = ({ results, isLoading, progress = 0, onClose, onJumpToRange, onViewRawSplit, height = 350 }) => {
    const [activeTab, setActiveTab] = useState<AnalysisTab>('summary');
    // 🐧⚡ Manage via selectedIndex (number) instead of selectedKey (string) -> Precise tracking even with duplicate keys
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);
    const [summaryFilter, setSummaryFilter] = useState<'regression' | 'improvement' | 'stable'>('regression');
    const [pointNavigation, setPointNavigation] = useState<Record<string, number>>({});

    // 🐧⚡ Added Timeline paging state (to prevent freezing)
    const [timelinePage, setTimelinePage] = useState(1);
    const PAGE_SIZE = 50;

    const handlePointJump = (sig: string, indices: number[], direction: 'next' | 'prev' | 'first') => {
        const currentIdx = pointNavigation[sig] || 0;
        let nextIdx = 0;
        if (direction === 'next') nextIdx = (currentIdx + 1) % indices.length;
        else if (direction === 'prev') nextIdx = (currentIdx - 1 + indices.length) % indices.length;
        else nextIdx = 0;

        setPointNavigation(prev => ({ ...prev, [sig]: nextIdx }));
        const visualIdx = indices[nextIdx];
        onJumpToRange?.('right', visualIdx, visualIdx);
    };

    const sortedResults = useMemo(() => {
        if (!results || !results.results) return [];
        return [...results.results]
            .filter(r => (r.leftAvgDelta > 0 && r.rightAvgDelta > 0) || r.isAliasInterval)
            .sort((a, b) => {
                const aIdx = a.leftPrevLineNum || a.rightPrevLineNum || 0;
                const bIdx = b.leftPrevLineNum || b.rightPrevLineNum || 0;
                return aIdx - bIdx;
            });
    }, [results]);

    // 🐧⚡ selectedKey: Derived from selectedIndex (resolves declaration order issues)
    const selectedKey = selectedIndex >= 0 && sortedResults.length > 0 ? sortedResults[selectedIndex]?.key ?? null : null;

    const summaryData = useMemo(() => {
        if (!results) return null;
        const intervalResults = (results.results || []).filter(r => (r.leftAvgDelta > 0 && r.rightAvgDelta > 0) || r.isAliasInterval);
        const pointResults = results.pointResults || [];

        const totalNodes = intervalResults.length;
        const regressions = intervalResults.filter(r => r.deltaDiff > 20).length;
        const improvements = intervalResults.filter(r => r.deltaDiff < -20).length;
        const stable = intervalResults.filter(r => Math.abs(r.deltaDiff) <= 20).length;
        const newLogsCount = pointResults.length;

        // Categorized lists
        const regressionList = intervalResults.filter(r => r.deltaDiff > 20).sort((a, b) => b.deltaDiff - a.deltaDiff);
        const improvementList = intervalResults.filter(r => r.deltaDiff < -20).sort((a, b) => a.deltaDiff - b.deltaDiff);
        const stableList = intervalResults.filter(r => Math.abs(r.deltaDiff) <= 20).sort((a, b) => Math.abs(b.deltaDiff) - Math.abs(a.deltaDiff));

        const topNewLogs = pointResults.slice(0, 100);

        return {
            totalNodes, regressions, improvements, stable, newLogsCount,
            regressionList, improvementList, stableList, topNewLogs
        };
    }, [results]);

    const formatDelta = (ms: number) => {
        if (ms === 0) return '0.0ms';
        if (Math.abs(ms) < 1) return `${ms.toFixed(3)}ms`;
        return `${ms.toFixed(1)}ms`;
    };


    const handleItemClick = (res: SplitAnalysisResult, isSinglePoint: boolean = false, explicitIndex?: number) => {
        // 🐧⚡ Index-based tracking for selected position (handles duplicate keys)
        const idx = explicitIndex !== undefined ? explicitIndex : sortedResults.indexOf(res);
        setSelectedIndex(idx);

        // Auto-scroll within Timeline list (Focus) - paging check needed
        if (activeTab === 'timeline') {
            if (idx !== -1) {
                const requiredPage = Math.floor(idx / PAGE_SIZE) + 1;
                if (requiredPage !== timelinePage) {
                    setTimelinePage(requiredPage);
                }
            }
        }

        setTimeout(() => {
            const element = document.getElementById(`segment-${res.key}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);

        if (!onJumpToRange) return;

        // 🐧🔍 Debug: Check actual lineNum values being passed
        console.log('[SplitAnalyzerPanel] Jump info:', {
            key: res.key,
            leftLineNum: res.leftLineNum, leftPrevLineNum: res.leftPrevLineNum,
            rightLineNum: res.rightLineNum, rightPrevLineNum: res.rightPrevLineNum,
            isBurst: res.isBurst, burstCount: res.burstCount,
            burstEndLineNum: res.burstEndLineNum,
            isAliasInterval: res.isAliasInterval, isAliasMatch: res.isAliasMatch, isNewError: res.isNewError
        });

        // 🐧🎯 Jump Logic
        // 1. Alias INTERVAL: PrevLineNum ~ LineNum (Range)
        // 2. Alias MATCH (Point): That point only (Single)
        // 3. New Error: That point only (Single)
        // 4. 🐧⚡ Burst: First occurrence (rightLineNum) ~ Last occurrence (burstEndLineNum)

        const isInterval = res.isAliasInterval || (!res.isAliasMatch && !res.isNewError);
        const forceSingle = !isInterval || isSinglePoint;

        if (res.isBurst && !isSinglePoint) {
            // Burst: Jump to range from first to last occurrence (both panels)
            const leftStart = res.leftPrevLineNum ?? 0;
            const leftEnd = res.burstEndLeftLineNum ?? res.leftLineNum;
            const rightStart = res.rightPrevLineNum ?? 0;
            const rightEnd = res.burstEndLineNum ?? res.rightLineNum;

            if (res.leftLineNum !== undefined && res.leftLineNum >= 0) {
                onJumpToRange('left', leftStart, leftEnd);
            }
            if (res.rightLineNum !== undefined && res.rightLineNum >= 0) {
                onJumpToRange('right', rightStart, rightEnd);
            }
            return;
        }

        // Jump Left
        if (res.leftLineNum !== undefined && res.leftLineNum >= 0) {
            const rawStart = forceSingle ? res.leftLineNum : (res.leftPrevLineNum ?? res.leftLineNum);
            // 🐧⚡ If start is greater than end, perform a single jump to end (current position)
            const start = (rawStart >= 0 && rawStart <= res.leftLineNum) ? rawStart : res.leftLineNum;
            const end = res.leftLineNum;
            console.log('[SplitAnalyzerPanel] Jump LEFT:', start, '->', end);
            onJumpToRange('left', start, end);
        }

        // Jump Right
        if (res.rightLineNum !== undefined && res.rightLineNum >= 0) {
            const rawStart = forceSingle ? res.rightLineNum : (res.rightPrevLineNum ?? res.rightLineNum);
            // 🐧⚡ If start is greater than end, perform a single jump to end (current position)
            const start = (rawStart >= 0 && rawStart <= res.rightLineNum) ? rawStart : res.rightLineNum;
            const end = res.rightLineNum;
            console.log('[SplitAnalyzerPanel] Jump RIGHT:', start, '->', end);
            onJumpToRange('right', start, end);
        }
    };

    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: height, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="w-full bg-slate-950 border-b border-blue-500/30 flex flex-col overflow-hidden shadow-xl font-sans text-gray-300"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 mr-4">
                        <Zap className="w-4 h-4 text-blue-400" />
                        <h3 className="text-sm font-bold text-slate-100">Analysis Engine</h3>
                    </div>

                    {/* Tabs */}
                    <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 shadow-inner">
                        <button
                            onClick={() => setActiveTab('summary')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-black transition-all ${activeTab === 'summary' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <LayoutDashboard size={12} /> SUMMARY
                        </button>
                        <button
                            onClick={() => setActiveTab('timeline')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-black transition-all ${activeTab === 'timeline' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Activity size={12} /> TIMELINE
                        </button>
                    </div>

                    {isLoading || (progress > 0 && progress < 100) ? (
                        <div className="flex items-center gap-3 ml-4 bg-blue-500/5 px-3 py-1 rounded border border-blue-500/10">
                            <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
                            <span className="text-[10px] text-blue-400 font-black animate-pulse uppercase tracking-[0.2em]">
                                ANALYZING LOGS{'.'.repeat((Math.floor(Date.now() / 500) % 3) + 1)} {progress}%
                            </span>
                        </div>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col relative min-h-0 bg-[#0c1117]">

                {isLoading && !results ? (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                        <div className="relative mb-6">
                            <RefreshCw className="w-16 h-16 text-blue-500/20 animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Zap className="w-8 h-8 text-blue-500 animate-pulse" />
                            </div>
                        </div>
                        <p className="text-blue-100 font-bold text-xl tracking-tight mb-2">Engaging Analysis Core...</p>
                        <p className="text-xs text-blue-400/60 font-black uppercase tracking-[0.4em] animate-pulse">
                            CALCULATING DELTAS & FREQUENCY ({progress}%)
                        </p>
                        <div className="mt-8 w-64 h-1.5 bg-slate-800 rounded-full overflow-hidden shadow-inner">
                            <motion.div
                                className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ ease: "easeOut" }}
                            />
                        </div>
                    </div>
                ) : null}

                <AnimatePresence mode="wait">
                    {activeTab === 'summary' && summaryData ? (
                        <motion.div
                            key="summary"
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 20, opacity: 0 }}
                            className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3"
                        >
                            {/* Summary Cards */}
                            <div className="grid grid-cols-5 gap-2 mb-3">
                                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-2 shadow-sm hover:border-blue-500/30 transition-all text-center">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Total Mapped Nodes</p>
                                    <div className="flex items-baseline justify-center gap-1.5 pt-1">
                                        <span className="text-3xl font-black text-white tracking-tighter leading-none">{summaryData.totalNodes}</span>
                                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-tight">Nodes</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSummaryFilter('regression')}
                                    className={`bg-slate-900/50 border p-2 rounded-xl shadow-sm transition-all text-center ${summaryFilter === 'regression' ? 'border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/20' : 'border-slate-800 hover:border-orange-500/30'}`}
                                >
                                    <div className="flex items-center justify-between mb-0.5">
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Regressions</p>
                                        <TrendingUp className={`w-3 h-3 ${summaryData.regressions > 0 ? 'text-orange-500' : 'text-slate-700'}`} />
                                    </div>
                                    <div className="flex items-baseline justify-center gap-1.5 pt-1">
                                        <span className={`text-3xl font-black tracking-tighter leading-none ${summaryData.regressions > 0 ? 'text-orange-400' : 'text-slate-400'}`}>{summaryData.regressions}</span>
                                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-tight">Slower</span>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setSummaryFilter('improvement')}
                                    className={`bg-slate-900/50 border p-2 rounded-xl shadow-sm transition-all text-center ${summaryFilter === 'improvement' ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20' : 'border-slate-800 hover:border-emerald-500/30'}`}
                                >
                                    <div className="flex items-center justify-between mb-0.5">
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Improvements</p>
                                        <TrendingDown className={`w-3 h-3 ${summaryData.improvements > 0 ? 'text-emerald-500' : 'text-slate-700'}`} />
                                    </div>
                                    <div className="flex items-baseline justify-center gap-1.5 pt-1">
                                        <span className={`text-3xl font-black tracking-tighter leading-none ${summaryData.improvements > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>{summaryData.improvements}</span>
                                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-tight">Faster</span>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setSummaryFilter('stable')}
                                    className={`bg-slate-900/50 border p-2 rounded-xl shadow-sm transition-all text-center ${summaryFilter === 'stable' ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/20' : 'border-slate-800 hover:border-indigo-500/30'}`}
                                >
                                    <div className="flex items-center justify-between mb-0.5">
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Stable</p>
                                        <Zap className={`w-3 h-3 ${summaryData.stable > 0 ? 'text-indigo-400' : 'text-slate-700'}`} />
                                    </div>
                                    <div className="flex items-baseline justify-center gap-1.5 pt-1">
                                        <span className={`text-3xl font-black tracking-tighter leading-none ${summaryData.stable > 0 ? 'text-indigo-400' : 'text-slate-400'}`}>{summaryData.stable}</span>
                                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-tight">STABLE</span>
                                    </div>
                                </button>
                                <div className="bg-slate-900/50 border border-slate-800 p-2 rounded-xl shadow-sm hover:border-blue-500/30 transition-all text-center">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">New Logs</p>
                                        <Activity className="w-3 h-3 text-blue-400" />
                                    </div>
                                    <div className="flex items-baseline justify-center gap-1.5 pt-1">
                                        <span className="text-3xl font-black text-blue-400 tracking-tighter leading-none">{summaryData.newLogsCount}</span>
                                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-tight">Added</span>
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Insights: 2-Column Layout */}
                            <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
                                {/* LEFT COLUMN: Dynamic Filtered List */}
                                <div className="bg-slate-900/30 rounded-xl border border-slate-800/80 overflow-hidden flex flex-col min-h-0">
                                    <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-800 flex items-center gap-2">
                                        {summaryFilter === 'regression' && <TrendingUp size={14} className="text-orange-400" />}
                                        {summaryFilter === 'improvement' && <TrendingDown size={14} className="text-emerald-400" />}
                                        {summaryFilter === 'stable' && <Zap size={14} className="text-indigo-400" />}

                                        <div className="flex items-center justify-between flex-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest">
                                                    {summaryFilter === 'regression' && 'Performance Regressions'}
                                                    {summaryFilter === 'improvement' && 'Performance Improvements'}
                                                    {summaryFilter === 'stable' && 'Stable Performance Nodes'}
                                                </h4>
                                                <span className={`text-[10px] font-mono font-black px-1.5 rounded-full border ${summaryFilter === 'regression' ? 'text-orange-400 bg-orange-400/10 border-orange-500/20' :
                                                    summaryFilter === 'improvement' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20' :
                                                        'text-indigo-400 bg-indigo-400/10 border-indigo-500/20'
                                                    }`}>
                                                    {summaryFilter === 'regression' ? summaryData.regressionList.length :
                                                        summaryFilter === 'improvement' ? summaryData.improvementList.length :
                                                            summaryData.stableList.length}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
                                        <AnimatePresence mode="wait">
                                            <motion.div
                                                key={summaryFilter}
                                                initial={{ y: 20, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                exit={{ y: -20, opacity: 0 }}
                                                transition={{ duration: 0.15, ease: "easeOut" }}
                                                className="absolute inset-0 overflow-y-auto custom-scrollbar p-1 flex flex-col gap-1"
                                            >
                                                {(() => {
                                                    const list = summaryFilter === 'regression' ? summaryData.regressionList :
                                                        summaryFilter === 'improvement' ? summaryData.improvementList :
                                                            summaryData.stableList;

                                                    if (list.length === 0) {
                                                        return <div className="flex items-center justify-center p-8 text-xs text-slate-600 italic">No items in this category.</div>;
                                                    }

                                                    return list.map((res: any, i: number) => {
                                                        const isImprovement = res.deltaDiff < 0;
                                                        const isStable = Math.abs(res.deltaDiff) <= 20;
                                                        const themeColor = isStable ? 'indigo' : (isImprovement ? 'emerald' : 'orange');
                                                        const Icon = isStable ? Zap : (isImprovement ? TrendingDown : TrendingUp);
                                                        const isSelected = selectedKey === res.key;

                                                        return (
                                                            <div
                                                                key={i}
                                                                onClick={() => handleItemClick(res)}
                                                                onDoubleClick={() => onViewRawSplit?.(res)}
                                                                className={`group relative flex bg-slate-950/40 rounded-xl border transition-all cursor-pointer overflow-hidden min-h-[100px] ${isSelected
                                                                    ? `border-${themeColor}-500/50 bg-${themeColor}-500/10 ring-1 ring-${themeColor}-500/20`
                                                                    : 'border-slate-800/50 hover:border-slate-800 hover:bg-slate-900/40'
                                                                    }`}
                                                            >
                                                                {isSelected && <div className={`absolute left-0 top-0 bottom-0 w-1 bg-${themeColor}-500`} />}

                                                                <div className="flex-1 px-3 py-1.5 flex items-center">
                                                                    <div className="flex-1 flex flex-col gap-0.5 min-w-0 pr-4">
                                                                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-slate-900/40 ${res.isGlobalBatch ? 'border-violet-500/20' : 'border-slate-800/50'} opacity-60`}>
                                                                            <span className="text-[10px] font-mono text-slate-400 truncate">
                                                                                {res.prevFileName || res.fileName}
                                                                                <span className="text-slate-200/30 mx-1.5">:</span>
                                                                                <span className="text-slate-300">{res.prevFunctionName || res.functionName}</span>
                                                                                <span className="text-slate-500 ml-1.5 font-bold">({res.leftCodeLineNum || res.leftOrigLineNum || res.leftLineNum})</span>
                                                                            </span>
                                                                        </div>

                                                                        <div className="flex px-6 my-[-6px] opacity-30">
                                                                            <ArrowDown size={14} className={`text-${themeColor}-500`} />
                                                                        </div>

                                                                        <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-950 border border-${themeColor}-500/20`}>
                                                                            <div className={`w-1.5 h-1.5 rounded-full bg-${themeColor}-500 shrink-0 ${!isStable ? 'animate-pulse' : ''}`} />
                                                                            <span className="text-[11px] font-black text-white truncate flex-1 leading-tight">
                                                                                {res.fileName} <span className="text-slate-500 mx-1.5">:</span> {res.functionName || res.preview.substring(0, 50)}
                                                                                <span className={`text-[10px] text-${themeColor}-400/70 ml-2 font-mono`}>
                                                                                    ({(res.rightCodeLineNum || res.rightOrigLineNum || res.rightLineNum)})
                                                                                </span>
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="w-[180px] shrink-0 flex flex-col items-center justify-center gap-1 border-x border-slate-800/30 px-4">
                                                                        <div className={`px-4 py-2 rounded-full flex items-center gap-2 bg-${themeColor}-500/10 border border-${themeColor}-500/20 shadow-lg shadow-${themeColor}-500/5`}>
                                                                            <Icon size={14} className={`text-${themeColor}-400`} />
                                                                            <span className={`text-[14px] font-black text-${themeColor}-400 font-mono tracking-tight`}>
                                                                                {`${res.deltaDiff > 0 ? '+' : ''}${formatDelta(res.deltaDiff)}`}
                                                                            </span>
                                                                        </div>
                                                                        <span className={`text-[9px] font-black text-${themeColor}-400/60 uppercase tracking-[0.2em]`}>
                                                                            {isStable ? 'STABLE' : (isImprovement ? 'IMPROVEMENT' : 'REGRESSION')}
                                                                        </span>
                                                                    </div>

                                                                    <div className="w-[120px] shrink-0 flex flex-col justify-center gap-2 pl-6">
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">LEFT AVG</span>
                                                                            <span className="text-[12px] font-mono text-slate-400 font-bold">{formatDelta(res.leftAvgDelta)}</span>
                                                                        </div>
                                                                        <div className="flex flex-col gap-0.5 border-t border-slate-800/40 pt-1.5">
                                                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">RIGHT AVG</span>
                                                                            <span className="text-[12px] font-mono text-white font-black">{formatDelta(res.rightAvgDelta)}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    });
                                                })()}
                                            </motion.div>
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* RIGHT COLUMN: Fixed New Logs List */}
                                <div className="bg-slate-900/30 rounded-xl border border-slate-800/80 overflow-hidden flex flex-col min-h-0">
                                    <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-800 flex items-center gap-2">
                                        <Activity size={14} className="text-blue-400" />
                                        <div className="flex items-center justify-between flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">NEW SIGNIFICANT LOGS (ONLY RIGHT)</span>
                                                <span className="text-[10px] font-mono text-blue-400 bg-blue-400/10 px-1.5 rounded-full border border-blue-500/20">{summaryData.topNewLogs.length}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-1 flex flex-col gap-1">
                                        {summaryData.topNewLogs.length > 0 ? summaryData.topNewLogs.map((res: PointAnalysisResult, i) => {
                                            const sig = res.sig;
                                            const currentNavIdx = pointNavigation[sig] || 0;
                                            const totalOccurrences = res.visualIndices.length;

                                            return (
                                                <div
                                                    key={i}
                                                    className="flex flex-col bg-slate-950/50 rounded-lg border border-slate-800/50 hover:border-blue-500/30 transition-all group overflow-hidden"
                                                >
                                                    <div className="flex items-center p-1.5 gap-2 border-b border-slate-800/30 bg-slate-900/40">
                                                        <div className="flex flex-col flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5 overflow-hidden">
                                                                <span className="text-[8px] font-black text-blue-400 shrink-0 uppercase tracking-tighter">NEW LOG</span>
                                                                <span className="text-[8px] font-mono text-slate-500 truncate">{res.fileName}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-black text-slate-200 truncate">{res.functionName || 'UNKNOWN'}</span>
                                                                {res.codeLineNum && <span className="text-[9px] text-slate-500 font-mono">({res.codeLineNum})</span>}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end shrink-0">
                                                            <span className="text-[10px] font-black text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded border border-blue-500/20">{res.count}#</span>
                                                        </div>
                                                    </div>

                                                    <div className="px-2 py-1.5 flex items-center justify-between gap-2 bg-slate-950/80">
                                                        <div className="flex-1 min-w-0">
                                                            <span className="text-[9px] text-slate-400 font-mono italic truncate block">
                                                                "{res.preview.substring(0, 50)}"
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1 bg-slate-900 px-1 rounded-md border border-slate-800">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handlePointJump(sig, res.visualIndices, 'prev'); }}
                                                                className="p-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                                                            >
                                                                <ChevronLeft size={12} />
                                                            </button>
                                                            <span className="text-[9px] font-mono font-bold text-slate-300 min-w-[30px] text-center">
                                                                {currentNavIdx + 1}/{totalOccurrences}
                                                            </span>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handlePointJump(sig, res.visualIndices, 'next'); }}
                                                                className="p-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                                                            >
                                                                <ChevronRight size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }) : (
                                            <div className="flex items-center justify-center p-8 text-xs text-slate-600 italic">No new significant logs detected.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="timeline"
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -20, opacity: 0 }}
                            className="flex-1 flex flex-col min-h-0"
                        >
                            {/* Navigation Controls */}
                            <div className="flex items-center justify-between px-4 py-2 bg-slate-900/60 border-b border-slate-800/80 sticky top-0 z-30 backdrop-blur-md">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Navigation</span>
                                    <div className="h-3 w-px bg-slate-800 mx-1" />
                                    <span className="text-[10px] font-mono text-blue-400 font-bold">
                                        {selectedKey ? `${sortedResults.findIndex(r => r.key === selectedKey) + 1} / ${sortedResults.length}` : `Total ${sortedResults.length}`}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => {
                                            if (sortedResults.length === 0) return;
                                            // 🐧⚡ Index-based: Go to last if no selectedIndex
                                            const idx = selectedIndex;
                                            if (idx > 0) {
                                                const prevRes = sortedResults[idx - 1];
                                                handleItemClick(prevRes, false, idx - 1);
                                            } else {
                                                // Looping: Press PREV at start to go to the last
                                                const lastIdx = sortedResults.length - 1;
                                                handleItemClick(sortedResults[lastIdx], false, lastIdx);
                                            }
                                        }}
                                        disabled={sortedResults.length === 0}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-[10px] font-black text-slate-400 hover:text-white hover:border-blue-500/50 disabled:opacity-30 disabled:pointer-events-none transition-all"
                                    >
                                        <ArrowUp size={12} strokeWidth={3} /> PREV
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (sortedResults.length === 0) return;
                                            // 🐧⚡ Index-based: Start from beginning if no selectedIndex
                                            const idx = selectedIndex;
                                            if (idx >= 0 && idx < sortedResults.length - 1) {
                                                const nextRes = sortedResults[idx + 1];
                                                handleItemClick(nextRes, false, idx + 1);
                                            } else {
                                                // Looping: Press NEXT at end to go to the first
                                                handleItemClick(sortedResults[0], false, 0);
                                            }
                                        }}
                                        disabled={sortedResults.length === 0}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-[10px] font-black text-slate-400 hover:text-white hover:border-blue-500/50 disabled:opacity-30 disabled:pointer-events-none transition-all"
                                    >
                                        NEXT <ArrowDown size={12} strokeWidth={3} />
                                    </button>
                                </div>
                            </div>

                            {/* Timeline List */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-slate-950/20 p-2.5">
                                {sortedResults.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-8 h-full text-center">
                                        <Zap className="w-12 h-12 text-slate-800 mb-4" />
                                        <p className="text-slate-400 font-bold text-sm">No analysis results found.</p>
                                        <p className="text-xs text-slate-600 mt-2 italic px-8">Analysis requires corresponding patterns in both log streams.</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        {/* Pagination Controls (Top) */}
                                        {sortedResults.length > PAGE_SIZE && (
                                            <div className="flex items-center justify-center gap-4 py-2 bg-slate-900/40 rounded-lg border border-slate-800 mb-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setTimelinePage(p => Math.max(1, p - 1)); }}
                                                    disabled={timelinePage === 1}
                                                    className="p-1 hover:bg-slate-800 rounded text-slate-400 disabled:opacity-20"
                                                >
                                                    <ChevronLeft size={20} />
                                                </button>
                                                <span className="text-xs font-black text-blue-400 font-mono">
                                                    PAGE {timelinePage} / {Math.ceil(sortedResults.length / PAGE_SIZE)}
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setTimelinePage(p => Math.min(Math.ceil(sortedResults.length / PAGE_SIZE), p + 1)); }}
                                                    disabled={timelinePage >= Math.ceil(sortedResults.length / PAGE_SIZE)}
                                                    className="p-1 hover:bg-slate-800 rounded text-slate-400 disabled:opacity-20"
                                                >
                                                    <ChevronRight size={20} />
                                                </button>
                                            </div>
                                        )}

                                        {sortedResults
                                            .slice((timelinePage - 1) * PAGE_SIZE, timelinePage * PAGE_SIZE)
                                            .map((res, i) => {
                                                const isSlower = res.deltaDiff > 0;
                                                const isFaster = res.deltaDiff < 0;
                                                const isMore = res.countDiff > 0;
                                                const isLess = res.countDiff < 0;
                                                const isSelected = selectedKey === res.key;

                                                // Theme Colors
                                                const themeColor = res.isNewError ? 'rose' : (isSlower ? 'orange' : (isFaster ? 'emerald' : (res.isGlobalBatch ? 'violet' : (res.isAliasInterval ? 'indigo' : 'blue'))));
                                                const Icon = res.isNewError ? AlertTriangle : (isSlower ? TrendingUp : (isFaster ? TrendingDown : (res.isGlobalBatch ? List : (res.isAliasInterval ? Zap : Activity))));

                                                return (
                                                    <div
                                                        key={res.key}
                                                        id={`segment-${res.key}`}
                                                        onClick={() => handleItemClick(res)}
                                                        onDoubleClick={() => onViewRawSplit?.(res)}
                                                        className={`group relative flex bg-slate-900/40 rounded-xl border transition-all cursor-pointer overflow-hidden ${isSelected
                                                            ? `border-${themeColor}-500/50 bg-${themeColor}-500/5 ring-1 ring-${themeColor}-500/20`
                                                            : 'border-slate-800/50 hover:border-slate-700 hover:bg-slate-900/60'
                                                            }`}
                                                    >
                                                        {/* Selection Indicator */}
                                                        {isSelected && <div className={`absolute left-0 top-0 bottom-0 w-1 bg-${themeColor}-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]`} />}

                                                        <div className="flex-1 py-1.5 px-2.5 flex items-center min-w-0">
                                                            {/* COL 1: Log Context (FROM -> TO) */}
                                                            <div className="w-[32%] min-w-[280px] shrink-0 flex flex-col gap-1 relative pr-6 border-r border-slate-800/40">
                                                                {/* FROM Box */}
                                                                <div className={`border border-slate-800/50 rounded-lg py-0.5 px-2.5 flex items-center gap-3 ${res.isGlobalBatch ? 'bg-violet-500/10 border-violet-500/20' : 'bg-slate-950/50'}`}>
                                                                    <div className={`w-1.5 h-1.5 rounded-full ${res.isGlobalBatch ? 'bg-violet-500 shadow-[0_0_5px_rgba(139,92,246,0.5)]' : 'bg-slate-600 shadow-[0_0_5px_rgba(71,85,105,0.5)]'}`} />
                                                                    <div className="flex flex-col min-w-0 flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[10px] font-mono text-slate-500 truncate">
                                                                                {res.isBurst && <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1 rounded mr-1.5 text-[8px] font-black uppercase">Burst</span>}
                                                                                {res.prevFileName || res.fileName || 'Unknown'}
                                                                            </span>
                                                                        </div>
                                                                        <span className="text-[11px] font-bold text-slate-400 truncate">
                                                                            {res.prevFunctionName || res.functionName || 'Unknown'}
                                                                            <span className="ml-1 text-[9px] text-slate-600 font-mono">({res.leftPrevCodeLineNum || res.leftPrevOrigLineNum || res.leftPrevLineNum})</span>
                                                                        </span>
                                                                    </div>
                                                                    {res.isGlobalBatch && <List size={12} className="text-violet-500/50 shrink-0" />}
                                                                </div>

                                                                {/* Minimal Connector */}
                                                                <div className="absolute left-[30px] top-[24px] bottom-[24px] w-[1px] bg-slate-800/80 z-0" />
                                                                <div className="absolute left-[26px] top-1/2 -translate-y-1/2 z-10">
                                                                    <div className={`bg-slate-950 p-0.5 rounded-full border border-slate-800`}>
                                                                        <ArrowDown size={8} className="text-slate-600" />
                                                                    </div>
                                                                </div>

                                                                {/* TO Box */}
                                                                <div className={`bg-${themeColor}-500/5 border border-${themeColor}-500/20 rounded-lg py-0.5 px-2.5 flex items-center gap-3 relative z-20`}>
                                                                    <div className={`w-1.5 h-1.5 rounded-full bg-${themeColor}-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]`} />
                                                                    <div className="flex flex-col min-w-0 flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={`text-[10px] font-mono text-${themeColor}-400/80 truncate`}>
                                                                                {res.fileName || 'Unknown'}
                                                                            </span>
                                                                        </div>
                                                                        <span className={`text-[11px] font-black text-${themeColor}-300 truncate`}>
                                                                            {res.isBurst && <span className={`bg-${themeColor}-500/20 text-${themeColor}-400 px-1 rounded mr-1.5 text-[9px] font-black underline decoration-dotted underline-offset-2`}>{res.burstCount}x Repeated</span>}
                                                                            {res.functionName || res.preview.substring(0, 100)}
                                                                            <span className="ml-1 text-[9px] text-slate-600 font-mono">({res.leftCodeLineNum || res.leftOrigLineNum || res.leftLineNum})</span>
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* COL 2: Visual Performance Bridge (The Expansion Area) */}
                                                            <div className="flex-1 flex items-center justify-center px-4 relative overflow-hidden h-full min-w-0">
                                                                {/* Background Pulse Effect */}
                                                                <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-${themeColor}-500/[0.03] to-transparent animate-pulse`} />

                                                                <div className="flex items-center gap-8 z-10 w-full max-w-2xl px-8">
                                                                    <div className={`h-px flex-1 bg-gradient-to-r from-transparent via-${themeColor}-500/40 to-transparent`} />

                                                                    <div className="flex flex-col items-center gap-1 shrink-0">
                                                                        <div className={`flex items-center gap-3 px-4 py-1.5 rounded-2xl bg-${themeColor}-500/10 border border-${themeColor}-500/30 shadow-[0_0_20px_rgba(0,0,0,0.3)] backdrop-blur-md`}>
                                                                            <div className={`p-1.5 rounded-full bg-${themeColor}-500/20 shadow-inner`}>
                                                                                <Icon size={18} className={`text-${themeColor}-400`} strokeWidth={3} />
                                                                            </div>
                                                                            <div className="flex flex-col">
                                                                                <span className={`text-lg font-black leading-tight text-${themeColor}-400 tabular-nums tracking-tighter`}>
                                                                                    {`${res.deltaDiff > 0 ? '+' : ''}${formatDelta(res.deltaDiff)}`}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <div className={`h-px w-3 bg-${themeColor}-500/30`} />
                                                                            <span className={`text-[10px] font-black text-${themeColor}-500/80 uppercase tracking-[0.25em] whitespace-nowrap`}>
                                                                                {res.isNewError ? 'NEW ERROR' : (isSlower ? 'REGRESSION' : (isFaster ? 'IMPROVEMENT' : 'STABLE'))}
                                                                            </span>
                                                                            <div className={`h-px w-3 bg-${themeColor}-500/30`} />
                                                                        </div>
                                                                    </div>

                                                                    <div className={`h-px flex-1 bg-gradient-to-r from-transparent via-${themeColor}-500/40 to-transparent`} />
                                                                </div>

                                                                {/* Flying Particles Effect for Intensity */}
                                                                {(isSlower || isFaster || res.isNewError) && (
                                                                    <div className="absolute inset-0 pointer-events-none opacity-40">
                                                                        {[...Array(3)].map((_, idx) => (
                                                                            <motion.div
                                                                                key={idx}
                                                                                initial={{ x: isFaster ? '100%' : '-100%', y: `${30 + idx * 20}%`, opacity: 0 }}
                                                                                animate={{ x: isFaster ? '-100%' : '100%', opacity: [0, 1, 0] }}
                                                                                transition={{
                                                                                    duration: Math.max(0.5, 2 - Math.abs(res.deltaDiff) / 100),
                                                                                    repeat: Infinity,
                                                                                    delay: idx * 0.4,
                                                                                    ease: "linear"
                                                                                }}
                                                                                className={`absolute w-8 h-px bg-gradient-to-r from-transparent via-${themeColor}-400/50 to-transparent`}
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* COL 3: Detailed Metrics (Individual Averages) */}
                                                            <div className="w-44 shrink-0 flex flex-col justify-center gap-1.5 pl-6 border-l border-slate-800/40">
                                                                <div className="space-y-1.5">
                                                                    <div className="flex flex-col px-1">
                                                                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-0.5">LEFT AVG</span>
                                                                        <span className="text-xs font-mono text-slate-400 font-bold">{formatDelta(res.leftAvgDelta)}</span>
                                                                    </div>
                                                                    <div className="flex flex-col px-1">
                                                                        <span className={`text-[9px] font-black text-${themeColor}-600/60 uppercase tracking-widest mb-0.5`}>RIGHT AVG</span>
                                                                        <span className="text-sm font-mono text-white font-black">{formatDelta(res.rightAvgDelta)}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                        {/* Pagination Controls (Bottom) */}
                                        {sortedResults.length > PAGE_SIZE && (
                                            <div className="flex items-center justify-center gap-4 py-4 bg-slate-900/20 rounded-lg border border-slate-800/30 mt-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setTimelinePage(p => Math.max(1, p - 1)); }}
                                                    disabled={timelinePage === 1}
                                                    className="p-1 hover:bg-slate-800 rounded text-slate-400 disabled:opacity-20"
                                                >
                                                    <ChevronLeft size={20} />
                                                </button>
                                                <span className="text-xs font-black text-blue-400 font-mono">
                                                    PAGE {timelinePage} / {Math.ceil(sortedResults.length / PAGE_SIZE)}
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setTimelinePage(p => Math.min(Math.ceil(sortedResults.length / PAGE_SIZE), p + 1)); }}
                                                    disabled={timelinePage >= Math.ceil(sortedResults.length / PAGE_SIZE)}
                                                    className="p-1 hover:bg-slate-800 rounded text-slate-400 disabled:opacity-20"
                                                >
                                                    <ChevronRight size={20} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};
