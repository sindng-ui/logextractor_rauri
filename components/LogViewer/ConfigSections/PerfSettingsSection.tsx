import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Lucide from 'lucide-react';
import { LogRule } from '../../../types';

const { Activity, Plus, Trash2, Palette, Clock, SortDesc, ChevronDown, ChevronUp } = Lucide;

interface PerfSettingsSectionProps {
    currentConfig: LogRule;
    updateCurrentRule: (updates: Partial<LogRule>) => void;
}

export const PerfSettingsSection = React.memo<PerfSettingsSectionProps>(({ currentConfig, updateCurrentRule }) => {
    const [isCollapsed, setIsCollapsed] = useState(true); // 기본적으로 접힌 상태! 🐧📂
    const [threshold, setThreshold] = useState(currentConfig.perfThreshold?.toString() ?? '1000');

    // Default 2 levels if none exist
    const [dangerLevels, setDangerLevels] = useState(currentConfig.dangerThresholds ?? [
        { ms: 500, color: '#f59e0b', label: 'Slow' },
        { ms: 2000, color: '#be123c', label: 'Very Slow' }
    ]);

    useEffect(() => {
        setThreshold(currentConfig.perfThreshold?.toString() ?? '1000');
    }, [currentConfig.perfThreshold]);

    useEffect(() => {
        if (currentConfig.dangerThresholds) {
            setDangerLevels(currentConfig.dangerThresholds);
        }
    }, [currentConfig.dangerThresholds]);

    const handleThresholdBlur = () => {
        const val = parseInt(threshold);
        if (!isNaN(val) && val !== currentConfig.perfThreshold) {
            updateCurrentRule({ perfThreshold: val });
        }
    };

    const updateDangerLevel = (index: number, updates: any) => {
        const next = [...dangerLevels];
        next[index] = { ...next[index], ...updates };
        setDangerLevels(next);
        updateCurrentRule({ dangerThresholds: next });
    };

    const addDangerLevel = () => {
        if (dangerLevels.length >= 8) return;
        const next = [...dangerLevels, { ms: 3000, color: '#ef4444', label: 'Critical' }];
        setDangerLevels(next);
        updateCurrentRule({ dangerThresholds: next });
    };

    const sortDangerLevels = () => {
        const next = [...dangerLevels].sort((a, b) => b.ms - a.ms);
        setDangerLevels(next);
        updateCurrentRule({ dangerThresholds: next });
    };

    const removeDangerLevel = (index: number) => {
        const next = dangerLevels.filter((_, i) => i !== index);
        setDangerLevels(next);
        updateCurrentRule({ dangerThresholds: next });
    };

    return (
        <div className="p-0">
            <button
                onClick={() => setIsCollapsed(p => !p)}
                className="w-full flex items-center justify-between text-sm font-bold text-indigo-200 mb-3 hover:text-indigo-300 transition-colors focus:outline-none group/perf-btn cursor-pointer py-1.5"
            >
                <div className="flex items-center gap-2">
                    <Activity size={16} className="text-indigo-400 icon-glow group-hover/perf-btn:scale-110 transition-transform" />
                    <span>Performance Analysis Settings</span>
                </div>
                <div className="p-1 rounded-lg bg-[#141b36]/30 border border-indigo-500/10 group-hover/perf-btn:border-indigo-500/20 transition-all">
                    {isCollapsed ? (
                        <ChevronDown size={14} className="text-slate-400 group-hover/perf-btn:text-indigo-300 transition-colors" />
                    ) : (
                        <ChevronUp size={14} className="text-slate-400 group-hover/perf-btn:text-indigo-300 transition-colors" />
                    )}
                </div>
            </button>

            <AnimatePresence initial={false}>
                {!isCollapsed && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="glass rounded-2xl p-5 border border-indigo-500/10 space-y-6">
                            {/* Main Pass/Fail Threshold */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <Clock size={12} /> Pass/Fail Threshold
                                    </label>
                                    <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 rounded">ms</span>
                                </div>
                                <input
                                    type="number"
                                    className="w-full bg-slate-900/50 text-slate-200 text-xs font-mono p-3 rounded-xl border border-slate-700/50 focus:border-indigo-500/50 focus:bg-slate-900 focus:outline-none transition-all shadow-inner"
                                    value={threshold}
                                    onChange={(e) => setThreshold(e.target.value)}
                                    onBlur={handleThresholdBlur}
                                    placeholder="1000"
                                />
                                <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
                                    If the interval is greater than this value, it will be marked as <span className="text-rose-400 font-bold">FAIL</span>.
                                </p>
                            </div>

                            <div className="h-px bg-white/5" />

                            {/* Danger Levels (Visual Coloring) */}
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <Palette size={12} /> Risk Levels (Visual)
                                    </label>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={sortDangerLevels}
                                            className="p-1 px-1.5 text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-1 group/sort cursor-pointer"
                                            title="Sort by ms (Desc)"
                                        >
                                            <SortDesc size={14} className="group-hover/sort:scale-110 transition-transform" />
                                            <span className="text-[8px] font-bold opacity-0 group-hover/sort:opacity-100 transition-opacity">SORT</span>
                                        </button>
                                        <button
                                            onClick={addDangerLevel}
                                            className="p-1 text-slate-500 hover:text-indigo-400 transition-colors cursor-pointer"
                                            title="Add Level"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {dangerLevels.map((lvl, idx) => (
                                        <div key={idx} className="flex items-center gap-2 group animate-in fade-in slide-in-from-right-2" style={{ animationDelay: `${idx * 50}ms` }}>
                                            <div className="relative shrink-0">
                                                <input
                                                    type="color"
                                                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0 overflow-hidden"
                                                    value={lvl.color}
                                                    onChange={(e) => updateDangerLevel(idx, { color: e.target.value })}
                                                />
                                                <div className="absolute inset-0 pointer-events-none rounded border border-white/10" style={{ backgroundColor: lvl.color, opacity: 0.3 }} />
                                            </div>
                                            <input
                                                type="text"
                                                className="flex-1 bg-slate-900/40 text-[11px] text-slate-300 px-2 py-1.5 rounded border border-slate-700/30 focus:outline-none focus:border-indigo-500/30"
                                                value={lvl.label}
                                                onChange={(e) => updateDangerLevel(idx, { label: e.target.value })}
                                                placeholder="Label"
                                            />
                                            <div className="flex items-center bg-slate-950 rounded border border-slate-700/30 px-2 py-1.5">
                                                <input
                                                    type="number"
                                                    className="w-12 bg-transparent text-[11px] font-mono text-indigo-400 text-right focus:outline-none"
                                                    value={lvl.ms}
                                                    onChange={(e) => updateDangerLevel(idx, { ms: parseInt(e.target.value) || 0 })}
                                                />
                                                <span className="text-[9px] text-slate-600 ml-1 font-bold">ms</span>
                                            </div>
                                            <button
                                                onClick={() => removeDangerLevel(idx)}
                                                className="p-1.5 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});
