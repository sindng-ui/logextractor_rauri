import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Lucide from 'lucide-react';
import { AnalysisResult, AnalysisSegment } from '../../../utils/perfAnalysis';

export interface PerfSegmentDetailProps {
    useCompactDetail: boolean;
    selectedSegmentId: string | null;
    result: AnalysisResult | null;
    setSelectedSegmentId: (id: string | null) => void;
    onViewRawRange?: (originalStart: number, originalEnd: number, filteredIndex?: number) => void;
}

export const PerfSegmentDetail: React.FC<PerfSegmentDetailProps> = ({
    useCompactDetail,
    selectedSegmentId,
    result,
    setSelectedSegmentId,
    onViewRawRange,
}) => {
    return (
        <AnimatePresence>
            {!useCompactDetail && selectedSegmentId && result && (() => {
                const s = result.segments.find(sg => sg.id === selectedSegmentId);
                if (!s) return null;
                
                // Calculate Stack Trace (Ancestors)
                const stackTrace: AnalysisSegment[] = [];
                let currentLane = s.lane!;
                let currentTime = (s.startTime + s.endTime) / 2; // Midpoint to find parent
                
                for (let l = currentLane; l >= 0; l--) {
                    const parent = result.segments.find(p => 
                        p.lane === l && 
                        p.startTime <= s.startTime && 
                        p.endTime >= s.endTime
                    );
                    if (parent) stackTrace.push(parent);
                }

                const stats = result.functionStats?.[s.name];
                const totalDuration = result.totalDuration || (result.endTime - result.startTime);
                
                const formatTime = (ms: number) => {
                    if (ms < 0.001) return '0.00ns';
                    if (ms < 1) return `${(ms * 1000).toFixed(2)}us`;
                    if (ms < 1000) return `${ms.toFixed(2)}ms`;
                    return `${(ms / 1000).toFixed(2)}s`;
                };

                const formatPercent = (val: number, total: number) => {
                    const p = (val / total) * 100;
                    return p < 0.01 ? '<0.01%' : `${p.toFixed(2)}%`;
                };

                return (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="shrink-0 bg-[#0d1117] border-t border-white/10 overflow-hidden relative font-mono text-[11px]"
                    >
                        <div className="flex h-[180px]">
                            {/* Left: Statistics Tables */}
                            <div className="w-[350px] border-r border-white/10 flex flex-col shrink-0">
                                <table className="w-full h-full border-collapse">
                                    <thead>
                                        <tr className="bg-slate-800/50 text-slate-400">
                                            <th className="border border-white/10 px-2 py-1 font-bold text-center w-1/2">This Instance</th>
                                            <th className="border border-white/10 px-2 py-1 font-bold text-center w-1/2">All Instances</th>
                                        </tr>
                                    </thead>
                                    <tbody className="h-full">
                                        <tr className="text-slate-300 h-full">
                                            <td className="border border-white/10 p-0 h-full">
                                                <div className="flex flex-col h-full">
                                                    <div className="flex justify-between border-b border-white/5 bg-slate-900/30">
                                                        <span className="px-2 py-0.5 border-r border-white/10 w-1/2 text-center text-[10px] text-slate-500 font-bold uppercase">Total</span>
                                                        <span className="px-2 py-0.5 w-1/2 text-center text-[10px] text-slate-500 font-bold uppercase">Self</span>
                                                    </div>
                                                    <div className="flex justify-between border-b border-white/10">
                                                        <span className="px-2 py-1 border-r border-white/10 w-1/2 text-center">{formatTime(s.duration)}</span>
                                                        <span className="px-2 py-1 w-1/2 text-center">{formatTime(s.selfTime || 0)}</span>
                                                    </div>
                                                    <div className="flex flex-1 min-h-[50px]">
                                                        <div className="w-1/2 bg-indigo-500/20 relative flex flex-col items-center justify-end pb-1 border-r border-cyan-500/30">
                                                            <div className="absolute inset-x-0 bottom-0 bg-indigo-500/40" style={{ height: `${(s.duration / totalDuration) * 100}%` }}></div>
                                                            <span className="relative z-10 font-bold text-indigo-300">{formatPercent(s.duration, totalDuration)}</span>
                                                        </div>
                                                        <div className="w-1/2 bg-cyan-700/20 relative flex flex-col items-center justify-end pb-1">
                                                            <div className="absolute inset-x-0 bottom-0 bg-cyan-500/40" style={{ height: `${((s.selfTime || 0) / totalDuration) * 100}%` }}></div>
                                                            <span className="relative z-10 font-bold text-cyan-300">{formatPercent(s.selfTime || 0, totalDuration)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="border border-white/10 p-0 h-full">
                                                <div className="flex flex-col h-full">
                                                    <div className="flex justify-between border-b border-white/5 bg-slate-900/30">
                                                        <span className="px-2 py-0.5 border-r border-white/10 w-1/2 text-center text-[10px] text-slate-500 font-bold uppercase">Total</span>
                                                        <span className="px-2 py-0.5 w-1/2 text-center text-[10px] text-slate-500 font-bold uppercase">Self</span>
                                                    </div>
                                                    <div className="flex justify-between border-b border-white/10">
                                                        <span className="px-2 py-1 border-r border-white/10 w-1/2 text-center">{stats ? formatTime(stats.totalTime) : '-'}</span>
                                                        <span className="px-2 py-1 w-1/2 text-center">{stats ? formatTime(stats.selfTime) : '-'}</span>
                                                    </div>
                                                    <div className="flex flex-1 min-h-[50px]">
                                                        <div className="w-1/2 bg-indigo-500/10 relative flex flex-col items-center justify-end pb-1 border-r border-cyan-500/10">
                                                            <div className="absolute inset-x-0 bottom-0 bg-indigo-500/30" style={{ height: `${stats ? (stats.totalTime / totalDuration) * 100 : 0}%` }}></div>
                                                            <span className="relative z-10 font-bold text-indigo-400/80">{stats ? formatPercent(stats.totalTime, totalDuration) : '-'}</span>
                                                        </div>
                                                        <div className="w-1/2 bg-cyan-700/10 relative flex flex-col items-center justify-end pb-1">
                                                            <div className="absolute inset-x-0 bottom-0 bg-cyan-500/30" style={{ height: `${stats ? (stats.selfTime / totalDuration) * 100 : 0}%` }}></div>
                                                            <span className="relative z-10 font-bold text-cyan-400/80">{stats ? formatPercent(stats.selfTime, totalDuration) : '-'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Right: Stack Trace List */}
                            <div className="flex-1 flex flex-col overflow-hidden bg-black/20">
                                <div className="px-3 py-1.5 border-b border-white/5 flex items-center justify-between text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                                    <span>Call Stack (Top to Bottom)</span>
                                    <div className="flex items-center gap-4">
                                        <button 
                                            onClick={() => onViewRawRange?.(s.originalStartLine || s.startLine, s.originalEndLine || s.endLine, s.startLine + 1)}
                                            className="hover:text-indigo-400 transition-colors flex items-center gap-1"
                                        >
                                            <Lucide.FileText size={10} /> View Logs
                                        </button>
                                        <button onClick={() => setSelectedSegmentId(null)} className="hover:text-rose-400 transition-colors">
                                            <Lucide.X size={12} />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-auto p-2 space-y-0.5 custom-scrollbar">
                                    {stackTrace.map((stackSeg, idx) => (
                                        <div 
                                            key={`${stackSeg.id}-${idx}`}
                                            className="flex items-center gap-2 group cursor-pointer hover:bg-white/5 p-1 rounded transition-all w-max min-w-full"
                                            onClick={() => setSelectedSegmentId(stackSeg.id)}
                                        >
                                            <div 
                                                className="w-3 h-3 rounded-sm shrink-0 border border-white/10" 
                                                style={{ backgroundColor: stackSeg.color }}
                                            ></div>
                                            <span className="text-slate-400 group-hover:text-indigo-300 whitespace-nowrap transition-colors">
                                                {idx > 0 && <span className="opacity-30 mr-1">&gt;</span>}
                                                {stackSeg.name}
                                            </span>
                                            {stackSeg.id === s.id && <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-1 rounded font-bold ml-auto shrink-0">SELECTED</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                );
            })()}
        </AnimatePresence>
    );
};
