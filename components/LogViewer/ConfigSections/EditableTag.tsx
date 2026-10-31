import React, { useState, useRef, useEffect, memo } from 'react';
import * as Lucide from 'lucide-react';
import { IconButton } from '../../ui/IconButton';

const { X } = Lucide;

interface EditableTagProps {
    isEditing: boolean;
    value: string;
    isActive: boolean;
    onStartEdit: () => void;
    onCommit: (newVal: string) => void;
    onDelete: () => void;
    onNavigate: (key: string, empty: boolean) => void;
    isLast: boolean;
    groupIdx: number;
    termIdx: number;
}

export const EditableTag = memo(({
    isEditing,
    value,
    isActive,
    onStartEdit,
    onCommit,
    onDelete,
    onNavigate,
    isLast,
    groupIdx,
    termIdx,
}: EditableTagProps) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const committedRef = useRef(false);

    useEffect(() => {
        if (isEditing) {
            committedRef.current = false;
            if (inputRef.current) {
                inputRef.current.focus();
            }
        }
    }, [isEditing]);

    const handleCommit = (val: string) => {
        if (committedRef.current) return;
        committedRef.current = true;
        onCommit(val);
    };

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                className="bg-slate-700 text-slate-200 px-2 py-1 rounded text-xs font-medium border border-indigo-500 w-24 outline-none shadow-lg z-50 absolute-input"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={() => handleCommit(localValue)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCommit(localValue);
                        onNavigate('NextInput', false);
                    } else if (e.key === 'Tab') {
                        e.preventDefault();
                        handleCommit(localValue);
                        if (e.shiftKey) {
                            onNavigate('PreviousInput', false);
                        } else {
                            onNavigate('NextInput', false);
                        }
                    } else if (e.key === 'Escape') {
                        handleCommit(value); // Revert
                    } else if (e.key === 'Backspace') {
                        if (!localValue) {
                            e.preventDefault();
                            onDelete();
                            onNavigate('Backspace', true);
                        } else if (e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
                            // Jump to previous item if at start
                            e.preventDefault();
                            handleCommit(localValue);
                            onNavigate('Left', false);
                        }
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        handleCommit(localValue);
                        onNavigate('Up', false);
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        handleCommit(localValue);
                        onNavigate('Down', false);
                    } else if (e.key === 'ArrowLeft') {
                        if (e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
                            e.preventDefault();
                            handleCommit(localValue);
                            onNavigate('Left', false);
                        }
                    } else if (e.key === 'ArrowRight') {
                        if (e.currentTarget.selectionStart === localValue.length) {
                            e.preventDefault();
                            handleCommit(localValue);
                            onNavigate('Right', false);
                        }
                    }
                }}
            />
        );
    }

    return (
        <div
            onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
            className={`flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 ${isActive
                ? 'bg-slate-800/80 text-emerald-300 border-slate-700/50 hover:border-emerald-500/50 hover:bg-slate-800 shadow-sm'
                : 'bg-slate-900/50 text-slate-500 border-slate-800 opacity-70'
                }`}
        >
            <span>{value}</span>
            <IconButton
                variant="ghost"
                size="xs"
                icon={<X size={10} />}
                className={`ml-1.5 -mr-1 ${isActive ? 'text-slate-500 hover:text-red-400' : 'text-slate-700'}`}
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                }}
            />
        </div>
    );
});
