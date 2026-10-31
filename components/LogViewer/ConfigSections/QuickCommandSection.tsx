import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { Plus, X, Edit2, Trash2, Zap, Terminal, Command, GripVertical, History, Search } from 'lucide-react';
import { ConfirmDialog, PromptDialog } from '../../ui/CommonDialogs';

interface QuickCommand {
    id: string;
    name: string;
    cmd: string;
}

interface QuickCommandSectionProps {
    onExecute: (cmd: string) => void;
    onSpecialKey?: (key: 'ctrl_p' | 'ctrl_c' | 'ctrl_p_thrice') => void;
    isConnected: boolean;
}

// 🐧 칩 전용 다이나믹 컬러 팔레트 (Tailwind PurgeSafe)
const ACCENT_COLORS = [
    { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'hover:border-emerald-500/50', glow: 'from-emerald-500/10' },
    { bg: 'bg-sky-500/20', text: 'text-sky-400', border: 'hover:border-sky-500/50', glow: 'from-sky-500/10' },
    { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'hover:border-rose-500/50', glow: 'from-rose-500/10' },
    { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'hover:border-amber-500/50', glow: 'from-amber-500/10' },
    { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'hover:border-purple-500/50', glow: 'from-purple-500/10' },
    { bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-400', border: 'hover:border-fuchsia-500/50', glow: 'from-fuchsia-500/10' },
];

const DraggableCommandItem = ({
    c,
    handleExecute,
    setHoveredCmd,
    setHoverPos,
    handleEdit,
    handleDelete,
    renderTokensToHtml,
    draggedId,
    onDragStart,
    onDragEnter,
    onDragEnd
}: {
    c: QuickCommand,
    handleExecute: (cmd: string) => void,
    setHoveredCmd: (cmd: string | null) => void,
    setHoverPos: (pos: { top: number, left: number } | null) => void,
    handleEdit: (c: QuickCommand, e: React.MouseEvent) => void,
    handleDelete: (id: string, e: React.MouseEvent) => void,
    renderTokensToHtml: (cmd: string) => string,
    draggedId: string | null,
    onDragStart: (id: string, e: React.DragEvent) => void,
    onDragEnter: (id: string, e: React.DragEvent) => void,
    onDragEnd: () => void
}) => {
    // 🐧 이름 기반 해시로 일관된 색상 부여
    const hash = c.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const accent = ACCENT_COLORS[hash % ACCENT_COLORS.length];

    return (
        <motion.div
            id={`cmd-${c.id}`}
            layout
            draggable
            onDragStart={(e: any) => {
                // HTML5 Drag UI 세팅
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                }
                onDragStart(c.id, e);
            }}
            onDragEnter={(e: any) => {
                e.preventDefault();
                onDragEnter(c.id, e);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragEnd={onDragEnd}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`group relative flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 ${accent.border} transition-colors duration-200 select-none cursor-pointer shadow-lg shadow-black/40 overflow-hidden ${draggedId === c.id ? 'opacity-40 scale-95 z-50' : 'opacity-100 z-0 hover:z-10'}`}
            onMouseEnter={(e) => {
                if (draggedId) return; // 🐧 드래그 중에는 프리뷰 차단
                setHoveredCmd(c.cmd);
                const rect = e.currentTarget.getBoundingClientRect();
                // 🐧 HUD 위치 살짝 위로 띄움
                setHoverPos({ top: rect.top - 15, left: rect.right + 20 });
            }}
            onMouseLeave={() => {
                setHoveredCmd(null);
                setHoverPos(null);
            }}
            onClick={() => handleExecute(c.cmd)}
        >
            <div className={`w-6 h-6 rounded-lg ${accent.bg} flex items-center justify-center shrink-0 transition-colors z-10`}>
                <Zap size={12} className={accent.text} />
            </div>

            <span className="text-[13px] font-bold text-slate-100 group-hover:text-white whitespace-nowrap tracking-tight z-10">
                {c.name}
            </span>

            {/* 🐧 호버 시 나타나는 미니 컨트롤러 */}
            <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300 z-10">
                <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(c, e); }}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-indigo-300 transition-colors"
                    title="Edit"
                >
                    <Edit2 size={12} />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.id, e); }}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                    title="Delete"
                >
                    <Trash2 size={12} />
                </button>
            </div>

            {/* 🐧 엣지 글로우 효과 (솔리드 그라데이션, 블러 0%) */}
            <div className={`absolute inset-0 bg-gradient-to-br ${accent.glow} to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`} />
        </motion.div>
    );
};

// 🐧 최근 명령어 아이템 뷰 (가벼운 스타일, 원클릭 등록)
const RecentCommandItem = ({ cmd, onAdd, handleExecute }: { cmd: string, onAdd: () => void, handleExecute: (c: string) => void }) => {
    return (
        <div 
            onClick={() => handleExecute(cmd)}
            className="group relative flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900/40 hover:bg-slate-800/80 border border-slate-800/50 hover:border-slate-700 transition-colors duration-200 select-none cursor-pointer shadow-md shadow-black/20 overflow-hidden"
        >
            <div className="w-6 h-6 rounded-lg bg-slate-800/80 flex items-center justify-center shrink-0 transition-colors z-10 group-hover:bg-slate-700">
                <History size={12} className="text-slate-500 group-hover:text-slate-300" />
            </div>
            
            <span className="text-[13px] font-medium text-slate-500 group-hover:text-slate-300 whitespace-nowrap tracking-tight z-10 truncate max-w-[200px]" title={cmd}>
                {cmd}
            </span>
            
            {/* 🐧 호버 시 나타나는 Add 버튼 */}
            <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300 z-10">
                <button 
                    onClick={(e) => { e.stopPropagation(); onAdd(); }} 
                    className="p-1.5 hover:bg-indigo-500/20 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors"
                    title="Add to User Commands"
                >
                    <Plus size={14} />
                </button>
            </div>
        </div>
    );
};

// 🐧 특수 토큰 전역 정의
export const QUICK_COMMAND_SPECIAL_TOKENS: Record<string, { label: string, color: string, value: string }> = {
    '[[ENTER]]': { label: 'ENTER', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', value: '\n' },
    '[[ESC]]': { label: 'ESC', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', value: '\x1b' },
    '[[CTRL_C]]': { label: 'CTRL+C', color: 'bg-red-500/20 text-red-400 border-red-500/30', value: '\x03' },
    '[[TAB]]': { label: 'TAB', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', value: '\t' },
    '[[CLIPBOARD]]': { label: 'CLIPBOARD', color: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30', value: '' }, // 특수 처리
};

// 🐧 글로벌 단축키(Alt+1~9) 연동을 위한 공용 실행 함수
export const executeQuickCommand = async (
    rawCmd: string,
    sendCommand: (cmd: string) => void,
    onPrompt?: (msg: string) => Promise<string | null>
) => {
    if (!rawCmd) return;

    let processedCmd = rawCmd;

    // 1. CLIPBOARD 매크로 치환
    if (processedCmd.includes('[[CLIPBOARD]]')) {
        try {
            const text = await navigator.clipboard.readText();
            processedCmd = processedCmd.split('[[CLIPBOARD]]').join(text);
        } catch (e) {
            console.error('[QuickCommand] Failed to read clipboard', e);
        }
    }

    // 2. PROMPT 매크로 치환
    const promptMatches = processedCmd.match(/\[\[PROMPT:([^\]]+)\]\]/g);
    if (promptMatches) {
        for (const match of promptMatches) {
            const promptMsg = match.replace('[[PROMPT:', '').replace(']]', '');
            let userInput: string | null = null;

            if (onPrompt) {
                userInput = await onPrompt(promptMsg);
            } else {
                console.error('[QuickCommand] onPrompt callback missing for macro substitution');
                return;
            }

            if (userInput === null) return; // 사용자가 취소하면 전체 실행 중단
            processedCmd = processedCmd.replace(match, userInput);
        }
    }

    // 🐧🎯 형님! 지령대로 기본 엔터를 추가합니다. (유저가 입력한건 추가 입력)
    processedCmd += '\n';

    // 3. DELAY 매크로에 따른 순차 실행
    const parts = processedCmd.split(/(\[\[DELAY:\d+\]\])/);

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.startsWith('[[DELAY:') && part.endsWith(']]')) {
            const delayMs = parseInt(part.replace('[[DELAY:', '').replace(']]', ''), 10);
            if (!isNaN(delayMs)) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        } else if (part.length > 0) {
            let finalCmd = part;
            Object.entries(QUICK_COMMAND_SPECIAL_TOKENS).forEach(([token, info]) => {
                if (token !== '[[CLIPBOARD]]') { // 클립보드는 이미 처리됨
                    finalCmd = finalCmd.split(token).join(info.value);
                }
            });
            if (finalCmd) {
                sendCommand(finalCmd);
            }
        }
    }
};

export const QuickCommandSection: React.FC<QuickCommandSectionProps> = ({ onExecute, onSpecialKey, isConnected }) => {
    const [commands, setCommands] = useState<QuickCommand[]>(() => {
        const saved = localStorage.getItem('quickCommands');
        // 🐧 스마트 매크로가 반영된 실무 최적화 기본값!
        const defaults = [
            { id: 'ps', name: 'ps', cmd: 'ps -efc | grep -Ei "smartthingsapp|smartthings-client|vd-sc-client" [[ENTER]]' },
            { id: 'pkgcmd', name: 'pkgcmd', cmd: 'pkgcmd -l | grep -Ei "smartthingsapp|smartthings-client|iotwidget|aov-dashboard|stpreview" [[ENTER]]' },
            { id: 'kill_clip', name: 'kill (clipboard)', cmd: 'kill -9 [[CLIPBOARD]] [[ENTER]]' },
            { id: 'launch_prompt', name: 'launch app (prompt)', cmd: 'launch_app [[PROMPT:Enter Package Name]] [[ENTER]]' },
            { id: 'uninstall', name: 'uninstall', cmd: 'pkgcmd -un [[PROMPT:Enter Package Name]] [[ENTER]]' }
        ];

        if (!saved) return defaults;

        try {
            const parsed = JSON.parse(saved);
            // 🐧 형님! 예전 버전(Log Clear 등)을 쓰고 계신 경우에만 최신 기본값으로 업데이트 해드립니다.
            // 형님이 직접 다 지우셔서 빈 목록([])이 된 경우에는 그대로 빈 상태를 유지합니다.
            if (Array.isArray(parsed) && parsed.length === 3 && parsed[0].name === 'Log Clear') {
                return defaults;
            }

            return Array.isArray(parsed) ? parsed : defaults;
        } catch (e) {
            console.error('[QuickCommand] Failed to parse saved commands', e);
            return defaults;
        }
    });

    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<Omit<QuickCommand, 'id'> & { id?: string }>({ name: '', cmd: '' });
    const [hoveredCmd, setHoveredCmd] = useState<string | null>(null);
    const [hoverPos, setHoverPos] = useState<{ top: number, left: number } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [dialogConfig, setDialogConfig] = useState<{
        title: string;
        description: React.ReactNode;
        confirmLabel?: string;
        isDanger?: boolean;
        onConfirm: () => void;
    } | null>(null);
    const [promptConfig, setPromptConfig] = useState<{ title: string, description: string, onConfirm: (val: string) => void, onCancel: () => void } | null>(null);
    const [recentCommands, setRecentCommands] = useState<string[]>([]);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const draggedIdRef = React.useRef<string | null>(null); // stale closure 방지용 ref
    const editorRef = React.useRef<HTMLDivElement>(null);
    const lastSwapTime = React.useRef<number>(0);
    const dragOffset = React.useRef({ x: 0, y: 0 });

    const loadRecentCommands = () => {
        try {
            const saved = localStorage.getItem('recentShellCommands');
            if (saved) setRecentCommands(JSON.parse(saved));
        } catch (e) { }
    };

    useEffect(() => {
        loadRecentCommands();
        window.addEventListener('recentCommandsUpdated', loadRecentCommands);
        return () => window.removeEventListener('recentCommandsUpdated', loadRecentCommands);
    }, []);

    const handleAddRecent = (cmdStr: string) => {
        const newCmd: QuickCommand = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
            name: cmdStr.length > 20 ? cmdStr.substring(0, 20) + '...' : cmdStr,
            cmd: cmdStr
        };
        const updated = [...commands, newCmd];
        setCommands(updated);
        try {
            localStorage.setItem('quickCommands', JSON.stringify(updated));
        } catch (e) {}
    };

    // 🐧🎯 HTML5 Drag & Drop 순서 변경 (2D Flex Wrap 완벽 지원)
    const handleDragStart = (id: string, e: React.DragEvent) => {
        if (searchQuery.trim() !== '') return;
        draggedIdRef.current = id; // ref 먼저 세팅 (즉시 반영)
        setDraggedId(id);
        setHoveredCmd(null);
        setHoverPos(null);

        const rect = e.currentTarget.getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    // 🐧 onDragEnter 기반 정렬
    // onDragEnter는 마우스가 카드 경계를 '진입'하는 순간 정확히 1회 발생 → 가장 신뢰할 수 있는 이벤트
    // 쿨다운(150ms)으로 빠른 연속 swap 방지 (oscillation 차단)
    const handleDragEnter = (targetId: string, _e: React.DragEvent) => {
        const currentDraggedId = draggedIdRef.current;
        if (!currentDraggedId || currentDraggedId === targetId) return;
        if (searchQuery.trim() !== '') return;

        const now = Date.now();
        if (now - lastSwapTime.current < 150) return;

        lastSwapTime.current = now;

        setCommands(prev => {
            const draggedIdx = prev.findIndex(c => c.id === currentDraggedId);
            const targetIdx = prev.findIndex(c => c.id === targetId);
            if (draggedIdx === -1 || targetIdx === -1) return prev;

            const newCmds = [...prev];
            const [draggedItem] = newCmds.splice(draggedIdx, 1);
            newCmds.splice(targetIdx, 0, draggedItem);
            return newCmds;
        });
    };

    const handleDragEnd = () => {
        draggedIdRef.current = null;
        setDraggedId(null);
        // 상태가 변경된 commands는 useEffect를 통해 localStorage에 자동 저장됨
    };

    const filteredCommands = React.useMemo(() => {
        if (!searchQuery.trim()) return commands;
        const q = searchQuery.toLowerCase();
        return commands.filter(c => c.name.toLowerCase().includes(q) || c.cmd.toLowerCase().includes(q));
    }, [commands, searchQuery]);

    // 🐧 토큰을 칩으로 렌더링하는 함수 (스마트 매크로 추가)
    const renderTokensToHtml = (cmd: string) => {
        if (!cmd) return '';
        let html = cmd
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // 1. 기본 정적 토큰 변환
        Object.entries(QUICK_COMMAND_SPECIAL_TOKENS).forEach(([token, info]) => {
            const escapedToken = token.replace(/[[\]]/g, '\\$&');
            const chipHtml = `<span contenteditable="false" class="inline-flex items-center px-2 py-0.5 rounded-md border ${info.color} text-[10px] font-black mx-0.5 cursor-default select-none shadow-sm align-middle" data-token="${token}">${info.label}</span>`;
            html = html.replace(new RegExp(escapedToken, 'g'), chipHtml);
        });

        // 2. PROMPT 동적 토큰 변환
        html = html.replace(/\[\[PROMPT:([^\]]+)\]\]/g, (match, msg) => {
            return `<span contenteditable="false" class="inline-flex items-center px-2 py-0.5 rounded-md border bg-sky-500/20 text-sky-400 border-sky-500/30 text-[10px] font-black mx-0.5 cursor-default select-none shadow-sm align-middle" data-token="${match}">PROMPT:${msg}</span>`;
        });

        // 3. DELAY 동적 토큰 변환
        html = html.replace(/\[\[DELAY:(\d+)\]\]/g, (match, ms) => {
            return `<span contenteditable="false" class="inline-flex items-center px-2 py-0.5 rounded-md border bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px] font-black mx-0.5 cursor-default select-none shadow-sm align-middle" data-token="${match}">DELAY:${ms}ms</span>`;
        });

        return html;
    };

    // 🐧 HTML에서 토큰 문자열로 변환
    const htmlToTokens = (html: string | null | undefined) => {
        if (!html) return '';
        try {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            const chips = temp.querySelectorAll('[data-token]');
            chips.forEach(chip => {
                const token = chip.getAttribute('data-token');
                if (token) chip.replaceWith(token);
            });
            // 🐧 innerText는 렌더링되지 않은 엘리먼트에서 빈 문자열을 반환할 수 있으므로 textContent를 우선 사용합니다.
            // trim()을 통해 불필요한 앞뒤 공백을 제거하여 저장 시 유효성 검사를 통과하게 합니다.
            const result = (temp.textContent || temp.innerText || '').trim();
            return result;
        } catch (e) {
            console.error('[QuickCommand] htmlToTokens error:', e);
            return '';
        }
    };

    // 🐧 에디터가 열릴 때 초기 내용 채우기
    useEffect(() => {
        if (isEditing && editorRef.current) {
            const currentHtml = editorRef.current.innerHTML;
            const targetHtml = renderTokensToHtml(editData.cmd);
            if (currentHtml !== targetHtml) {
                editorRef.current.innerHTML = targetHtml;
            }
            // 포커스 및 커서 끝으로 이동
            setTimeout(() => {
                const el = editorRef.current;
                if (el) {
                    el.focus();
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(el);
                    range.collapse(false);
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            }, 50);
        }
    }, [isEditing]);

    useEffect(() => {
        localStorage.setItem('quickCommands', JSON.stringify(commands));
    }, [commands]);

    const handleSave = () => {
        // 🐧 형님! state 업데이트가 비동기라 느릴 수 있으니, 저장 시점에 DOM에서 직접 최신 커맨드를 긁어옵니다!
        const currentCmd = htmlToTokens(editorRef.current?.innerHTML);
        const currentName = editData.name.trim();

        if (!currentName || !currentCmd) {
            console.warn('[QuickCommand] Save blocked: name or cmd is empty', { currentName, currentCmd });
            return;
        }

        const newCommand: QuickCommand = {
            id: editData.id || Math.random().toString(36).substring(7),
            name: currentName,
            cmd: currentCmd
        };

        if (editData.id) {
            setCommands(prev => prev.map(c => c.id === editData.id ? newCommand : c));
        } else {
            setCommands(prev => [...prev, newCommand]);
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
                // 🐧 형님! 삭제되는 순간 프리뷰 잔상도 깔끔하게 지워줍니다.
                setHoveredCmd(null);
                setHoverPos(null);
            }
        });
    };

    const handleEdit = (cmd: QuickCommand, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditData(cmd);
        setIsEditing(true);
    };

    const handleExecute = (cmd: string) => {
        if (!isConnected) return;

        const handlePrompt = (msg: string): Promise<string | null> => {
            return new Promise((resolve) => {
                setPromptConfig({
                    title: 'Quick Command Input',
                    description: msg,
                    onConfirm: (val: string) => resolve(val),
                    onCancel: () => resolve(null)
                });
            });
        };

        executeQuickCommand(cmd, onExecute, handlePrompt);
    };

    return (
        <div className="flex flex-col h-full space-y-6 relative">
            {/* 🐧 Special Serial Keys (System Actions) */}
            {onSpecialKey && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                        <Command size={14} className="text-indigo-400" />
                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">System Actions</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={() => onSpecialKey('ctrl_p')}
                            className="flex flex-col items-center justify-center p-3 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 transition-all active:scale-95 group"
                        >
                            <span className="text-[10px] font-black uppercase group-hover:text-emerald-300">Break</span>
                            <span className="text-[8px] opacity-50 font-mono">Ctrl P</span>
                        </button>
                        <button
                            onClick={() => onSpecialKey('ctrl_c')}
                            className="flex flex-col items-center justify-center p-3 rounded-xl bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 transition-all active:scale-95 group"
                        >
                            <span className="text-[10px] font-black uppercase group-hover:text-red-300">Cancel</span>
                            <span className="text-[8px] opacity-50 font-mono">Ctrl+C</span>
                        </button>
                        <button
                            onClick={() => onExecute('20089999\n')}
                            className="flex flex-col items-center justify-center p-3 rounded-xl bg-fuchsia-600/10 hover:bg-fuchsia-600/20 border border-fuchsia-500/20 text-fuchsia-400 transition-all active:scale-95 group"
                        >
                            <span className="text-[10px] font-black uppercase group-hover:text-fuchsia-300">Special Key</span>
                            <span className="text-[8px] opacity-50 font-mono tracking-widest">20089999↵</span>
                        </button>
                    </div>
                </div>
            )}

            {/* 🐧 Custom User Commands & Recent Commands (Unified Scroll Area) */}
            <div className="flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-10 space-y-6 pr-2">
                
                {/* User Commands */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                            <Zap size={14} className="text-amber-400" />
                            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">User Commands</h3>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Search Bar */}
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search size={12} className="text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search commands..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-56 bg-slate-900/80 border border-slate-700 hover:border-slate-600 focus:border-indigo-500/60 rounded-full pl-8 pr-4 py-1.5 text-xs text-slate-200 focus:bg-slate-900 outline-none transition-all placeholder-slate-500 shadow-inner shadow-black/20"
                                />
                            </div>
                            <button
                                onClick={() => { setIsEditing(true); setEditData({ name: '', cmd: '' }); }}
                                className="group flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-400/50 transition-all active:scale-95"
                                title="Add Command"
                            >
                                <Plus size={12} className="text-indigo-400 group-hover:rotate-90 transition-transform duration-300" />
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">New</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2.5 p-2">
                        {filteredCommands.length === 0 && (
                            <div className="w-full py-10 text-center flex flex-col items-center gap-3 opacity-30">
                                <Terminal size={32} />
                                <span className="text-xs font-medium">No commands found.</span>
                            </div>
                        )}
                        {filteredCommands.map((c) => (
                            <DraggableCommandItem
                                key={c.id}
                                c={c}
                                handleExecute={handleExecute}
                                setHoveredCmd={setHoveredCmd}
                                setHoverPos={setHoverPos}
                                handleEdit={handleEdit}
                                handleDelete={handleDelete}
                                renderTokensToHtml={renderTokensToHtml}
                                draggedId={draggedId}
                                onDragStart={handleDragStart}
                                onDragEnter={handleDragEnter}
                                onDragEnd={handleDragEnd}
                            />
                        ))}
                    </div>
                </div>

                {/* 🐧 Recent Commands */}
                {recentCommands.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <History size={14} className="text-slate-400" />
                                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Recent Commands</h3>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2.5 p-2">
                            {recentCommands.map((cmd, idx) => (
                                <RecentCommandItem 
                                    key={cmd + idx} 
                                    cmd={cmd} 
                                    onAdd={() => handleAddRecent(cmd)} 
                                    handleExecute={handleExecute}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>


            {/* 🐧🎯 글로벌 전문 프리뷰 HUD (마우스 오버한 카드 우측에 밀착 렌더링) */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {hoveredCmd && hoverPos && !draggedId && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="fixed z-[99999] pointer-events-none"
                            style={{
                                top: hoverPos.top,
                                left: hoverPos.left
                            }}
                        >
                            {/* 🐧 GPU 최적화: 무거운 다중 레이어 그림자 제거 */}
                            <div className="bg-slate-900 border border-indigo-500/50 rounded-3xl p-8 shadow-xl min-w-[550px] max-w-[900px]">
                                <div className="flex items-center gap-3 mb-4 border-b border-white/10 pb-3">
                                    <div className="p-2 bg-indigo-500/10 rounded-lg">
                                        <Terminal size={18} className="text-indigo-400" />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none mt-1">Quick Preview</span>
                                        {/* 🐧 GPU 최적화: glow 효과(shadow) 제거 */}
                                        <span className="text-[10px] font-black text-emerald-300 bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 rounded-md inline-flex items-center w-fit">
                                            🖱️ Click card to execute
                                        </span>
                                    </div>
                                </div>
                                <div className="text-xl text-white font-mono leading-relaxed break-all whitespace-pre-wrap">
                                    {hoveredCmd.includes('[[') ? (
                                        <div dangerouslySetInnerHTML={{ __html: renderTokensToHtml(hoveredCmd) }} className="flex items-center flex-wrap gap-2.5" />
                                    ) : hoveredCmd}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* 🐧 Edit Overlay (GPU 최적화: blur 제거) */}
            <AnimatePresence>
                {isEditing && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-slate-950 z-[100] p-6 flex flex-col space-y-6 overflow-y-auto custom-scrollbar"
                    >
                        <div className="flex justify-between items-center">
                            <h4 className="text-sm font-black text-white uppercase tracking-wider">{editData.id ? 'Edit Command' : 'New Command'}</h4>
                            <button
                                onClick={() => setIsEditing(false)}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X size={20} className="text-slate-400" />
                            </button>
                        </div>

                        <div className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Friendly Name</label>
                                <input
                                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                    value={editData.name}
                                    onChange={e => setEditData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g. My Quick Log Clear"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center ml-1">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Shell Command</label>
                                    <span className="text-[9px] text-indigo-400/60 italic">Chips are treated as single entities</span>
                                </div>

                                {/* 🐧🎯 Tokenized Editor */}
                                <div
                                    ref={editorRef}
                                    contentEditable
                                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none h-32 overflow-y-auto font-mono transition-all custom-scrollbar whitespace-pre-wrap break-all"
                                    onBlur={(e) => {
                                        const html = e.currentTarget?.innerHTML;
                                        setEditData(prev => ({ ...prev, cmd: htmlToTokens(html) }));
                                    }}
                                    onInput={(e) => {
                                        const html = e.currentTarget?.innerHTML;
                                        const tokens = htmlToTokens(html);
                                        if (tokens !== editData.cmd) {
                                            setEditData(prev => ({ ...prev, cmd: tokens }));
                                        }
                                    }}
                                />

                                {/* 🐧 Quick Insert Buttons */}
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {Object.entries(QUICK_COMMAND_SPECIAL_TOKENS).map(([token, info]) => (
                                        <button
                                            key={token}
                                            onClick={() => {
                                                const el = editorRef.current;
                                                if (el) {
                                                    const currentCmd = htmlToTokens(el.innerHTML);
                                                    const newCmd = currentCmd + token;
                                                    setEditData(prev => ({ ...prev, cmd: newCmd }));

                                                    // 🐧 칩 삽입 후 수동으로 HTML 업데이트 및 포커스 유지
                                                    el.innerHTML = renderTokensToHtml(newCmd);

                                                    setTimeout(() => {
                                                        const freshEl = editorRef.current;
                                                        if (freshEl) {
                                                            freshEl.focus();
                                                            const range = document.createRange();
                                                            const sel = window.getSelection();
                                                            range.selectNodeContents(freshEl);
                                                            range.collapse(false);
                                                            sel?.removeAllRanges();
                                                            sel?.addRange(range);
                                                        }
                                                    }, 0);
                                                }
                                            }}
                                            className={`px-3 py-1.5 rounded-xl border text-[9px] font-black transition-all hover:scale-105 active:scale-95 ${info.color}`}
                                        >
                                            +{info.label}
                                        </button>
                                    ))}
                                    <button
                                        disabled={editData.cmd.includes('[[PROMPT:')}
                                        onClick={() => {
                                            if (editData.cmd.includes('[[PROMPT:')) return;
                                            setPromptConfig({
                                                title: 'Add Prompt Token',
                                                description: 'Enter the message to display to the user when executing this command:',
                                                onConfirm: (msg: string) => {
                                                    const el = editorRef.current;
                                                    if (el && msg.trim()) {
                                                        const token = `[[PROMPT:${msg.trim()}]]`;
                                                        const currentCmd = htmlToTokens(el.innerHTML);
                                                        const newCmd = currentCmd + token;
                                                        setEditData(prev => ({ ...prev, cmd: newCmd }));
                                                        el.innerHTML = renderTokensToHtml(newCmd);

                                                        setTimeout(() => {
                                                            const freshEl = editorRef.current;
                                                            if (freshEl) {
                                                                freshEl.focus();
                                                                const range = document.createRange();
                                                                const sel = window.getSelection();
                                                                range.selectNodeContents(freshEl);
                                                                range.collapse(false);
                                                                sel?.removeAllRanges();
                                                                sel?.addRange(range);
                                                            }
                                                        }, 0);
                                                    }
                                                },
                                                onCancel: () => { }
                                            });
                                        }}
                                        className={`px-3 py-1.5 rounded-xl border text-[9px] font-black transition-all ${editData.cmd.includes('[[PROMPT:')
                                            ? 'border-slate-800 bg-slate-900/50 text-slate-600 cursor-not-allowed opacity-50'
                                            : 'border-sky-500/30 bg-sky-500/20 text-sky-400 hover:scale-105 active:scale-95'
                                            }`}
                                    >
                                        +PROMPT
                                    </button>
                                </div>
                            </div>
                            <button
                                onClick={handleSave}
                                // 🐧 GPU 최적화: 컬러 섀도우 제거 및 transition-colors로 변경
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-sm font-black transition-colors active:scale-[0.98]"
                            >
                                SAVE COMMAND
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

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

            {promptConfig && (
                <PromptDialog
                    isOpen={true}
                    onClose={() => {
                        promptConfig.onCancel();
                        setPromptConfig(null);
                    }}
                    title={promptConfig.title}
                    description={promptConfig.description}
                    onConfirm={(val) => {
                        promptConfig.onConfirm(val);
                        setPromptConfig(null);
                    }}
                />
            )}
        </div>
    );
};
