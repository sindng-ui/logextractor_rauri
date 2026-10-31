import React, { useEffect, useState } from 'react';
import { X, Timer, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react';
import { useLogContext } from './LogContext';

const formatTimestamp = (ts: number): string => {
    const d = new Date(ts);
    const pad = (n: number, l = 2) => String(n).padStart(l, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

export const LatencySpotlightPanel: React.FC = () => {
    const {
        isLatencySpotlightOpen,
        setIsSpamAnalyzerOpen, // 🔥 배타적 표시를 위한 토글
        setIsLatencySpotlightOpen,
        isAnalyzingLatency,
        latencyResults,
        requestLatencyAnalysis,
        leftFilteredCount,
        jumpToGlobalLine
    } = useLogContext();

    const [thresholdMs, setThresholdMs] = useState<number>(500);

    // 패널이 열렸을 때 결과가 없으면 자동으로 분석 수행
    useEffect(() => {
        if (isLatencySpotlightOpen && latencyResults.length === 0 && !isAnalyzingLatency && leftFilteredCount > 0) {
            requestLatencyAnalysis(thresholdMs);
        }
    }, [isLatencySpotlightOpen, latencyResults.length, isAnalyzingLatency, requestLatencyAnalysis, leftFilteredCount, thresholdMs]);

    if (!isLatencySpotlightOpen) return null;

    const handleThresholdChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newThreshold = parseInt(e.target.value, 10);
        setThresholdMs(newThreshold);
        requestLatencyAnalysis(newThreshold);
    };

    // 포맷팅 함수: ms를 보기 좋게 s나 ms로 표현
    const formatGap = (ms: number): string => {
        if (ms >= 1000) {
            return `${(ms / 1000).toFixed(2)}s`;
        }
        return `${ms}ms`;
    };

    return (
        <div className="w-full bg-slate-950 border-b border-indigo-500/30 flex flex-col overflow-hidden shadow-xl" style={{ height: '35vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                    <Timer className="w-4 h-4 text-amber-400 animate-pulse" />
                    <div>
                        <span className="text-sm font-bold text-slate-200">Latency Spotlight</span>
                        <span className="ml-3 text-xs text-slate-500">
                            {isAnalyzingLatency ? 'Analyzing time gaps...' : `${latencyResults.length} hotspots detected (Top 20)`}
                        </span>
                    </div>
                </div>
                
                {/* Control options (Threshold + Re-Analyze + Close) */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2 py-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gap Threshold:</span>
                        <select
                            value={thresholdMs}
                            onChange={handleThresholdChange}
                            className="bg-transparent text-xs text-amber-400 font-bold font-mono outline-none cursor-pointer"
                        >
                            <option value={100} className="bg-slate-950 text-slate-200">100ms</option>
                            <option value={200} className="bg-slate-950 text-slate-200">200ms</option>
                            <option value={500} className="bg-slate-950 text-slate-200">500ms</option>
                            <option value={1000} className="bg-slate-950 text-slate-200">1s</option>
                            <option value={3000} className="bg-slate-950 text-slate-200">3s</option>
                            <option value={5000} className="bg-slate-950 text-slate-200">5s</option>
                        </select>
                    </div>

                    <button
                        onClick={() => requestLatencyAnalysis(thresholdMs)}
                        disabled={isAnalyzingLatency || leftFilteredCount === 0}
                        className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-400 disabled:opacity-30 transition-colors"
                        title="Re-Analyze"
                    >
                        <RefreshCw className={`w-4 h-4 ${isAnalyzingLatency ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={() => setIsLatencySpotlightOpen(false)}
                        className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-950/20">
                <div className="flex flex-col p-3 gap-2 w-full">
                    {isAnalyzingLatency ? (
                        <div className="flex items-center justify-center py-10 gap-3 text-slate-500">
                            <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
                            <span className="animate-pulse font-medium">Scanning log timestamps for gaps...</span>
                        </div>
                    ) : latencyResults.length === 0 ? (
                        <div className="flex items-center justify-center py-10 gap-2 text-slate-500 italic">
                            <AlertTriangle className="w-4 h-4" />
                            <span>No latency hotspots detected above the threshold.</span>
                        </div>
                    ) : (
                        latencyResults.map((item, idx) => {
                            const maxGap = latencyResults[0].gapMs;
                            const barWidth = Math.max(5, (item.gapMs / maxGap) * 100);

                            return (
                                <div
                                    key={idx}
                                    className="flex items-center gap-4 p-3 bg-slate-900/60 border border-slate-800 rounded-lg hover:border-amber-500/50 hover:bg-slate-900 transition-all group w-full relative overflow-hidden animate-fade-in-up"
                                    style={{ animationDelay: `${Math.min(idx * 0.015, 0.5)}s`, animationFillMode: 'both' }}
                                >
                                    {/* Rank & Time Gap Section */}
                                    <div className="flex flex-col items-center justify-center min-w-[85px] border-r border-slate-800/80 pr-4 shrink-0">
                                        <div className="bg-slate-800/80 h-5 px-2 flex items-center justify-center rounded-full mb-1">
                                            <span className="text-[9px] font-bold text-slate-400 tracking-wider leading-none">HOTSPOT {idx + 1}</span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-xl font-black text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.3)] leading-none">
                                                +{formatGap(item.gapMs)}
                                            </span>
                                            <span className="text-[9px] font-medium text-slate-500 mt-1 uppercase tracking-tight font-mono">Delay Gap</span>
                                        </div>
                                    </div>

                                    {/* Detailed Line & Preview Section */}
                                    <div className="flex-1 min-w-0">
                                        {/* Activity Bar for visual indicator of latency size */}
                                        <div className="w-full h-1 bg-slate-950/50 rounded-full overflow-hidden mb-2.5 opacity-40 group-hover:opacity-100 transition-opacity">
                                            <div
                                                className="h-full bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 transition-all duration-1000 ease-out"
                                                style={{ width: `${barWidth}%` }}
                                            />
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            {/* Before Log Line */}
                                            <div className="flex items-center gap-2 group/before">
                                                <button
                                                    onClick={() => jumpToGlobalLine(item.beforeIndex, 'left', 'center')}
                                                    className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 hover:bg-amber-500 hover:text-slate-950 transition-all font-mono"
                                                    title="Jump to line before gap"
                                                >
                                                    Line {item.beforeLineNum}
                                                </button>
                                                <span className="text-[10px] text-slate-500 font-mono shrink-0">
                                                    [{formatTimestamp(item.beforeTimestamp)}]
                                                </span>
                                                <p className="text-[11px] font-mono text-slate-400 truncate flex-1 italic bg-slate-950/20 px-2 py-0.5 rounded border-l border-slate-700/60 break-all select-all group-hover/before:text-slate-200 transition-colors">
                                                    {item.beforePreview}
                                                </p>
                                            </div>

                                            {/* Transition Indicator */}
                                            <div className="flex items-center pl-8 py-0.5 gap-2 select-none opacity-40 group-hover:opacity-75 transition-opacity">
                                                <div className="w-2 h-2 rounded-full border border-amber-500/50" />
                                                <div className="h-[1px] w-12 bg-gradient-to-r from-amber-500/30 to-transparent" />
                                                <span className="text-[9px] font-bold text-amber-500 tracking-wider uppercase font-mono">
                                                    Gap duration: {item.gapMs.toLocaleString()} ms
                                                </span>
                                            </div>

                                            {/* After Log Line */}
                                            <div className="flex items-center gap-2 group/after">
                                                <button
                                                    onClick={() => jumpToGlobalLine(item.afterIndex, 'left', 'center')}
                                                    className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-slate-950 transition-all font-mono"
                                                    title="Jump to line after gap"
                                                >
                                                    Line {item.afterLineNum}
                                                </button>
                                                <span className="text-[10px] text-slate-500 font-mono shrink-0">
                                                    [{formatTimestamp(item.afterTimestamp)}]
                                                </span>
                                                <p className="text-[11px] font-mono text-slate-300 truncate flex-1 italic bg-slate-950/40 px-2 py-0.5 rounded border-l-2 border-amber-500/50 break-all select-all group-hover/after:text-white transition-colors">
                                                    {item.afterPreview}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Shortcuts */}
                                    <div className="flex items-center shrink-0 pl-2">
                                        <button
                                            onClick={() => jumpToGlobalLine(item.afterIndex, 'left', 'center')}
                                            className="p-2 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-slate-950 transition-all shadow-md group/jump"
                                            title="Jump to delay point"
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
        </div>
    );
};
