import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Lucide from 'lucide-react';

interface Milestone {
    time: number;
    label: string;
    color: string;
}

interface PerfMilestoneBarProps {
    milestones: Milestone[];
    viewStart: number;
    viewDuration: number;
    width: number;
    selectedTime: number | null;
    onSelect: (time: number | null) => void;
    onDoubleClick: (time: number, label: string) => void;
}

export const PerfMilestoneBar: React.FC<PerfMilestoneBarProps> = ({
    milestones,
    viewStart,
    viewDuration,
    width,
    selectedTime,
    onSelect,
    onDoubleClick
}) => {
    const visibleMilestones = useMemo(() => {
        const viewEnd = viewStart + viewDuration;
        return milestones.filter(m => m.time >= viewStart && m.time <= viewEnd);
    }, [milestones, viewStart, viewDuration]);

    if (milestones.length === 0) return null;

    return (
        <div className="absolute top-[-8px] left-0 right-0 h-4 pointer-events-none z-[120] overflow-visible">
            <AnimatePresence>
                {visibleMilestones.map((m, idx) => {
                    const left = ((m.time - viewStart) / viewDuration) * 100;
                    const isSelected = selectedTime === m.time;

                    return (
                        <motion.div
                            key={`${m.time}-${m.label}`}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ 
                                opacity: 1, 
                                y: 0,
                                scale: isSelected ? 1.15 : 1
                            }}
                            exit={{ opacity: 0 }}
                            className={`absolute bottom-0 flex flex-row items-center group cursor-pointer pointer-events-auto transition-transform ${isSelected ? 'z-[130]' : 'z-[120]'}`}
                            style={{ left: `${left}%` }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelect(isSelected ? null : m.time);
                            }}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                onDoubleClick(m.time, m.label);
                            }}
                        >
                            {/* Selection Ring / Glow */}
                            {isSelected && (
                                <motion.div 
                                    layoutId="milestone-selection"
                                    className="absolute inset-[-4px] rounded-full border-2 border-white/50 shadow-[0_0_15px_rgba(255,255,255,0.4)] pointer-events-none"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                />
                            )}

                            {/* Marker Flag (Points Down) */}
                            <div 
                                className={`w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] drop-shadow-md transition-all ${isSelected ? 'opacity-100 scale-125' : 'opacity-80 group-hover:opacity-100'}`} 
                                style={{ borderTopColor: m.color }}
                            />

                            {/* Marker Label (To the right) */}
                            <div className={`ml-1.5 px-2.5 py-1 rounded-md border-2 text-[10.5px] font-black whitespace-nowrap shadow-2xl backdrop-blur-xl flex items-center gap-1.5 transition-all ${isSelected ? 'bg-slate-900 border-white/60 scale-110' : 'bg-slate-950/90 border-white/20 group-hover:bg-slate-900/95 group-hover:scale-110 group-hover:border-white/40'}`}
                                style={{ 
                                    borderColor: isSelected ? `${m.color}` : `${m.color}cc`,
                                }}
                            >
                                <div className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: m.color }} />
                                <span 
                                    className="text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]"
                                >
                                    {m.label}
                                </span>
                            </div>
                            
                            {/* Detailed Info on Hover (Tooltip style) */}
                            <div className="absolute top-full mt-2 opacity-0 group-hover:opacity-100 transition-all transform scale-95 group-hover:scale-100 pointer-events-none z-50">
                                <div className="bg-slate-900/95 border border-white/10 px-2.5 py-1.5 rounded-lg shadow-2xl flex flex-col gap-0.5 min-w-[100px] backdrop-blur-xl">
                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                                        Time
                                    </span>
                                    <span className="text-[11px] font-mono text-white font-bold">
                                        {m.time.toLocaleString()} ms
                                    </span>
                                </div>
                            </div>

                            {/* Glow effect on hover */}
                            <div 
                                className="absolute top-[8px] w-[2px] h-[400px] opacity-0 group-hover:opacity-10 transition-opacity bg-gradient-to-b"
                                style={{ 
                                    backgroundImage: `linear-gradient(to bottom, ${m.color}, transparent)`
                                }}
                            />
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
};
