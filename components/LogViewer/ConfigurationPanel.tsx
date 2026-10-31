import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Lucide from 'lucide-react';
import { useLogContext } from './LogContext';
import { useHappyTool } from '../../contexts/HappyToolContext';
import { Button } from '../ui/Button';
import { ConfigHeader } from './ConfigSections/ConfigHeader';
import { HappyComboSection } from './ConfigSections/HappyComboSection';

import { BlockListSection } from './ConfigSections/BlockListSection';
import { HighlightSection } from './ConfigSections/HighlightSection';

import { PerfSettingsSection } from './ConfigSections/PerfSettingsSection';


import { QuickCommandSection } from './ConfigSections/QuickCommandSection';

const { ChevronLeft, ChevronRight, Settings, Zap } = Lucide;

const ConfigurationPanel = React.memo(() => {
    const {
        isPanelOpen, setIsPanelOpen,
        configPanelWidth, handleConfigResizeStart,
        currentConfig, appliedConfig, updateCurrentRule,
        groupedRoots, appliedGroupedRoots, collapsedRoots, setCollapsedRoots, handleToggleRoot,
        sendTizenCommand, sendSerialSpecialKey,
        logViewPreferences, updateLogViewPreferences,
        isLogging, setIsLogging, connectionMode,
        hasEverConnected, setIsTizenQuickConnect, setIsTizenModalOpen,
        tizenSocket,
        tabId,
        isActive
    } = useLogContext();

    const { configActiveTab, setConfigActiveTab } = useHappyTool();

    // 🐧🎯 형님! Ctrl + Shift + Z 단축키로 탭을 토글하는 로직입니다! (한글 IME 모드 완벽 지원 및 활성 탭 대응)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 현재 활성화된 Active 탭일 때만 단축키 로직을 수행합니다.
            if (!isActive) return;

            if (e.ctrlKey && e.shiftKey && (e.code === 'KeyZ' || e.key.toLowerCase() === 'z')) {
                e.preventDefault();
                setConfigActiveTab(prev => prev === 'settings' ? 'commands' : 'settings');
                setIsPanelOpen(true); 
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setIsPanelOpen, setConfigActiveTab, isActive]); // 🐧 isActive를 의존성 배열에 추가하여 상태 변화 대응

    const onToggle = useCallback(() => setIsPanelOpen(prev => !prev), [setIsPanelOpen]);

    const onToggleRootCollapse = useCallback((root: string) => {
        setCollapsedRoots(prev => {
            const next = new Set(prev);
            if (next.has(root)) next.delete(root);
            else next.add(root);
            return next;
        });
    }, [setCollapsedRoots]);
    const defaultLogCommand = 'dlogutil -c;logger-mgr --filter $(TAGS); dlogutil -v kerneltime $(TAGS) &';

    const handleToggleLogging = useCallback(() => {
        if (isLogging) {
            // Stop Logging
            // 1. Send Ctrl+C
            sendTizenCommand('\x03');

            // 2. Kill dlogutil explicitly after a short delay
            setTimeout(() => {
                sendTizenCommand('pkill dlogutil\n');
            }, 300);
            setIsLogging(false);
        } else {
            // Start Logging
            if (!currentConfig) return;
            // 1. Kill existing dlogutil
            sendTizenCommand('pkill dlogutil\n');

            // 2. Refresh tags and build command
            const cmdTemplate = currentConfig.logCommand ?? defaultLogCommand;
            const tags = (currentConfig.logTags || []).join(' ').trim();
            let finalCmd = cmdTemplate.replace(/\$\(TAGS\)/g, tags);

            // Cleanup: remove redundant separators and spaces when tags are empty
            finalCmd = finalCmd
                .replace(/--filter\s+;/g, ';') // remove empty filter before semicolon
                .replace(/;\s*;/g, ';')      // remove double semicolons
                .replace(/\s+/g, ' ')        // collapse spaces
                .replace(/;\s*$/, '')        // remove trailing semicolon
                .trim();

            console.log('[ConfigPanel] Starting Logging:', {
                template: cmdTemplate,
                tags,
                finalCmd,
                connectionMode,
                hasEverConnected
            });

            // Execute
            sendTizenCommand(finalCmd + '\n');
            setIsLogging(true);
        }
    }, [isLogging, currentConfig, sendTizenCommand, setIsLogging, connectionMode, hasEverConnected]);
    const handleReconnect = useCallback(() => {
        setIsTizenQuickConnect(true);
        setIsTizenModalOpen(true);
    }, [setIsTizenQuickConnect, setIsTizenModalOpen]);

    const handleUpdateName = useCallback((name: string) => {
        updateCurrentRule({ name });
    }, [updateCurrentRule]);

    if (!currentConfig) {
        return (
            <div className="border-r border-slate-800 bg-slate-950 p-6 flex items-center justify-center text-slate-500 flex-col h-full shrink-0" style={{ width: isPanelOpen ? configPanelWidth : undefined }}>
                Select or Create a Rule
            </div>
        );
    }

    return (
        <div
            className={`${isPanelOpen ? '' : 'w-8'} glass-morphism flex flex-col h-full shadow-2xl z-20 custom-scrollbar relative shrink-0 transition-[width] duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden`}
            style={{
                width: isPanelOpen ? configPanelWidth : undefined,
                transitionDelay: isPanelOpen ? '50ms' : '0ms',
                contain: 'layout paint',
                willChange: 'width',
                transform: 'translateZ(0)'
            }}
        >
            {isPanelOpen && (
                <div
                    className="absolute right-0 top-0 bottom-0 w-1 hover:bg-indigo-500/50 cursor-col-resize z-50 transition-colors"
                    onMouseDown={handleConfigResizeStart}
                />
            )}

            <div className="absolute top-[22px] right-[-14px] z-50">
                <Button
                    variant="secondary"
                    className="w-7 h-10 rounded-full bg-indigo-600 border border-indigo-400/30 hover:bg-indigo-500 flex items-center justify-center transition-all active:scale-95 focus:scale-100 ring-0 hover:scale-110 group/btn"
                    onClick={onToggle}
                >
                    {isPanelOpen ? (
                        <ChevronLeft size={16} className="text-white group-hover/btn:-translate-x-0.5 transition-transform" />
                    ) : (
                        <ChevronRight size={16} className="text-white group-hover/btn:translate-x-0.5 transition-transform" />
                    )}
                </Button>
            </div>

            {/* 🐧🎯 상시 렌더링 구조로 변경하여 애니메이션 영속성 확보 */}
            <div
                className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${
                    isPanelOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                style={{ width: configPanelWidth }}
            >
                {/* 탭 바와 내용물은 패널이 닫혀있어도 메모리에 유지됨 */}
                <div className="px-5 py-2 flex items-center justify-between border-b border-white/5 bg-slate-950/40">
                    <div className="flex bg-slate-900/80 p-0.5 rounded-lg border border-white/5 w-full relative overflow-hidden h-8">
                        {/* 🐧🎯 단축키/클릭 모두 완벽하게 대응하는 싱글 트래킹 인디케이터 (그림자 제거) */}
                        <motion.div 
                            className="absolute top-0.5 bottom-0.5 rounded-md"
                            initial={false}
                            animate={{ 
                                x: configActiveTab === 'settings' ? '0%' : '100%',
                                backgroundColor: configActiveTab === 'settings' ? '#4f46e5' : '#f59e0b', // indigo-600 / amber-500
                                width: 'calc(50% - 1px)'
                            }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />

                        <button 
                            onClick={() => setConfigActiveTab('settings')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1 z-10 text-[9px] font-black uppercase tracking-widest transition-colors duration-300 relative ${
                                configActiveTab === 'settings' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <span className="relative z-20 flex items-center gap-1.5">
                                <Settings size={12} className={configActiveTab === 'settings' ? 'animate-spin-slow' : ''} />
                                Settings
                            </span>
                        </button>
                        <button 
                            onClick={() => setConfigActiveTab('commands')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1 z-10 text-[9px] font-black uppercase tracking-widest transition-colors duration-300 relative ${
                                configActiveTab === 'commands' ? 'text-slate-950' : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <span className="relative z-20 flex items-center gap-1.5">
                                <Zap size={12} className={configActiveTab === 'commands' ? 'fill-current' : ''} />
                                Commands
                            </span>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 pt-4 custom-scrollbar pb-20 relative">
                    <AnimatePresence mode="wait">
                        {configActiveTab === 'settings' ? (
                            <motion.div
                                key="settings"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                className="space-y-6"
                            >
                                <ConfigHeader
                                    name={currentConfig.name}
                                    onUpdateName={handleUpdateName}
                                />

                                <div className="card-gradient p-1">
                                    <HappyComboSection
                                        currentConfig={currentConfig}
                                        appliedConfig={appliedConfig}
                                        updateCurrentRule={updateCurrentRule}
                                        groupedRoots={groupedRoots}
                                        appliedGroupedRoots={appliedGroupedRoots}
                                        collapsedRoots={collapsedRoots}
                                        onToggleRootCollapse={onToggleRootCollapse}
                                        handleToggleRoot={handleToggleRoot}
                                        happyCombosCaseSensitive={currentConfig.happyCombosCaseSensitive || false}
                                        tabId={tabId}
                                        setCollapsedRoots={setCollapsedRoots}
                                    />
                                </div>

                                <div className="card-gradient p-1">
                                    <BlockListSection
                                        currentConfig={currentConfig}
                                        updateCurrentRule={updateCurrentRule}
                                        blockListCaseSensitive={currentConfig.blockListCaseSensitive || false}
                                    />
                                </div>

                                <div className="card-gradient p-1">
                                    <HighlightSection
                                        currentConfig={currentConfig}
                                        updateCurrentRule={updateCurrentRule}
                                        colorHighlightsCaseSensitive={currentConfig.colorHighlightsCaseSensitive || false}
                                    />
                                </div>





                                <div className="card-gradient p-1">
                                    <PerfSettingsSection
                                        currentConfig={currentConfig}
                                        updateCurrentRule={updateCurrentRule}
                                    />
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="commands"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                className="h-full"
                            >
                                <QuickCommandSection 
                                    isConnected={!!tizenSocket}
                                    onExecute={sendTizenCommand}
                                    onSpecialKey={sendSerialSpecialKey}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* 🐧 패널이 닫혀있을 때의 세로 텍스트 오버레이 (별도 분리) */}
            {!isPanelOpen && (
                <div className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-all group px-0 py-12 z-10" onClick={onToggle}>
                    <div 
                        className="text-slate-100 font-black tracking-[0.1em] text-[11px] uppercase group-hover:text-indigo-400 transition-all select-none"
                        style={{ 
                            writingMode: 'vertical-rl', 
                            transform: 'rotate(180deg)',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        Configuration
                    </div>
                </div>
            )}
        </div>
    );
});

export default ConfigurationPanel;
