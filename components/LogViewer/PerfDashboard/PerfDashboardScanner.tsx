import React from 'react';
import { motion } from 'framer-motion';
import * as Lucide from 'lucide-react';
import { AnalysisResult } from '../../../utils/perfAnalysis';

interface PerfDashboardScannerProps {
    minimized: boolean;
    isAnalyzing: boolean;
    result: AnalysisResult | null;
}

export const PerfDashboardScanner: React.FC<PerfDashboardScannerProps> = ({ minimized, isAnalyzing, result }) => {
    if (minimized) return null;

    return (
        <motion.div
            key="scanning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center bg-slate-900/90  z-50 relative overflow-hidden"
        >
            {/* Colorful Loading / Scanning Animation */}
            <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                {/* Outer spinning gradient ring */}
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                    className="absolute inset-0 rounded-full border-t-4 border-indigo-500 border-r-4 border-pink-500 border-b-4 border-emerald-500 border-l-4 border-transparent opacity-80 shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                />
                {/* Inner pulsing orb */}
                <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.7, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                    className="absolute inset-4 rounded-full bg-gradient-to-tr from-indigo-500 to-pink-500 blur-md"
                />
                {/* Center Icon */}
                <Lucide.Activity size={32} className="text-white relative z-10" />
            </div>
            <h3 className="text-white font-bold text-lg tracking-wider mb-3 drop-shadow-md">Analyzing Performance</h3>
            <div className="flex items-center gap-1.5 text-slate-300 text-[11px] font-mono">
                <motion.div
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                    className="w-1.5 h-1.5 rounded-full bg-indigo-400"
                />
                <motion.div
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                    className="w-1.5 h-1.5 rounded-full bg-pink-400"
                />
                <motion.div
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                />
                <span className="ml-2 uppercase tracking-widest text-slate-400">Extracting transactions...</span>
            </div>
            <div className="mt-4 flex flex-col items-center gap-2">
                <span className="text-xs font-black text-indigo-400 uppercase tracking-[0.3em] animate-pulse">
                    {isAnalyzing ? 'Analyzing Data...' : 'Initializing View...'}
                </span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest opacity-60">
                    {result ? `Preparing ${result.segments.length.toLocaleString()} intervals` : 'Processing log stream'}
                </span>
            </div>
        </motion.div>
    );
};
