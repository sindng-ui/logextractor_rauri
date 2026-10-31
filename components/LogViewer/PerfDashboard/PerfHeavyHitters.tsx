import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Lucide from 'lucide-react';
import { AnalysisResult } from '../../../utils/perfAnalysis';
import { formatDuration } from '../../../utils/logTime';

interface PerfHeavyHittersProps {
    result: AnalysisResult | null;
    highlightName: string | null;
    onToggleHighlight: (name: string) => void;
}

export const PerfHeavyHitters: React.FC<PerfHeavyHittersProps> = ({ result, highlightName, onToggleHighlight }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    // 🐧 기본적으로 Top 10 Heavy Hitters 영역을 접힌 상태(collapsed)로 시작합니다.
    const [isCollapsed, setIsCollapsed] = useState(true);

    const onHandleWheel = (e: React.WheelEvent) => {
        if (!scrollRef.current) return;
        // If it's a vertical scroll, translate it to horizontal scroll
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            scrollRef.current.scrollLeft += e.deltaY;
        }
    };

    const heavyHitters = useMemo(() => {
        if (!result || !result.functionStats) return [];

        const statsArray = Object.entries(result.functionStats).map(([name, stats]) => ({
            name,
            ...stats
        }));

        // Sort by selfTime descending and take top 10
        return statsArray
            .sort((a, b) => b.selfTime - a.selfTime)
            .slice(0, 10);
    }, [result]);

    if (!result || heavyHitters.length === 0) return null;

    const totalDuration = result.totalDuration;

    return (
        <div className="bg-slate-900/80 border-b border-white/5 py-2 px-4 flex flex-col gap-1.5 shrink-0 overflow-hidden relative group/heavy select-none">
            {/* Clickable Header for Collapsing/Expanding */}
            <div 
                onClick={() => setIsCollapsed(prev => !prev)}
                className="flex items-center justify-between cursor-pointer hover:bg-white/5 -mx-4 -my-2 px-4 py-2 transition-all active:scale-[0.99] origin-center"
                title={isCollapsed ? "Click to expand Heavy Hitters" : "Click to collapse Heavy Hitters"}
            >
                <div className="flex items-center gap-2">
                    <Lucide.Flame size={14} className={`text-orange-500 ${isCollapsed ? '' : 'animate-pulse'}`} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-200 transition-colors">
                        Top 10 Heavy Hitters <span className="text-slate-600 font-normal ml-1">(Sorted by Self-Time)</span>
                    </span>
                    <Lucide.ChevronDown 
                        size={12} 
                        className={`text-slate-500 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} 
                    />
                </div>
                <div className="flex items-center gap-2 text-[9px] text-slate-500 font-mono font-bold uppercase tracking-wider">
                    {isCollapsed ? (
                        <span className="text-indigo-400 flex items-center gap-1 hover:text-indigo-300 transition-colors animate-pulse">
                            [Click to Expand]
                        </span>
                    ) : (
                        <span className="text-slate-600">Identify direct CPU bottlenecks</span>
                    )}
                </div>
            </div>

            {/* Smooth Sliding AnimatePresence */}
            <AnimatePresence initial={false}>
                {!isCollapsed && (
                    <motion.div
                        key="heavy-hitters-cards"
                        initial={{ height: 0, opacity: 0, marginTop: 0 }}
                        animate={{ height: 'auto', opacity: 1, marginTop: 4 }}
                        exit={{ height: 0, opacity: 0, marginTop: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="overflow-hidden"
                    >
                        <div 
                            ref={scrollRef}
                            onWheel={onHandleWheel}
                            className="flex gap-2.5 overflow-x-auto pb-1.5 custom-scrollbar-horizontal scroll-smooth pt-1"
                        >
                            {heavyHitters.map((h, idx) => {
                                const selfPercent = (h.selfTime / totalDuration) * 100;
                                
                                return (
                                    <motion.button
                                        key={h.name}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        onClick={() => onToggleHighlight(h.name)}
                                        className={`flex flex-col gap-1.5 p-2.5 bg-slate-800/40 border transition-all min-w-[160px] max-w-[220px] shrink-0 group/card relative overflow-hidden ${highlightName === h.name ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'border-white/5 hover:bg-indigo-500/10 hover:border-indigo-500/30'} rounded-xl`}
                                    >
                                        {/* Rank Badge */}
                                        <div className="absolute top-1 right-2 text-[14px] font-black opacity-5 text-white italic group-hover/card:opacity-10 transition-opacity">
                                            #{idx + 1}
                                        </div>

                                        <div className="flex flex-col gap-0.5 z-10 w-full text-left">
                                            <span 
                                                className="text-[11px] font-bold text-slate-300 truncate w-full group-hover/card:text-indigo-300 transition-colors" 
                                                title={h.name}
                                            >
                                                {h.name}
                                            </span>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[14px] font-black text-white tracking-tighter">
                                                    {formatDuration(h.selfTime)}
                                                </span>
                                                <span className="text-[9px] text-slate-500 font-bold uppercase">
                                                    {h.count} calls
                                                </span>
                                            </div>
                                        </div>

                                        {/* Progress Bar Container */}
                                        <div className="h-1 w-full bg-slate-950/50 rounded-full overflow-hidden mt-1">
                                            <motion.div 
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.max(2, selfPercent)}%` }}
                                                className={`h-full ${idx === 0 ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : idx < 3 ? 'bg-orange-500' : 'bg-indigo-500'}`}
                                            />
                                        </div>
                                        
                                        <span className="text-[8px] text-slate-600 font-black uppercase tracking-widest mt-0.5">
                                            {selfPercent.toFixed(2)}% of total
                                        </span>
                                    </motion.button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Hint Overlay for scrolling */}
            {!isCollapsed && (
                <div className="absolute right-0 top-10 bottom-0 w-8 bg-gradient-to-l from-slate-900 to-transparent pointer-events-none opacity-0 group-hover/heavy:opacity-100 transition-opacity" />
            )}
        </div>
    );
};
