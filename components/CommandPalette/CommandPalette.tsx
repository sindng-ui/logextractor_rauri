import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as Lucide from 'lucide-react';
import { useCommand, Command } from '../../contexts/CommandContext';

const { Search, Command: CommandIcon, CornerDownLeft } = Lucide;

const CommandPalette: React.FC = () => {
    const { isOpen, closePalette, commands } = useCommand();
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Reset state when opened
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            // Small timeout to allow render before focusing
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Filter commands
    const filteredCommands = useMemo(() => {
        if (!query.trim()) return commands;
        const lowerQuery = query.toLowerCase();
        return commands.filter(cmd =>
            cmd.title.toLowerCase().includes(lowerQuery) ||
            cmd.section?.toLowerCase().includes(lowerQuery) ||
            cmd.keywords?.some(k => k.toLowerCase().includes(lowerQuery))
        );
    }, [commands, query]);

    // Group by section
    const groupedCommands = useMemo(() => {
        const groups: Record<string, Command[]> = {};
        filteredCommands.forEach(cmd => {
            const section = cmd.section || 'General';
            if (!groups[section]) groups[section] = [];
            groups[section].push(cmd);
        });
        return groups;
    }, [filteredCommands]);

    // Flattened list for keyboard navigation
    const flatList = useMemo(() => {
        const list: Command[] = [];
        Object.keys(groupedCommands).sort().forEach(section => {
            list.push(...groupedCommands[section]);
        });
        return list;
    }, [groupedCommands]);

    // Keyboard Navigation
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % flatList.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + flatList.length) % flatList.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (flatList[selectedIndex]) {
                    const cmd = flatList[selectedIndex];
                    cmd.action();
                    closePalette();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closePalette();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, flatList, selectedIndex, closePalette]);

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current && isOpen) {
            const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
            if (selectedEl) {
                selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [selectedIndex, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000000] flex items-start justify-center pt-[20vh] px-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-950/80"
                onClick={closePalette}
            />

            {/* Modal */}
            <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">

                {/* Search Bar */}
                <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                    <Search className="text-slate-400 mr-3" size={20} />
                    <input
                        ref={inputRef}
                        className="flex-1 bg-transparent text-lg focus:outline-none placeholder-slate-400 text-slate-800 dark:text-slate-200"
                        placeholder="Type a command or search..."
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setSelectedIndex(0);
                        }}
                    />
                    <div className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-xs font-mono text-slate-500 border border-slate-200 dark:border-slate-700">
                        ESC
                    </div>
                </div>

                {/* Results List */}
                <div
                    ref={listRef}
                    className="max-h-[60vh] overflow-y-auto overflow-x-hidden custom-scrollbar py-2"
                >
                    {flatList.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                            <p>No commands found.</p>
                        </div>
                    ) : (
                        Object.keys(groupedCommands).sort().map(section => (
                            <div key={section} className="mb-2">
                                <div className="px-4 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider sticky top-0 bg-white/95 dark:bg-slate-900/95 z-10">
                                    {section}
                                </div>
                                {groupedCommands[section].map(cmd => {
                                    const index = flatList.indexOf(cmd);
                                    const isSelected = index === selectedIndex;

                                    return (
                                        <div
                                            key={cmd.id}
                                            data-index={index}
                                            className={`
                                                flex items-center px-4 py-3 mx-2 rounded-lg cursor-pointer transition-colors
                                                ${isSelected
                                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                                }
                                            `}
                                            onClick={() => {
                                                cmd.action();
                                                closePalette();
                                            }}
                                            onMouseEnter={() => setSelectedIndex(index)}
                                        >
                                            <div className={`mr-4 ${isSelected ? 'text-white' : 'text-slate-400'}`}>
                                                {cmd.icon || <CommandIcon size={18} />}
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-medium text-sm">{cmd.title}</div>
                                            </div>
                                            {cmd.shortcut && (
                                                <div className={`text-xs font-mono ml-4 px-1.5 py-0.5 rounded ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
                                                    {cmd.shortcut}
                                                </div>
                                            )}
                                            {isSelected && (
                                                <CornerDownLeft size={14} className="ml-3 text-white/70" />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="bg-slate-50 dark:bg-slate-950 px-4 py-2 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500">
                    <span className="flex items-center gap-2">
                        <span className="font-medium">ProTip:</span> Use Up/Down to navigate, Enter to select
                    </span>
                    <span>{flatList.length} commands</span>
                </div>
            </div>
        </div>
    );
};

export default CommandPalette;
