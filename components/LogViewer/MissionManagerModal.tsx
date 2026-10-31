import React, { useState, useEffect, memo } from 'react';
import { X, GripVertical, Sparkles, Check } from 'lucide-react';
import { Reorder } from 'framer-motion';
import { LogRule } from '../../types';

interface MissionManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    rules: LogRule[];
    onUpdateRules: (rules: LogRule[]) => void;
}

const MissionManagerModal: React.FC<MissionManagerModalProps> = memo(({
    isOpen,
    onClose,
    rules,
    onUpdateRules
}) => {
    const [items, setItems] = useState<LogRule[]>(rules);

    // Sync with props when modal opens
    useEffect(() => {
        if (isOpen) {
            setItems(rules);
        }
    }, [isOpen, rules]);

    const handleSave = () => {
        onUpdateRules(items);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
            <div
                className="bg-slate-900 border border-indigo-500/30 rounded-2xl shadow-2xl w-full max-w-[500px] flex flex-col overflow-hidden max-h-[80vh]"
            >
                {/* Header */}
                <div className="bg-slate-950/80 p-5 border-b border-slate-800 flex justify-between items-center shrink-0">
                    <h2 className="text-sm font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                        <Sparkles size={18} /> Mission Manager
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 cursor-pointer text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <p className="text-[11px] text-slate-500 mb-4 px-2">
                        Drag to reorder missions. The order will be reflected in the selection dropdown.
                    </p>

                    <Reorder.Group
                        values={items}
                        onReorder={setItems}
                        className="space-y-2"
                    >
                        {items.map((rule) => (
                            <Reorder.Item
                                key={rule.id}
                                value={rule}
                                className="relative"
                            >
                                <div className="group flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl hover:border-indigo-500/30 hover:bg-slate-800 transition-all cursor-grab active:cursor-grabbing">
                                    <div className="text-slate-500 group-hover:text-indigo-400 transition-colors">
                                        <GripVertical size={16} />
                                    </div>
                                    <span className="text-sm text-slate-200 font-medium truncate flex-1">
                                        {rule.name || 'Untitled Mission'}
                                    </span>
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-indigo-500 transition-colors" />
                                </div>
                            </Reorder.Item>
                        ))}
                    </Reorder.Group>

                    {items.length === 0 && (
                        <div className="py-12 text-center text-slate-600 text-sm">
                            No missions registered.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-950/50 border-t border-slate-800 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-xl transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        <Check size={14} /> Apply Changes
                    </button>
                </div>
            </div>
        </div>
    );
});

export default MissionManagerModal;
