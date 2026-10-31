import React from 'react';
import * as Lucide from 'lucide-react';
import { ExtractedEntity, detectEntities } from '../../utils/logEntityDetector';

interface EntityChipBarProps {
    logLineContent: string;
    onApplyFilter: (value: string) => void;
    onAddHighlight: (value: string) => void;
}

export const EntityChipBar: React.FC<EntityChipBarProps> = ({
    logLineContent,
    onApplyFilter,
    onAddHighlight
}) => {
    const entities = React.useMemo(() => detectEntities(logLineContent), [logLineContent]);

    if (entities.length === 0) {
        return null; // Don't render anything if no entities detected
    }

    // Dynamic style mapping for entities
    const getChipStyles = (type: ExtractedEntity['type']) => {
        switch (type) {
            case 'pid':
                return {
                    bg: 'bg-indigo-950/30 hover:bg-indigo-900/40',
                    border: 'border-indigo-500/30 hover:border-indigo-400',
                    text: 'text-indigo-300',
                    iconColor: 'text-indigo-400'
                };
            case 'tid':
                return {
                    bg: 'bg-sky-950/30 hover:bg-sky-900/40',
                    border: 'border-sky-500/30 hover:border-sky-400',
                    text: 'text-sky-300',
                    iconColor: 'text-sky-400'
                };
            case 'hex':
                return {
                    bg: 'bg-amber-950/30 hover:bg-amber-900/40',
                    border: 'border-amber-500/30 hover:border-amber-400',
                    text: 'text-amber-300',
                    iconColor: 'text-amber-400'
                };
            default:
                return {
                    bg: 'bg-slate-900/40 hover:bg-slate-800/50',
                    border: 'border-slate-700 hover:border-slate-600',
                    text: 'text-slate-300',
                    iconColor: 'text-slate-400'
                };
        }
    };

    return (
        <div className="bg-slate-900 border-b border-indigo-950 flex items-center shrink-0 py-1.5 px-4 h-10 select-none overflow-hidden no-drag pointer-events-auto">
            {/* Lead Title Label */}
            <span className="text-[10px] font-black uppercase text-indigo-400/70 tracking-wider flex items-center gap-1 mr-3 shrink-0">
                <Lucide.Cpu size={12} /> Smart Entities:
            </span>

            {/* Horizontal Scrollable Chips Container */}
            <div className="flex-1 flex gap-2 items-center overflow-x-auto scrollbar-none py-0.5 pr-2">
                {entities.map((entity, idx) => {
                    const styles = getChipStyles(entity.type);

                    return (
                        <div
                            key={`${entity.type}-${entity.value}-${idx}`}
                            className={`flex items-center h-6 rounded-md border ${styles.bg} ${styles.border} transition-all duration-200 shadow-sm shrink-0 pl-2 pr-1`}
                        >
                            {/* Entity Label (Value) */}
                            <span className={`text-[10px] font-mono font-bold ${styles.text} mr-2`}>
                                {entity.label}
                            </span>

                            <div className="h-3 w-px bg-slate-800 mx-1 shrink-0" />

                            {/* Dual action buttons inside the chip */}
                            <div className="flex items-center gap-0.5">
                                {/* 1. Quick Filter Action */}
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onApplyFilter(entity.value);
                                    }}
                                    className={`p-0.5 rounded hover:bg-slate-800 text-[10px] ${styles.iconColor} hover:text-white transition-colors cursor-pointer`}
                                    title={`Filter logs matching "${entity.value}"`}
                                >
                                    <Lucide.Filter size={10} />
                                </button>

                                {/* 2. Quick Highlight Action */}
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onAddHighlight(entity.value);
                                    }}
                                    className={`p-0.5 rounded hover:bg-slate-800 text-[10px] ${styles.iconColor} hover:text-white transition-colors cursor-pointer`}
                                    title={`Highlight "${entity.value}"`}
                                >
                                    <Lucide.Sparkles size={10} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            <span className="text-[9px] text-slate-500 font-medium shrink-0 ml-2">
                💡 Click <span className="text-indigo-400 font-bold">Filter</span> to query, <span className="text-indigo-400 font-bold">Spark</span> to highlight
            </span>
        </div>
    );
};
