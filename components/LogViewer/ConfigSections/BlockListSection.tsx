import React, { useState } from 'react';
import * as Lucide from 'lucide-react';
import { IconButton } from '../../ui/IconButton';
import { LogRule } from '../../../types';

const { ShieldAlert, X } = Lucide;

interface BlockListSectionProps {
    currentConfig: LogRule;
    updateCurrentRule: (updates: Partial<LogRule>) => void;
    blockListCaseSensitive: boolean;
}

export const BlockListSection = React.memo<BlockListSectionProps>(({ currentConfig, updateCurrentRule, blockListCaseSensitive }) => {
    // Edit State
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');
    const editInputRef = React.useRef<HTMLInputElement>(null);

    // Edit Handlers
    const startEditing = (index: number, val: string) => {
        setEditingIndex(index);
        setEditValue(val);
    };

    const saveEdit = () => {
        if (editingIndex === null) return;

        let newExcludes = [...currentConfig.excludes];

        if (!editValue.trim()) {
            // If empty, remove it
            newExcludes = newExcludes.filter((_, i) => i !== editingIndex);
        } else {
            // Update
            newExcludes[editingIndex] = editValue.trim();
        }

        updateCurrentRule({ excludes: newExcludes });
        cancelEdit();
    };

    const cancelEdit = () => {
        setEditingIndex(null);
        setEditValue('');
    };

    return (
        <div className="p-0">
            <div className="flex items-center justify-between mb-6">
                <label className="text-sm font-bold text-red-200 flex items-center gap-2">
                    <ShieldAlert size={16} className="text-red-500 icon-glow" />
                    Block List
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-[10px] text-slate-500 hover:text-indigo-400 transition-colors uppercase font-bold tracking-wider">
                    <input type="checkbox" checked={blockListCaseSensitive} onChange={(e) => updateCurrentRule({ blockListCaseSensitive: e.target.checked })} className="accent-indigo-500 rounded-sm w-3 h-3" />
                    <span>Case Sensitive</span>
                </label>
            </div>

            <div className="glass rounded-2xl p-4 border border-red-500/10 relative overflow-hidden group">
                <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                <div className="flex flex-wrap gap-2 relative z-10">
                    {currentConfig.excludes.map((exc, idx) => {
                        if (exc.trim() === '') return null;
                        const isEditing = editingIndex === idx;

                        if (isEditing) {
                            return (
                                <div key={idx} className="relative group">
                                    <input
                                        ref={editInputRef}
                                        autoFocus
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            e.stopPropagation();
                                            if (e.key === 'Enter') saveEdit();
                                            if (e.key === 'Escape') cancelEdit();
                                        }}
                                        onBlur={() => {
                                            if (editValue.trim()) saveEdit();
                                            else cancelEdit();
                                        }}
                                        className="w-24 px-2 py-1 rounded-lg text-sm font-bold text-red-900 bg-red-100 border-2 border-red-500 shadow-xl focus:outline-none transition-all"
                                    />
                                    <div className="absolute -top-3 -right-2 bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full shadow-sm font-bold animate-bounce hidden group-focus-within:block">
                                        ENTER
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div
                                key={idx}
                                onClick={(e) => {
                                    // Prevent edit if clicking delete button
                                    if ((e.target as HTMLElement).closest('button')) return;
                                    startEditing(idx, exc);
                                }}
                                className="flex items-center bg-red-500/10 text-red-200 px-3 py-1.5 rounded-lg text-sm font-medium border border-red-500/20 shadow-sm transition-transform hover:scale-105 cursor-pointer active:scale-95 select-none"
                                title="Click to edit"
                            >
                                <span>{exc}</span>
                                <IconButton
                                    variant="ghost"
                                    size="xs"
                                    icon={<X size={12} />}
                                    className="ml-2 text-red-400/50 hover:text-red-300 hover:bg-red-500/20 rounded-full"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        updateCurrentRule({ excludes: currentConfig.excludes.filter((_, i) => i !== idx) });
                                    }}
                                />
                            </div>
                        );
                    })}

                    <input
                        className={`bg-transparent text-sm text-slate-300 placeholder-slate-500/50 focus:text-red-100 focus:placeholder-red-400/50 transition-colors py-1.5 px-3 rounded-lg border border-transparent focus:border-red-500/30 focus:outline-none min-w-[120px] hover:bg-white/5 ${editingIndex !== null ? 'opacity-50 pointer-events-none' : ''}`}
                        placeholder={editingIndex !== null ? "Finish editing..." : "+ block word..."}
                        disabled={editingIndex !== null}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                updateCurrentRule({ excludes: [...currentConfig.excludes.filter(t => t !== ''), e.currentTarget.value.trim()] });
                                e.currentTarget.value = '';
                            } else if (e.key === 'Backspace' && !e.currentTarget.value) {
                                const activeExcludes = currentConfig.excludes.filter(t => t !== '');
                                if (activeExcludes.length > 0) {
                                    updateCurrentRule({ excludes: activeExcludes.slice(0, -1) });
                                }
                            }
                        }}
                    />
                </div>
            </div>
        </div>
    );
});
