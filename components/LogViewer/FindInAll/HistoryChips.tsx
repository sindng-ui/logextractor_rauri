import React, { memo } from 'react';
import { Trash2, Clock } from 'lucide-react';
import { FindInAllHistoryItem } from '../../../hooks/useFindInAllHistory';

interface HistoryChipProps {
    item: FindInAllHistoryItem;
    onLoad: (item: FindInAllHistoryItem) => void;
}

const HistoryChip: React.FC<HistoryChipProps> = memo(({ item, onLoad }) => {
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
                inline-flex items-center gap-2 px-3 py-1.5 rounded-xl
                bg-slate-800/40 border border-slate-700/40
                hover:bg-indigo-950/35 hover:border-indigo-500/40
                text-slate-300 transition-all text-[11px] font-mono shrink-0 select-none cursor-pointer
                group
            "
        >
            <Clock size={10} className="text-slate-500 group-hover:text-indigo-400 transition-colors" />
            <span className="text-[10px] text-slate-500 font-sans">{timeStr}</span>
            <span className="w-[1px] h-2.5 bg-slate-700/60" />
            
            {/* keyword chips list preview */}
            <div className="flex items-center gap-1 overflow-hidden max-w-[280px]">
                {keywords.map((kw, i) => (
                    <span
                        key={i}
                        className="
                            px-1.5 py-0.5 rounded-md
                            bg-indigo-950/40 border border-indigo-900/50
                            text-indigo-300 text-[10px] font-semibold font-mono
                            truncate max-w-[90px]
                        "
                    >
                        {kw}
                    </span>
                ))}
            </div>

            {excludes.length > 0 && (
                <span
                    className="
                        px-1 py-0.5 rounded bg-rose-950/50 border border-rose-900/40
                        text-rose-400 text-[9px] font-mono shrink-0
                    "
                >
                    -{excludes.length} excl.
                </span>
            )}
        </button>
    );
});
HistoryChip.displayName = 'HistoryChip';

interface HistoryChipsProps {
    history: FindInAllHistoryItem[];
    onLoad: (item: FindInAllHistoryItem) => void;
    onClear: () => void;
}

const HistoryChips: React.FC<HistoryChipsProps> = memo(({ history, onLoad, onClear }) => {
    if (history.length === 0) return null;

    return (
        <div className="w-full flex items-center gap-2 px-5 py-2.5 bg-slate-950/30 border-t border-slate-800/40">
            <div
                className="
                    flex-1 flex items-center gap-2 overflow-x-auto py-0.5 select-none
                    scrollbar-none
                "
                style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                }}
            >
                {history.map(item => (
                    <HistoryChip key={item.id} item={item} onLoad={onLoad} />
                ))}
            </div>
            
            <button
                type="button"
                onClick={onClear}
                className="
                    p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30
                    rounded-lg transition-all shrink-0 ml-2 border border-transparent
                    hover:border-rose-900/40
                "
                title="Clear all search history"
            >
                <Trash2 size={13} />
            </button>
        </div>
    );
});
HistoryChips.displayName = 'HistoryChips';

export default HistoryChips;
