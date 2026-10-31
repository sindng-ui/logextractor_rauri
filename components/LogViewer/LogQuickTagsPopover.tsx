/**
 * LogQuickTagsPopover.tsx
 * TopBar에서 Log Tags & Start/Stop Logging을 팝오버로 빠르게 제어 🐧⚡
 * - 로깅 상태 (🔴 REC / ⬛ Stopped) 표시
 * - 태그 칩 목록 인라인 확인
 * - 팝오버 내에서 태그 추가/삭제 + Start/Stop 토글
 */

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
    Tag, Play, Square, X, Plus, Terminal, Eye, SlidersHorizontal
} from 'lucide-react';
import { useLogContext } from './LogContext';
import LogPresetDropdown from './LogPresetDropdown';
import LogViewSettingsPanel from './LogViewSettingsPanel';

const LogQuickTagsPopover: React.FC = memo(() => {
    const {
        currentConfig,
        updateCurrentRule,
        isLogging,
        setIsLogging,
        connectionMode,
        hasEverConnected,
        setIsTizenQuickConnect,
        setIsTizenModalOpen,
        sendTizenCommand,
    } = useLogContext() as any;

    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false); // Popover expandable width control 🐧⚡
    const [isEditingCommand, setIsEditingCommand] = useState(false); // Command edit mode toggle 🐧🛠️
    const [commandEditValue, setCommandEditValue] = useState(''); // Temp command template edited value

    const [tagInput, setTagInput] = useState('');
    const [pendingLoggingStart, setPendingLoggingStart] = useState(false); // 자동 로깅 예약 플래그 🐧⚡
    const popoverRef = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const tags: string[] = currentConfig?.logTags || [];

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (
                popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
                btnRef.current && !btnRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    // Auto focus input when popover opens
    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 60);
    }, [isOpen]);

    // connectionMode가 활성화되는 순간을 감시하여 자동 로깅 예약 처리 🐧⚡
    useEffect(() => {
        if (connectionMode && pendingLoggingStart) {
            setPendingLoggingStart(false);
            // 소켓 세션 및 단말 쉘 안착 시간(타이밍 이슈 방지)을 고려하여 1000ms 대기 후 실행
            const timer = setTimeout(() => {
                if (!isLogging && sendTizenCommand && currentConfig) {
                    const defaultCmd = 'dlogutil -c;logger-mgr --filter $(TAGS); dlogutil -v kerneltime $(TAGS) &';
                    const cmd = currentConfig.logCommand ?? defaultCmd;
                    const tagStr = tags.join(' ').trim();
                    const finalCmd = cmd.replace(/\$\(TAGS\)/g, tagStr);
                    sendTizenCommand(finalCmd + '\n');
                    setIsLogging(true);
                }
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [connectionMode, pendingLoggingStart, isLogging, sendTizenCommand, currentConfig, tags, setIsLogging]);

    const addTag = useCallback(() => {
        const val = tagInput.trim();
        if (!val || !updateCurrentRule) return;
        const current = currentConfig?.logTags || [];
        if (!current.includes(val)) {
            updateCurrentRule({ logTags: [...current, val] });
        }
        setTagInput('');
    }, [tagInput, currentConfig, updateCurrentRule]);

    const removeTag = useCallback((idx: number) => {
        if (!updateCurrentRule) return;
        const current = currentConfig?.logTags || [];
        updateCurrentRule({ logTags: current.filter((_: string, i: number) => i !== idx) });
    }, [currentConfig, updateCurrentRule]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); addTag(); }
        else if (e.key === 'Escape') setIsOpen(false);
        else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
            removeTag(tags.length - 1);
        }
    }, [addTag, tagInput, tags, removeTag]);

    const handleToggleLogging = useCallback(() => {
        if (!setIsLogging || !currentConfig) return;
        if (isLogging) {
            // Stop
            setIsLogging(false);
            if (sendTizenCommand) {
                sendTizenCommand('\x03'); // SIGINT
                // 🐧 형님! 백그라운드 &로 실행된 dlogutil 프로세스를 단말에서 완전히 진압하기 위해 pkill을 명시적으로 내립니다!
                setTimeout(() => {
                    sendTizenCommand('pkill dlogutil\n');
                }, 300);
            }
        } else {
            // Start - check connection
            if (!connectionMode && hasEverConnected) {
                setPendingLoggingStart(true); // 자동 로깅 예약 플래그 ON! 🐧🔥
                setIsTizenQuickConnect?.(true);
                setIsTizenModalOpen?.(true);
                return;
            }
            if (!connectionMode) return;
            // Build and send log command
            const defaultCmd = 'dlogutil -c;logger-mgr --filter $(TAGS); dlogutil -v kerneltime $(TAGS) &';
            const cmd = currentConfig.logCommand ?? defaultCmd;
            const tagStr = tags.join(' ').trim();
            const finalCmd = cmd.replace(/\$\(TAGS\)/g, tagStr);
            if (sendTizenCommand) sendTizenCommand(finalCmd + '\n');
            setIsLogging(true);
        }
    }, [isLogging, setIsLogging, currentConfig, connectionMode, hasEverConnected,
        setIsTizenQuickConnect, setIsTizenModalOpen, sendTizenCommand, tags, setPendingLoggingStart]);

    const canLog = !!connectionMode;

    return (
        <div className="relative">
            {/* Trigger Button */}
            <button
                ref={btnRef}
                onClick={() => setIsOpen(p => !p)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-300 text-xs font-black shadow-md hover:scale-[1.04] active:scale-[0.96] ${isLogging
                    ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 border-rose-500/80 text-white hover:from-red-500 hover:to-rose-500 hover:shadow-[0_0_15px_rgba(244,63,94,0.4)]'
                    : isOpen
                        ? 'bg-[#161f42] border-indigo-400 text-indigo-200 shadow-[0_0_18px_rgba(99,102,241,0.4)]'
                        : 'bg-gradient-to-r from-slate-900 via-[#131a35] to-slate-900 border-indigo-500/20 text-slate-300 hover:text-indigo-300 hover:border-indigo-400/80 hover:shadow-[0_0_15px_rgba(99,102,241,0.3)] shadow-[0_2px_8px_rgba(0,0,0,0.4)]'
                    }`}
                title="Log Tags & Logging Control"
            >
                {isLogging ? (
                    <>
                        {/* 🔴 REC dot */}
                        <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                        </span>
                        <span className="text-white font-black tracking-wide">REC</span>
                    </>
                ) : (
                    <SlidersHorizontal size={13} className="text-indigo-400" />
                )}

                <span className="tracking-tight uppercase">Log Center</span>

                {/* Tag count badge */}
                {tags.length > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-md text-xs font-black border transition-all ${isLogging
                        ? 'bg-white/20 text-white border-white/30'
                        : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                        }`}>
                        {tags.length}
                    </span>
                )}
            </button>

            {/* Popover */}
            {isOpen && (
                <div
                    ref={popoverRef}
                    style={{ width: isExpanded ? '880px' : '560px' }}
                    className="
                        absolute top-full mt-2 right-0 z-[200]
                        bg-[#0b0f1e] border border-indigo-500/20
                        rounded-2xl shadow-[0_20px_50px_rgba(99,102,241,0.18)]
                        overflow-hidden flex flex-col transition-[width,transform] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]
                    "
                >
                    {/* Header */}
                    <div className="px-5 py-3 border-b border-[#141b36] flex items-center gap-2.5 bg-[#05070e]/40">
                        <Terminal size={15} className="text-cyan-400 animate-pulse" />
                        <span className="text-sm font-black bg-gradient-to-r from-[#00f2fe] via-cyan-400 to-[#0072ff] bg-clip-text text-transparent flex-1 filter drop-shadow-[0_0_8px_rgba(0,242,254,0.3)]">
                            Log Control Center
                        </span>

                        {/* Expand Settings Toggle Button */}
                        <button
                            type="button"
                            onClick={() => setIsExpanded(p => !p)}
                            className={`
                                flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-black tracking-wide transition-all duration-300 hover:scale-[1.03] active:scale-[0.97]
                                ${isExpanded
                                    ? 'bg-[#1a2342] border-indigo-400 text-indigo-200 shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                                    : 'bg-[#0f1424] border-indigo-500/20 text-slate-400 hover:text-indigo-300 hover:border-indigo-500/50'
                                }
                            `}
                        >
                            <Eye size={13} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180 text-cyan-400' : ''}`} />
                            <span>{isExpanded ? 'Hide Settings ⬅️' : 'Quick Settings ⚙️'}</span>
                        </button>

                        <span className="w-px h-3 bg-[#141b36]/60 mx-1" />

                        {/* Status */}
                        {isLogging ? (
                            <span className="flex items-center gap-1.5 text-xs font-black text-rose-400">
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse inline-block" />
                                LOGGING
                            </span>
                        ) : (
                            <span className="text-xs text-slate-500 font-extrabold tracking-wider">IDLE</span>
                        )}
                    </div>

                    {/* 2-Column Split View */}
                    <div className="flex divide-x divide-[#141b36]/60">
                        {/* Left Column: Tags & Logging Control (w-[560px]) */}
                        <div className="w-[560px] p-5 flex flex-col space-y-4">
                            <div>
                                {/* Presets 드롭다운 🐧🏷️ */}
                                <LogPresetDropdown />

                                <div
                                    className="
                                        min-h-[96px] w-full rounded-xl border border-indigo-500/10 bg-[#05070e]/60
                                        p-2.5 flex flex-wrap gap-1.5 items-start cursor-text
                                        focus-within:border-indigo-500/40 focus-within:shadow-[0_0_12px_rgba(99,102,241,0.15)] 
                                        transition-all duration-300 overflow-y-auto max-h-[130px]
                                        mt-2
                                    "
                                    onClick={() => inputRef.current?.focus()}
                                >
                                    {tags.map((tag, i) => (
                                        <span
                                            key={`${tag}-${i}`}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-indigo-500/30 bg-gradient-to-r from-indigo-950/60 to-[#181335]/60 text-indigo-200 text-xs font-mono font-bold transition-all hover:from-indigo-900/70 hover:to-[#221a4d]/70 hover:border-indigo-400/50 shadow-sm hover:scale-[1.02]"
                                        >
                                            {tag}
                                            <button
                                                type="button"
                                                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                                                onClick={e => { e.preventDefault(); e.stopPropagation(); removeTag(i); }}
                                                className="opacity-55 hover:opacity-100 transition-opacity text-indigo-400 hover:text-indigo-200"
                                                tabIndex={-1}
                                            >
                                                <X size={10} />
                                            </button>
                                        </span>
                                    ))}
                                    <input
                                        ref={inputRef}
                                        value={tagInput}
                                        onChange={e => setTagInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={tags.length === 0 ? '+ add tags (Enter)' : ''}
                                        className="flex-1 min-w-[100px] bg-transparent text-xs text-slate-200 placeholder-slate-600 font-mono focus:outline-none py-0.5"
                                        spellCheck={false}
                                    />
                                </div>
                                {tagInput.trim() && (
                                    <button
                                        onClick={addTag}
                                        className="mt-2 flex items-center gap-1 text-xs text-cyan-400/70 hover:text-cyan-300 transition-colors font-bold"
                                    >
                                        <Plus size={13} /> Add "{tagInput.trim()}"
                                    </button>
                                )}

                                {/* Live Command Preview */}
                                {(() => {
                                    const defaultCmd = 'dlogutil -c;logger-mgr --filter $(TAGS); dlogutil -v kerneltime $(TAGS) &';
                                    const cmd = currentConfig?.logCommand ?? defaultCmd;
                                    const tagStr = tags.join(' ').trim();
                                    const finalCmd = cmd.replace(/\$\(TAGS\)/g, tagStr || '[No Tags]');

                                    const handleStartEdit = () => {
                                        setCommandEditValue(cmd);
                                        setIsEditingCommand(true);
                                    };

                                    const handleSaveEdit = () => {
                                        if (updateCurrentRule) {
                                            updateCurrentRule({ logCommand: commandEditValue });
                                        }
                                        setIsEditingCommand(false);
                                    };

                                    return (
                                        <div className="mt-4 p-3.5 rounded-xl border border-indigo-500/10 bg-[#03050a] space-y-2 shadow-inner">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-[#4d5b94] uppercase tracking-widest font-black">
                                                    ⚡ Live Command Preview
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    {isEditingCommand ? (
                                                        <button
                                                            type="button"
                                                            onClick={handleSaveEdit}
                                                            className="text-[12px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-black hover:bg-emerald-500/35 hover:text-white transition-all shadow-[0_0_8px_rgba(16,185,129,0.2)] hover:scale-[1.03] active:scale-[0.97]"
                                                        >
                                                            SAVE 💾
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={handleStartEdit}
                                                            className="text-[12px] bg-[#141b36] text-slate-400 border border-indigo-500/20 px-1.5 py-0.5 rounded font-black hover:border-indigo-400 hover:text-indigo-200 transition-all hover:scale-[1.03] active:scale-[0.97]"
                                                        >
                                                            EDIT ✏️
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {isEditingCommand ? (
                                                <div className="space-y-1.5">
                                                    <textarea
                                                        value={commandEditValue}
                                                        onChange={e => setCommandEditValue(e.target.value)}
                                                        className="w-full min-h-[60px] max-h-[100px] p-2 bg-[#090d1a] border border-indigo-500/30 rounded-lg text-xs font-mono text-cyan-300 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all placeholder-slate-700 resize-y"
                                                        spellCheck={false}
                                                    />
                                                    <p className="text-xs text-cyan-400/70 font-bold leading-normal">
                                                        * <span className="text-[#00f2fe]">$(TAGS)</span> placeholder will be replaced with selected tags.
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="text-xs font-mono text-indigo-300/80 break-all select-all leading-relaxed p-1 hover:text-indigo-200 transition-colors cursor-pointer">
                                                    {finalCmd}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Start / Stop button */}
                            <div className="pt-3 border-t border-[#141b36]/60">
                                <button
                                    onClick={handleToggleLogging}
                                    disabled={!canLog && !hasEverConnected}
                                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-extrabold transition-all duration-300 border shadow-md active:scale-[0.98] ${isLogging
                                        ? 'bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white border-rose-500/50 shadow-[0_4px_12px_rgba(220,38,38,0.2)]'
                                        : 'bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-500 hover:from-emerald-300 hover:to-teal-400 text-slate-950 border-emerald-400/40 shadow-[0_4px_16px_rgba(16,185,129,0.25)]'
                                        } disabled:opacity-30 disabled:cursor-not-allowed`}
                                    title={!canLog && !hasEverConnected ? 'Connect to a device first' : ''}
                                >
                                    {isLogging ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                                    {isLogging ? 'Stop Logging' : 'Start Logging'}
                                </button>
                                {!canLog && hasEverConnected && (
                                    <p className="text-xs text-amber-400/70 text-center mt-1.5 font-bold animate-pulse">
                                        Disconnected — click to reconnect
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Right Column: View Settings (w-[320px]) */}
                        <LogViewSettingsPanel isExpanded={isExpanded} />
                    </div>
                </div>
            )}
        </div>
    );
});

LogQuickTagsPopover.displayName = 'LogQuickTagsPopover';
export default LogQuickTagsPopover;
