import React, { useState, useEffect } from 'react';
import { X, Moon, Sun, Keyboard, Info, Type, RotateCcw, BookOpen, Terminal, ExternalLink, Copy, Folder } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useHappyTool } from '../contexts/HappyToolContext';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentStartLineIndex: number;
    enabledPlugins?: string[];
    setEnabledPlugins?: (plugins: string[]) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { addToast } = useToast();
    const { defaultOutputFolder, setDefaultOutputFolder } = useHappyTool();
    const [activeTab, setActiveTab] = useState<'general' | 'shortcuts' | 'cli' | 'guide' | 'about'>('general');
    const [theme] = useState<'dark' | 'light'>(() => {
        return localStorage.getItem('theme') as 'dark' | 'light' || 'dark';
    });
    const [zoom, setZoom] = useState(1);

    useEffect(() => {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        if (isOpen && window.electronAPI?.getZoomFactor) {
            setZoom(window.electronAPI.getZoomFactor());
        }
    }, [isOpen]);

    const handleZoomChange = (val: number) => {
        const newZoom = Math.min(Math.max(0.5, val), 3.0);
        setZoom(newZoom);
        window.electronAPI?.setZoomFactor && window.electronAPI.setZoomFactor(newZoom);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 w-screen h-screen z-[100000] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        Settings
                    </h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-48 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-white/5 p-2 flex flex-col gap-1">
                        <button
                            onClick={() => setActiveTab('general')}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all outline-none ${activeTab === 'general' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800/50'}`}
                        >
                            <Type size={16} /> General
                        </button>
                        <button
                            onClick={() => setActiveTab('shortcuts')}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all outline-none ${activeTab === 'shortcuts' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800/50'}`}
                        >
                            <Keyboard size={16} /> Shortcuts
                        </button>
                        <button
                            onClick={() => setActiveTab('cli')}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all outline-none ${activeTab === 'cli' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800/50'}`}
                        >
                            <Terminal size={16} /> Headless CLI
                        </button>
                        <button
                            onClick={() => setActiveTab('guide')}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all outline-none ${activeTab === 'guide' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800/50'}`}
                        >
                            <BookOpen size={16} /> User Guide
                        </button>
                        <button
                            onClick={() => setActiveTab('about')}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all outline-none ${activeTab === 'about' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800/50'}`}
                        >
                            <Info size={16} /> About
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 p-6 overflow-y-auto bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 custom-scrollbar">

                        {/* General Tab */}
                        {activeTab === 'general' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-200 will-change-transform">
                                <div>
                                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-700 dark:text-slate-300"><Moon size={18} /> Appearance</h3>
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => { }}
                                            className={`flex-1 p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${theme === 'dark' ? 'border-indigo-500 bg-slate-800 text-white shadow-lg shadow-indigo-500/20' : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600 opacity-50 cursor-not-allowed'}`}
                                            title="Theme switching is disabled"
                                        >
                                            <Moon size={24} />
                                            <span className="font-medium">Dark Mode</span>
                                        </button>
                                        <button
                                            onClick={() => { }}
                                            className={`flex-1 p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${theme === 'light' ? 'border-indigo-500 bg-white text-slate-900 shadow-lg' : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600 opacity-50 cursor-not-allowed'}`}
                                            title="Theme switching is disabled"
                                        >
                                            <Sun size={24} />
                                            <span className="font-medium">Light Mode</span>
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-700 dark:text-slate-300"><Type size={18} /> UI Zoom</h3>
                                    <div className="flex items-center gap-4 bg-white dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-white/5">
                                        <button onClick={() => handleZoomChange(zoom - 0.1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-500 dark:text-slate-300">-</button>
                                        <div className="flex-1">
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="2.0"
                                                step="0.1"
                                                value={zoom}
                                                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                                                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                            />
                                        </div>
                                        <button onClick={() => handleZoomChange(zoom + 0.1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-500 dark:text-slate-300">+</button>
                                        <span className="font-mono w-16 text-center text-slate-700 dark:text-slate-300 font-bold">{Math.round(zoom * 100)}%</span>
                                        <button onClick={() => handleZoomChange(1.0)} className="text-xs text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 flex items-center gap-1 transition-colors ml-2" title="Reset Zoom"><RotateCcw size={12} /> Reset</button>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 ml-1">Use Ctrl + +/- to zoom quickly.</p>
                                </div>
                            </div>
                        )}

                        {/* CLI Tab */}
                        {activeTab === 'cli' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-200 will-change-transform">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-300">
                                        <Terminal size={18} className="text-indigo-500" /> CLI Settings & Guide
                                    </h3>
                                    <button
                                        onClick={async () => {
                                            if (window.electronAPI?.openExternal && window.electronAPI?.getAppPath) {
                                                const appPath = await window.electronAPI.getAppPath();
                                                const guidePath = `${appPath}/important/cli_user_guide.md`;
                                                window.electronAPI.openExternal(guidePath);
                                            }
                                        }}
                                        className="text-[10px] items-center gap-1 font-bold text-slate-500 hover:text-indigo-400 transition-colors uppercase flex"
                                    >
                                        <ExternalLink size={10} /> Open Full Guide
                                    </button>
                                </div>

                                {/* Configuration */}
                                <div className="bg-white dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-white/5 p-6 space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                            <Folder size={20} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">Default Output Folder</h4>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400">Used for saving logs/files unless --output is specified.</p>
                                        </div>
                                    </div>

                                    <div className="relative group">
                                        <input
                                            type="text"
                                            value={defaultOutputFolder || ''}
                                            onChange={(e) => setDefaultOutputFolder(e.target.value)}
                                            placeholder="e.g. C:\HappyTool_Outputs (Leave blank for current dir)"
                                            className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                                        />
                                    </div>
                                </div>

                                {/* CLI Usage Guide */}
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-400 flex items-center gap-2 px-1">
                                        Quick Commands
                                    </h4>

                                    <div className="grid grid-cols-1 gap-4">
                                        {/* Command Card: Log Extractor */}
                                        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden group/card hover:border-indigo-500/20 transition-all">
                                            <div className="px-4 py-3 bg-slate-100/50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm">📡</span>
                                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Log Extractor</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText('.\\HappyTool.exe cli log-extractor -f "FilterName" -i "test.log"');
                                                        addToast('Command copied to clipboard', 'info');
                                                    }}
                                                    className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-indigo-400 transition-all"
                                                >
                                                    <Copy size={14} />
                                                </button>
                                            </div>
                                            <div className="p-4 space-y-2">
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Filter and export large log files in the background</p>
                                                <div className="bg-slate-950 rounded-lg p-3 font-mono text-[11px] text-indigo-400/90 leading-relaxed border border-white/5">
                                                    .\HappyTool.exe cli log-extractor -f "Filter" -i "path"
                                                </div>
                                            </div>
                                        </div>

                                        {/* Command Card: Analyze Diff */}
                                        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden group/card hover:border-indigo-500/20 transition-all">
                                            <div className="px-4 py-3 bg-slate-100/50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm">📊</span>
                                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Analyze Diff</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText('.\\HappyTool.exe cli analyze-diff -f "Step" -l "old.log" -r "new.log" -o "diff.json"');
                                                        addToast('Command copied to clipboard', 'info');
                                                    }}
                                                    className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-indigo-400 transition-all"
                                                >
                                                    <Copy size={14} />
                                                </button>
                                            </div>
                                            <div className="p-4 space-y-2">
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Analyze performance differences and new events between two logs</p>
                                                <div className="bg-slate-950 rounded-lg p-3 font-mono text-[11px] text-indigo-400/90 leading-relaxed border border-white/5">
                                                    .\HappyTool.exe cli analyze-diff -f "Mission" -l "left.log" -r "right.log" -o "diff.json"
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Advanced Tip Block */}
                                    <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 mt-6 group">
                                        <div className="flex items-center gap-2 text-indigo-400 font-bold text-[11px] uppercase tracking-widest mb-2">
                                            <Info size={12} /> Advanced Technical Tip
                                        </div>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                            HappyTool CLI operates internally by invoking a **Hidden BrowserWindow**.
                                            This allows full support for **WASM (WebAssembly)** engine and **SharedArrayBuffer** high-performance multi-threaded filtering even in terminal environments.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Shortcuts Tab */}
                        {activeTab === 'shortcuts' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200 will-change-transform">
                                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-700 dark:text-slate-300"><Keyboard size={18} /> Keyboard Shortcuts</h3>

                                {[
                                    {
                                        title: '🌐 Global',
                                        description: 'Shortcuts available globally',
                                        items: [
                                            { action: 'Open Settings', keys: ['Ctrl', ','] },
                                            { action: 'Command Palette', keys: ['Ctrl', 'K'] },
                                            { action: 'Command Palette (Alt)', keys: ['Ctrl', 'P'] },
                                            { action: 'Zoom In', keys: ['Ctrl', '+'] },
                                            { action: 'Zoom Out', keys: ['Ctrl', '-'] },
                                            { action: 'Reset Zoom', keys: ['Ctrl', '0'] },
                                        ],
                                    },
                                    {
                                        title: '📊 Log Extractor',
                                        description: 'Shortcuts for Log Extractor',
                                        items: [
                                            { action: 'New Tab', keys: ['Ctrl', 'T'] },
                                            { action: 'Close Tab', keys: ['Ctrl', 'W'] },
                                            { action: 'Next Tab', keys: ['Ctrl', 'Tab'] },
                                            { action: 'Previous Tab', keys: ['Ctrl', 'Shift', 'Tab'] },
                                            { action: 'Find', keys: ['Ctrl', 'F'] },
                                            { action: 'Go to Line', keys: ['Ctrl', 'G'] },
                                            { action: 'Open Log Archive', keys: ['Ctrl', 'Shift', 'L'] },
                                            { action: 'View Bookmarks', keys: ['Ctrl', 'B'] },
                                            { action: 'Toggle Bookmark', keys: ['Space'] },
                                            { action: 'Next Bookmark', keys: ['F4'] },
                                            { action: 'Previous Bookmark', keys: ['F3'] },
                                            { action: 'Go to Highlight #N', keys: ['Ctrl', '1~5'] },
                                            { action: 'Toggle Settings Panel', keys: ['Ctrl', '`'] },
                                            { action: 'Increase Font Size', keys: ['Ctrl', ']'] },
                                            { action: 'Decrease Font Size', keys: ['Ctrl', '['] },
                                            { action: 'Clear Logs (Real-time)', keys: ['Ctrl', 'Shift', 'X'] },
                                            { action: 'Copy Selected Log', keys: ['Ctrl', 'C'] },
                                            { action: 'Page Navigation', keys: ['PageUp', 'PageDown'] },
                                            { action: 'Sync Scroll', keys: ['Shift', 'Scroll'] },
                                        ],
                                    },
                                ].map((group, groupIdx) => (
                                    <div key={groupIdx} className="bg-white dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden">
                                        <div className="px-4 py-3 bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-white/5">
                                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">{group.title}</h4>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{group.description}</p>
                                        </div>
                                        <div className="divide-y divide-slate-100 dark:divide-white/5">
                                            {group.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                    <span className="text-sm text-slate-700 dark:text-slate-300">{item.action}</span>
                                                    <div className="flex gap-1">
                                                        {item.keys.map((k, kIdx) => (
                                                            <span key={kIdx} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700/50 rounded text-xs font-mono border border-slate-200 dark:border-slate-600/50 shadow-sm min-w-[24px] text-center text-slate-600 dark:text-slate-300">{k}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* About Tab */}
                        {activeTab === 'about' && (
                            <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200 will-change-transform py-10">
                                <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[2rem] mx-auto shadow-2xl shadow-indigo-500/20 flex items-center justify-center transform rotate-3 hover:rotate-0 transition-transform duration-500">
                                    <span className="text-5xl font-black text-white">H</span>
                                </div>
                                <div>
                                    <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-gradient-x">HappyTool Light</h1>
                                    <p className="text-slate-500 dark:text-slate-400 font-mono mt-2 text-sm bg-slate-100 dark:bg-slate-800/50 inline-block px-3 py-1 rounded-full border border-slate-200 dark:border-white/5">v{__APP_VERSION__}</p>
                                </div>
                                <div className="p-8 bg-white dark:bg-slate-800/30 rounded-3xl border border-slate-200 dark:border-white/5 text-sm leading-relaxed max-w-sm mx-auto shadow-xl">
                                    <p className="text-slate-600 dark:text-slate-300 font-medium">
                                        High-Performance Log Analyzer.
                                        Designed for speed, clarity, and productivity.
                                    </p>
                                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-white/5 text-xs text-slate-400 dark:text-slate-500">
                                        © 2025 Samsung Electronics Co., Ltd. <br />All rights reserved.
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* User Guide Tab */}
                        {activeTab === 'guide' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200 will-change-transform">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl mx-auto shadow-xl shadow-indigo-500/20 flex items-center justify-center mb-4 icon-glow">
                                        <BookOpen size={32} className="text-white" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">HappyTool User Guide</h3>
                                    <p className="text-slate-600 dark:text-slate-400">Learn more about Log Analyzer features</p>
                                </div>

                                <div className="bg-white dark:bg-slate-800/50 rounded-3xl p-6 border border-slate-200 dark:border-white/5 shadow-xl">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex items-start gap-4 p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700/50">
                                            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center flex-shrink-0 text-indigo-500">
                                                <span className="text-2xl">📊</span>
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Log Extractor</h4>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Powerful analysis tool to quickly find desired content in large log files</p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-4 p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700/50">
                                            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-500/10 rounded-xl flex items-center justify-center flex-shrink-0 text-blue-500">
                                                <span className="text-2xl">⚖️</span>
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Analyze Diff</h4>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Precisely analyze time differences and new events between two log files</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
