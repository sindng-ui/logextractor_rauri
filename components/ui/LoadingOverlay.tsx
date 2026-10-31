import React from 'react';
import * as Lucide from 'lucide-react';

interface LoadingOverlayProps {
    isVisible: boolean;
    fileName: string;
    progress: number;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isVisible, fileName, progress }) => {
    if (!isVisible) return null;

    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 dark:text-slate-400 bg-slate-100/50 dark:bg-slate-900/80  z-50 pointer-events-auto">
            <div className="relative mb-8">
                <div className="absolute inset-0 -m-6 bg-indigo-500/30 rounded-full animate-pulse blur-xl"></div>
                <div className="relative w-20 h-20">
                    <div className="absolute inset-0 border-[3px] border-slate-700/30 rounded-full"></div>
                    <div className="absolute inset-0 border-[3px] border-transparent border-t-cyan-400 border-r-indigo-500 rounded-full animate-spin [animation-duration:1s]"></div>
                    <div className="absolute inset-3 border-[3px] border-slate-700/30 rounded-full"></div>
                    <div className="absolute inset-3 border-[3px] border-transparent border-b-purple-400 border-l-pink-500 rounded-full animate-spin [animation-direction:reverse] [animation-duration:1.5s]"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Lucide.Cpu size={24} className="text-slate-400 animate-pulse" />
                    </div>
                </div>
            </div>
            <div className="flex flex-col items-center gap-2">
                <h3 className="font-bold text-lg text-slate-700 dark:text-slate-200">Processing Log File...</h3>
                <div className="w-64 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
                    <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out"
                        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                    ></div>
                </div>
                <p className="text-xs font-mono text-slate-400 mt-1">{fileName ? fileName : 'Loading...'} ({Math.round(progress)}%)</p>
            </div>
        </div>
    );
};

export default LoadingOverlay;
