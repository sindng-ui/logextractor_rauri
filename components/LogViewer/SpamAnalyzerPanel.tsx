import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Activity, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLogContext } from './LogContext';

export const SpamAnalyzerPanel: React.FC = () => {
    const {
        isSpamAnalyzerOpen,
        setIsSpamAnalyzerOpen,
        isAnalyzingSpam,
        spamResultsLeft,
        requestSpamAnalysisLeft,
        leftFilteredCount,
        jumpToGlobalLine,
        jumpToAbsoluteLine // 🔥 NEW: Use absolute index jump
    } = useLogContext();

    // Local state for jump tracking (uses pattern key (fileName+functionName) as key)
    const [jumpIndices, setJumpIndices] = React.useState<Record<string, number>>({});

    // Start automated analysis if no data when UI opens
    useEffect(() => {
        if (isSpamAnalyzerOpen && spamResultsLeft.length === 0 && !isAnalyzingSpam && leftFilteredCount > 0) {
            requestSpamAnalysisLeft();
        }
    }, [isSpamAnalyzerOpen, spamResultsLeft.length, isAnalyzingSpam, requestSpamAnalysisLeft, leftFilteredCount]);

    if (!isSpamAnalyzerOpen) return null;

    const handleJump = (item: any, direction: 'next' | 'prev') => {
        if (!item.indices || item.indices.length === 0) return;

        // 🎯 Apply the same key rules as the analysis logic (source-oriented)
        const key = (item.fileName !== 'Unknown File' || item.functionName !== 'Unknown Location')
            ? `${item.fileName}::${item.functionName}`
            : item.lineContent.replace(/[\d:\-\.\[\]\s]/g, '').substring(0, 60);

        const currentIdx = jumpIndices[key] === undefined ? 0 : jumpIndices[key];
        let nextIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;

        // Circular handling
        if (nextIdx >= item.indices.length) nextIdx = 0;
        if (nextIdx < 0) nextIdx = item.indices.length - 1;

        // 🚀 [HYPER-JUMP] Absolute index-based jump! (Immune to filter changes 🐧🛡️)
        const absoluteIndex = item.indices[nextIdx];
        jumpToAbsoluteLine(absoluteIndex, 'left');

        setJumpIndices(prev => ({ ...prev, [key]: nextIdx }));
    };

    return (
        <div className="w-full bg-slate-950 border-b border-indigo-500/30 flex flex-col overflow-hidden shadow-xl" style={{ height: '35vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-indigo-400" />
                    <div>
                        <span className="text-sm font-bold text-slate-200">Spam Analyzer</span>
                        <span className="ml-3 text-xs text-slate-500">
                            {isAnalyzingSpam ? 'Analyzing patterns...' : `${spamResultsLeft.length} patterns found (Top 100)`}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => requestSpamAnalysisLeft()}
                        disabled={isAnalyzingSpam || leftFilteredCount === 0}
                        className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-400 disabled:opacity-30 transition-colors"
                        title="Re-Analyze"
                    >
                        <RefreshCw className={`w-4 h-4 ${isAnalyzingSpam ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={() => setIsSpamAnalyzerOpen(false)}
                        className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* List Content - Changed to vertical scroll */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-950/20">
                <div className="flex flex-col p-3 gap-2 w-full">
                    {isAnalyzingSpam ? (
                        <div className="flex items-center justify-center py-10 gap-3 text-slate-500">
                            <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
                            <span className="animate-pulse font-medium">Grouping repetitive logs...</span>
                        </div>
                    ) : spamResultsLeft.length === 0 ? (
                        <div className="flex items-center justify-center py-10 gap-2 text-slate-500 italic">
                            <AlertTriangle className="w-4 h-4" />
                            <span>No repetitive logs found in the current view.</span>
                        </div>
                    ) : (
                        spamResultsLeft.map((item, idx) => {
                            const barWidth = Math.max(5, (item.count / spamResultsLeft[0].count) * 100);

                            // 🎯 Same key rules as handleJump
                            const itemKey = (item.fileName !== 'Unknown File' || item.functionName !== 'Unknown Location')
                                ? `${item.fileName}::${item.functionName}`
                                : item.lineContent.replace(/[\d:\-\.\[\]\s]/g, '').substring(0, 60);

                            const currentPosIdx = jumpIndices[itemKey] === undefined ? 0 : jumpIndices[itemKey];

                            return (
                                <div
                                    key={idx}
                                    className="flex items-center gap-4 p-3 bg-slate-900/60 border border-slate-800 rounded-lg hover:border-indigo-500/50 hover:bg-slate-900 transition-all group w-full relative overflow-hidden animate-fade-in-up"
                                    style={{ animationDelay: `${Math.min(idx * 0.015, 0.5)}s`, animationFillMode: 'both' }}
                                >
                                    {/* Rank & Count Section */}
                                    <div className="flex flex-col items-center justify-center min-w-[75px] border-r border-slate-800/80 pr-4 shrink-0">
                                        <div className="bg-slate-800/80 h-5 px-2 flex items-center justify-center rounded-full mb-1">
                                            <span className="text-[9px] font-bold text-slate-400 tracking-wider leading-none">RANK {idx + 1}</span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-xl font-black text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.3)] leading-none">{item.count.toLocaleString()}</span>
                                            <span className="text-[9px] font-medium text-slate-500 mt-1 uppercase tracking-tighter">Occurrences</span>
                                        </div>
                                    </div>

                                    {/* Detailed Meta Section */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex gap-2 mb-2 flex-wrap items-center">
                                            {/* File Name Chip */}
                                            {item.fileName !== 'Unknown File' && (
                                                <div className="flex items-center bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-0.5">
                                                    <span className="text-[10px] font-bold text-emerald-400 tracking-tight font-mono truncate max-w-[140px]" title={item.fileName}>
                                                        {item.fileName}
                                                    </span>
                                                </div>
                                            )}


                                            {/* Function Name Chip */}
                                            <div className="flex items-center bg-indigo-500/10 border border-indigo-500/20 rounded-md px-2 py-0.5">
                                                <span className="text-[10px] font-bold text-indigo-300 font-mono truncate max-w-[180px]" title={item.functionName}>
                                                    {item.functionName}
                                                </span>
                                            </div>

                                            {/* Mini Activity Bar */}
                                            <div className="flex-1 min-w-[40px] h-1 bg-slate-950/50 rounded-full overflow-hidden ml-2 opacity-40 group-hover:opacity-100 transition-opacity">
                                                <div
                                                    className="h-full bg-gradient-to-r from-rose-500 via-indigo-500 to-indigo-400 transition-all duration-1000 ease-out"
                                                    style={{ width: `${barWidth}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Log Content Snippet */}
                                        <div className="relative">
                                            <p className="text-[11px] font-mono text-slate-300/90 line-clamp-1 italic bg-slate-950/30 px-2 py-1 rounded border-l-2 border-indigo-500/40 break-all select-all hover:text-white transition-colors" title={item.lineContent}>
                                                {item.lineContent}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Jump Buttons Section */}
                                    <div className="flex items-center gap-1 shrink-0 pl-2">
                                        <button
                                            onClick={() => handleJump(item, 'prev')}
                                            className="p-1.5 rounded bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-indigo-400 transition-all"
                                            title="Jump to previous occurrence"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>

                                        <div className="min-w-[45px] flex flex-col items-center justify-center font-mono">
                                            <span className="text-[11px] font-bold text-indigo-400">{currentPosIdx + 1}</span>
                                            <div className="w-full h-[1px] bg-slate-800 my-0.5" />
                                            <span className="text-[9px] font-medium text-slate-500">{item.count}</span>
                                        </div>

                                        <button
                                            onClick={() => handleJump(item, 'next')}
                                            className="p-1.5 rounded bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all shadow-md group/jump"
                                            title="Jump to next occurrence"
                                        >
                                            <ChevronRight className="w-4 h-4 group-hover/jump:translate-x-0.5 transition-transform" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div >
    );
};
