import React, { useState, useEffect, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, GripVertical, Sparkles, Check } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { LogRule } from '../../types';

interface MissionManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    rules: LogRule[];
    onUpdateRules: (rules: LogRule[]) => void;
}

interface SortableMissionItemProps {
    rule: LogRule;
}

const SortableMissionItem: React.FC<SortableMissionItemProps> = memo(({ rule }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: rule.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
        position: 'relative',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`group flex items-center gap-3 p-3 rounded-xl border select-none touch-none transition-colors ${
                isDragging
                    ? 'bg-slate-800 border-indigo-400 shadow-lg shadow-indigo-950/60 cursor-grabbing'
                    : 'bg-slate-800/50 border-slate-700/50 hover:border-indigo-500/30 hover:bg-slate-800 cursor-grab active:cursor-grabbing'
            }`}
        >
            <div className={`transition-colors ${isDragging ? 'text-indigo-400' : 'text-slate-500 group-hover:text-indigo-400'}`}>
                <GripVertical size={16} />
            </div>
            <span className="text-sm text-slate-200 font-medium truncate flex-1">
                {rule.name || 'Untitled Mission'}
            </span>
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isDragging ? 'bg-indigo-400' : 'bg-slate-700 group-hover:bg-indigo-500'}`} />
        </div>
    );
});

const MissionManagerModal: React.FC<MissionManagerModalProps> = memo(({
    isOpen,
    onClose,
    rules,
    onUpdateRules
}) => {
    const [items, setItems] = useState<LogRule[]>(rules);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 4,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Sync with props when modal opens
    useEffect(() => {
        if (isOpen) {
            setItems(rules);
        }
    }, [isOpen, rules]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        setItems((prev) => {
            const oldIndex = prev.findIndex((r) => r.id === active.id);
            const newIndex = prev.findIndex((r) => r.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return prev;
            return arrayMove(prev, oldIndex, newIndex);
        });
    }, []);

    const handleSave = () => {
        onUpdateRules(items);
        onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 no-drag"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
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

                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={items.map((r) => r.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2">
                                {items.map((rule) => (
                                    <SortableMissionItem key={rule.id} rule={rule} />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>

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
        </div>,
        document.body
    );
});

export default MissionManagerModal;
