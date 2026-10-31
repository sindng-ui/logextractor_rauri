import React, { useState } from 'react';
import * as Lucide from 'lucide-react';
import { useLogContext } from './LogContext';
import { useToast } from '../../contexts/ToastContext';
import { useHappyTool } from '../../contexts/HappyToolContext';
import MissionManagerModal from './MissionManagerModal';
import LogQuickTagsPopover from './LogQuickTagsPopover';
import { Settings2, ListOrdered } from 'lucide-react';
import { ConfirmDialog } from '../ui/CommonDialogs';


const { Plus, Trash2, Maximize, Columns, Sparkles } = Lucide;

// 🎯 Hyungnim, if you want to turn the Analyze Diff button back on, please change the flag below to true!
const ENABLE_SPLIT_ANALYZE_BUTTON = true;

const TopBar: React.FC<{
    onReturnFocus?: () => void;
    onSplitAnalyze?: () => void;
    isSplitAnalyzing?: boolean;
    isSplitAnalyzerOpen?: boolean;
}> = ({ onReturnFocus, onSplitAnalyze, isSplitAnalyzing, isSplitAnalyzerOpen }) => {
    const { addToast } = useToast();
    const { setIsSettingsOpen } = useHappyTool();
    const {
        rules, selectedRuleId, setSelectedRuleId,
        handleCreateRule, handleDeleteRule, onExportSettings,
        onUpdateRules, // ✅ Added for Mission Manager
        fileInputRef, logFileInputRef,
        leftFileName, leftIndexingProgress,
        isDualView, setIsDualView, toggleDualView,
        handleImportFile, handleLogFileSelect,
        setIsTizenModalOpen,
        requestLeftLines, requestRightLines,
        leftFilteredCount, rightFilteredCount,
        tizenSocket, handleTizenDisconnect, findText,
        searchInputRef,
        isTizenQuickConnect, setIsTizenQuickConnect, // Added
        setIsSearchFocused, // ✅ Consumed
        quickFilter, setQuickFilter, // ✅ Quick Filter
        dialogConfig, setDialogConfig, // ✅ Added for Global Dialogs
        isSpamAnalyzerOpen, setIsSpamAnalyzerOpen,
        isLatencySpotlightOpen, setIsLatencySpotlightOpen,
        isHistogramOpen, setIsHistogramOpen,
    } = useLogContext();

    // Quick Connect Handler
    const onQuickConnect = () => {
        setIsTizenQuickConnect(true);
        setIsTizenModalOpen(true);
    };

    const [isMissionManagerOpen, setIsMissionManagerOpen] = useState(false);

    const onSelectRule = setSelectedRuleId;
    const onCreateRule = handleCreateRule;
    const onDeleteRule = handleDeleteRule;
    const onImportFile = handleImportFile;
    const onLogFileSelect = handleLogFileSelect;
    const onConnectTizen = () => {
        setIsTizenQuickConnect(false);
        setIsTizenModalOpen(true);
    };

    const handleCopyLogs = async () => {
        let content = '';
        if (leftFilteredCount > 0) {
            const lines = await requestLeftLines(0, leftFilteredCount);
            content += `--- LEFT PANE (${lines.length} lines) ---\n`;
            content += lines.map(l => l.content).join('\n');
        }
        if (isDualView && rightFilteredCount > 0) {
            const lines = await requestRightLines(0, rightFilteredCount);
            content += `\n--- RIGHT PANE (${lines.length} lines) ---\n`;
            content += lines.map(l => l.content).join('\n');
        }
        if (!content) {
            console.log('[TopBar] No content to copy, showing warning toast');
            return addToast('No logs to copy.', 'warning');
        }
        try {
            await navigator.clipboard.writeText(content);
            addToast('Logs copied to clipboard!', 'success');
        } catch (e) { addToast('Failed to copy.', 'error'); }
    };

    const handleSaveLogs = async () => {
        let content = '';
        if (leftFilteredCount > 0) {
            const lines = await requestLeftLines(0, leftFilteredCount);
            content += `--- LEFT PANE (${lines.length} lines) ---\n`;
            content += lines.map(l => l.content).join('\n');
        }
        if (isDualView && rightFilteredCount > 0) {
            const lines = await requestRightLines(0, rightFilteredCount);
            content += `\n--- RIGHT PANE (${lines.length} lines) ---\n`;
            content += lines.map(l => l.content).join('\n');
        }

        if (!content) return addToast('No logs to save.', 'warning');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `filtered_logs_${new Date().getTime()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className=" border-b p-4 pl-3 pr-[140px] flex items-center justify-between shrink-0 h-16 z-50 title-drag relative" style={{ backgroundColor: '#0f172a', borderBottomColor: 'rgba(99, 102, 241, 0.3)' }}>
            {/* Left Section: Settings & Mission & Rules */}
            <div className="flex items-center gap-4 no-drag">
                <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="w-10 h-10 flex items-center justify-center bg-slate-800/90 hover:bg-slate-700 border border-white/10 rounded-xl shadow-lg text-slate-400 hover:text-white transition-all duration-300 active:scale-95 group"
                    style={{ WebkitAppRegion: 'no-drag' } as any}
                    title="Settings (Ctrl+,)"
                >
                    <Lucide.Settings size={18} className="group-hover:rotate-90 transition-transform duration-500" />
                </button>
            <div className="flex items-center space-x-4">
                    <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20"><Sparkles size={18} className="text-indigo-400" /></div>
                    <select className="border-none bg-transparent font-bold text-slate-200 text-lg focus:outline-none cursor-pointer hover:text-indigo-400 transition-colors [&>option]:bg-slate-900 w-64 truncate" value={selectedRuleId || ''} onChange={(e) => onSelectRule(e.target.value)}>
                        {rules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <button
                        onClick={() => setIsMissionManagerOpen(true)}
                        className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all"
                        title="Manage Mission Order"
                    >
                        <ListOrdered size={18} />
                    </button>
                </div>
                <div className="h-6 w-px bg-slate-700"></div>
                <div className="flex items-center space-x-2">
                    <button onClick={onCreateRule} className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-500 rounded-full flex items-center text-sm font-medium shadow-lg shadow-indigo-900/50 transition-all hover:scale-105" title="New Rule"><Plus size={16} className="mr-1" /> Create</button>
                    {selectedRuleId && (
                        <>
                            <button onClick={onDeleteRule} className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors"><Trash2 size={18} /></button>
                        </>
                    )}
                </div>
            </div>

            {/* Right Section: Layout, Tools */}
            <div className="flex items-center gap-3 no-drag">
                {/* File Init - Removed as per request */}

                <button
                    onClick={onConnectTizen}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${tizenSocket
                        ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-300'
                        : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-400 hover:text-slate-300'
                        }`}
                >
                    <Lucide.Link size={14} />
                    <span className="text-sm font-medium">Connection</span>
                    {tizenSocket && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-1"></div>}
                </button>

                {/* Quick Connect (Bolt) */}
                {!tizenSocket && (
                    <button
                        onClick={onQuickConnect}
                        className="p-1.5 rounded-lg bg-slate-800 border-slate-700 text-yellow-400 hover:bg-slate-700 hover:text-yellow-300 border transition-all shadow-sm"
                        title="Quick Connect (Last Used)"
                    >
                        <Lucide.Zap size={14} fill="currentColor" />
                    </button>
                )}

                <div className="w-px h-6 bg-slate-700 mx-1"></div>

                {/* 🐧⚡ Log Tags Quick Popover */}
                <LogQuickTagsPopover />

                <div className="w-px h-6 bg-slate-700 mx-1"></div>

                {/* ⚡ Quick Filters (Collect) */}
                <div className="flex items-center gap-1 bg-slate-900 rounded-lg border border-slate-800 p-0.5">
                    <button
                        onClick={() => setQuickFilter(quickFilter === 'error' ? 'none' : 'error')}
                        className={`p-1.5 rounded transition-colors ${quickFilter === 'error' ? 'bg-red-500/20 text-red-400' : 'text-slate-500 hover:text-red-400 hover:bg-slate-800'}`}
                        title="Collect Errors (Error Level)"
                    >
                        <Lucide.AlertCircle size={14} />
                    </button>
                    <button
                        onClick={() => setQuickFilter(quickFilter === 'exception' ? 'none' : 'exception')}
                        className={`p-1.5 rounded transition-colors ${quickFilter === 'exception' ? 'bg-orange-500/20 text-orange-400' : 'text-slate-500 hover:text-orange-400 hover:bg-slate-800'}`}
                        title="Collect Exceptions (Text Match)"
                    >
                        <Lucide.AlertTriangle size={14} />
                    </button>
                </div>

                <div className="w-px h-6 bg-slate-700 mx-1"></div>

                {/* ⏱️ Analysis Tools (Spam, Latency & Histogram) */}
                <div className="flex items-center gap-1 bg-slate-900 rounded-lg border border-slate-800 p-0.5">
                    <button
                        onClick={() => {
                            setIsLatencySpotlightOpen(false);
                            setIsHistogramOpen(false);
                            setIsSpamAnalyzerOpen(!isSpamAnalyzerOpen);
                        }}
                        className={`p-1.5 rounded transition-colors ${isSpamAnalyzerOpen ? 'bg-rose-500/20 text-rose-400' : 'text-slate-500 hover:text-rose-400 hover:bg-slate-800'}`}
                        title="Spam Analyzer"
                    >
                        <Lucide.Activity size={14} />
                    </button>
                    <button
                        onClick={() => {
                            setIsSpamAnalyzerOpen(false);
                            setIsHistogramOpen(false);
                            setIsLatencySpotlightOpen(!isLatencySpotlightOpen);
                        }}
                        className={`p-1.5 rounded transition-colors ${isLatencySpotlightOpen ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500 hover:text-amber-400 hover:bg-slate-800'}`}
                        title="Latency Spotlight"
                    >
                        <Lucide.Timer size={14} />
                    </button>
                    <button
                        onClick={() => {
                            setIsSpamAnalyzerOpen(false);
                            setIsLatencySpotlightOpen(false);
                            setIsHistogramOpen(!isHistogramOpen);
                        }}
                        className={`p-1.5 rounded transition-colors ${isHistogramOpen ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-500 hover:text-indigo-400 hover:bg-slate-800'}`}
                        title="Log Histogram Chart"
                    >
                        <Lucide.BarChart3 size={14} />
                    </button>
                </div>

                <div className="w-px h-6 bg-slate-700 mx-1"></div>

                {/* Find Bar */}
                <div className="flex items-center bg-slate-900 rounded-lg border border-slate-800 h-9 px-2">
                    <Lucide.Search size={14} className="text-slate-500 mr-2" />
                    <input
                        ref={searchInputRef}
                        className="bg-transparent border-none text-xs text-slate-300 w-32 focus:outline-none placeholder-slate-600 font-mono"
                        placeholder="Find in logs..."
                        onFocus={() => setIsSearchFocused && setIsSearchFocused(true)}
                        onBlur={() => setIsSearchFocused && setIsSearchFocused(false)}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                e.currentTarget.blur();
                                return;
                            }
                            if (e.key === 'Tab') {
                                e.preventDefault();
                                if (onReturnFocus) onReturnFocus();
                                return;
                            }
                            if (e.key === 'Enter') {
                                const val = e.currentTarget.value;
                                if (val.trim()) {
                                    // Default to Left pane for now
                                    findText(val, e.shiftKey ? 'prev' : 'next', 'left', undefined, false, true);
                                    // If Dual View, maybe search Right too? 
                                    if (isDualView) findText(val, e.shiftKey ? 'prev' : 'next', 'right', undefined, false, true);
                                }
                            }
                        }}
                    />
                </div>

                <div className="w-px h-6 bg-slate-700 mx-1"></div>

                {/* Analyze Diff Button (Dual View Only) - Moved to left of Layout Toggle */}
                {ENABLE_SPLIT_ANALYZE_BUTTON && isDualView && onSplitAnalyze && (
                    <button
                        onClick={onSplitAnalyze}
                        className={`flex items-center justify-center gap-2 px-3 py-1.5 mr-2 rounded-lg border transition-all text-xs font-bold w-[130px] shrink-0 ${isSplitAnalyzing
                            ? 'bg-blue-900/50 border-blue-500/30 text-blue-300 shadow-inner'
                            : isSplitAnalyzerOpen
                                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
                                : 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20'
                            }`}
                        title={isSplitAnalyzerOpen ? "Close Analysis" : "Compare Left and Right logs"}
                    >
                        <Lucide.Zap size={14} className={isSplitAnalyzing ? "animate-pulse delay-75" : ""} />
                        <span>{isSplitAnalyzing ? 'Analyzing...' : isSplitAnalyzerOpen ? 'Close Diff' : 'Analyze Diff'}</span>
                    </button>
                )}

                {/* Layout Toggle */}
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <button onClick={() => isDualView && toggleDualView()} className={`p-2 rounded flex items-center gap-2 text-xs font-bold transition-all ${!isDualView ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}><Maximize size={14} /> Single</button>
                    <button onClick={() => !isDualView && toggleDualView()} className={`p-2 rounded flex items-center gap-2 text-xs font-bold transition-all ${isDualView ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}><Columns size={14} /> Split</button>
                </div>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={onImportFile} />
            <input type="file" ref={logFileInputRef} className="hidden" onChange={onLogFileSelect} />

            <MissionManagerModal
                isOpen={isMissionManagerOpen}
                onClose={() => setIsMissionManagerOpen(false)}
                rules={rules}
                onUpdateRules={onUpdateRules}
            />

            {dialogConfig && (
                <ConfirmDialog 
                    isOpen={true}
                    onClose={() => setDialogConfig(null)}
                    title={dialogConfig.title}
                    description={dialogConfig.description}
                    confirmLabel={dialogConfig.confirmLabel}
                    isDanger={dialogConfig.isDanger}
                    onConfirm={dialogConfig.onConfirm}
                />
            )}
        </div>
    );
};

export default TopBar;
