
import React, { useMemo, useState, useEffect } from 'react';
import * as Lucide from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { formatTransactionFlow } from '../../utils/transactionAnalysis';
import { extractTimestamp, formatDuration } from '../../utils/logTime';
import { LOG_VIEW_CONFIG } from '../../constants/logViewUI';

interface TransactionLogItem {
    lineNum: number;
    content: string;
    visualIndex: number;
    delta?: string | null;
}

interface TransactionDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    identity: { type: string, value: string } | null;
    logs: { lineNum: number, content: string, visualIndex: number }[];
    isLoading: boolean;
    onJumpToLine: (lineNum: number, visualIndex: number) => void;
}

/**
 * 💡 Helper: Extract number (ms) from Delta string
 */
const parseDeltaMs = (delta: string): number => {
    if (!delta) return 0;
    const match = delta.match(/\+(\d+(?:\.\d+)?)(ms|s|m)/);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2];
    if (unit === 's') return value * 1000;
    if (unit === 'm') return value * 60 * 1000;
    return value;
};

/**
 * 💡 Helper: Return style based on latency (Smart Delay)
 */
const getDeltaStyle = (delta: string) => {
    const ms = parseDeltaMs(delta);
    if (ms >= 1000) return 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50 shadow-sm animate-pulse';
    if (ms >= 500) return 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/40';
    if (ms >= 200) return 'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/30';
    return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
};

const TransactionDrawer: React.FC<TransactionDrawerProps> = ({
    isOpen,
    onClose,
    identity,
    logs,
    isLoading,
    onJumpToLine
}) => {
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);

    // Reset selected index when identity changes or drawer closes
    useEffect(() => {
        if (!isOpen) {
            setSelectedIndex(-1);
        }
    }, [isOpen, identity]);

    // 💡 Performance: Only calculate formatted flow when logs change
    const analyzedLogs = useMemo(() => {
        if (!logs || logs.length === 0) return [];
        return formatTransactionFlow(logs) as TransactionLogItem[];
    }, [logs]);

    // 💡 Stats: Calculate transaction performance statistics
    const stats = useMemo(() => {
        if (logs.length < 2) return null;

        try {
            const first = logs[0].content;
            const last = logs[logs.length - 1].content;
            const startTs = extractTimestamp(first);
            const endTs = extractTimestamp(last);

            if (startTs === null || endTs === null) return null;

            const totalMs = Math.abs(endTs - startTs);
            const avgInterval = totalMs / (logs.length - 1);

            // Find Max Delay Line
            let maxDelay = 0;
            let maxDelayLine = -1;
            let prevTs = startTs;

            for (let i = 1; i < logs.length; i++) {
                const currentTs = extractTimestamp(logs[i].content);
                if (currentTs !== null) {
                    const diff = Math.abs(currentTs - prevTs);
                    if (diff > maxDelay) {
                        maxDelay = diff;
                        maxDelayLine = logs[i].lineNum;
                    }
                    prevTs = currentTs;
                }
            }

            return {
                total: formatDuration(totalMs),
                avg: `${avgInterval.toFixed(1)}ms`,
                maxDelay: formatDuration(maxDelay),
                maxDelayLine,
                isBad: totalMs > 5000 || maxDelay > 1000 // Simple threshold
            };
        } catch (e) {
            return null;
        }
    }, [logs]);

    return (
        <div
            className={`fixed top-[52px] bottom-0 right-0 bg-white dark:bg-slate-900 shadow-3xl z-[1000] border-l border-slate-200 dark:border-slate-800 flex flex-col transform transition-all duration-300 ease-in-out ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'
                }`}
            style={{ width: LOG_VIEW_CONFIG.DRAWER.WIDTH }}
        >
            {/* Header */}
            <div className="p-4 pt-5 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3 bg-slate-50 dark:bg-slate-900/80 relative">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden mr-10">
                        <div className={`p-2 rounded-lg shrink-0 ${stats?.isBad ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>
                            <Lucide.Zap size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">Performance Analyzer</h3>
                                <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded font-mono font-bold">
                                    {selectedIndex >= 0 ? `${selectedIndex + 1} / ` : ''}{analyzedLogs.length}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize truncate">
                                {identity?.type}: <span className="font-mono text-indigo-500 font-bold">{identity?.value}</span>
                            </p>
                        </div>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="absolute top-2 right-2 w-12 h-12 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-all z-[1001] active:scale-95"
                    style={{ WebkitAppRegion: 'no-drag' } as any}
                    aria-label="Close"
                >
                    <Lucide.X size={24} className="pointer-events-none" />
                </button>

                {/* Performance Stats Dashboard */}
                {!isLoading && stats && (
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg shadow-sm">
                            <div className="text-[9px] text-slate-400 uppercase font-bold mb-1">Total Duration</div>
                            <div className="text-xs font-mono font-bold text-indigo-500">{stats.total}</div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg shadow-sm">
                            <div className="text-[9px] text-slate-400 uppercase font-bold mb-1">Avg Interval</div>
                            <div className="text-xs font-mono font-bold text-teal-500">{stats.avg}</div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg shadow-sm">
                            <div className="text-[9px] text-slate-400 uppercase font-bold mb-1">Max Bottleneck</div>
                            <div className={`text-xs font-mono font-bold ${parseDeltaMs(stats.maxDelay) > 500 ? 'text-red-500' : 'text-amber-500'}`}>{stats.maxDelay}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Content - Virtualized with Virtuoso */}
            <div className="flex-1 overflow-hidden relative">
                {isLoading ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                        <div className="relative">
                            <Lucide.Loader2 size={40} className="animate-premium-spin text-indigo-500" />
                            <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full animate-pulse" />
                        </div>
                        <span className="text-sm animate-pulse font-medium tracking-tight">Profiling Transaction Bottlenecks...</span>
                    </div>
                ) : analyzedLogs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                        <Lucide.SearchX size={48} className="opacity-20" />
                        <span className="text-sm">No matching transactions found.</span>
                    </div>
                ) : (
                    <Virtuoso
                        style={{ height: '100%' }}
                        data={analyzedLogs}
                        totalCount={analyzedLogs.length}
                        className="custom-scrollbar"
                        itemContent={(index, log) => (
                            <div className="px-4 py-1 group relative">
                                {/* Delta Time with Smart Delay Highlight */}
                                {log.delta && (
                                    <div className="ml-4 pl-6 border-l-2 border-slate-200 dark:border-slate-800 py-1 mb-1">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shadow-sm transition-all duration-300 ${getDeltaStyle(log.delta)}`}>
                                            {log.delta}
                                        </span>
                                    </div>
                                )}

                                {/* Log Line Card */}
                                <div
                                    onClick={() => {
                                        setSelectedIndex(index);
                                        onJumpToLine(log.lineNum, log.visualIndex);
                                    }}
                                    className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-md group active:scale-[0.98] ${selectedIndex === index
                                        ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-400 dark:border-indigo-400/50 scale-[1.01] shadow-lg ring-1 ring-indigo-500/20'
                                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-700/50 hover:border-indigo-500/50 hover:bg-white dark:hover:bg-slate-800'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-mono font-bold ${selectedIndex === index ? 'text-indigo-500' : 'text-slate-400'}`}>
                                                #{log.lineNum}
                                            </span>
                                            {stats?.maxDelayLine === log.lineNum && (
                                                <span className="text-[9px] bg-red-500 text-white px-1 rounded flex items-center gap-0.5 font-bold animate-pulse">
                                                    <Lucide.AlertTriangle size={8} /> BOTTLE NECK
                                                </span>
                                            )}
                                        </div>
                                        <Lucide.ExternalLink size={12} className={`${selectedIndex === index ? 'text-indigo-500 opacity-100' : 'text-slate-300 opacity-0 group-hover:opacity-100'} transition-opacity`} />
                                    </div>
                                    <div className={`text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed ${selectedIndex === index ? 'text-indigo-900 dark:text-indigo-100' : 'text-slate-700 dark:text-slate-300'
                                        }`}>
                                        {log.content}
                                    </div>
                                </div>
                            </div>
                        )}
                    />
                )}
            </div>

            {/* Removed footer for space as requested by user */}
        </div>
    );
};

export default React.memo(TransactionDrawer);
