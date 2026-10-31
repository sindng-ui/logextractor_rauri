import React, { useState, memo, useCallback } from 'react';
import { Trash2, RotateCcw, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { FindInAllHistoryItem } from '../../../hooks/useFindInAllHistory';

interface HistoryRowProps {
    item: FindInAllHistoryItem;
    onLoad: (item: FindInAllHistoryItem) => void;
}

const HistoryRow: React.FC<HistoryRowProps> = memo(({ item, onLoad }) => {
    const timeStr = new Date(item.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
    });
    const keywords = item.rule.includeKeywords;
    const excludes = item.rule.excludeKeywords;

    return (
        <button
            type="button"
            onClick={() => onLoad(item)}
            className="
                w-full text-left flex items-center gap-3 px-3.5 py-2 rounded-lg 
                hover:bg-slate-800/60 transition-all group font-mono text-xs
                border border-transparent hover:border-indigo-500/20
            "
        >
            <RotateCcw size={11} className="text-slate-500 group-hover:text-indigo-400 shrink-0 transition-colors" />

            {/* Keyword chips list preview */}
            <div className="flex-1 flex flex-wrap items-center gap-1.5 overflow-hidden">
                {keywords.map((kw, i) => (
                    <span
                        key={i}
                        className="
                            inline-block px-1.5 py-0.5 rounded-md 
                            bg-indigo-950/40 border border-indigo-900/50 
                            text-indigo-300 text-[10px] font-semibold
                            truncate max-w-[120px]
                        "
                    >
                        {kw}
                    </span>
                ))}
                {excludes.length > 0 && (
                    <span
                        className="
                            px-1 py-0.5 rounded bg-rose-950/40 border border-rose-900/30
                            text-rose-400 text-[9px] shrink-0
                        "
                    >
                        -{excludes.length} excl.
                    </span>
                )}
            </div>

            <span className="text-[10px] text-slate-500 shrink-0 flex items-center gap-1 font-sans">
                <Clock size={9} />
                {timeStr}
            </span>
        </button>
    );
});
HistoryRow.displayName = 'HistoryRow';

interface HistoryListProps {
    history: FindInAllHistoryItem[];
    onLoad: (item: FindInAllHistoryItem) => void;
    onClear: () => void;
}

const HistoryList: React.FC<HistoryListProps> = memo(({ history, onLoad, onClear }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const visibleLimit = 3;
    const hasMore = history.length > visibleLimit;
    
    const displayedItems = isExpanded ? history : history.slice(0, visibleLimit);

    const toggleExpand = useCallback(() => {
        setIsExpanded(prev => !prev);
    }, []);

    if (history.length === 0) return null;

    return (
        <div className="w-full px-5 pb-4 bg-slate-950/10 flex flex-col gap-1.5 relative">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-800/40 mb-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Search History</span>
                <button
                    type="button"
                    onClick={onClear}
                    className="
                        flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-500 
                        hover:text-rose-400 hover:bg-rose-950/30 transition-all
                        border border-transparent hover:border-rose-900/30
                    "
                    title="Clear search history"
                >
                    <Trash2 size={11} />
                    <span>Clear All</span>
                </button>
            </div>

            {/* List container with relative position for gradient overlay */}
            <div className="relative flex flex-col gap-1">
                {displayedItems.map(item => (
                    <HistoryRow key={item.id} item={item} onLoad={onLoad} />
                ))}

                {/* Gradient fade-out overlay to hint "there is more below" */}
                {hasMore && !isExpanded && (
                    <div 
                        className="
                            absolute bottom-0 left-0 right-0 h-10 
                            bg-gradient-to-t from-slate-900 via-slate-900/70 to-transparent 
                            pointer-events-none rounded-b-lg
                        "
                    />
                )}
            </div>

            {/* Expand / Collapse Control */}
            {hasMore && (
                <button
                    type="button"
                    onClick={toggleExpand}
                    className="
                        w-full flex items-center justify-center gap-1.5 py-1.5 mt-1
                        rounded-lg bg-slate-800/20 hover:bg-slate-800/40 border border-slate-800/40
                        text-[10px] font-bold text-slate-400 hover:text-slate-200 transition-all
                    "
                >
                    {isExpanded ? (
                        <>
                            <ChevronUp size={12} />
                            <span>Show Less</span>
                        </>
                    ) : (
                        <>
                            <ChevronDown size={12} />
                            <span>Show More (+{history.length - visibleLimit} searches)</span>
                        </>
                    )}
                </button>
            )}
        </div>
    );
});
HistoryList.displayName = 'HistoryList';

export default HistoryList;
