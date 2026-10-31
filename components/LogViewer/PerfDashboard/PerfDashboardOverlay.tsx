import React from 'react';
import { motion } from 'framer-motion';
import * as Lucide from 'lucide-react';
import { AnalysisResult } from '../../../utils/perfAnalysis';

interface PerfDashboardOverlayProps {
    isAnalyzing: boolean;
    isScanningStatus: boolean;
    isInitialDrawComplete: boolean;
    result: AnalysisResult | null;
}

export const PerfDashboardOverlay: React.FC<PerfDashboardOverlayProps> = ({
    isAnalyzing,
    isScanningStatus,
    isInitialDrawComplete,
    result
}) => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] bg-slate-900/80  flex flex-col items-center justify-center pointer-events-auto"
        >
            <div className="relative mb-6">
                <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full" />
                <Lucide.Loader2 size={42} className="text-indigo-500 animate-spin relative z-10" />
            </div>
            <div className="flex flex-col items-center gap-2">
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
