import React, { useMemo } from 'react';
import {
  Copy,
  Braces,
  ChevronRight,
  Clock,
  ExternalLink,
  X,
  FileCode2,
  Sparkles,
} from 'lucide-react';
import { NodeDetailPayload } from '../../../types/jsonBeautify';
import { decodeInlineBadge, formatByteSize } from '../../../utils/jsonValueDecoders';

interface JsonNodeInspectorProps {
  detail: NodeDetailPayload | null;
  width: number;
  onWidthChange: (nextWidth: number) => void;
  onWidthCommit: (finalWidth: number) => void;
  onClose: () => void;
  onCopyText: (text: string, label: string) => void;
  onCopyNodeSubtree: (nodeId: number, mode: 'pretty' | 'minified' | 'value') => void;
  onOpenEmbeddedJson: (rawJson: string, label: string) => void;
  onNavigateBreadcrumb: (nodeId: number) => void;
}

const MIN_INSPECTOR_WIDTH = 260;

const JsonNodeInspector: React.FC<JsonNodeInspectorProps> = ({
  detail,
  width,
  onWidthChange,
  onWidthCommit,
  onClose,
  onCopyText,
  onCopyNodeSubtree,
  onOpenEmbeddedJson,
  onNavigateBreadcrumb,
}) => {
  const [isResizing, setIsResizing] = React.useState(false);
  const badge = useMemo(() => {
    if (!detail) return null;
    return decodeInlineBadge(detail.type, detail.fullValueText, detail.hasEmbeddedJson);
  }, [detail]);

  const handleResizeMouseDown = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = width;
      let latestWidth = startWidth;
      setIsResizing(true);

      const maxWidth = Math.max(480, Math.min(960, Math.floor(window.innerWidth * 0.65)));

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        latestWidth = Math.round(Math.max(MIN_INSPECTOR_WIDTH, Math.min(maxWidth, startWidth + delta)));
        onWidthChange(latestWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        onWidthCommit(latestWidth);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [width, onWidthChange, onWidthCommit]
  );

  const resizeHandle = (
    <div
      onMouseDown={handleResizeMouseDown}
      onDoubleClick={() => {
        onWidthChange(360);
        onWidthCommit(360);
      }}
      title="Drag to resize Inspector (Double-click to reset)"
      className={`absolute top-0 bottom-0 -left-[3px] w-[7px] cursor-col-resize z-30 group/resize flex justify-center ${
        isResizing ? 'bg-indigo-500/20' : ''
      }`}
    >
      <div
        className={`w-[2px] h-full transition-colors duration-150 ${
          isResizing
            ? 'bg-indigo-400'
            : 'bg-transparent group-hover/resize:bg-indigo-400/70'
        }`}
      />
    </div>
  );

  if (!detail) {
    return (
      <div
        style={{ width }}
        className="relative shrink-0 border-l border-slate-800 bg-slate-950/90 flex flex-col items-center justify-center text-slate-500 text-xs p-6"
      >
        {resizeHandle}
        <Braces size={24} className="mb-2 opacity-40" />
        <p>Select any node to inspect details</p>
      </div>
    );
  }

  return (
    <aside
      style={{ width }}
      className="relative shrink-0 border-l border-slate-800 bg-[#0b101d] flex flex-col min-h-0"
    >
      {resizeHandle}
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0 bg-slate-900/70">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            {detail.type}
          </span>
          <span className="font-mono text-xs font-bold text-white truncate" title={detail.key}>
            {detail.key}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Close Inspector"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3.5 space-y-4">
        {/* Breadcrumb Path */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Path</div>
          <div className="flex flex-wrap items-center gap-1 text-[11px] font-mono bg-slate-900/80 border border-slate-800 rounded-lg p-2">
            {detail.breadcrumbs.map((b, idx) => (
              <React.Fragment key={b.id}>
                {idx > 0 && <ChevronRight size={11} className="text-slate-600 shrink-0" />}
                <button
                  onClick={() => onNavigateBreadcrumb(b.id)}
                  className="text-slate-300 hover:text-indigo-300 hover:underline truncate max-w-[140px]"
                  title={b.path}
                >
                  {b.label}
                </button>
              </React.Fragment>
            ))}
          </div>
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={() => onCopyText(detail.path, 'JSONPath copied')}
              className="flex-1 py-1 px-2 rounded-md bg-slate-800/90 hover:bg-slate-700 text-[11px] text-slate-300 flex items-center justify-center gap-1 transition-colors"
              title={detail.path}
            >
              <Copy size={11} /> JSONPath
            </button>
            <button
              onClick={() => onCopyText(detail.jsPath, 'JS Path copied')}
              className="flex-1 py-1 px-2 rounded-md bg-slate-800/90 hover:bg-slate-700 text-[11px] text-slate-300 flex items-center justify-center gap-1 transition-colors"
              title={detail.jsPath}
            >
              <FileCode2 size={11} /> JS Path
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2">
            <div className="text-[10px] text-slate-500">Size</div>
            <div className="text-xs font-mono font-bold text-slate-100">{formatByteSize(detail.byteSize)}</div>
          </div>
          <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2">
            <div className="text-[10px] text-slate-500">Share</div>
            <div className="text-xs font-mono font-bold text-orange-300">{detail.percent.toFixed(1)}%</div>
          </div>
          <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2">
            <div className="text-[10px] text-slate-500">Depth / Kids</div>
            <div className="text-xs font-mono font-bold text-cyan-300">
              L{detail.depth} / {detail.childCount}
            </div>
          </div>
        </div>

        {/* Smart Decoded Card */}
        {badge && (
          <div className="rounded-xl bg-indigo-950/40 border border-indigo-500/30 p-3 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
              <Sparkles size={12} /> Smart Decoder
            </div>
            {badge.kind === 'timestamp' && (
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-300">
                <Clock size={14} />
                <span>{badge.label}</span>
              </div>
            )}
            {badge.kind === 'color' && badge.colorValue && (
              <div className="flex items-center gap-2.5">
                <span
                  className="w-7 h-7 rounded-lg border border-white/20 shrink-0"
                  style={{ backgroundColor: badge.colorValue }}
                />
                <span className="font-mono text-xs text-slate-200">{badge.colorValue}</span>
              </div>
            )}
            {badge.kind === 'url' && badge.urlValue && (
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-sky-300 truncate">{badge.urlValue}</span>
                <button
                  onClick={() => onCopyText(badge.urlValue!, 'URL copied')}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 shrink-0"
                  title="Copy URL"
                >
                  <ExternalLink size={12} />
                </button>
              </div>
            )}
            {badge.kind === 'embedded-json' && detail.embeddedJsonRaw && (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-300">
                  This string contains valid nested JSON! Open it directly as a new snapshot to analyze.
                </p>
                <button
                  onClick={() => onOpenEmbeddedJson(detail.embeddedJsonRaw!, `Embedded: ${detail.key}`)}
                  className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Braces size={13} /> Parse Embedded JSON
                </button>
              </div>
            )}
          </div>
        )}

        {/* Value / Subtree Preview */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {detail.type === 'object' || detail.type === 'array' ? 'Subtree JSON' : 'Raw Value'}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => onCopyNodeSubtree(detail.id, detail.type === 'string' ? 'value' : 'pretty')}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-indigo-600 text-[10px] font-semibold text-slate-300 hover:text-white flex items-center gap-1 transition-colors"
              >
                <Copy size={10} /> Copy
              </button>
              {(detail.type === 'object' || detail.type === 'array') && (
                <button
                  onClick={() => onCopyNodeSubtree(detail.id, 'minified')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300 transition-colors"
                >
                  Minify
                </button>
              )}
            </div>
          </div>
          <pre className="rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-[11.5px] leading-relaxed text-slate-200 whitespace-pre-wrap break-all max-h-[60vh] overflow-y-auto custom-scrollbar select-text">
            {detail.type === 'string' ? detail.fullValueText : detail.prettySubtreePreview}
          </pre>
          {detail.isTruncated && (
            <p className="text-[10px] text-amber-400/90 mt-1">
              Preview truncated for UI speed — click Copy for full payload.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
};

export default React.memo(JsonNodeInspector);
