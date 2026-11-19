import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Search, Filter, ArrowUp, ArrowDown, X, ChevronsUpDown, Minimize2 } from 'lucide-react';
import { SearchResultPayload, VisibleTreeRow } from '../../../types/jsonBeautify';
import JsonTreeRow from './JsonTreeRow';

interface JsonTreeViewProps {
  rows: VisibleTreeRow[];
  selectedNodeId: number | null;
  searchResult: SearchResultPayload | null;
  pendingJumpNodeId: number | null;
  onClearPendingJump: () => void;
  onToggleNode: (nodeId: number) => void;
  onSelectNode: (nodeId: number) => void;
  onExpandDepth: (depth: number) => void;
  onExpandToNode: (nodeId: number) => void;
  onSearch: (query: string, mode: 'jump' | 'filter', caseSensitive: boolean) => void;
  onCopySubtree: (nodeId: number) => void;
  onOpenEmbeddedByNodeId: (nodeId: number) => void;
}

const JsonTreeView: React.FC<JsonTreeViewProps> = ({
  rows,
  selectedNodeId,
  searchResult,
  pendingJumpNodeId,
  onClearPendingJump,
  onToggleNode,
  onSelectNode,
  onExpandDepth,
  onExpandToNode,
  onSearch,
  onCopySubtree,
  onOpenEmbeddedByNodeId,
}) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'jump' | 'filter'>('jump');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchCursor, setMatchCursor] = useState(0);
  const [internalJumpTarget, setInternalJumpTarget] = useState<number | null>(null);

  // Debounced search dispatch to worker
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query, searchMode, caseSensitive);
      setMatchCursor(0);
    }, 140);
    return () => clearTimeout(timer);
  }, [query, searchMode, caseSensitive, onSearch]);

  // Ctrl+F focuses tree search bar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.code === 'KeyF' || e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        e.stopPropagation();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const scrollToNodeId = useCallback(
    (nodeId: number) => {
      const idx = rows.findIndex((r) => r.id === nodeId);
      if (idx !== -1 && virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({ index: idx, align: 'center' });
        return true;
      }
      return false;
    },
    [rows]
  );

  // Handle external jump target (e.g. Heavy Node chip or Table row jump)
  useEffect(() => {
    const target = pendingJumpNodeId ?? internalJumpTarget;
    if (target === null) return;
    if (scrollToNodeId(target)) {
      if (pendingJumpNodeId !== null) onClearPendingJump();
      if (internalJumpTarget !== null) setInternalJumpTarget(null);
    }
  }, [rows, pendingJumpNodeId, internalJumpTarget, scrollToNodeId, onClearPendingJump]);

  const jumpToMatchAt = useCallback(
    (idx: number) => {
      if (!searchResult || searchResult.matchIds.length === 0) return;
      const safeIdx = (idx + searchResult.matchIds.length) % searchResult.matchIds.length;
      setMatchCursor(safeIdx);
      const targetId = searchResult.matchIds[safeIdx];
      onSelectNode(targetId);
      if (!scrollToNodeId(targetId)) {
        setInternalJumpTarget(targetId);
        onExpandToNode(targetId);
      }
    },
    [searchResult, onSelectNode, scrollToNodeId, onExpandToNode]
  );

  const activeMatchNodeId =
    searchResult && searchResult.matchIds.length > 0
      ? searchResult.matchIds[matchCursor] ?? null
      : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#0a0f1c]">
      {/* Tree Toolbar */}
      <div className="shrink-0 px-3 py-2 border-b border-slate-800/90 bg-slate-900/60 flex flex-wrap items-center gap-2">
        {/* Search Input */}
        <div className="flex items-center bg-slate-950 border border-slate-800 focus-within:border-indigo-500 rounded-lg px-2.5 h-8 flex-1 min-w-[240px] max-w-md">
          <Search size={13} className="text-slate-500 mr-2 shrink-0" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchResult && searchResult.matchIds.length > 0) {
                e.preventDefault();
                jumpToMatchAt(e.shiftKey ? matchCursor - 1 : matchCursor + 1);
              } else if (e.key === 'Escape') {
                setQuery('');
              }
            }}
            placeholder='Search key, value, or JSONPath ($.devices[*].id)...'
            className="bg-transparent border-none text-xs text-slate-200 flex-1 focus:outline-none placeholder-slate-500 font-mono"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-slate-500 hover:text-slate-200 p-0.5 mr-1"
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
          <button
            onClick={() => setCaseSensitive((v) => !v)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
              caseSensitive ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Match Case"
          >
            Aa
          </button>
        </div>

        {/* Jump vs Filter Tree Mode Toggle */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 h-8">
          <button
            onClick={() => setSearchMode('jump')}
            className={`px-2.5 h-full rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors ${
              searchMode === 'jump'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Highlight & jump through matches"
          >
            <Search size={11} /> Jump
          </button>
          <button
            onClick={() => setSearchMode('filter')}
            className={`px-2.5 h-full rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors ${
              searchMode === 'filter'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Keep only matching branches and their ancestors"
          >
            <Filter size={11} /> Filter Tree
          </button>
        </div>

        {/* Match Counter & Stepper */}
        {query.trim() && searchResult && (
          <div className="flex items-center gap-1 px-2 h-8 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono">
            <span className={searchResult.totalMatches > 0 ? 'text-amber-300' : 'text-rose-400'}>
              {searchResult.totalMatches > 0
                ? `${matchCursor + 1} / ${searchResult.totalMatches}`
                : '0 matches'}
            </span>
            {searchResult.totalMatches > 0 && (
              <>
                <button
                  onClick={() => jumpToMatchAt(matchCursor - 1)}
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                  title="Previous Match (Shift+Enter)"
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  onClick={() => jumpToMatchAt(matchCursor + 1)}
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                  title="Next Match (Enter)"
                >
                  <ArrowDown size={12} />
                </button>
              </>
            )}
          </div>
        )}

        {/* Depth Controls */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] font-bold uppercase text-slate-500 mr-1">Depth</span>
          {[1, 2, 3, 4].map((d) => (
            <button
              key={d}
              onClick={() => onExpandDepth(d)}
              className="px-2 py-1 rounded-md bg-slate-800/80 hover:bg-indigo-600 text-[11px] font-mono font-semibold text-slate-300 hover:text-white transition-colors"
              title={`Expand to Level ${d}`}
            >
              L{d}
            </button>
          ))}
          <button
            onClick={() => onExpandDepth(99)}
            className="px-2 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 flex items-center gap-1 transition-colors"
            title="Expand All (up to 25k container nodes)"
          >
            <ChevronsUpDown size={11} /> All
          </button>
          <button
            onClick={() => onExpandDepth(1)}
            className="px-2 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 flex items-center gap-1 transition-colors"
            title="Collapse to Root"
          >
            <Minimize2 size={11} /> Collapse
          </button>
        </div>
      </div>

      {/* Virtualized Tree Canvas */}
      <div className="flex-1 min-h-0 relative">
        {rows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-xs">
            No matching nodes found for &quot;{query}&quot;
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            style={{ height: '100%', width: '100%' }}
            totalCount={rows.length}
            overscan={200}
            itemContent={(index) => {
              const row = rows[index];
              if (!row) return null;
              return (
                <JsonTreeRow
                  row={row}
                  isSelected={row.id === selectedNodeId}
                  isActiveSearchMatch={row.id === activeMatchNodeId}
                  onToggle={onToggleNode}
                  onSelect={onSelectNode}
                  onCopySubtree={onCopySubtree}
                  onOpenEmbedded={onOpenEmbeddedByNodeId}
                />
              );
            }}
          />
        )}
      </div>

      {/* Bottom Status */}
      <div className="shrink-0 px-3 py-1 border-t border-slate-800/80 bg-slate-950/90 flex items-center justify-between text-[11px] text-slate-500 font-mono">
        <span>Showing {rows.length.toLocaleString()} visible rows (virtualized 60fps)</span>
        <span>Double-click container to toggle • Ctrl+F to search</span>
      </div>
    </div>
  );
};

export default React.memo(JsonTreeView);
