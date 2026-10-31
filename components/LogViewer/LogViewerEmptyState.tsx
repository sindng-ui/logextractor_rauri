import React from 'react';
import { Upload } from 'lucide-react';
import * as Lucide from 'lucide-react';

interface LogViewerEmptyStateProps {
    fileName?: string;
    onBrowse?: () => void;
    onPasteClipboard?: () => void;
}

export const LogViewerEmptyState: React.FC<LogViewerEmptyStateProps> = ({ fileName, onBrowse, onPasteClipboard }) => {
    return (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 pointer-events-none">
            {fileName ? (
                <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                        <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse"></div>
                        <Lucide.Loader2 className="animate-spin text-indigo-400 relative z-10" size={32} />
                    </div>
                    <span className="text-xs font-medium text-indigo-300 animate-pulse">Processing log...</span>
                </div>
            ) : (
                <div
                    className="group flex flex-col items-center gap-4 p-12 rounded-3xl border-2 border-dashed border-slate-700/50 bg-slate-900/20 transition-all duration-300 hover:bg-slate-800/40 hover:border-indigo-500/50 hover:scale-[1.02] cursor-pointer pointer-events-auto"
                    onClick={onBrowse}
                >
                    <div className="p-4 rounded-2xl bg-slate-800/50 group-hover:bg-indigo-500/20 transition-colors shadow-xl">
                        <Upload size={32} className="text-slate-500 group-hover:text-indigo-400 transition-colors icon-glow" />
                    </div>
                    <div className="text-center space-y-1">
                        <span className="text-sm font-bold text-slate-300 group-hover:text-indigo-200 transition-colors block">
                            Drop a log file here
                        </span>
                        <span className="text-xs text-slate-500 group-hover:text-indigo-400/70 transition-colors block">
                            or click to browse
                        </span>
                    </div>
                    {onPasteClipboard && (
                        <>
                            <div className="text-[10px] text-slate-600 font-bold my-1">— OR —</div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPasteClipboard();
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-700/60 bg-slate-800/40 hover:bg-indigo-500/20 hover:border-indigo-500/50 hover:text-indigo-200 text-slate-400 text-xs font-semibold transition-all duration-200 shadow-lg active:scale-95 group/paste"
                            >
                                <Lucide.ClipboardPaste size={14} className="group-hover/paste:scale-110 transition-transform text-slate-500 group-hover/paste:text-indigo-400" />
                                Paste from Clipboard
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
