import React, { useMemo } from 'react';
import { ChevronRight, ChevronDown, Copy, Braces, Clock } from 'lucide-react';
import { VisibleTreeRow } from '../../../types/jsonBeautify';
import { decodeInlineBadge, formatByteSize } from '../../../utils/jsonValueDecoders';

interface JsonTreeRowProps {
  row: VisibleTreeRow;
  isSelected: boolean;
  isActiveSearchMatch: boolean;
  onToggle: (nodeId: number) => void;
  onSelect: (nodeId: number) => void;
  onCopySubtree: (nodeId: number) => void;
  onOpenEmbedded?: (nodeId: number) => void;
}

const GUIDE_COLORS = [
  'border-indigo-500/25',
  'border-cyan-500/25',
  'border-emerald-500/25',
  'border-amber-500/25',
  'border-pink-500/25',
];

const JsonTreeRow: React.FC<JsonTreeRowProps> = ({
  row,
  isSelected,
  isActiveSearchMatch,
  onToggle,
  onSelect,
  onCopySubtree,
  onOpenEmbedded,
}) => {
  const hasChildren = row.childCount > 0;
  const isContainer = row.type === 'object' || row.type === 'array';

  const badge = useMemo(() => {
    if (isContainer) return null;
    return decodeInlineBadge(row.type, row.preview, row.hasEmbeddedJson);
  }, [isContainer, row.type, row.preview, row.hasEmbeddedJson]);

  const indentPx = row.depth * 20;

  return (
    <div
      onClick={() => onSelect(row.id)}
      onDoubleClick={() => hasChildren && onToggle(row.id)}
      className={`group flex items-center h-[28px] px-2 font-mono text-[12.5px] cursor-pointer select-none whitespace-nowrap border-l-2 transition-colors ${
        isActiveSearchMatch
          ? 'bg-amber-500/25 border-amber-400 text-white'
          : isSelected
            ? 'bg-indigo-600/25 border-indigo-400 text-white'
            : row.isMatch
              ? 'bg-indigo-500/15 border-indigo-500/50'
              : 'border-transparent hover:bg-slate-800/60'
      }`}
    >
      {/* Depth Indentation Guides */}
      <div className="flex items-stretch h-full shrink-0" style={{ width: indentPx }}>
        {row.depth > 0 &&
          Array.from({ length: row.depth }).map((_, d) => (
            <div
              key={d}
              className={`w-[20px] h-full border-l ${GUIDE_COLORS[d % GUIDE_COLORS.length]}`}
            />
          ))}
      </div>

      {/* Expand/Collapse Caret */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (hasChildren) onToggle(row.id);
        }}
        className={`w-5 h-5 mr-1 flex items-center justify-center rounded shrink-0 ${
          hasChildren
            ? 'text-slate-400 hover:text-indigo-300 hover:bg-slate-700/60'
            : 'opacity-0 pointer-events-none'
        }`}
        tabIndex={-1}
      >
        {hasChildren && (row.isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
      </button>

      {/* Key Name */}
      <span
        className={`mr-1.5 shrink-0 font-semibold ${
          row.isArrayItem
            ? 'text-slate-400 text-[11.5px]'
            : row.depth === 0
              ? 'text-indigo-300'
              : 'text-sky-300'
        }`}
      >
        {row.isArrayItem ? `[${row.key}]` : `"${row.key}"`}
      </span>
      <span className="text-slate-500 mr-1.5 shrink-0">:</span>

      {/* Value / Container Summary */}
      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
        {isContainer ? (
          <>
            <span className="text-slate-300 font-bold shrink-0">
              {row.type === 'array' ? '[' : '{'}
            </span>
            {!row.isExpanded ? (
              <>
                <span className="text-[11px] px-1.5 py-0.2 rounded bg-slate-800/90 text-slate-400 border border-slate-700/60 shrink-0">
                  {row.childCount} {row.type === 'array' ? 'items' : 'keys'}
                </span>
                {row.summaryPreview && (
                  <span className="text-[11.5px] text-slate-400 truncate">
                    {row.summaryPreview}
                  </span>
                )}
                <span className="text-slate-300 font-bold shrink-0">
                  {row.type === 'array' ? ']' : '}'}
                </span>
              </>
            ) : (
              <span className="text-[11px] text-slate-500 shrink-0">
                {row.childCount} {row.type === 'array' ? 'items' : 'keys'}
              </span>
            )}
          </>
        ) : (
          <span
            className={`truncate ${
              row.type === 'string'
                ? 'text-emerald-400'
                : row.type === 'number'
                  ? 'text-blue-400'
                  : row.type === 'boolean'
                    ? 'text-amber-400 font-semibold'
                    : 'text-rose-400 font-semibold'
            }`}
          >
            {row.preview}
          </span>
        )}

        {/* Inline Smart Badges */}
        {badge?.kind === 'timestamp' && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-[10.5px] shrink-0">
            <Clock size={10} /> {badge.label}
          </span>
        )}
        {badge?.kind === 'color' && badge.colorValue && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10.5px] shrink-0">
            <span
              className="w-2.5 h-2.5 rounded-sm border border-white/30"
              style={{ backgroundColor: badge.colorValue }}
            />
          </span>
        )}
        {badge?.kind === 'embedded-json' && onOpenEmbedded && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenEmbedded(row.id);
            }}
            className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-400/40 text-indigo-200 hover:text-white text-[10.5px] font-sans font-semibold shrink-0 transition-colors"
            title="Parse embedded JSON string in new snapshot"
          >
            <Braces size={10} /> Parse JSON
          </button>
        )}
      </div>

      {/* Right Hover Metadata & Quick Copy */}
      <div className="ml-2 flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {row.byteSize >= 1024 && (
          <span className="text-[10px] text-slate-500 font-mono">
            {formatByteSize(row.byteSize)}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCopySubtree(row.id);
          }}
          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-indigo-300"
          title="Copy node JSON"
        >
          <Copy size={11} />
        </button>
      </div>
    </div>
  );
};

export default React.memo(JsonTreeRow);
