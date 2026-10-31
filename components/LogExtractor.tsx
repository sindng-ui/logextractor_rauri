import React, { useState, useCallback, useEffect } from 'react';
import { LogRule, AppSettings } from '../types';
import LogSession from './LogSession';
import { LogProvider } from './LogViewer/LogContext';
import { Plus, X, FileText, Copy, XCircle, Trash2, Archive } from 'lucide-react';
import { useContextMenu } from './ContextMenu';
import { useLogArchiveContext } from './LogArchive';
import { deleteStoredValue, getStoredValue } from '../utils/db';
import { workerRegistry } from '../hooks/LogWorkerRegistry';
import { LogViewPreferencesProvider } from './LogViewer/LogViewPreferencesContext';

import { useFindInAll } from '../hooks/useFindInAll';



interface Tab {
    id: string;
    title: string;
    initialFile: File | null;
    filePath?: string;
}

import { useHappyTool } from '../contexts/HappyToolContext';

interface Tab {
    id: string;
    title: string;
    initialFile: File | null;
    filePath?: string;
}

const LogExtractor: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
    const {
        logRules: rules,
        setLogRules: onUpdateRules,
        handleExportSettings: onExportSettings,
        handleImportSettings: onImportSettings,
        isFocusMode // ✅ Focus Mode
    } = useHappyTool();

    // Log Archive
    const { toggleSidebar, setLoadArchiveToTab } = useLogArchiveContext();
    // Shared state for configuration panel width
    const [configPanelWidth, setConfigPanelWidth] = useState(() => {
        try {
            const saved = localStorage.getItem('configPanelWidth');
            if (!saved) return 320;
            const parsed = parseFloat(saved);
            return Number.isFinite(parsed) && parsed > 100 ? parsed : 320;
        } catch (e) {
            return 320;
        }
    });

    useEffect(() => {
        localStorage.setItem('configPanelWidth', configPanelWidth.toString());
    }, [configPanelWidth]);

    // ✅ Shared state for Configuration Panel visibility
    const [isPanelOpen, setIsPanelOpen] = useState(() => {
        const saved = localStorage.getItem('isConfigPanelOpen');
        return saved !== null ? saved === 'true' : true;
    });

    useEffect(() => {
        localStorage.setItem('isConfigPanelOpen', String(isPanelOpen));
    }, [isPanelOpen]);


    // ✅ Keyboard Shortcut for Configuration Panel Width
    useEffect(() => {
        const handleConfigResize = (e: KeyboardEvent) => {
            if (!isActive) return; // Only if Log Extractor is active tool

            if (e.ctrlKey && e.shiftKey) {
                // Use e.code to handle matching regardless of Shift character (e.g. { or })
                if (e.code === 'BracketLeft' || e.key === '[' || e.key === '{') {
                    ``
                    e.preventDefault();
                    setConfigPanelWidth(current => Math.max(150, current - 20)); // Decrease width, min 150px
                } else if (e.code === 'BracketRight' || e.key === ']' || e.key === '}') {
                    e.preventDefault();
                    setConfigPanelWidth(current => Math.min(window.innerWidth - 100, current + 20)); // Increase width
                }
            }
        };

        window.addEventListener('keydown', handleConfigResize);
        return () => window.removeEventListener('keydown', handleConfigResize);
    }, [isActive]);

    // ✅ Context Menu for tabs
    const { showContextMenu, ContextMenuComponent } = useContextMenu();


    // ✅ Search Focus State (Lifted for Focus Mode Layout)
    const [isSearchFocused, setIsSearchFocused] = useState(false);

    // Default initial state (do not load validation files)
    const [tabs, setTabs] = useState<Tab[]>(() => {
        try {
            const saved = localStorage.getItem('openTabs');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed.map((t: any) => ({
                        id: t.id,
                        title: t.title,
                        initialFile: null,
                        filePath: t.filePath // ✅ Restore file path to pass to individual tab's loadState
                    }));
                }
            }
        } catch (e) {
            console.error('[LogExtractor] Failed to load tabs', e);
        }
        return [{ id: 'tab-1', title: 'New Log 1', initialFile: null }];
    });

    const [activeTabId, setActiveTabId] = useState<string>(() => {
        const saved = localStorage.getItem('activeTabId');
        return saved || 'tab-1';
    });



    // 🐧⚡ Find in All Hook initialization (독립 전체 찾기, Global Mission과 무관)
    const findInAll = useFindInAll({ tabs });



    // 🐧⚡ Event listener for Global Search Tab Switch
    useEffect(() => {
        const handleSwitch = (e: Event) => {
            const customEvent = e as CustomEvent<{ tabId: string }>;
            if (customEvent.detail && customEvent.detail.tabId) {
                setActiveTabId(customEvent.detail.tabId);
            }
        };
        window.addEventListener('global-search-switch-tab', handleSwitch);
        return () => window.removeEventListener('global-search-switch-tab', handleSwitch);
    }, []);

    // Determine next tab counter based on existing IDs
    const [tabCounter, setTabCounter] = useState(() => {
        const saved = localStorage.getItem('openTabs');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    const maxId = parsed.reduce((max: number, t: any) => {
                        const match = t.id.match(/^tab-(\d+)$/);
                        if (match) {
                            return Math.max(max, parseInt(match[1], 10));
                        }
                        return max;
                    }, 1);
                    return maxId + 1;
                }
            } catch { }
        }
        return 2;
    });

    // ✅ Performance: Debounce localStorage writes (1000ms)
    // Prevents synchronous I/O blocking during rapid tab switching or reordering
    useEffect(() => {
        const timer = setTimeout(() => {
            const safeTabs = tabs.map(t => ({ id: t.id, title: t.title, filePath: t.filePath }));
            localStorage.setItem('openTabs', JSON.stringify(safeTabs));
            localStorage.setItem('activeTabId', activeTabId);
        }, 1000);

        return () => clearTimeout(timer);
    }, [tabs, activeTabId]);

    // ✅ Drag & Drop state
    const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
    const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
    const [dragOverPosition, setDragOverPosition] = useState<'left' | 'right'>('right');


    const handleAddTab = useCallback((file: File | null = null) => {
        const newTabId = `tab-${tabCounter}`;

        // Safety: Ensure any stale state for this reused ID is cleared
        deleteStoredValue(`tabState_${newTabId}`);

        const newTitle = file ? file.name : `New Log ${tabCounter}`;
        const filePath = file && 'path' in file ? (file as any).path : undefined;

        setTabs(prev => [...prev, { id: newTabId, title: newTitle, initialFile: file, filePath }]);
        setActiveTabId(newTabId);
        setTabCounter(prev => prev + 1);


    }, [tabCounter]);

    /**
     * 🎯 [Notepad++ 전역 파일 오프너 허브]
     * - 중복 탭이 다른 곳에 켜져 있으면 해당 탭을 Active 탭으로 스위칭하고 Reload를 실행합니다.
     * - 중복 탭이 없고, 현재 탭이 빈 탭이면 현재 탭에 덮어씌웁니다.
     * - 그렇지 않으면 새 탭을 개설하여 엽니다.
     */
    const handleOpenFile = useCallback(async (file: File) => {
        let path = '';
        if (window.electronAPI && window.electronAPI.getFilePath) {
            path = window.electronAPI.getFilePath(file);
        } else {
            path = ('path' in file && (file as any).path) || '';
        }

        const fileName = file.name;

        // 1. 이미 동일한 파일(경로 또는 파일명)이 열려 있는 기존 탭이 존재하는지 조사
        const existingTab = tabs.find(t => {
            if (path && t.filePath) {
                return t.filePath === path;
            }
            return t.title === fileName;
        });

        if (existingTab) {
            console.log(`[LogExtractor] Found existing tab for ${fileName}. Activating tab: ${existingTab.id}`);
            // 해당 탭을 Active 상태로 전환!
            setActiveTabId(existingTab.id);

            // 해당 탭의 title과 initialFile을 강제 갱신하여 reload 트리거!
            setTabs(current => current.map(t => 
                t.id === existingTab.id 
                    ? { ...t, title: fileName, initialFile: file, filePath: path || t.filePath } 
                    : t
            ));
            return;
        }

        // 2. 동일한 파일이 없는 경우: 현재 활성화된 Active 탭이 '빈 탭'인지 확인
        const activeTab = tabs.find(t => t.id === activeTabId);
        let activeTabHasFile = false;
        
        if (activeTab) {
            if (activeTab.initialFile || activeTab.filePath) {
                activeTabHasFile = true;
            } else {
                try {
                    const activeTabStateStr = await getStoredValue(`tabState_${activeTabId}`);
                    if (activeTabStateStr) {
                        const parsed = JSON.parse(activeTabStateStr);
                        if (parsed.filePath) activeTabHasFile = true;
                    }
                } catch (e) {
                    console.error('[LogExtractor] Failed to read active tab state from DB during file drag check', e);
                }
            }
        }

        if (!activeTabHasFile && activeTab) {
            console.log(`[LogExtractor] Current active tab is empty. Loading file in current tab: ${activeTabId}`);
            // 현재 빈 탭에 그대로 덮어씌워 로딩
            setTabs(current => current.map(t => 
                t.id === activeTabId 
                    ? { ...t, title: fileName, initialFile: file, filePath: path } 
                    : t
            ));
        } else {
            console.log(`[LogExtractor] Opening in a new tab: ${fileName}`);
            // 새 탭을 파서 활성화
            handleAddTab(file);
        }
    }, [tabs, activeTabId, handleAddTab]);

    /**
     * Load archive logs into a new tab
     * Convert content string to File object to utilize existing tab creation flow
     */
    const handleArchiveToTab = useCallback((title: string, content: string) => {
        const blob = new Blob([content], { type: 'text/plain' });
        const file = new File([blob], `[Archive] ${title}.log`, { type: 'text/plain' });
        handleAddTab(file);
    }, [handleAddTab]);

    // Register Archive -> Tab load function
    useEffect(() => {
        setLoadArchiveToTab(handleArchiveToTab);
        return () => setLoadArchiveToTab(undefined);
    }, [handleArchiveToTab, setLoadArchiveToTab]);

    const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();

        // Cleanup storage & workers
        deleteStoredValue(`tabState_${tabId}`);



        if (tabs.length === 1) {
            const nextId = `tab-${tabCounter}`;
            deleteStoredValue(`tabState_${nextId}`);
            workerRegistry.terminateWorkers(tabId); // Terminate old tab's workers

            setTabs([{ id: nextId, title: `New Log ${tabCounter}`, initialFile: null }]);
            setActiveTabId(nextId);
            setTabCounter(prev => prev + 1);
            return;
        }

        const tabIndex = tabs.findIndex(t => t.id === tabId);
        const newTabs = tabs.filter(t => t.id !== tabId);

        setTabs(newTabs);

        // ✅ Terminate workers for the closed tab 💥
        workerRegistry.terminateWorkers(tabId);

        if (tabId === activeTabId) {
            const newActiveIndex = Math.max(0, tabIndex - 1);
            setActiveTabId(newTabs[newActiveIndex].id);
        }
    }, [tabs, activeTabId, tabCounter]);

    const handleGlobalDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            handleOpenFile(file); // 🎯 기존 handleAddTab 대신 전역 파일 오픈 위임으로 변경!
        }
    }, [handleOpenFile]);

    // ✅ Tab Context Menu handlers
    const handleDuplicateTab = useCallback((tabId: string) => {
        const tab = tabs.find(t => t.id === tabId);
        if (!tab) return;

        const newTabId = `tab-${tabCounter}`;
        deleteStoredValue(`tabState_${newTabId}`);

        const newTitle = `${tab.title} (Copy)`;

        setTabs(prev => [...prev, {
            id: newTabId,
            title: newTitle,
            initialFile: tab.initialFile,
            filePath: tab.filePath
        }]);
        setActiveTabId(newTabId);
        setTabCounter(prev => prev + 1);
    }, [tabs, tabCounter]);

    const handleCloseOtherTabs = useCallback((tabId: string) => {
        const tab = tabs.find(t => t.id === tabId);
        if (!tab) return;

        // Cleanup storage & workers for other tabs
        tabs.forEach(t => {
            if (t.id !== tabId) {
                deleteStoredValue(`tabState_${t.id}`);
                workerRegistry.terminateWorkers(t.id);
            }
        });

        setTabs([tab]);
        setActiveTabId(tabId);
    }, [tabs]);

    const handleCloseAllTabs = useCallback(() => {
        // Cleanup all storage & workers
        tabs.forEach(t => {
            deleteStoredValue(`tabState_${t.id}`);
            workerRegistry.terminateWorkers(t.id);
        });

        const newTabId = `tab-${tabCounter}`;
        deleteStoredValue(`tabState_${newTabId}`);

        setTabs([{ id: newTabId, title: `New Log ${tabCounter}`, initialFile: null }]);
        setActiveTabId(newTabId);
        setTabCounter(prev => prev + 1);
    }, [tabs, tabCounter]);

    const handleTabContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
        const tab = tabs.find(t => t.id === tabId);
        if (!tab) return;

        showContextMenu(e, [
            {
                label: 'Duplicate Tab',
                icon: <Copy size={16} />,
                action: () => handleDuplicateTab(tabId),
            },
            {
                label: 'Close Tab',
                icon: <XCircle size={16} />,
                action: () => handleCloseTab({} as React.MouseEvent, tabId),
                variant: 'default',
                disabled: tabs.length === 1,
            },
            {
                label: 'Close Other Tabs',
                icon: <X size={16} />,
                action: () => handleCloseOtherTabs(tabId),
                disabled: tabs.length === 1,
            },
            {
                label: 'Close All Tabs',
                icon: <Trash2 size={16} />,
                action: () => handleCloseAllTabs(),
                variant: 'danger',
            },
        ]);
    }, [tabs, showContextMenu, handleDuplicateTab, handleCloseTab, handleCloseOtherTabs, handleCloseAllTabs]);

    // ✅ Drag & Drop handlers
    const handleTabDragStart = useCallback((e: React.DragEvent, tabId: string) => {
        setDraggedTabId(tabId);
        e.dataTransfer.effectAllowed = 'move';
        // Set a semi-transparent drag image
        if (e.currentTarget instanceof HTMLElement) {
            const dragImage = e.currentTarget.cloneNode(true) as HTMLElement;
            dragImage.style.opacity = '0.5';
            document.body.appendChild(dragImage);
            e.dataTransfer.setDragImage(dragImage, 0, 0);
            setTimeout(() => document.body.removeChild(dragImage), 0);
        }
    }, []);

    const handleTabDragOver = useCallback((e: React.DragEvent, tabId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (draggedTabId && draggedTabId !== tabId) {
            setDragOverTabId(tabId);

            // Calculate drop position based on mouse X relative to tab center
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseX = e.clientX;
            const tabCenter = rect.left + rect.width / 2;
            setDragOverPosition(mouseX < tabCenter ? 'left' : 'right');
        }
    }, [draggedTabId]);

    const handleTabDragLeave = useCallback(() => {
        setDragOverTabId(null);
        setDragOverPosition('right');
    }, []);

    const handleTabDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
        e.preventDefault();

        if (!draggedTabId || draggedTabId === targetTabId) {
            setDraggedTabId(null);
            setDragOverTabId(null);
            return;
        }

        const draggedIndex = tabs.findIndex(t => t.id === draggedTabId);
        const targetIndex = tabs.findIndex(t => t.id === targetTabId);

        if (draggedIndex === -1 || targetIndex === -1) {
            setDraggedTabId(null);
            setDragOverTabId(null);
            setDragOverPosition('right');
            return;
        }

        // ✅ Calculate drop position explicitly from event to avoid state race conditions
        const rect = e.currentTarget.getBoundingClientRect();
        const dropPos = (e.clientX < (rect.left + rect.width / 2)) ? 'left' : 'right';

        // ✅ Calculate insert position based on calculated drop position
        const newTabs = [...tabs];
        const [draggedTab] = newTabs.splice(draggedIndex, 1);

        // Adjust target index based on position and if we removed before target
        let insertIndex = targetIndex;
        if (dropPos === 'right') {
            insertIndex = targetIndex + 1;
        }
        // If dragged from before target, decrement insert index
        if (draggedIndex < targetIndex) {
            insertIndex--;
        }

        newTabs.splice(insertIndex, 0, draggedTab);

        setTabs(newTabs);
        setDraggedTabId(null);
        setDragOverTabId(null);
        setDragOverPosition('right');
    }, [draggedTabId, tabs]);

    const handleTabDragEnd = useCallback(() => {
        setDraggedTabId(null);
        setDragOverTabId(null);
        setDragOverPosition('right');
    }, []);

    // Tab color function (similar to Post Tool groups)
    const getTabStyles = (id: string) => {
        const styles = [
            { base: 'border-blue-500/50 bg-blue-500/5', shadow: 'shadow-blue-500/10', gradient: 'from-blue-500 to-blue-400' },
            { base: 'border-purple-500/50 bg-purple-500/5', shadow: 'shadow-purple-500/10', gradient: 'from-purple-500 to-purple-400' },
            { base: 'border-pink-500/50 bg-pink-500/5', shadow: 'shadow-pink-500/10', gradient: 'from-pink-500 to-pink-400' },
            { base: 'border-rose-500/50 bg-rose-500/5', shadow: 'shadow-rose-500/10', gradient: 'from-rose-500 to-rose-400' },
            { base: 'border-red-500/50 bg-red-500/5', shadow: 'shadow-red-500/10', gradient: 'from-red-500 to-red-400' },
            { base: 'border-indigo-500/50 bg-indigo-500/5', shadow: 'shadow-indigo-500/10', gradient: 'from-indigo-500 to-indigo-400' },
            { base: 'border-violet-500/50 bg-violet-500/5', shadow: 'shadow-violet-500/10', gradient: 'from-violet-500 to-violet-400' },
            { base: 'border-fuchsia-500/50 bg-fuchsia-500/5', shadow: 'shadow-fuchsia-500/10', gradient: 'from-fuchsia-500 to-fuchsia-400' },
            { base: 'border-cyan-500/50 bg-cyan-500/5', shadow: 'shadow-cyan-500/10', gradient: 'from-cyan-500 to-cyan-400' },
            { base: 'border-sky-500/50 bg-sky-500/5', shadow: 'shadow-sky-500/10', gradient: 'from-sky-500 to-sky-400' },
            { base: 'border-teal-500/50 bg-teal-500/5', shadow: 'shadow-teal-500/10', gradient: 'from-teal-500 to-teal-400' },
            { base: 'border-emerald-500/50 bg-emerald-500/5', shadow: 'shadow-emerald-500/10', gradient: 'from-emerald-500 to-emerald-400' },
            { base: 'border-lime-500/50 bg-lime-500/5', shadow: 'shadow-lime-500/10', gradient: 'from-lime-500 to-lime-400' },
            { base: 'border-amber-500/50 bg-amber-500/5', shadow: 'shadow-amber-500/10', gradient: 'from-amber-500 to-amber-400' },
            { base: 'border-orange-500/50 bg-orange-500/5', shadow: 'shadow-orange-500/10', gradient: 'from-orange-500 to-orange-400' },
        ];
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
        return styles[Math.abs(hash) % styles.length];
    };




    // Keyboard Navigation for Tabs
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check for Ctrl+Tab (Next Tab)
            // Note: Shift+Ctrl+Tab for previous tab is also standard, implementing both for completeness
            if (e.ctrlKey && e.key === 'Tab') {
                e.preventDefault();
                const currentIndex = tabs.findIndex(t => t.id === activeTabId);
                if (currentIndex === -1) return;

                let nextIndex;
                if (e.shiftKey) {
                    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                } else {
                    nextIndex = (currentIndex + 1) % tabs.length;
                }

                setActiveTabId(tabs[nextIndex].id);
            }

            // Check for Ctrl+W (Close Current Tab)
            if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) {
                e.preventDefault();
                e.stopPropagation();
                // Pass a synthetic event or null since handleCloseTab expects a MouseEvent but doesn't strictly need it for logic
                handleCloseTab({ stopPropagation: () => { } } as any, activeTabId);
            }

            // Check for Ctrl+T (New Tab)
            if ((e.ctrlKey || e.metaKey) && (e.key === 't' || e.key === 'T')) {
                e.preventDefault();
                e.stopPropagation();
                handleAddTab(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [tabs, activeTabId, handleCloseTab]);

    // ✅ UI Improvement: Unified title bar with smooth scrolling
    const headerElement = React.useMemo(() => (
        <div
            className={`h-8 flex items-center bg-[#0f172a] border-b border-slate-800/60 select-none title-drag pr-36 header-transition ${isFocusMode ? 'header-hidden' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleGlobalDrop}
        >
            <div
                className="flex-1 flex overflow-x-auto overflow-y-hidden items-end h-full px-2 scroll-smooth no-drag"
            >
                {/* Custom scrollbar styling via Tailwind */}
                <style>{`
                    .tab-container::-webkit-scrollbar {
                        height: 4px;
                    }
                    .tab-container::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    .tab-container::-webkit-scrollbar-thumb {
                        background: rgba(99, 102, 241, 0.3);
                        border-radius: 2px;
                    }
                    .tab-container::-webkit-scrollbar-thumb:hover {
                        background: rgba(99, 102, 241, 0.5);
                    }
                `}</style>
                <div className="flex items-end h-full gap-0.5 tab-container" style={{ minWidth: 'max-content' }}>
                    {tabs.map((tab, idx) => {
                        const isActive = tab.id === activeTabId;
                        const isDragging = tab.id === draggedTabId;
                        const isDragOver = tab.id === dragOverTabId;
                        const tabStyles = getTabStyles(tab.id);

                        const draggedIndex = tabs.findIndex(t => t.id === draggedTabId);
                        const isLeftValid = draggedIndex !== idx - 1; // Don't show left indicator if dragging immediate previous tab
                        const isRightValid = draggedIndex !== idx + 1; // Don't show right indicator if dragging immediate next tab

                        return (
                            <div
                                key={tab.id}
                                draggable
                                onClick={() => setActiveTabId(tab.id)}
                                onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
                                onDragStart={(e) => handleTabDragStart(e, tab.id)}
                                onDragOver={(e) => handleTabDragOver(e, tab.id)}
                                onDragLeave={handleTabDragLeave}
                                onDrop={(e) => handleTabDrop(e, tab.id)}
                                onDragEnd={handleTabDragEnd}
                                className={`
                                    group relative flex items-center gap-2 px-4 py-1.5 min-w-[120px] max-w-[200px]
                                    text-xs font-medium cursor-move rounded-t-lg border-t border-l border-r
                                    transition-colors duration-200 ease-out
                                    ${idx > 0 ? '-ml-3' : ''}
                                    ${isDragging ? 'opacity-40 scale-95' : ''}
                                    ${isActive
                                        ? `bg-slate-950 ${tabStyles.base} text-slate-200 z-20 shadow-lg ${tabStyles.shadow} scale-[1.02] h-full mb-0`
                                        : `bg-slate-950/40 border-slate-800/40 text-slate-500 hover:bg-slate-900/50 hover:text-slate-300 z-10 hover:z-15 hover:scale-[1.01] h-[calc(100%-1px)] mb-[1px]`
                                    }
                                `}
                                style={{
                                    transform: isActive ? 'translateY(1px)' : 'translateY(0)',
                                }}
                                title={tab.title}
                            >
                                {/* Drop indicators - Smart hiding */}
                                {isDragOver && draggedTabId && dragOverPosition === 'left' && isLeftValid && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 z-50 rounded-l-lg" />
                                )}
                                {isDragOver && draggedTabId && dragOverPosition === 'right' && isRightValid && (
                                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-indigo-500 z-50 rounded-r-lg" />
                                )}

                                <FileText
                                    size={12}
                                    className={`transition-colors duration-200 ${isActive ? 'text-slate-200' : 'opacity-50 group-hover:opacity-80'}`}
                                />
                                <span className="truncate flex-1">{tab.title}</span>
                                <button
                                    onClick={(e) => handleCloseTab(e, tab.id)}
                                    className={`
                                        opacity-0 group-hover:opacity-100 p-0.5 rounded-md transition-all duration-200
                                        ${isActive ? 'hover:bg-slate-700/50 text-slate-300' : 'hover:bg-slate-700 text-slate-400'}
                                    `}
                                >
                                    <X size={12} />
                                </button>

                                {/* Active indicator */}
                                {isActive && (
                                    <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${tabStyles.gradient} rounded-t-full`} />
                                )}
                                {/* Bottom border hider for active tab - Positioned inside to avoid overflow clipping */}
                                {isActive && (
                                    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-slate-950 z-30" />
                                )}
                            </div>
                        );
                    })}

                    <button
                        onClick={() => handleAddTab(null)}
                        className="h-[32px] w-[32px] flex items-center justify-center rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-slate-800/50 transition-all duration-200 ml-2 mb-0.5 z-0 hover:scale-110"
                        title="New Tab (Ctrl+T)"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>
        </div >
    ), [tabs, activeTabId, handleAddTab, handleCloseTab, handleGlobalDrop, draggedTabId, dragOverTabId, handleTabDragStart, handleTabDragOver, handleTabDragLeave, handleTabDrop, handleTabDragEnd, toggleSidebar, isFocusMode]);

    const handleTitleChange = useCallback((tabId: string, newTitle: string) => {
        setTabs(current => current.map(t => t.id === tabId ? { ...t, title: newTitle } : t));
    }, []);

    return (
        <LogViewPreferencesProvider>
            <div className="flex h-full flex-col font-sans overflow-hidden bg-[#0b0f19] relative">
                {/* ✅ Global Header - Rendered Once, Positioned Absolutely to sit right of Config Panel */}
                {/* ✅ Global Header - Rendered Once, Positioned Absolutely to sit right of Config Panel */}
                {/* ✅ Global Header - Rendered Once, Positioned Absolutely to sit right of Config Panel */}
                <div
                    className={`absolute right-0 h-8 z-40 transition-[left,transform] duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] top-0 ${(isFocusMode && !isPanelOpen && !isSearchFocused) ? 'translate-y-0 pointer-events-none' : 'translate-y-16 pointer-events-auto'}`}
                    style={{
                        left: isPanelOpen ? configPanelWidth : 32,
                        transitionDelay: isPanelOpen ? '100ms, 0ms' : '0ms, 100ms' // Staggered: Open=HeaderDown/Wait/PanelOut, Close=PanelIn/Wait/HeaderUp. Wait...
                        // Close (!isPanel): Panel Shrink (Left) -> 0ms. Header Up (Transform) -> 100ms. Correct: '0ms, 100ms'.
                        // Open (isPanel): Header Down (Transform) -> 0ms. Panel Expand (Left) -> 100ms. Correct: '100ms, 0ms'.
                    }}
                >
                    {headerElement}
                </div>

                <div className="flex-1 overflow-hidden relative">
                    {tabs.map((tab) => (
                        <div
                            key={tab.id}
                            className="w-full h-full"
                            style={{ display: tab.id === activeTabId ? 'block' : 'none' }}
                        >
                            <LogProvider
                                key={tab.id}
                                rules={rules}
                                onUpdateRules={onUpdateRules}
                                onExportSettings={onExportSettings}
                                onImportSettings={onImportSettings}
                                configPanelWidth={configPanelWidth}
                                setConfigPanelWidth={setConfigPanelWidth}
                                tabId={tab.id}
                                initialFilePath={tab.filePath}
                                initialFile={tab.initialFile} // ✅ Pass the File object
                                onFileChange={(newPath) => {
                                    setTabs(current => current.map(t => t.id === tab.id ? { ...t, filePath: newPath } : t));
                                }}
                                isActive={isActive && tab.id === activeTabId}
                                isPanelOpen={isPanelOpen}
                                setIsPanelOpen={setIsPanelOpen}
                                isSearchFocused={isSearchFocused} // ✅ Pass Down
                                setIsSearchFocused={setIsSearchFocused} // ✅ Pass Down
                                onAddTab={handleArchiveToTab} // ✅ New Tab Callback
                                onOpenFile={handleOpenFile} // 🎯 전역 파일 오픈 위임 추가!
                            >
                                <SessionWrapper
                                    isActive={isActive && tab.id === activeTabId}
                                    title={tab.title}
                                    tabId={tab.id}
                                    onTitleChange={handleTitleChange}

                                    findInAll={findInAll}
                                />
                            </LogProvider>
                        </div>
                    ))}
                </div>

                {/* ✅ Context Menu */}
                {ContextMenuComponent}
            </div>
        </LogViewPreferencesProvider>
    );
};

// Wrapper to properly pass props
const SessionWrapper: React.FC<{
    isActive: boolean;
    title: string;
    onTitleChange: (id: string, title: string) => void;
    tabId: string;

    findInAll: any;
}> = React.memo(({ isActive, title, onTitleChange, tabId, findInAll }) => {
    // We create a stable callback for this specific session instance
    const handleTitleChange = useCallback((newTitle: string) => {
        onTitleChange(tabId, newTitle);
    }, [onTitleChange, tabId]);

    return (
        <LogSession
            isActive={isActive}
            currentTitle={title}
            onTitleChange={handleTitleChange}
            findInAll={findInAll}
            tabId={tabId} // 🐧⚡ 추가!
        />
    );
});

export default LogExtractor;
