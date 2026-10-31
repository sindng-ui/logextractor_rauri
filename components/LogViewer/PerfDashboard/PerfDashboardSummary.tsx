import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Lucide from 'lucide-react';
import { AnalysisResult, AnalysisSegment } from '../../../utils/perfAnalysis';
import { formatDuration } from '../../../utils/logTime';

interface PerfDashboardSummaryProps {
    result: AnalysisResult | null;
    flameSegments: AnalysisSegment[];
    isFullScreen: boolean;
    useCompactDetail?: boolean;
    selectedSegmentId: string | null;
    setSelectedSegmentId: (id: string | null) => void;
    onViewRawRange?: (start: number, end: number, highlight?: number) => void;
    onCopyRawRange?: (start: number, end: number) => void;
    perfThreshold: number;
}

export const PerfDashboardSummary: React.FC<PerfDashboardSummaryProps> = ({
    result,
    flameSegments,
    isFullScreen,
    useCompactDetail,
    selectedSegmentId,
    setSelectedSegmentId,
    onViewRawRange,
    onCopyRawRange,
    perfThreshold
}) => {
    if (isFullScreen || !result) return null;

    const individual = flameSegments.filter(s => s.tid !== 'Global');
    const filteredFail = individual.filter(s => s.duration >= perfThreshold).length;

    return (
        <div className="w-64 shrink-0 border-r border-white/5 bg-slate-900/50 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5">
                    <span className="text-[9px] text-slate-500 uppercase font-black block mb-1">Total Ops</span>
                    <span className="text-lg font-black text-indigo-400">
                        {individual.length}
                    </span>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5">
                    <span className="text-[9px] text-slate-500 uppercase font-black block mb-1">Slow Ops</span>
                    <span className={`text-lg font-black ${filteredFail > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {filteredFail}
                    </span>
                </div>
            </div>

            {/* Sidebar Detail Section (Compact Mode Detail - Integrated in Dashboard) */}
            <AnimatePresence>
                {useCompactDetail && selectedSegmentId && result && (() => {
                    const s = result.segments.find(sg => sg.id === selectedSegmentId);
                    if (!s) return null;
                    const isBottleneck = s.duration >= perfThreshold;
                    return (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-2 pt-4 border-t border-white/10 flex flex-col gap-3 overflow-hidden"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Selected Segment</span>
                                <button onClick={() => setSelectedSegmentId(null)} className="text-slate-500 hover:text-white transition-colors">
                                    <Lucide.X size={12} />
                                </button>
                            </div>

                            <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5 flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${isBottleneck ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' : 'bg-emerald-500'}`} />
                                    <span className="text-[12px] font-black text-white truncate leading-tight" title={s.name}>{s.name}</span>
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                    <span className={`text-[15px] font-black tracking-tighter leading-none ${isBottleneck ? 'text-rose-400' : 'text-emerald-400'}`}>{formatDuration(s.duration)}</span>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => onViewRawRange?.(s.originalStartLine || s.startLine, s.originalEndLine || s.endLine, s.startLine + 1)}
                                    className="flex-1 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border border-indigo-500/20"
                                >
                                    Raw
                                </button>
                                <button
                                    onClick={() => onCopyRawRange?.(s.originalStartLine || s.startLine, s.originalEndLine || s.endLine)}
                                    className="flex-1 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border border-emerald-500/20"
                                >
                                    Copy
                                </button>
                            </div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>
        </div>
    );
};
