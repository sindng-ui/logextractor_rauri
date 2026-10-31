import React, { useState, useEffect } from 'react';
import * as Lucide from 'lucide-react';

const { X, Keyboard, Command } = Lucide;

interface Shortcut {
    keys: string[];
    description: string;
    category: string;
}

const shortcuts: Shortcut[] = [
    // Global
    { keys: ['Ctrl', ','], description: 'Open Settings', category: 'Global' },
    { keys: ['Ctrl', 'K'], description: 'Command Palette', category: 'Global' },
    { keys: ['Ctrl', 'P'], description: 'Command Palette (Alt)', category: 'Global' },
    { keys: ['Ctrl', 'Shift', '+'], description: 'Zoom In', category: 'Global' },
    { keys: ['Ctrl', 'Shift', '-'], description: 'Zoom Out', category: 'Global' },
    { keys: ['Ctrl', '0'], description: 'Reset Zoom', category: 'Global' },

    // Log Extractor
    { keys: ['Ctrl', 'T'], description: 'New Tab', category: 'Log Extractor' },
    { keys: ['Ctrl', 'W'], description: 'Close Tab', category: 'Log Extractor' },
    { keys: ['Ctrl', 'Tab'], description: 'Next Tab', category: 'Log Extractor' },
    { keys: ['Ctrl', 'Shift', 'Tab'], description: 'Previous Tab', category: 'Log Extractor' },
    { keys: ['Ctrl', 'F'], description: 'Find', category: 'Log Extractor' },
    { keys: ['Ctrl', 'G'], description: 'Go to Line', category: 'Log Extractor' },
    { keys: ['Ctrl', 'Shift', 'A'], description: 'Open Log Archive', category: 'Log Extractor' },
    { keys: ['Ctrl', 'B'], description: 'View Bookmarks', category: 'Log Extractor' },
    { keys: ['Space'], description: 'Toggle Bookmark', category: 'Log Extractor' },
    { keys: ['F4'], description: 'Next Bookmark', category: 'Log Extractor' },
    { keys: ['F3'], description: 'Previous Bookmark', category: 'Log Extractor' },
    { keys: ['Ctrl', '1~5'], description: 'Go to Highlight #N', category: 'Log Extractor' },
    { keys: ['Ctrl', '`'], description: 'Toggle Settings Panel', category: 'Log Extractor' },
    { keys: ['Ctrl', ']'], description: 'Increase Font Size', category: 'Log Extractor' },
    { keys: ['Ctrl', '['], description: 'Decrease Font Size', category: 'Log Extractor' },
    { keys: ['Ctrl', 'Shift', 'X'], description: 'Clear Logs (Real-time)', category: 'Log Extractor' },
    { keys: ['Ctrl', 'C'], description: 'Copy Selected Log', category: 'Log Extractor' },
    { keys: ['PageUp', 'PageDown'], description: 'Page Navigation', category: 'Log Extractor' },
    { keys: ['Shift', 'Scroll'], description: 'Sync Scroll', category: 'Log Extractor' },
];

export const KeyboardShortcutsPanel: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);

    // ✅ Performance: Listen for Ctrl+? to toggle
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === '?') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            // ESC to close
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    if (!isOpen) return null;

    // Group shortcuts by category
    const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
        if (!acc[shortcut.category]) {
            acc[shortcut.category] = [];
        }
        acc[shortcut.category].push(shortcut);
        return acc;
    }, {} as Record<string, Shortcut[]>);

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/80  z-[9998] transition-opacity duration-200"
                onClick={() => setIsOpen(false)}
            />

            {/* Panel */}
            <div className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none">
                <div
                    className="bg-slate-900/95  border border-indigo-500/30 rounded-2xl shadow-2xl shadow-indigo-500/20 max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden pointer-events-auto transition-all duration-200 scale-100"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/10 rounded-lg">
                                <Keyboard size={24} className="text-indigo-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-100">Keyboard Shortcuts</h2>
                                <p className="text-xs text-slate-400 mt-0.5">Press Ctrl+? to toggle this panel</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-2 hover:bg-slate-800 rounded-lg transition-all duration-200"
                        >
                            <X size={20} className="text-slate-400 hover:text-slate-200" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="overflow-y-auto max-h-[calc(80vh-100px)] p-6 custom-scrollbar">
                        {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
                            <div key={category} className="mb-6 last:mb-0">
                                <h3 className="text-sm font-bold text-indigo-400 mb-3 uppercase tracking-wider">
                                    {category}
                                </h3>
                                <div className="space-y-2">
                                    {categoryShortcuts.map((shortcut, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-800/50 transition-all duration-200 group"
                                        >
                                            <span className="text-sm text-slate-300 group-hover:text-slate-100 transition-colors">
                                                {shortcut.description}
                                            </span>
                                            <div className="flex gap-1">
                                                {shortcut.keys.map((key, keyIdx) => (
                                                    <React.Fragment key={keyIdx}>
                                                        <kbd className="px-2 py-1 min-w-[32px] text-center bg-slate-800 border border-slate-700 rounded text-xs font-mono text-slate-300 shadow-sm group-hover:bg-indigo-500/10 group-hover:border-indigo-500/30 transition-all duration-200">
                                                            {key}
                                                        </kbd>
                                                        {keyIdx < shortcut.keys.length - 1 && (
                                                            <span className="text-slate-600 mx-1 text-xs self-center">+</span>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-white/10 bg-slate-950/50">
                        <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                            <Command size={12} />
                            <span>Pro tip: Most shortcuts work across all tools</span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

// ✅ Performance: Floating button to open shortcuts panel
export const KeyboardShortcutsButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="fixed bottom-4 left-4 z-[9997] p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg shadow-indigo-500/30 transition-all duration-200 hover:scale-110 group"
            title="Keyboard Shortcuts (Ctrl+?)"
        >
            <Keyboard size={20} className={`transition-transform duration-200 ${isHovered ? 'scale-110' : ''}`} />
            {isHovered && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap border border-indigo-500/30">
                    Shortcuts (Ctrl+?)
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                        <div className="w-2 h-2 bg-slate-900 rotate-45 border-r border-b border-indigo-500/30" />
                    </div>
                </div>
            )}
        </button>
    );
};
