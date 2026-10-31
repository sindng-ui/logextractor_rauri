import React from 'react';
import {
    Archive, Bookmark, Copy, Download, BarChart3, Activity,
    Zap, Split, Table, X
} from 'lucide-react';

interface LogViewerToolbarProps {
    isRawMode?: boolean;
    workerReady: boolean;
    placeholderText: string;
    fileName?: string;
    onArchiveSave?: () => void;
    isArchiveSaveEnabled?: boolean;
    onShowBookmarks?: () => void;
    bookmarksSize: number;
    onCopy?: (ignoreSelection?: boolean) => void;
    onSave?: (ignoreSelection?: boolean) => void;
    onCopyAsConfluenceTable?: () => void;
    onAnalyzePerformance?: () => void;
    perfAnalysisResult?: any;
    isAnalyzingPerformance?: boolean;
    onAnalyzeSpam?: () => void;
    isAnalyzingSpam?: boolean;
    onReset?: () => void; // Added
}

const ToolbarButton: React.FC<{
    icon: React.ElementType;
    onClick?: () => void;
    tooltip: string;
    disabled?: boolean;
    className?: string;
    active?: boolean;
    pulse?: boolean;
    fill?: string;
}> = ({ icon: Icon, onClick, tooltip, disabled, className, active, pulse, fill }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`p-1.5 rounded-lg transition-colors 
            ${active
                ? 'bg-indigo-500/10 text-indigo-500'
                : 'text-slate-400 dark:text-slate-400 hover:text-indigo-500 hover:bg-slate-200 dark:hover:bg-white/10'
            } 
            ${disabled ? 'cursor-not-allowed opacity-30' : ''} 
            ${className || ''}`}
        title={tooltip}
    >
        <Icon size={14} className={pulse ? 'animate-pulse' : ''} fill={fill || 'none'} />
    </button>
);

export const LogViewerToolbar: React.FC<LogViewerToolbarProps> = ({
    isRawMode = false,
    workerReady,
    placeholderText,
    fileName,
    onArchiveSave,
    isArchiveSaveEnabled = false,
    onShowBookmarks,
    bookmarksSize,
    onCopy,
    onSave,
    onCopyAsConfluenceTable,
    onAnalyzePerformance,
    perfAnalysisResult,
    isAnalyzingPerformance = false,
    onAnalyzeSpam,
    isAnalyzingSpam = false,
    onReset
}) => {
    return (
        <div
            className={`h-11 border-b border-slate-200 dark:border-white/5 flex items-center justify-between shrink-0 z-50 relative group/toolbar px-3 
            ${isRawMode ? 'bg-transparent' : 'bg-white/50 dark:bg-slate-950/50'}`}
            style={{ WebkitAppRegion: 'no-drag' } as any}
        >
            <div className="flex items-center gap-3 overflow-hidden">
                <div className={`p-1.5 rounded-lg shadow-sm transition-all duration-300 ${workerReady ? (isRawMode ? 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300' : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300 icon-glow') : 'bg-slate-100 text-slate-500 dark:bg-slate-800/50 dark:text-slate-500'}`}>
                    {isRawMode ? <Split size={14} /> : <Zap size={14} />}
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="font-bold text-xs text-slate-700 dark:text-slate-200 truncate max-w-[300px] tracking-tight">
                        {workerReady ? (isRawMode ? 'Raw View' : (placeholderText.includes('Drag') ? placeholderText : placeholderText.replace('Processing...', '').replace('Drop a log file to start', 'No file loaded'))) : (fileName ? 'Processing...' : 'Empty')}
                    </span>
                </div>
                {workerReady && onReset && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onReset();
                        }}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded text-slate-400 hover:text-rose-500 transition-colors ml-[-4px]"
                        title="Close Log"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            <div className="flex items-center gap-1 transition-opacity duration-200">
                {workerReady && !isRawMode && onArchiveSave && (
                    <ToolbarButton
                        icon={Archive}
                        onClick={onArchiveSave}
                        disabled={!isArchiveSaveEnabled}
                        tooltip={isArchiveSaveEnabled ? 'Save to Archive (Max 30MB)' : 'Log exceeds 30MB limit for archive'}
                        className="hover:text-purple-500"
                    />
                )}

                {workerReady && !isRawMode && onShowBookmarks && (
                    <ToolbarButton
                        icon={Bookmark}
                        onClick={onShowBookmarks}
                        tooltip="View Bookmarks"
                        fill={bookmarksSize > 0 ? "currentColor" : "none"}
                        className="hover:text-yellow-600 dark:hover:text-yellow-400"
                    />
                )}

                {workerReady && !isRawMode && onCopyAsConfluenceTable && (
                    <ToolbarButton
                        icon={Table}
                        onClick={onCopyAsConfluenceTable}
                        tooltip="Copy as Confluence Table"
                        className="hover:text-blue-500"
                    />
                )}

                {workerReady && !isRawMode && onCopy && (
                    <ToolbarButton
                        icon={Copy}
                        onClick={() => onCopy()}
                        tooltip="Copy Filtered Logs"
                        className="hover:text-indigo-500"
                    />
                )}

                {workerReady && !isRawMode && onSave && (
                    <ToolbarButton
                        icon={Download}
                        onClick={() => onSave()}
                        tooltip="Save Filtered Logs"
                        className="hover:text-emerald-500"
                    />
                )}

                {workerReady && !isRawMode && onAnalyzePerformance && (
                    <ToolbarButton
                        icon={BarChart3}
                        onClick={onAnalyzePerformance}
                        tooltip="Analyze Performance (Flame Map)"
                        active={!!perfAnalysisResult || isAnalyzingPerformance}
                        pulse={isAnalyzingPerformance}
                    />
                )}

                {workerReady && !isRawMode && onAnalyzeSpam && (
                    <ToolbarButton
                        icon={Activity}
                        onClick={onAnalyzeSpam}
                        tooltip="Spam Analyzer"
                        active={isAnalyzingSpam}
                        pulse={isAnalyzingSpam}
                        className="hover:text-rose-500"
                    />
                )}
            </div>
        </div>
    );
};
