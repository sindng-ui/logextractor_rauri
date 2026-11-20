import React from 'react';
import {
  Camera,
  ClipboardCopy,
  ClipboardPaste,
  Download,
  FileUp,
  Frame,
  History,
  LayoutGrid,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react';

interface AnnotatorHeaderProps {
  hasDocument: boolean;
  dimensionsLabel: string;
  canUndo: boolean;
  canRedo: boolean;
  frameEnabled: boolean;
  isFrameOpen: boolean;
  isHistoryOpen: boolean;
  historyCount: number;
  onUndo: () => void;
  onRedo: () => void;
  onToggleFramePopover: () => void;
  onToggleHistory: () => void;
  onPasteClipboard: () => void;
  onOpenFile: () => void;
  onCopyImage: () => void;
  onSaveImage: () => void;
  onClearCanvas: () => void;
  onOpenApps?: () => void;
}

const AnnotatorHeader: React.FC<AnnotatorHeaderProps> = ({
  hasDocument,
  dimensionsLabel,
  canUndo,
  canRedo,
  frameEnabled,
  isFrameOpen,
  isHistoryOpen,
  historyCount,
  onUndo,
  onRedo,
  onToggleFramePopover,
  onToggleHistory,
  onPasteClipboard,
  onOpenFile,
  onCopyImage,
  onSaveImage,
  onClearCanvas,
  onOpenApps,
}) => {
  return (
    <header className="relative h-14 shrink-0 title-drag pl-3 pr-[144px] bg-[#0f172a] border-b border-indigo-500/30 flex items-center justify-between gap-2 z-30 select-none">
      {/* Left Navigation */}
      <div className="flex items-center gap-2 no-drag min-w-0">
        {onOpenApps && (
          <button
            type="button"
            onClick={onOpenApps}
            className="w-9 h-9 rounded-xl bg-indigo-500/15 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-300 hover:text-white flex items-center justify-center transition-colors active:scale-95"
            title="Switch Apps (Ctrl+Shift+P)"
          >
            <LayoutGrid size={16} />
          </button>
        )}

        <div className="h-5 w-px bg-slate-700 mx-0.5" />

        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-400/30 flex items-center justify-center text-rose-300 shrink-0">
            <Camera size={14} />
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <h1 className="text-sm font-bold text-slate-100 leading-none tracking-tight whitespace-nowrap">
              Snap Studio
            </h1>
            {hasDocument && dimensionsLabel && (
              <span className="text-[11px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded hidden sm:inline">
                {dimensionsLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Center Undo / Redo + Frame + History */}
      <div className="flex items-center gap-1.5 no-drag">
        {hasDocument && (
          <>
            <div className="h-8 flex items-center bg-slate-950 px-0.5 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className="w-7 h-[26px] rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 size={14} />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                className="w-7 h-[26px] rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors"
                title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
              >
                <Redo2 size={14} />
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleFramePopover}
              className={`h-8 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors active:scale-95 ${
                frameEnabled || isFrameOpen
                  ? 'bg-indigo-600/90 border-indigo-400/50 text-white'
                  : 'bg-slate-800/90 hover:bg-slate-700 border-white/10 text-slate-300 hover:text-white'
              }`}
              title="Pretty Frame (Rounded Corners + Shadow + Padding)"
            >
              <Frame size={13} />
              <span>Frame</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onToggleHistory}
          className={`h-8 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors active:scale-95 ${
            isHistoryOpen
              ? 'bg-indigo-600/90 border-indigo-400/50 text-white'
              : 'bg-slate-800/90 hover:bg-slate-700 border-white/10 text-slate-300 hover:text-white'
          }`}
          title="Recent Captures History"
        >
          <History size={13} />
          <span>History</span>
          {historyCount > 0 && (
            <span className="h-[18px] px-1.5 rounded bg-white/15 text-[10px] font-mono leading-none inline-flex items-center justify-center">
              {historyCount}
            </span>
          )}
        </button>
      </div>

      {/* Right Quick Actions */}
      <div className="flex items-center gap-1.5 no-drag">
        <button
          type="button"
          onClick={onPasteClipboard}
          className="h-8 px-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors active:scale-95"
          title="Paste Image from Clipboard (Ctrl+V)"
        >
          <ClipboardPaste size={13} />
          <span className="hidden md:inline">Paste</span>
        </button>

        <button
          type="button"
          onClick={onOpenFile}
          className="w-8 h-8 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-colors active:scale-95"
          title="Open Image File"
        >
          <FileUp size={14} />
        </button>

        {hasDocument && (
          <>
            <button
              type="button"
              onClick={onCopyImage}
              className="h-8 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 border border-rose-400/40 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-95"
              title="Copy Annotated Image to Clipboard (Ctrl+C)"
            >
              <ClipboardCopy size={13} />
              <span>Copy</span>
            </button>

            <button
              type="button"
              onClick={onSaveImage}
              className="h-8 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors active:scale-95"
              title="Save PNG File (Ctrl+S)"
            >
              <Download size={13} />
              <span className="hidden lg:inline">Save</span>
            </button>

            <button
              type="button"
              onClick={onClearCanvas}
              className="w-8 h-8 rounded-xl bg-slate-800/90 hover:bg-rose-950 border border-white/10 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 flex items-center justify-center transition-colors active:scale-95"
              title="Close Image"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </header>
  );
};

export default React.memo(AnnotatorHeader);
