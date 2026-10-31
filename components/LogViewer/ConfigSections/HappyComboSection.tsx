import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as Lucide from 'lucide-react';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { LogRule, HappyGroup } from '../../../types';

const { Zap, X, Folder, FolderOpen, Plus, Activity, PlayCircle, StopCircle, MinusCircle, Search, PlusCircle, ChevronsDownUp, ChevronsUpDown } = Lucide;

interface HappyComboSectionProps {
    currentConfig: LogRule;
    appliedConfig?: LogRule; // ✅ Added for sync
    updateCurrentRule: (updates: Partial<LogRule>) => void;
    groupedRoots: { root: string; isRootEnabled: boolean; items: { group: string[]; active: boolean; originalIdx: number, id?: string, alias?: string }[] }[];
    appliedGroupedRoots?: { root: string; isRootEnabled: boolean; items: { group: string[]; active: boolean; originalIdx: number, id?: string, alias?: string }[] }[]; // ✅ Added for sync
    collapsedRoots: Set<string>;
    onToggleRootCollapse: (root: string) => void;
    handleToggleRoot: (root: string, enabled: boolean) => void;
    happyCombosCaseSensitive: boolean;
    tabId: string;
    setCollapsedRoots: React.Dispatch<React.SetStateAction<Set<string>>>;
}

// Helper to check if a specific tag is being edited
const isTagEditing = (target: { groupIdx: number, termIdx: number, isActive: boolean } | null, originalIdx: number, termIdx: number, isActive: boolean) => {
    return !!(target && target.groupIdx === originalIdx && target.termIdx === termIdx && target.isActive === isActive);
};

import { EditableTag } from './EditableTag';

export const HappyComboSection = React.memo<HappyComboSectionProps>(({
    currentConfig,
    appliedConfig,
    updateCurrentRule,
    groupedRoots,
    appliedGroupedRoots,
    collapsedRoots,
    onToggleRootCollapse,
    handleToggleRoot,
    happyCombosCaseSensitive,
    tabId,
    setCollapsedRoots
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    // editingTarget only stores COORDINATES. Value is local to EditableTag.
    const [editingTarget, setEditingTarget] = useState<{ groupIdx: number, termIdx: number, isActive: boolean, value?: string } | null>(null);
    const [isPerfMode, setIsPerfMode] = useState(false); // ✅ Perf Mode Checkbox State

    // Ref to handle auto-focus on new branch creation
    const pendingBranchFocus = useRef<{ rootIdx: number, branchIdx: number } | null>(null);
    // Ref to handle auto-focus on new root creation
    const pendingRootFocus = useRef<string | null>(null);

    // ✅ Suggestions logic for Alias
    const [focusedAliasId, setFocusedAliasId] = useState<string | null>(null);
    const allAliases = useMemo(() => {
        const set = new Set<string>();
        currentConfig.happyGroups?.forEach(g => {
            if (g.alias?.trim()) set.add(g.alias.trim());
        });
        return Array.from(set).sort();
    }, [currentConfig.happyGroups]);

    // ✅ Filtered Groups based on search
    const filteredGroupedRoots = useMemo(() => {
        if (!searchTerm.trim()) return groupedRoots;
        const term = searchTerm.toLowerCase();
        return groupedRoots.filter(gr => {
            const rootMatch = gr.root.toLowerCase().includes(term);
            const tagMatch = gr.items.some(item => 
                item.group.some(tag => tag.toLowerCase().includes(term))
            );
            const aliasMatch = gr.items.some(item => 
                item.alias?.toLowerCase().includes(term)
            );
            return rootMatch || tagMatch || aliasMatch;
        });
    }, [groupedRoots, searchTerm]);

    const handleCollapseAll = () => {
        const allRoots = groupedRoots.map(g => g.root);
        setCollapsedRoots(new Set(allRoots));
    };

    const handleExpandAll = () => {
        setCollapsedRoots(new Set());
    };

    const handleCreateNewRoot = () => {
        let newName = 'NewRoot';
        let counter = 1;
        const existing = new Set(groupedRoots.map(g => g.root));
        while (existing.has(newName)) { newName = `NewRoot (${counter++})`; }

        if (currentConfig.happyGroups) {
            const newId = Math.random().toString(36).substring(7);
            updateCurrentRule({ happyGroups: [...currentConfig.happyGroups, { id: newId, tags: [newName], enabled: true }] });
        } else {
            updateCurrentRule({ includeGroups: [...currentConfig.includeGroups, [newName]] });
        }
        pendingRootFocus.current = newName;
    };

    useEffect(() => {
        if (pendingBranchFocus.current) {
            const { rootIdx, branchIdx } = pendingBranchFocus.current;
            const input = document.querySelector(`input[data-add-tag="hc-${tabId}-${rootIdx}-${branchIdx}"]`) as HTMLInputElement;
            if (input) {
                input.focus();
                pendingBranchFocus.current = null;
            }
        }

        if (pendingRootFocus.current) {
            // Find the root that matches the name
            if (groupedRoots.some(g => g.root === pendingRootFocus.current)) {
                setEditingTarget({ groupIdx: -1, termIdx: -1, isActive: true, value: pendingRootFocus.current });
                pendingRootFocus.current = null;
            }
        }
    }, [groupedRoots]);

    // Helper to update groups
    const handleUpdateGroup = (originalIdx: number, newGroup: string[], isActive: boolean, id?: string, alias?: string) => {
        if (currentConfig.happyGroups) {
            // New Logic
            const newHappyGroups = [...currentConfig.happyGroups];
            const targetIndex = id ? newHappyGroups.findIndex(g => g.id === id) : originalIdx;

            if (targetIndex > -1) {
                newHappyGroups[targetIndex] = {
                    ...newHappyGroups[targetIndex],
                    tags: newGroup,
                    alias: alias !== undefined ? alias : newHappyGroups[targetIndex].alias
                };

                // 💡 Unified Happy Combos: Clear legacy fields to prevent ghost filtering
                updateCurrentRule({
                    happyGroups: newHappyGroups,
                    includeGroups: [], // Clear legacy OR/AND groups

                });
            }
        } else {
            // Legacy Logic
            const sourceArray = isActive ? currentConfig.includeGroups : (currentConfig.disabledGroups || []);
            const newGroups = [...sourceArray];
            newGroups[originalIdx] = newGroup;

            if (isActive) updateCurrentRule({ includeGroups: newGroups });
            else updateCurrentRule({ disabledGroups: newGroups });
        }
    };

    const handleDeleteRoot = (root: string) => {
        if (currentConfig.happyGroups) {
            const newHappyGroups = currentConfig.happyGroups.filter(h => (h.tags[0] || '').trim() !== root);
            updateCurrentRule({
                happyGroups: newHappyGroups,
                includeGroups: [],

            });
        } else {
            const newIncludes = currentConfig.includeGroups.filter(g => (g[0] || '').trim() !== root);
            const newDisabled = (currentConfig.disabledGroups || []).filter(g => (g[0] || '').trim() !== root);
            updateCurrentRule({ includeGroups: newIncludes, disabledGroups: newDisabled });
        }
    };

    const handleDeleteBranch = (item: any, itemsLength: number, root: string, rootIdx: number, itemIdx: number) => {
        if (itemsLength === 1) {
            const newGroup = [root];
            handleUpdateGroup(item.originalIdx, newGroup, item.active, item.id);
            // Stay focused on current + tag (which is now cleaned)
        } else {
            if (currentConfig.happyGroups && item.id) {
                const newHappy = currentConfig.happyGroups.filter(h => h.id !== item.id);
                updateCurrentRule({ happyGroups: newHappy });
            } else {
                const sourceArray = item.active ? currentConfig.includeGroups : (currentConfig.disabledGroups || []);
                const newGroups = sourceArray.filter((_, i) => i !== item.originalIdx);
                if (item.active) updateCurrentRule({ includeGroups: newGroups });
                else updateCurrentRule({ disabledGroups: newGroups });
            }

            // Move Focus
            if (itemIdx > 0) {
                // Focus previous branch's + tag
                setTimeout(() => {
                    const prevInput = document.querySelector(`input[data-add-tag="${rootIdx}-${itemIdx - 1}"]`) as HTMLInputElement;
                    prevInput?.focus();
                }, 50);
            } else {
                // Focus root tag
                setEditingTarget({ groupIdx: -1, termIdx: -1, isActive: true, value: root } as any);
            }
        }
    };

    const handleCreateBranch = (rootIdx: number, rootTag: string, existingItemCount: number) => {
        const newId = Math.random().toString(36).substring(7);
        if (currentConfig.happyGroups) {
            updateCurrentRule({ happyGroups: [...currentConfig.happyGroups, { id: newId, tags: [rootTag], enabled: true }] });
        } else {
            updateCurrentRule({ includeGroups: [...currentConfig.includeGroups, [rootTag]] });
        }
        pendingBranchFocus.current = { rootIdx, branchIdx: existingItemCount };
    };

    const handleNavigate = (key: string, rootIdx: number, itemIdx: number, tIdx: number, root: string, itemsLength: number, branchTagsLength: number, itemOriginalIdx?: number, itemActive?: boolean) => {
        // Selector helper for unique tab-based access
        const getAddTagInput = (rIdx: number, iIdx: number) => document.querySelector(`input[data-add-tag="hc-${tabId}-${rIdx}-${iIdx}"]`) as HTMLInputElement;

        if (key === 'Down') {
            if (itemIdx < itemsLength - 1) {
                const nextBranch = groupedRoots[rootIdx].items[itemIdx + 1];
                const nextBranchTags = nextBranch.group.slice(1);
                // Try to find same tIdx tag in next branch
                if (tIdx > 0 && tIdx <= nextBranchTags.length) {
                    setEditingTarget({ groupIdx: nextBranch.originalIdx, termIdx: tIdx, isActive: nextBranch.active });
                } else {
                    getAddTagInput(rootIdx, itemIdx + 1)?.focus();
                }
            } else {
                handleCreateBranch(rootIdx, root, itemsLength);
            }
        } else if (key === 'Up') {
            if (itemIdx > 0) {
                const prevBranch = groupedRoots[rootIdx].items[itemIdx - 1];
                const prevBranchTags = prevBranch.group.slice(1);
                // Try to find same tIdx tag in previous branch
                if (tIdx > 0 && tIdx <= prevBranchTags.length) {
                    setEditingTarget({ groupIdx: prevBranch.originalIdx, termIdx: tIdx, isActive: prevBranch.active });
                } else {
                    getAddTagInput(rootIdx, itemIdx - 1)?.focus();
                }
            } else {
                // Focus root tag
                setEditingTarget({ groupIdx: -1, termIdx: -1, isActive: true, value: root } as any);
            }
        } else if (key === 'Left' || key === 'Backspace') {
            if (tIdx > 1) {
                setEditingTarget({ groupIdx: itemOriginalIdx!, termIdx: tIdx - 1, isActive: itemActive! });
            } else if (tIdx === 1) {
                // Jump to Root
                setEditingTarget({ groupIdx: -1, termIdx: -1, isActive: true, value: root } as any);
            } else if (tIdx === 0) { // Coming from + tag
                if (branchTagsLength > 0) {
                    setEditingTarget({ groupIdx: itemOriginalIdx!, termIdx: branchTagsLength, isActive: itemActive! });
                } else {
                    // Jump to Root
                    setEditingTarget({ groupIdx: -1, termIdx: -1, isActive: true, value: root } as any);
                }
            }
        } else if (key === 'PreviousInput') {
            if (tIdx > 1) {
                setEditingTarget({ groupIdx: itemOriginalIdx!, termIdx: tIdx - 1, isActive: itemActive! });
            } else {
                // Jump to Root
                setEditingTarget({ groupIdx: -1, termIdx: -1, isActive: true, value: root } as any);
            }
        } else if (key === 'Right' || key === 'NextInput') {
            if (tIdx < branchTagsLength) {
                setEditingTarget({ groupIdx: itemOriginalIdx!, termIdx: tIdx + 1, isActive: itemActive! });
            } else {
                getAddTagInput(rootIdx, itemIdx)?.focus();
            }
        }
    };

    return (
        <div className="p-0">
            <div className="sticky top-0 z-30 bg-slate-900 -mx-5 px-5 py-4 mb-4 border-b border-slate-800/50 shadow-lg shadow-black/20">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            checked={groupedRoots.some(r => r.isRootEnabled)}
                            onChange={(e) => {
                                const enabled = e.target.checked;
                                const updates: Partial<LogRule> = { happyCombosEnabled: enabled };

                                // 💡 형님! 켜면 전체 켜기, 끄면 전체 끄기로 동작합니다.
                                if (currentConfig.happyGroups) {
                                    updates.happyGroups = currentConfig.happyGroups.map(g => ({ ...g, enabled }));
                                }

                                updateCurrentRule(updates);
                            }}
                            className="accent-yellow-400 w-4 h-4 cursor-pointer"
                            title={groupedRoots.some(r => r.isRootEnabled) ? "Disable All Happy Combos" : "Enable All Happy Combos"}
                        />
                        <label className={`text-sm font-black uppercase tracking-tighter flex items-center gap-2 transition-colors ${groupedRoots.some(r => r.isRootEnabled) ? 'text-indigo-100' : 'text-slate-500'}`}>
                            <Zap size={16} className={`${groupedRoots.some(r => r.isRootEnabled) ? 'text-yellow-400 fill-yellow-400 icon-glow' : 'text-slate-600'}`} />
                            Happy Combos
                        </label>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* ✅ Collapse/Expand All */}
                        <div className="flex items-center bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/50">
                            <IconButton
                                onClick={handleCollapseAll}
                                icon={<ChevronsDownUp size={14} />}
                                title="Collapse All"
                                size="sm"
                                variant="ghost"
                                className="text-slate-400 hover:text-white"
                            />
                            <IconButton
                                onClick={handleExpandAll}
                                icon={<ChevronsUpDown size={14} />}
                                title="Expand All"
                                size="sm"
                                variant="ghost"
                                className="text-slate-400 hover:text-white"
                            />
                        </div>

                        {/* ✅ Quick Create Button */}
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleCreateNewRoot}
                            icon={<PlusCircle size={14} />}
                            className="bg-indigo-600 hover:bg-indigo-500 text-xs font-bold h-8"
                        >
                            ADD COMBO
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* ✅ Search Input - 너비 제한 추가 */}
                    <div className="relative flex-1 max-w-[240px] group">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-950/50 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-auto">
                        {/* ✅ Perf Mode Toggle */}
                        <label className={`flex items-center gap-1.5 cursor-pointer text-[10px] uppercase font-bold tracking-wider transition-colors ${isPerfMode ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}>
                            <input type="checkbox" checked={isPerfMode} onChange={(e) => setIsPerfMode(e.target.checked)} className="accent-amber-500 rounded-sm w-3 h-3" />
                            <span className="flex items-center gap-1">
                                <Activity size={12} />
                                Perf
                            </span>
                        </label>

                        <label className={`flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-500 hover:text-indigo-400 transition-colors uppercase font-bold tracking-wider ${happyCombosCaseSensitive ? 'text-indigo-400' : ''}`}>
                            <input type="checkbox" checked={happyCombosCaseSensitive ?? false} onChange={(e) => updateCurrentRule({ happyCombosCaseSensitive: e.target.checked })} className="accent-indigo-500 rounded-sm w-3 h-3" />
                            <span>Case</span>
                        </label>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {filteredGroupedRoots.length === 0 && searchTerm && (
                    <div className="py-20 text-center text-slate-600 italic text-sm">
                        No combos matching "{searchTerm}"
                    </div>
                )}
                {filteredGroupedRoots.map(({ root, isRootEnabled, items }, rootIdx) => {
                    const isAnyAliasFocusedInThisRoot = items.some(item => focusedAliasId === (item.id || item.originalIdx.toString()));

                    // 🐧🎯 형님! 시각적 상태(색상 등)는 실제로 적용된 설정을 따라가게 하여 로그 렌더러와 동기화합니다.
                    const appliedRoot = appliedGroupedRoots?.find(a => a.root === root);
                    const visuallyEnabled = appliedRoot ? appliedRoot.isRootEnabled : isRootEnabled;

                    return (
                        <div key={rootIdx} className={`glass rounded-2xl p-4 transition-all duration-300 relative group border ${visuallyEnabled ? 'border-indigo-500/10' : 'border-slate-800 opacity-60'} ${isAnyAliasFocusedInThisRoot ? 'z-50' : 'z-10'}`}>
                            {/* Background Gradient for Root */}
                            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br transition-opacity duration-500 pointer-events-none ${visuallyEnabled ? 'from-indigo-500/5 to-transparent opacity-100' : 'opacity-0'}`} />

                            {/* Root Header */}
                            <div className="flex items-center gap-3 relative z-10 mb-2">
                                <input type="checkbox" checked={visuallyEnabled} onChange={(e) => handleToggleRoot(root, e.target.checked)} className="accent-indigo-500 w-4 h-4 cursor-pointer" />

                                <IconButton
                                    onClick={() => onToggleRootCollapse(root)}
                                    icon={collapsedRoots.has(root) ? <Folder size={14} /> : <FolderOpen size={14} />}
                                    className={`rounded-lg transition-colors ${visuallyEnabled ? 'text-indigo-300 hover:bg-indigo-500/20' : 'text-slate-500 hover:bg-slate-800'} ${!collapsedRoots.has(root) && visuallyEnabled ? 'bg-indigo-500/10' : ''}`}
                                    size="sm"
                                />

                                {/* Root Name Editing */}
                                {editingTarget?.groupIdx === -1 && editingTarget?.value === root ? (
                                    <input
                                        autoFocus
                                        className="bg-indigo-900/50 text-indigo-100 px-3 py-1 rounded-lg text-sm font-bold border border-indigo-500/50 outline-none shadow-lg min-w-[120px]"
                                        defaultValue={root}
                                        onBlur={(e) => {
                                            const newVal = e.target.value.trim();
                                            if (newVal && newVal !== root) {
                                                if (currentConfig.happyGroups) {
                                                    const newHappyGroups = currentConfig.happyGroups.map(h => {
                                                        if ((h.tags[0] || '').trim() === root) {
                                                            return { ...h, tags: [newVal, ...h.tags.slice(1)] };
                                                        }
                                                        return h;
                                                    });
                                                    updateCurrentRule({ happyGroups: newHappyGroups });
                                                } else {
                                                    const newIncludes = currentConfig.includeGroups.map(g => (g[0] || '').trim() === root ? [newVal, ...g.slice(1)] : g);
                                                    const newDisabled = (currentConfig.disabledGroups || []).map(g => (g[0] || '').trim() === root ? [newVal, ...g.slice(1)] : g);
                                                    updateCurrentRule({ includeGroups: newIncludes, disabledGroups: newDisabled });
                                                }
                                            }
                                            setEditingTarget(null);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                                                e.preventDefault();
                                                e.currentTarget.blur();
                                                // Focus first branch's + tag or first tag
                                                if (items.length > 0) {
                                                    if (items[0].group.length > 1) {
                                                        setEditingTarget({ groupIdx: items[0].originalIdx, termIdx: 1, isActive: items[0].active });
                                                    } else {
                                                        const firstBranchPlusInput = document.querySelector(`input[data-add-tag="hc-${tabId}-${rootIdx}-0"]`) as HTMLInputElement;
                                                        firstBranchPlusInput?.focus();
                                                    }
                                                }
                                            } else if (e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                if (items.length > 0) {
                                                    const firstBranchPlusInput = document.querySelector(`input[data-add-tag="hc-${tabId}-${rootIdx}-0"]`) as HTMLInputElement;
                                                    firstBranchPlusInput?.focus();
                                                }
                                            }
                                        }}
                                    />
                                ) : (
                                    <span
                                        onClick={() => setEditingTarget({ groupIdx: -1, termIdx: -1, isActive: true, value: root } as any)}
                                        className={`font-bold text-sm cursor-pointer hover:text-indigo-300 transition-colors px-2 py-1 rounded hover:bg-white/5 ${visuallyEnabled ? 'text-indigo-100' : 'text-slate-500'}`}
                                    >
                                        {root}
                                    </span>
                                )}

                                <IconButton
                                    variant="ghost"
                                    size="sm"
                                    icon={<Plus size={14} />}
                                    title="Add Branch"
                                    className={`ml-2 transition-all ${isRootEnabled ? 'text-indigo-400 hover:bg-indigo-500/20' : 'text-slate-600 hover:bg-slate-800'}`}
                                    onClick={() => handleCreateBranch(rootIdx, root, items.length)}
                                />

                                <IconButton
                                    variant="ghost"
                                    size="sm"
                                    icon={<X size={14} />}
                                    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-red-400"
                                    onClick={() => handleDeleteRoot(root)}
                                />
                            </div>

                            {/* Branches */}
                            {!collapsedRoots.has(root) && (
                                <div className="relative pl-7 space-y-3 mt-3">
                                    <div className="absolute left-[11px] top-0 bottom-4 w-px bg-slate-800" />

                                    {items.map((item, itemIdx) => {
                                        const branchTags = item.group.slice(1);

                                        // 🐧🎯 형님! 브랜치(아이템) 단위로도 시각적 상태를 동기화합니다.
                                        const appliedItem = appliedRoot?.items.find(ai => ai.id === item.id || (ai.originalIdx === item.originalIdx));
                                        const visuallyActive = appliedItem ? appliedItem.active : item.active;

                                        return (
                                            <div key={item.originalIdx} className="relative group/branch flex items-center pr-2">
                                                {/* Branch Line */}
                                                <div className="absolute -left-4 top-[14px] w-4 h-px bg-slate-800" />

                                                <div className="flex flex-wrap items-center gap-2 flex-1">
                                                    {branchTags.map((term, tIdx) => (
                                                        <React.Fragment key={tIdx}>
                                                            {tIdx > 0 && <div className="w-1 h-1 bg-slate-700 rounded-full mx-0.5" />}
                                                            <EditableTag
                                                                isEditing={isTagEditing(editingTarget, item.originalIdx, tIdx + 1, item.active)}
                                                                value={term}
                                                                isActive={visuallyActive}
                                                                isLast={tIdx === branchTags.length - 1}
                                                                groupIdx={item.originalIdx}
                                                                termIdx={tIdx + 1}
                                                                onStartEdit={() => setEditingTarget({ groupIdx: item.originalIdx, termIdx: tIdx + 1, isActive: item.active })}
                                                                onCommit={(newVal) => {
                                                                    const newGroup = [...item.group];
                                                                    if (newVal.trim()) newGroup[tIdx + 1] = newVal.trim();
                                                                    else newGroup.splice(tIdx + 1, 1);
                                                                    handleUpdateGroup(item.originalIdx, newGroup, item.active, item.id);
                                                                    setEditingTarget(null);
                                                                }}
                                                                onDelete={() => {
                                                                    const newGroup = [...item.group];
                                                                    newGroup.splice(tIdx + 1, 1);
                                                                    handleUpdateGroup(item.originalIdx, newGroup, item.active, item.id);
                                                                }}
                                                                onNavigate={(key) => handleNavigate(key, rootIdx, itemIdx, tIdx + 1, root, items.length, branchTags.length, item.originalIdx, item.active)}
                                                            />
                                                        </React.Fragment>
                                                    ))}

                                                    {/* Add Tag Input */}
                                                    <input
                                                        className="bg-transparent text-[11px] text-slate-500 placeholder-slate-600 focus:text-indigo-300 focus:placeholder-indigo-500/50 focus:outline-none min-w-[60px] py-1 px-2 border border-transparent focus:border-indigo-500/30 rounded-lg transition-all hover:bg-white/5"
                                                        placeholder="+ tag"
                                                        data-add-tag={`hc-${tabId}-${rootIdx}-${itemIdx}`}
                                                        onBlur={(e) => { e.currentTarget.value = ''; }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                                                const newGroup = [...item.group, e.currentTarget.value.trim()];
                                                                handleUpdateGroup(item.originalIdx, newGroup, item.active, item.id);
                                                                e.currentTarget.value = '';
                                                            } else if (e.key === 'ArrowDown') {
                                                                e.preventDefault();
                                                                handleNavigate('Down', rootIdx, itemIdx, branchTags.length, root, items.length, branchTags.length, item.originalIdx, item.active);
                                                            } else if (e.key === 'ArrowUp') {
                                                                e.preventDefault();
                                                                handleNavigate('Up', rootIdx, itemIdx, branchTags.length, root, items.length, branchTags.length, item.originalIdx, item.active);
                                                            } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
                                                                e.preventDefault();
                                                                handleNavigate('Left', rootIdx, itemIdx, 0, root, items.length, branchTags.length, item.originalIdx, item.active);
                                                            } else if (e.key === 'Backspace' && !e.currentTarget.value) {
                                                                e.preventDefault();
                                                                handleNavigate('Backspace', rootIdx, itemIdx, 0, root, items.length, branchTags.length, item.originalIdx, item.active);
                                                            } else if (e.key === 'Delete' && !e.currentTarget.value) {
                                                                e.preventDefault();
                                                                handleDeleteBranch(item, items.length, root, rootIdx, itemIdx);
                                                            } else if (e.key === 'Tab') {
                                                                if (e.shiftKey) {
                                                                    e.preventDefault();
                                                                    handleNavigate('Left', rootIdx, itemIdx, 0, root, items.length, branchTags.length, item.originalIdx, item.active);
                                                                } else {
                                                                    if (itemIdx < items.length - 1) {
                                                                        e.preventDefault();
                                                                        const nextBranch = items[itemIdx + 1];
                                                                        const nextBranchTags = nextBranch.group.slice(1);
                                                                        if (nextBranchTags.length > 0) {
                                                                            setEditingTarget({ groupIdx: nextBranch.originalIdx, termIdx: 1, isActive: nextBranch.active });
                                                                        } else {
                                                                            const nextInput = document.querySelector(`input[data-add-tag="hc-${tabId}-${rootIdx}-${itemIdx + 1}"]`) as HTMLInputElement;
                                                                            nextInput?.focus();
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>

                                                {/* ✅ Perf Mode UI */}
                                                {isPerfMode && (
                                                    <div className="flex items-center gap-2 ml-3 animate-in fade-in slide-in-from-right-4 duration-300">
                                                        <div className="h-4 w-px bg-slate-700/50" />

                                                        {/* Alias Input */}
                                                        <div className="relative group/alias">
                                                            <input
                                                                className={`text-[10px] bg-slate-900/50 border border-slate-700 rounded px-2 py-1 w-24 text-slate-300 placeholder-slate-600 focus:border-amber-500/50 focus:outline-none transition-all ${item.alias ? 'text-amber-300 border-amber-500/30 bg-amber-500/5' : ''}`}
                                                                placeholder="Alias"
                                                                value={item.alias || ''}
                                                                onFocus={() => setFocusedAliasId(item.id || item.originalIdx.toString())}
                                                                onBlur={() => setTimeout(() => setFocusedAliasId(null), 200)}
                                                                onChange={(e) => handleUpdateGroup(item.originalIdx, item.group, item.active, item.id, e.target.value)}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                                            />
                                                            {item.alias && (
                                                                <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-500 rounded-full flex items-center justify-center shadow-lg shadow-amber-900/50">
                                                                    <Activity size={8} className="text-black" />
                                                                </div>
                                                            )}

                                                            {/* Alias Suggestions */}
                                                            {focusedAliasId === (item.id || item.originalIdx.toString()) && allAliases.length > 0 && (
                                                                <div className="absolute top-full left-0 mt-1 w-40 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                                    <div className="px-2 py-1 text-[8px] uppercase text-slate-500 font-bold border-b border-slate-800 mb-1">Suggestions</div>
                                                                    <div className="max-h-32 overflow-y-auto custom-scrollbar">
                                                                        {allAliases
                                                                            .filter(a => !item.alias || a.toLowerCase().includes(item.alias.toLowerCase()))
                                                                            .map((a, i) => (
                                                                                <div
                                                                                    key={i}
                                                                                    className="px-2 py-1.5 text-[10px] text-slate-300 hover:bg-amber-500/10 hover:text-amber-400 cursor-pointer transition-colors flex items-center gap-2"
                                                                                    onClick={() => handleUpdateGroup(item.originalIdx, item.group, item.active, item.id, a)}
                                                                                >
                                                                                    <Activity size={10} className="text-amber-500/50" />
                                                                                    {a}
                                                                                </div>
                                                                            ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Removed Role Badges as per request */}


                                                <IconButton
                                                    variant="ghost"
                                                    size="xs"
                                                    icon={<X size={12} />}
                                                    className="ml-2 opacity-0 group-hover/branch:opacity-100 transition-opacity text-slate-600 hover:text-red-400"
                                                    onClick={() => handleDeleteBranch(item, items.length, root, rootIdx, itemIdx)}
                                                />
                                            </div>
                                        );
                                    })}

                                    <div className="relative pl-4 pt-1">
                                        <div className="absolute left-[11px] top-4 w-4 h-px bg-slate-800" />
                                        <button
                                            onClick={() => handleCreateBranch(rootIdx, root, items.length)}
                                            className="text-[10px] font-bold text-indigo-400/70 hover:text-indigo-300 flex items-center gap-1 py-1 px-2 rounded hover:bg-indigo-500/10 transition-colors uppercase tracking-wider"
                                        >
                                            <Plus size={10} /> Add Branch
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <Button
                variant="outline"
                className="w-full mt-4 h-10 border border-dashed border-slate-700 rounded-xl text-slate-500 hover:bg-slate-800 hover:border-indigo-500/50 hover:text-indigo-300 transition-all hover:shadow-lg hover:shadow-indigo-900/10 group"
                icon={<Plus size={16} className="group-hover:text-indigo-400" />}
                onClick={() => {
                    let newName = 'NewRoot';
                    let counter = 1;
                    const existing = new Set(groupedRoots.map(g => g.root));
                    while (existing.has(newName)) { newName = `NewRoot (${counter++})`; }

                    if (currentConfig.happyGroups) {
                        const newId = Math.random().toString(36).substring(7);
                        updateCurrentRule({ happyGroups: [...currentConfig.happyGroups, { id: newId, tags: [newName], enabled: true }] });
                    } else {
                        updateCurrentRule({ includeGroups: [...currentConfig.includeGroups, [newName]] });
                    }
                    pendingRootFocus.current = newName;
                }}
            >
                Create New Combo Group
            </Button>
        </div>
    );
});
