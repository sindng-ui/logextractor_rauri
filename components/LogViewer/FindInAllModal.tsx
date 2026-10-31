/**
 * FindInAllModal.tsx
 * Ctrl+Shift+F — premium full-width search modal 🐧⚡
 * - Large, premium dark UI (no blur)
 * - Tag-chip keyword input (Enter / comma to add)
 * - Recent search history in vertical compact list with expand capability
 * - Block list open by default
 */

import React, {
    useState, useEffect, useCallback, memo
} from 'react';
import {
    X, Search, Tag, ShieldOff
} from 'lucide-react';
import {
    FindInAllRule, FindInAllHistoryItem,
    useFindInAllHistory
} from '../../hooks/useFindInAllHistory';

import TagInput from './FindInAll/TagInput';
import SectionHeader from './FindInAll/SectionHeader';
import HistoryList from './FindInAll/HistoryList';

interface FindInAllModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSearch: (rule: FindInAllRule) => void;
    isSearching: boolean;
    lastSearchRule: FindInAllRule | null;
    targetTabId?: string;       // 🐧⚡ 추가: 현재 탭 전용 검색 모드인 경우의 탭 ID
    targetTabTitle?: string;    // 🐧⚡ 추가: 현재 탭의 타이틀
}

// ─────────────────────────────────────────────────────────────
// Main Modal
// ─────────────────────────────────────────────────────────────
const FindInAllModal: React.FC<FindInAllModalProps> = memo(({
    isOpen, onClose, onSearch, isSearching, lastSearchRule, targetTabId, targetTabTitle
}) => {
    const { history, clearHistory } = useFindInAllHistory();

    const [includeTags, setIncludeTags] = useState<string[]>([]);
    const [excludeTags, setExcludeTags] = useState<string[]>([]);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [blockListCaseSensitive, setBlockListCaseSensitive] = useState(false);
    const [isIncludeOpen, setIsIncludeOpen] = useState(true);
    const [isExcludeOpen, setIsExcludeOpen] = useState(true); // open by default

    // Restore last rule when modal opens
    useEffect(() => {
        if (!isOpen) return;
        const source = lastSearchRule ?? (history.length > 0 ? history[0].rule : null);
        if (source) {
            setIncludeTags(source.includeKeywords);
            setExcludeTags(source.excludeKeywords);
            setCaseSensitive(source.caseSensitive);
            setBlockListCaseSensitive(source.blockListCaseSensitive);
        }
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // Esc to close
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: globalThis.KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        };
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
    }, [isOpen, onClose]);

    const handleSearch = useCallback(() => {
        const rule: FindInAllRule = {
            includeKeywords: includeTags,
            excludeKeywords: excludeTags,
            caseSensitive,
            blockListCaseSensitive,
            targetTabId, // 🐧⚡ 스코프 전달!
        };
        onSearch(rule);
    }, [includeTags, excludeTags, caseSensitive, blockListCaseSensitive, onSearch, targetTabId]);

    const handleLoadHistory = useCallback((item: FindInAllHistoryItem) => {
        setIncludeTags(item.rule.includeKeywords);
        setExcludeTags(item.rule.excludeKeywords);
        setCaseSensitive(item.rule.caseSensitive);
        setBlockListCaseSensitive(item.rule.blockListCaseSensitive);
    }, []);

    // Ctrl+Enter in modal → search
    const handleModalKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            handleSearch();
        }
    }, [handleSearch]);

    if (!isOpen) return null;

    const canSearch = includeTags.length > 0;

    return (
        <div
            className="fixed inset-0 z-[150] flex items-start justify-center pt-[8vh]"
            style={{ background: 'rgba(0,0,0,0.72)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="
                    w-full max-w-[700px] mx-4
                    bg-slate-900 border border-slate-700/50
                    rounded-2xl shadow-[0_32px_80px_rgba(0,0,0,0.7)]
                    flex flex-col overflow-hidden
                    max-h-[88vh]
                "
                onKeyDown={handleModalKeyDown}
            >
                {/* ── Header ── */}
                <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between shrink-0 bg-slate-900">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/15 rounded-xl border border-indigo-500/25">
                            <Search size={17} className="text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-100 tracking-wide">
                                {targetTabId ? `Find in Tab: ${targetTabTitle}` : 'Find in All Open Files'}
                            </h2>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                                {targetTabId ? 'Search within the active log tab only' : 'Search across all loaded log tabs simultaneously'}
                            </p>
                        </div>
                        <kbd className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 ml-1">
                            {targetTabId ? 'Ctrl+F' : 'Ctrl+Shift+F'}
                        </kbd>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* ── Scrollable body ── */}
                <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>

                    {/* Happy Combo [1st] */}
                    <div className="border-b border-slate-800/60">
                        <SectionHeader
                            isOpen={isIncludeOpen}
                            onToggle={() => setIsIncludeOpen(p => !p)}
                            icon={<Tag size={13} />}
                            title="Happy Combo"
                            badge={
                                includeTags.length > 0 && (
                                    <span className="ml-1 text-[10px] bg-indigo-900/50 text-indigo-300 px-1.5 py-0.5 rounded-full border border-indigo-800/50">
                                        {includeTags.length}
                                    </span>
                                )
                            }
                            accentColor="emerald"
                        />
                        {isIncludeOpen && (
                            <div className="px-5 pb-4">
                                <TagInput
                                    tags={includeTags}
                                    onChange={setIncludeTags}
                                    placeholder="Type keyword + Enter or comma to add..."
                                    accentColor="emerald"
                                    autoFocus
                                />
                                <div className="flex items-center gap-2 mt-2">
                                    <button
                                        type="button"
                                        onClick={() => setCaseSensitive(p => !p)}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                                            caseSensitive
                                                ? 'bg-indigo-900/60 border-indigo-500/60 text-indigo-200'
                                                : 'bg-slate-800/60 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                                        }`}
                                    >
                                        Aa&nbsp;Case
                                    </button>
                                    <span className="text-[10px] text-slate-600">
                                        {includeTags.length} keyword{includeTags.length !== 1 ? 's' : ''}
                                        {includeTags.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setIncludeTags([])}
                                                className="ml-2 text-indigo-400/50 hover:text-indigo-300 transition-colors"
                                            >
                                                clear all
                                            </button>
                                        )}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Block List [2nd] */}
                    <div className="border-b border-slate-800/60">
                        <SectionHeader
                            isOpen={isExcludeOpen}
                            onToggle={() => setIsExcludeOpen(p => !p)}
                            icon={<ShieldOff size={13} />}
                            title="Block List"
                            badge={
                                excludeTags.length > 0 && (
                                    <span className="ml-1 text-[10px] bg-rose-900/50 text-rose-300 px-1.5 py-0.5 rounded-full border border-rose-800/50">
                                        {excludeTags.length}
                                    </span>
                                )
                            }
                            accentColor="rose"
                        />
                        {isExcludeOpen && (
                            <div className="px-5 pb-4">
                                <TagInput
                                    tags={excludeTags}
                                    onChange={setExcludeTags}
                                    placeholder="Type keyword + Enter or comma to exclude..."
                                    accentColor="rose"
                                />
                                <div className="flex items-center gap-2 mt-2">
                                    <button
                                        type="button"
                                        onClick={() => setBlockListCaseSensitive(p => !p)}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                                            blockListCaseSensitive
                                                ? 'bg-rose-900/60 border-rose-500/60 text-rose-300'
                                                : 'bg-slate-800/60 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                                        }`}
                                    >
                                        Aa&nbsp;Case
                                    </button>
                                    <span className="text-[10px] text-slate-600">
                                        {excludeTags.length} keyword{excludeTags.length !== 1 ? 's' : ''}
                                        {excludeTags.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setExcludeTags([])}
                                                className="ml-2 text-rose-400/50 hover:text-rose-300 transition-colors"
                                            >
                                                clear all
                                            </button>
                                        )}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Recent Searches [3rd] */}
                    <HistoryList
                        history={history}
                        onLoad={handleLoadHistory}
                        onClear={clearHistory}
                    />
                </div>

                {/* ── Footer ── */}
                <div className="px-6 py-4 bg-slate-950/60 border-t border-slate-800/80 flex items-center gap-3 shrink-0">
                    {/* Shortcut hints */}
                    <div className="flex items-center gap-2 text-[10px] text-slate-600 flex-1 flex-wrap">
                        <span className="flex items-center gap-1">
                            <kbd className="bg-slate-800 text-slate-500 px-1 py-0.5 rounded border border-slate-700">Enter</kbd>
                            <span>add tag</span>
                        </span>
                        <span className="text-slate-700">·</span>
                        <span className="flex items-center gap-1">
                            <kbd className="bg-slate-800 text-slate-500 px-1 py-0.5 rounded border border-slate-700">Ctrl+Enter</kbd>
                            <span>search</span>
                        </span>
                        <span className="text-slate-700">·</span>
                        <span className="flex items-center gap-1">
                            <kbd className="bg-slate-800 text-slate-500 px-1 py-0.5 rounded border border-slate-700">Esc</kbd>
                            <span>close</span>
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-xl transition-all"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={handleSearch}
                        disabled={isSearching || !canSearch}
                        className="
                            flex items-center gap-2 px-6 py-2 text-xs font-bold
                            bg-gradient-to-r from-indigo-600 to-violet-600
                            hover:from-indigo-500 hover:to-violet-500
                            disabled:opacity-40 disabled:cursor-not-allowed
                            text-white rounded-xl
                            shadow-lg shadow-indigo-900/40
                            transition-all active:scale-95
                        "
                    >
                        {isSearching ? (
                            <>
                                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <span>Searching...</span>
                            </>
                        ) : (
                            <>
                                <Search size={13} />
                                <span>{targetTabId ? 'Search Tab' : 'Search All'}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
});

FindInAllModal.displayName = 'FindInAllModal';
export default FindInAllModal;

