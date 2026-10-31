import React, { useState, useEffect, useMemo } from 'react';
import { Terminal, Plus, X, Play, Edit2, Trash2, ChevronRight, ChevronLeft, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmDialog } from '../ui/CommonDialogs';

interface QuickCommand {
    id: string;
    name: string;
    cmd: string;
}

interface QuickCommandPanelProps {
    onExecute: (cmd: string) => void;
    onSpecialKey?: (key: 'ctrl_p' | 'ctrl_c' | 'ctrl_p_thrice') => void;
    isConnected: boolean;
}

const QuickCommandPanel: React.FC<QuickCommandPanelProps> = ({ onExecute, onSpecialKey, isConnected }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [commands, setCommands] = useState<QuickCommand[]>(() => {
        const saved = localStorage.getItem('quickCommands');
        return saved ? JSON.parse(saved) : [
            { id: '1', name: 'Log Clear', cmd: 'dlogutil -c' },
            { id: '2', name: 'Process List', cmd: 'ps -ef' },
            { id: '3', name: 'Restart App', cmd: 'app_control restart' }
        ];
    });

    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<{ id?: string, name: string, cmd: string }>({ name: '', cmd: '' });
    const [dialogConfig, setDialogConfig] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredCommands = useMemo(() => {
        return commands.filter(c => 
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            c.cmd.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [commands, searchQuery]);

    useEffect(() => {
        localStorage.setItem('quickCommands', JSON.stringify(commands));
    }, [commands]);

    const handleSave = () => {
        if (!editData.name || !editData.cmd) return;
        if (editData.id) {
            setCommands(prev => prev.map(c => c.id === editData.id ? { ...c, name: editData.name, cmd: editData.cmd } : c));
        } else {
            setCommands(prev => [...prev, { id: Math.random().toString(36).substring(7), name: editData.name, cmd: editData.cmd }]);
        }
        setIsEditing(false);
        setEditData({ name: '', cmd: '' });
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setDialogConfig({
            title: 'Delete Command',
            description: 'Are you sure you want to delete this command?',
            confirmLabel: 'Delete',
            isDanger: true,
            onConfirm: () => {
                setCommands(prev => prev.filter(c => c.id !== id));
            }
        });
    };

    const handleEdit = (cmd: QuickCommand, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditData(cmd);
        setIsEditing(true);
    };

    if (!isConnected) return null;

    return (
        <div className="fixed right-6 bottom-24 z-40 flex items-end gap-3 pointer-events-none">
            {/* Command List Panel */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, x: 20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.95 }}
                        className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl w-64 flex flex-col overflow-hidden pointer-events-auto"
                    >
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                            <h3 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                <Zap size={12} /> Quick Commands
                            </h3>
                            <button 
                                onClick={() => { setIsEditing(true); setEditData({ name: '', cmd: '' }); }}
                                className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors"
                            >
                                <Plus size={14} />
                            </button>
                        </div>

                        <div className="px-3 py-2 border-b border-slate-800/50 bg-slate-900/30">
                            <input
                                type="text"
                                placeholder="Search commands..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-950/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:border-indigo-500/50 focus:bg-slate-900 outline-none placeholder-slate-600 transition-all"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto max-h-[400px] p-2 custom-scrollbar space-y-1">
                            {/* 🐧 Special Serial Keys Section */}
                            {onSpecialKey && (
                                <div className="mb-2 p-1 bg-slate-950/30 rounded-xl border border-slate-800/50">
                                    <div className="px-2 py-1 text-[8px] font-bold text-slate-500 uppercase tracking-tighter">System Actions</div>
                                    <div className="grid grid-cols-3 gap-1 p-1">
                                        <button 
                                            onClick={() => onSpecialKey('ctrl_p')}
                                            className="flex flex-col items-center justify-center p-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-300 transition-all active:scale-95"
                                        >
                                            <span className="text-[10px] font-black">BREAK</span>
                                            <span className="text-[8px] opacity-60">Ctrl+P</span>
                                        </button>
                                        <button 
                                            onClick={() => onSpecialKey('ctrl_c')}
                                            className="flex flex-col items-center justify-center p-2 rounded-lg bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-300 transition-all active:scale-95"
                                        >
                                            <span className="text-[10px] font-black">CANCEL</span>
                                            <span className="text-[8px] opacity-60">Ctrl+C</span>
                                        </button>
                                        <button 
                                            onClick={() => onSpecialKey('ctrl_p_thrice')}
                                            className="flex flex-col items-center justify-center p-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-300 transition-all active:scale-95"
                                        >
                                            <span className="text-[10px] font-black">RE-ACT</span>
                                            <span className="text-[8px] opacity-60">Ctrl+P x3</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {filteredCommands.length === 0 && !onSpecialKey && (
                                <div className="py-8 text-center text-slate-500 text-[10px]">
                                    {commands.length === 0 ? '명령어를 추가해 주세요.' : '검색 결과가 없습니다.'}
                                </div>
                            )}
                            {filteredCommands.map((c) => (
                                <div
                                    key={c.id}
                                    onClick={() => onExecute(c.cmd)}
                                    className="group relative flex items-center justify-between p-3 rounded-xl bg-slate-800/40 hover:bg-indigo-600/20 border border-transparent hover:border-indigo-500/30 cursor-pointer transition-all duration-200"
                                >
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-xs font-bold text-slate-200 truncate">{c.name}</span>
                                        <span className="text-[9px] text-slate-500 font-mono truncate group-hover:text-indigo-300">{c.cmd}</span>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => handleEdit(c, e)} className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-indigo-400">
                                            <Edit2 size={12} />
                                        </button>
                                        <button onClick={(e) => handleDelete(c.id, e)} className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-400">
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 group-hover:h-1/2 bg-indigo-500 rounded-r-full transition-all duration-200" />
                                </div>
                            ))}
                        </div>

                        {/* Edit/Add Overlay */}
                        <AnimatePresence>
                            {isEditing && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute inset-0 bg-slate-900 p-4 flex flex-col space-y-3 z-10"
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase">{editData.id ? 'Edit Command' : 'Add Command'}</h4>
                                        <button onClick={() => setIsEditing(false)}><X size={14} className="text-slate-500" /></button>
                                    </div>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Name</label>
                                            <input 
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                                                value={editData.name}
                                                onChange={e => setEditData(prev => ({ ...prev, name: e.target.value }))}
                                                placeholder="e.g. Log Clear"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Command</label>
                                            <textarea 
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none h-20 resize-none font-mono"
                                                value={editData.cmd}
                                                onChange={e => setEditData(prev => ({ ...prev, cmd: e.target.value }))}
                                                placeholder="e.g. dlogutil -c"
                                            />
                                        </div>
                                        <button 
                                            onClick={handleSave}
                                            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors shadow-lg shadow-indigo-900/20"
                                        >
                                            SAVE COMMAND
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Summon Button */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsExpanded(!isExpanded)}
                className={`pointer-events-auto p-4 rounded-2xl shadow-2xl flex items-center gap-3 transition-all duration-300 border ${
                    isExpanded 
                    ? 'bg-slate-950 border-indigo-500/50 text-indigo-400' 
                    : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-400 text-white'
                }`}
            >
                {isExpanded ? <ChevronRight size={20} /> : <Zap size={20} />}
                {!isExpanded && <span className="text-xs font-black tracking-tighter uppercase">Quick Commands</span>}
            </motion.button>

            {dialogConfig && (
                <ConfirmDialog 
                    isOpen={true}
                    onClose={() => setDialogConfig(null)}
                    title={dialogConfig.title}
                    description={dialogConfig.description}
                    confirmLabel={dialogConfig.confirmLabel}
                    isDanger={dialogConfig.isDanger}
                    onConfirm={dialogConfig.onConfirm}
                />
            )}
        </div>
    );
};

export default QuickCommandPanel;
