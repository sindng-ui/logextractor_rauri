import React, { useState, useRef } from 'react';
import * as Lucide from 'lucide-react';
import { IconButton } from '../../ui/IconButton';
import { LogRule } from '../../../types';

const { Highlighter, Palette, X } = Lucide;

const HIGHLIGHT_COLORS = [
    { label: 'Yellow', value: 'bg-yellow-200' },
    { label: 'Red', value: 'bg-red-200' },
    { label: 'Green', value: 'bg-green-200' },
    { label: 'Blue', value: 'bg-blue-200' },
    { label: 'Purple', value: 'bg-purple-200' },
    { label: 'Orange', value: 'bg-orange-200' },
    { label: 'Light Red', value: 'bg-red-100' },
];

interface HighlightSectionProps {
    currentConfig: LogRule;
    updateCurrentRule: (updates: Partial<LogRule>) => void;
    colorHighlightsCaseSensitive: boolean;
}

export const HighlightSection = React.memo<HighlightSectionProps>(({ currentConfig, updateCurrentRule, colorHighlightsCaseSensitive }) => {
    // New Item State
    const [newHighlightWord, setNewHighlightWord] = useState('');
    const [newHighlightColor, setNewHighlightColor] = useState('');
    const [newLineEffect, setNewLineEffect] = useState(false);

    // Inline Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editKeyword, setEditKeyword] = useState('');
    const [editColor, setEditColor] = useState('');
    const [editLineEffect, setEditLineEffect] = useState(false);

    // Refs
    const newHighlightInputRef = useRef<HTMLInputElement>(null);
    const editInputRef = useRef<HTMLInputElement>(null);

    const isHexColor = (color: string) => /^#[0-9A-F]{6}$/i.test(color);

    // creation
    const handleCreate = () => {
        if (!newHighlightWord.trim()) return;
        const h = {
            id: Math.random().toString(36).substring(7),
            keyword: newHighlightWord.trim(),
            color: newHighlightColor || HIGHLIGHT_COLORS[0].value,
            lineEffect: newLineEffect
        };
        updateCurrentRule({ highlights: [...(currentConfig.highlights || []), h] });
        setNewHighlightWord('');
        setNewLineEffect(false);
        // Keep focus on create input for rapid entry
        newHighlightInputRef.current?.focus();
    };

    // inline editing start
    const startEditing = (h: { id: string, keyword: string, color: string, lineEffect?: boolean }) => {
        setEditingId(h.id);
        setEditKeyword(h.keyword);
        setEditColor(h.color);
        setEditLineEffect(h.lineEffect || false);
        // Focus will be handled by autoFocus on the rendered input, 
        // or we can use a timeout to focus ref if needed. 
        // React's autoFocus usually works for conditional rendering.
    };

    // inline editing save
    const saveEdit = () => {
        if (!editingId || !editKeyword.trim()) {
            cancelEdit();
            return;
        }

        const updated = (currentConfig.highlights || []).map(h =>
            h.id === editingId
                ? { ...h, keyword: editKeyword.trim(), color: editColor || h.color, lineEffect: editLineEffect }
                : h
        );
        updateCurrentRule({ highlights: updated });
        setEditingId(null);
        setEditKeyword('');
        setEditColor('');
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditKeyword('');
        setEditColor('');
    };

    // Color Palette Logic
    const activeColor = editingId ? editColor : newHighlightColor;
    const handleColorSelect = (colorValue: string) => {
        if (editingId) {
            setEditColor(colorValue);
            // Re-focus the edit input so user can keep typing if they clicked color
            setTimeout(() => editInputRef.current?.focus(), 0);
        } else {
            setNewHighlightColor(colorValue);
            newHighlightInputRef.current?.focus();
        }
    };

    return (
        <div className="p-0">
            <div className="flex items-center justify-between mb-6">
                <label className="text-sm font-bold text-pink-200 flex items-center gap-2">
                    <Highlighter size={16} className="text-pink-400 icon-glow" />
                    Color Highlights
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-[10px] text-slate-500 hover:text-indigo-400 transition-colors uppercase font-bold tracking-wider">
                    <input type="checkbox" checked={colorHighlightsCaseSensitive} onChange={(e) => updateCurrentRule({ colorHighlightsCaseSensitive: e.target.checked })} className="accent-indigo-500 rounded-sm w-3 h-3" />
                    <span>Case Sensitive</span>
                </label>
            </div>

            <div className={`glass rounded-2xl p-4 border transition-colors ${editingId ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-pink-500/10'}`}>
                <div className="flex flex-col gap-3 mb-4">
                    {/* Color Picker: Controls NEW item or EDIT item depending on state */}
                    <div className="flex gap-2 flex-wrap">
                        {HIGHLIGHT_COLORS.map(c => (
                            <button
                                key={c.value}
                                onClick={() => handleColorSelect(c.value)}
                                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${c.value} ${activeColor === c.value || (!activeColor && c.value === HIGHLIGHT_COLORS[0].value) ? 'border-white scale-110 shadow-lg ring-2 ring-indigo-500/50' : 'border-transparent opacity-80'}`}
                                title={c.label}
                            />
                        ))}
                        <label className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer flex items-center justify-center overflow-hidden bg-slate-800 relative ${isHexColor(activeColor) ? 'border-white scale-110 shadow-lg ring-2 ring-indigo-500/50' : 'border-slate-600 opacity-80'}`} title="Custom Color">
                            {isHexColor(activeColor) && (<div className="absolute inset-0" style={{ backgroundColor: activeColor }}></div>)}
                            <Palette size={12} className={`relative z-10 ${isHexColor(activeColor) ? 'text-white drop-shadow-md' : 'text-slate-400'}`} />
                            <input
                                type="color"
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                value={isHexColor(activeColor) ? activeColor : '#000000'}
                                onChange={(e) => handleColorSelect(e.target.value)}
                            />
                        </label>
                    </div>

                    {/* Creation Input - Only enabled when NOT editing? Or always enabled? 
                        User wants "edit in place". 
                        To avoid confusion, maybe dim the create input when in edit mode?
                    */}
                    <div className={`relative transition-opacity flex gap-2 items-center ${editingId ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
                        <input
                            ref={newHighlightInputRef}
                            className={`flex-1 bg-slate-900/50 text-sm text-slate-200 placeholder-slate-500 focus:bg-slate-800 focus:outline-none py-2 px-3 rounded-xl border border-slate-700/50 focus:border-pink-500/50 transition-colors`}
                            placeholder={editingId ? "Finish editing first..." : "Type word to highlight..."}
                            value={newHighlightWord}
                            onChange={(e) => setNewHighlightWord(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreate();
                            }}
                            disabled={!!editingId}
                        />
                        <label className="flex items-center gap-1 cursor-pointer select-none text-xs text-slate-400 hover:text-indigo-400 font-bold uppercase tracking-wider bg-black/20 px-2 py-2 rounded-lg border border-transparent hover:border-indigo-500/30 transition-all">
                            <input
                                type="checkbox"
                                checked={newLineEffect}
                                onChange={(e) => setNewLineEffect(e.target.checked)}
                                className="accent-indigo-500 rounded-sm w-3 h-3"
                                disabled={!!editingId}
                            />
                            <span>Line</span>
                        </label>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {(currentConfig.highlights || []).map((h, i) => {
                        const isHex = isHexColor(h.color);
                        const isEditing = h.id === editingId;

                        // INLINE EDITOR
                        if (isEditing) {
                            return (
                                <div key={h.id} className="relative group flex items-center gap-1">
                                    <input
                                        ref={editInputRef}
                                        autoFocus
                                        value={editKeyword}
                                        onChange={(e) => setEditKeyword(e.target.value)}
                                        onKeyDown={(e) => {
                                            e.stopPropagation(); // Prevent global shortcuts
                                            if (e.key === 'Enter') saveEdit();
                                            if (e.key === 'Escape') cancelEdit();
                                        }}
                                        onBlur={() => {
                                            // Optional: Save on blur? 
                                            // If we save on blur, clicking color palette works naturally.
                                            // But if invalid, maybe cancel.
                                            // Let's try SAVE on blur if valid.
                                            if (editKeyword.trim()) saveEdit();
                                            else cancelEdit();
                                        }}
                                        style={isHexColor(editColor) ? { backgroundColor: editColor } : undefined}
                                        className={`w-24 px-2 py-1 rounded-lg text-xs font-bold text-slate-900 border-2 border-indigo-500 shadow-xl focus:outline-none transition-all ${!isHexColor(editColor) ? editColor : ''}`}
                                    />
                                    <label className="flex items-center justify-center cursor-pointer select-none text-xs text-slate-400 hover:text-indigo-400 font-bold bg-black/20 w-6 h-full rounded-md border border-transparent hover:border-indigo-500/30 transition-all" title="Toggle Line Mode">
                                        <input
                                            type="checkbox"
                                            checked={editLineEffect}
                                            onChange={(e) => setEditLineEffect(e.target.checked)}
                                            className="w-3 h-3 accent-indigo-500"
                                        />
                                    </label>
                                    <div className="absolute -top-3 -right-2 bg-indigo-500 text-white text-[9px] px-1.5 py-0.5 rounded-full shadow-sm font-bold animate-bounce hidden group-focus-within:block">
                                        ENTER
                                    </div>
                                </div>
                            );
                        }

                        // STANDARD DISPLAY
                        return (
                            <div
                                key={h.id}
                                onClick={(e) => {
                                    // Prevent edit if clicking delete
                                    if ((e.target as HTMLElement).closest('button')) return;
                                    startEditing(h);
                                }}
                                style={isHex ? { backgroundColor: h.color } : undefined}
                                className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-bold text-slate-900 border border-black/5 shadow-sm transition-all hover:scale-105 cursor-pointer select-none ${!isHex ? h.color : ''} active:scale-95`}
                                title="Click to edit"
                            >
                                {h.keyword}
                                {i < 5 && <span className="text-[9px] opacity-50 ml-1 font-mono">(#{i + 1})</span>}
                                <IconButton
                                    variant="ghost"
                                    size="xs"
                                    icon={<X size={12} />}
                                    className="text-slate-800/50 hover:text-black hover:bg-black/10 rounded-full"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        updateCurrentRule({ highlights: (currentConfig.highlights || []).filter(item => item.id !== h.id) });
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});
