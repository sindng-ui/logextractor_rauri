import React from 'react';
import { Camera, History, Trash2, X } from 'lucide-react';
import { AnnotatorHistoryMeta } from '../../../types/screenshotAnnotator';

interface AnnotatorHistoryDrawerProps {
  isOpen: boolean;
  items: AnnotatorHistoryMeta[];
  activeId: string | null;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const AnnotatorHistoryDrawer: React.FC<AnnotatorHistoryDrawerProps> = ({
  isOpen,
  items,
  activeId,
  onRestore,
  onDelete,
  onClearAll,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <aside className="w-[296px] shrink-0 bg-[#0d1424] border-l border-indigo-500/25 flex flex-col select-none z-20">
      <div className="h-11 px-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={14} className="text-indigo-300" />
          <span className="text-xs font-bold text-slate-100">Recent Captures</span>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
            {items.length}/15
          </span>
        </div>
        <div className="flex items-center gap-1">
          {items.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="px-2 py-1 rounded-lg text-[10px] font-semibold text-rose-300 hover:bg-rose-950/70 transition-colors"
              title="Clear all saved captures"
            >
              Clear All
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-2">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 text-slate-500 text-xs">
            <Camera size={24} className="mb-2 opacity-40" />
            <div>No saved captures yet.</div>
            <div className="text-[11px] mt-1">
              Edits auto-save with all vector layers intact.
            </div>
          </div>
        ) : (
          items.map((item) => {
            const isCurrent = item.id === activeId;
            return (
              <div
                key={item.id}
                onClick={() => onRestore(item.id)}
                className={`group rounded-xl border overflow-hidden cursor-pointer transition-colors ${
                  isCurrent
                    ? 'bg-indigo-950/50 border-indigo-400/60'
                    : 'bg-[#0f172a] border-slate-800 hover:border-indigo-500/40'
                }`}
              >
                <div className="relative h-28 bg-slate-950 flex items-center justify-center overflow-hidden">
                  {item.thumbnailDataUrl ? (
                    <img
                      src={item.thumbnailDataUrl}
                      alt={item.title}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Camera size={20} className="text-slate-700" />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(item.id);
                    }}
                    className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-slate-950/90 border border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-500/50 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete from history"
                  >
                    <Trash2 size={12} />
                  </button>
                  {isCurrent && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-indigo-600 text-[9px] font-bold text-white">
                      ACTIVE
                    </span>
                  )}
                </div>
                <div className="px-2.5 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-200 truncate">
                      {item.title}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {item.width}×{item.height} · {item.annotationCount} marks
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0">
                    {formatRelativeTime(item.updatedAt)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

export default React.memo(AnnotatorHistoryDrawer);
