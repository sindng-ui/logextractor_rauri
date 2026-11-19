import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { ChevronRight, Search, Braces, Brackets, Copy, Clock } from 'lucide-react';
import { ColumnItem, ColumnLevelPayload, NodeDetailPayload } from '../../../types/jsonBeautify';
import { decodeInlineBadge, formatByteSize } from '../../../utils/jsonValueDecoders';

interface JsonColumnViewProps {
  levels: ColumnLevelPayload[];
  selectedPathIds: number[];
  selectedNodeId: number | null;
  nodeDetail: NodeDetailPayload | null;
  onSelectColumnItem: (levelIndex: number, item: ColumnItem) => void;
  onCopyText: (text: string, label: string) => void;
  onOpenEmbeddedJson: (raw: string, label: string) => void;
}

interface SingleColumnProps {
  level: ColumnLevelPayload;
  levelIndex: number;
  activeChildId: number | null;
  onSelectItem: (levelIndex: number, item: ColumnItem) => void;
}

const FinderColumn: React.FC<SingleColumnProps> = React.memo(
  ({ level, levelIndex, activeChildId, onSelectItem }) => {
    const [filterText, setFilterText] = useState('');

    const filteredItems = useMemo(() => {
      const q = filterText.trim().toLowerCase();
      if (!q) return level.items;
      return level.items.filter(
        (it) =>
          it.key.toLowerCase().includes(q) ||
          it.preview.toLowerCase().includes(q) ||
          (it.summaryPreview && it.summaryPreview.toLowerCase().includes(q))
      );
    }, [level.items, filterText]);

    return (
      <div className="w-[275px] shrink-0 h-full border-r border-slate-800 flex flex-col bg-[#0b101d]">
        {/* Column Header */}
        <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/75 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {level.type === 'array' ? (
                <Brackets size={13} className="text-cyan-400 shrink-0" />
              ) : (
                <Braces size={13} className="text-indigo-400 shrink-0" />
              )}
              <span className="font-mono text-xs font-bold text-slate-100 truncate" title={level.path}>
                {level.title}
              </span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
              {level.totalCount}
            </span>
          </div>

          {level.totalCount > 8 && (
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md px-2 h-7">
              <Search size={11} className="text-slate-500 mr-1.5 shrink-0" />
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter column..."
                className="bg-transparent border-none text-[11px] text-slate-200 w-full focus:outline-none placeholder-slate-600"
              />
            </div>
          )}
        </div>

        {/* Virtualized Column List */}
        <div className="flex-1 min-h-0">
          <Virtuoso
            style={{ height: '100%', width: '100%' }}
            totalCount={filteredItems.length}
            overscan={150}
            itemContent={(idx) => {
              const item = filteredItems[idx];
              if (!item) return null;
              const isSelected = item.id === activeChildId;
              const isContainer = item.type === 'object' || item.type === 'array';
              const badge = !isContainer
                ? decodeInlineBadge(item.type, item.preview, item.hasEmbeddedJson)
                : null;

              return (
                <div
                  onClick={() => onSelectItem(levelIndex, item)}
                  className={`px-3 py-2 border-b border-slate-800/40 cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-indigo-600/30 border-l-2 border-l-indigo-400 text-white'
                      : 'hover:bg-slate-800/50 text-slate-300'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-mono text-xs font-semibold truncate ${
                          item.isArrayItem ? 'text-cyan-300' : 'text-slate-100'
                        }`}
                      >
                        {item.key}
                      </span>
                      {badge?.kind === 'color' && badge.colorValue && (
                        <span
                          className="w-2.5 h-2.5 rounded-sm border border-white/30 shrink-0"
                          style={{ backgroundColor: badge.colorValue }}
                        />
                      )}
                      {badge?.kind === 'embedded-json' && (
                        <span className="px-1 rounded bg-indigo-500/25 text-indigo-200 text-[9px] font-bold shrink-0">
                          JSON
                        </span>
                      )}
                    </div>
                    <div
                      className={`font-mono text-[11px] truncate mt-0.5 ${
                        isContainer
                          ? 'text-slate-400'
                          : item.type === 'string'
                            ? 'text-emerald-400/90'
                            : item.type === 'number'
                              ? 'text-blue-400'
                              : item.type === 'boolean'
                                ? 'text-amber-400'
                                : 'text-rose-400'
                      }`}
                    >
                      {item.summaryPreview || item.preview}
                    </div>
                  </div>
                  {isContainer && (
                    <ChevronRight
                      size={14}
                      className={`shrink-0 ${isSelected ? 'text-indigo-300' : 'text-slate-600'}`}
                    />
                  )}
                </div>
              );
            }}
          />
        </div>
      </div>
    );
  }
);
FinderColumn.displayName = 'FinderColumn';

const JsonColumnView: React.FC<JsonColumnViewProps> = ({
  levels,
  selectedPathIds,
  selectedNodeId,
  nodeDetail,
  onSelectColumnItem,
  onCopyText,
  onOpenEmbeddedJson,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        left: scrollContainerRef.current.scrollWidth,
        behavior: 'smooth',
      });
    }
  }, [levels.length, selectedNodeId]);

  const isLeafDetailShown =
    nodeDetail && nodeDetail.type !== 'object' && nodeDetail.type !== 'array';
  const leafBadge = useMemo(() => {
    if (!isLeafDetailShown || !nodeDetail) return null;
    return decodeInlineBadge(nodeDetail.type, nodeDetail.fullValueText, nodeDetail.hasEmbeddedJson);
  }, [isLeafDetailShown, nodeDetail]);

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 flex min-h-0 min-w-0 overflow-x-auto overflow-y-hidden bg-[#090d16] custom-scrollbar"
    >
      {levels.map((lvl, idx) => {
        const nextPathId = selectedPathIds[idx + 1] ?? (idx === levels.length - 1 ? selectedNodeId : null);
        return (
          <FinderColumn
            key={`${lvl.parentId}-${idx}`}
            level={lvl}
            levelIndex={idx}
            activeChildId={nextPathId}
            onSelectItem={onSelectColumnItem}
          />
        );
      })}

      {/* Rich Leaf Value Card (JSON Hero Style) */}
      {isLeafDetailShown && nodeDetail && (
        <div className="w-[340px] shrink-0 h-full p-4 overflow-y-auto custom-scrollbar bg-[#0d1323] border-r border-slate-800">
          <div className="rounded-2xl bg-slate-900 border border-slate-700/80 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {nodeDetail.type}
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {formatByteSize(nodeDetail.byteSize)}
              </span>
            </div>

            <div className="font-mono text-sm font-bold text-white break-all">{nodeDetail.key}</div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-300 whitespace-pre-wrap break-all max-h-64 overflow-y-auto custom-scrollbar">
              {nodeDetail.fullValueText}
            </div>

            {leafBadge?.kind === 'timestamp' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
                <Clock size={14} /> {leafBadge.label}
              </div>
            )}

            {leafBadge?.kind === 'color' && leafBadge.colorValue && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                <span
                  className="w-8 h-8 rounded-lg border border-white/20"
                  style={{ backgroundColor: leafBadge.colorValue }}
                />
                <span className="font-mono text-xs text-slate-200">{leafBadge.colorValue}</span>
              </div>
            )}

            {leafBadge?.kind === 'embedded-json' && nodeDetail.embeddedJsonRaw && (
              <button
                onClick={() => onOpenEmbeddedJson(nodeDetail.embeddedJsonRaw!, `Embedded: ${nodeDetail.key}`)}
                className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Braces size={14} /> Open Embedded JSON
              </button>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onCopyText(nodeDetail.fullValueText, 'Value copied')}
                className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center justify-center gap-1.5"
              >
                <Copy size={12} /> Copy Value
              </button>
              <button
                onClick={() => onCopyText(nodeDetail.path, 'JSONPath copied')}
                className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center justify-center gap-1.5"
              >
                <Copy size={12} /> JSONPath
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(JsonColumnView);
