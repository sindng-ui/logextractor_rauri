/**
 * FindInAllResultPanel.tsx
 * Find in All result panel — anchored below LogViewerPane 🐧⚡
 *
 * Height reset fix: keep DOM mounted even when invisible (display:none).
 * This prevents useState re-initialization on tab switches.
 *
 * - Drag handle to resize (localStorage persisted)
 * - React.memo + snapshot — zero performance impact during logging
 * - Close (X) / Re-search (↻) buttons
 * - Notepad++ tree view via GlobalSearchResultView
 */

import React, { useRef, useState, useCallback, memo } from 'react';
import { X, RotateCcw, FileSearch } from 'lucide-react';
import { GlobalSearchResultView, TabSearchResult } from './GlobalSearchResultView';
import { FindInAllRule } from '../../hooks/useFindInAllHistory';
import { LogRule } from '../../types';

const LS_HEIGHT_KEY = 'find-in-all-panel-height';
const DEFAULT_HEIGHT = 240;
const MIN_HEIGHT = 120;
const MAX_HEIGHT_RATIO = 0.7; // 70vh

interface FindInAllResultPanelProps {
    isVisible: boolean;
    results: TabSearchResult[];
    isSearching: boolean;
    lastSearchRule: FindInAllRule | null;
    onClose: () => void;
    onReSearch: () => void;
    onJumpToTabLine: (tabId: string, pane: 'left' | 'right', lineNum: number) => void;
}

/** FindInAllRule → LogRule-like object for GlobalSearchResultView */
function buildDisplayRule(rule: FindInAllRule | null): LogRule | null {
    if (!rule) return null;
    return {
        id: 'find-in-all-temp',
        name: 'Find in All',
        includeGroups: rule.includeKeywords.map(k => [k]),
        excludes: rule.excludeKeywords,
        highlights: [],
        happyCombosCaseSensitive: rule.caseSensitive,
        blockListCaseSensitive: rule.blockListCaseSensitive,
    };
}

const FindInAllResultPanel: React.FC<FindInAllResultPanelProps> = memo(({
    isVisible,
    results,
    isSearching,
    lastSearchRule,
    onClose,
    onReSearch,
    onJumpToTabLine,
}) => {
    // ✅ Height persisted in localStorage.
    //    Component stays mounted (display:none when invisible) so height state
    //    is never reset when the user clicks a result line and triggers a tab switch.
    const [height, setHeight] = useState<number>(() => {
        try {
            const saved = localStorage.getItem(LS_HEIGHT_KEY);
            if (saved) return Math.max(MIN_HEIGHT, parseInt(saved, 10));
        } catch {}
        return DEFAULT_HEIGHT;
    });

    const isDragging = useRef(false);
    const dragStartY = useRef(0);
    const dragStartHeight = useRef(0);
    const panelRef = useRef<HTMLDivElement>(null);

    const saveHeight = useCallback((h: number) => {
        try { localStorage.setItem(LS_HEIGHT_KEY, String(h)); } catch {}
    }, []);

    const handleDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        dragStartY.current = e.clientY;
        dragStartHeight.current = height;

        const onMouseMove = (ev: MouseEvent) => {
            if (!isDragging.current) return;
            const delta = dragStartY.current - ev.clientY; // drag up = taller
            const maxH = window.innerHeight * MAX_HEIGHT_RATIO;
            const newH = Math.min(maxH, Math.max(MIN_HEIGHT, dragStartHeight.current + delta));
            setHeight(newH);
        };

        const onMouseUp = (ev: MouseEvent) => {
            isDragging.current = false;
            const delta = dragStartY.current - ev.clientY;
            const maxH = window.innerHeight * MAX_HEIGHT_RATIO;
            const finalH = Math.min(maxH, Math.max(MIN_HEIGHT, dragStartHeight.current + delta));
            saveHeight(finalH);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [height, saveHeight]);

    const displayRule = buildDisplayRule(lastSearchRule);

    const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);
    const filesWithMatches = results.filter(r => r.matches.length > 0).length;

    // ✅ KEY FIX: Use display:none instead of returning null.
    //    Returning null unmounts the component → useState height resets.
    //    Keeping it in DOM with visibility hidden preserves all state.
    return (
        <div
            ref={panelRef}
            className="shrink-0 flex flex-col border-t border-indigo-500/20 bg-slate-950 relative overflow-hidden"
            style={{
                height: isVisible ? height : 0,
                minHeight: 0,
                // transition only on open/close, not while dragging
                transition: isDragging.current ? 'none' : 'height 150ms ease',
                pointerEvents: isVisible ? 'auto' : 'none',
            }}
        >
            {/* ── Drag handle (top) ── */}
            <div
                onMouseDown={handleDragStart}
                className="h-2 cursor-row-resize bg-slate-900 hover:bg-indigo-500/20 transition-colors flex items-center justify-center shrink-0 group"
                title="Drag to resize"
            >
                <div className="w-12 h-0.5 bg-slate-700 rounded-full group-hover:bg-indigo-400 transition-colors" />
            </div>

            {/* ── Header bar ── */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800/60 shrink-0">
                <div className="flex items-center gap-2">
                    <FileSearch size={13} className="text-indigo-400 shrink-0" />
                    <span className="text-xs font-bold text-slate-300">
                        {lastSearchRule?.targetTabId ? 'Find Results (Current Tab)' : 'Find Results (All Open Files)'}
                    </span>

                    {!isSearching && results.length > 0 && (
                        <div className="text-[10px] text-slate-500 bg-slate-950/60 px-2 py-0.5 rounded-md border border-slate-800/60 flex items-center gap-1">
                            <span className="text-emerald-400 font-bold">{filesWithMatches}</span>
                            <span>files /</span>
                            <span className="text-yellow-400 font-bold">{totalMatches}</span>
                            <span>hits</span>
                        </div>
                    )}

                    {lastSearchRule && lastSearchRule.includeKeywords.length > 0 && (
                        <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-500 font-mono truncate max-w-[200px]">
                            <span className="text-indigo-400/70">»</span>
                            <span className="truncate">{lastSearchRule.includeKeywords.slice(0, 2).join(', ')}</span>
                            {lastSearchRule.includeKeywords.length > 2 && (
                                <span className="text-slate-600">+{lastSearchRule.includeKeywords.length - 2}</span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {/* Re-search button */}
                    <button
                        onClick={onReSearch}
                        disabled={isSearching || !lastSearchRule}
                        className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Re-run last search"
                    >
                        <RotateCcw size={13} className={isSearching ? 'animate-spin' : ''} />
                    </button>
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-all"
                        title="Close result panel"
                    >
                        <X size={13} />
                    </button>
                </div>
            </div>

            {/* ── Result area (GlobalSearchResultView) ── */}
            <div className="flex-1 overflow-hidden">
                <GlobalSearchResultView
                    results={results}
                    rule={displayRule}
                    onJumpToTabLine={onJumpToTabLine}
                    isSearching={isSearching}
                />
            </div>
        </div>
    );
});

FindInAllResultPanel.displayName = 'FindInAllResultPanel';
export default FindInAllResultPanel;
