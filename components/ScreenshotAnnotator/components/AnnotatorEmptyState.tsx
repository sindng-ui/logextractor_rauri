import React from 'react';
import { Camera, ClipboardPaste, Clock, FileUp } from 'lucide-react';
import { AnnotatorHistoryMeta } from '../../../types/screenshotAnnotator';

interface AnnotatorEmptyStateProps {
  recentHistory: AnnotatorHistoryMeta[];
  isDragging?: boolean;
  onPasteClipboard: () => void;
  onOpenFile: () => void;
  onLoadSample: () => void;
  onRestoreHistory: (id: string) => void;
}

const AnnotatorEmptyState: React.FC<AnnotatorEmptyStateProps> = ({
  recentHistory,
  isDragging = false,
  onPasteClipboard,
  onOpenFile,
  onLoadSample,
  onRestoreHistory,
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto custom-scrollbar select-none bg-[#090d16]">
      <div
        className={`w-full max-w-lg rounded-2xl border border-dashed px-8 py-10 transition-colors duration-200 ${
          isDragging
            ? 'border-rose-400/70 bg-rose-950/20'
            : 'border-slate-800 bg-[#0d1322]/70'
        }`}
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-400/20 flex items-center justify-center text-rose-300 mb-4">
            <Camera size={20} strokeWidth={2} />
          </div>

          <h2 className="text-[15px] font-semibold text-slate-200 tracking-tight">
            Drop an image or press{' '}
            <kbd className="px-1.5 py-0.5 mx-0.5 rounded-md bg-slate-900 border border-slate-700/80 text-rose-300 font-mono text-xs font-medium">
              Ctrl+V
            </kbd>
          </h2>
          <p className="text-xs text-slate-500 mt-1.5 mb-6">
            PNG, JPG, WebP, or clipboard screenshot
          </p>

          <div className="flex items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onPasteClipboard}
              className="px-4 py-2 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors active:scale-95"
            >
              <ClipboardPaste size={14} />
              Paste
            </button>
            <button
              type="button"
              onClick={onOpenFile}
              className="px-4 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/80 font-medium text-xs flex items-center gap-1.5 transition-colors active:scale-95"
            >
              <FileUp size={14} />
              Open File
            </button>
          </div>

          <div className="flex items-center gap-3 mt-5 text-[11px] text-slate-500">
            <button
              type="button"
              onClick={onLoadSample}
              className="hover:text-slate-300 transition-colors"
            >
              Load sample
            </button>
          </div>
        </div>
      </div>

      {recentHistory.length > 0 && (
        <div className="w-full max-w-lg mt-5">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-2 px-1">
            <Clock size={11} />
            <span>Recent</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {recentHistory.slice(0, 3).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onRestoreHistory(item.id)}
                className="group rounded-xl bg-[#0d1322] border border-slate-800 hover:border-slate-700 overflow-hidden text-left transition-colors"
              >
                <div className="h-20 bg-slate-950 overflow-hidden flex items-center justify-center">
                  {item.thumbnailDataUrl ? (
                    <img
                      src={item.thumbnailDataUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Camera size={16} className="text-slate-700" />
                  )}
                </div>
                <div className="px-2 py-1.5">
                  <div className="text-[11px] text-slate-300 truncate">{item.title}</div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {item.width}×{item.height}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(AnnotatorEmptyState);
