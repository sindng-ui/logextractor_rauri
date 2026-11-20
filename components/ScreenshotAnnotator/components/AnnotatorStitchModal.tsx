import React, { useEffect } from 'react';
import { Columns2, Layers, Replace, Rows2, X } from 'lucide-react';
import { StitchMode } from '../../../types/screenshotAnnotator';

interface AnnotatorStitchModalProps {
  pendingImage: { dataUrl: string; width: number; height: number } | null;
  onChoose: (mode: StitchMode) => void;
  onCancel: () => void;
}

const OPTIONS: {
  mode: StitchMode;
  keyHint: string;
  label: string;
  sub: string;
  icon: React.ComponentType<{ size?: number }>;
}[] = [
  { mode: 'replace', keyHint: '1', label: 'Replace', sub: 'Backup current & open new', icon: Replace },
  { mode: 'right', keyHint: '2', label: 'Side-by-Side', sub: 'Place on right (Before / After)', icon: Columns2 },
  { mode: 'below', keyHint: '3', label: 'Stack Below', sub: 'Stitch underneath vertically', icon: Rows2 },
  { mode: 'overlay', keyHint: '4', label: 'Overlay Sticker', sub: 'Movable image on top', icon: Layers },
];

const AnnotatorStitchModal: React.FC<AnnotatorStitchModalProps> = ({
  pendingImage,
  onChoose,
  onCancel,
}) => {
  useEffect(() => {
    if (!pendingImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === '1') {
        e.preventDefault();
        onChoose('replace');
      } else if (e.key === '2') {
        e.preventDefault();
        onChoose('right');
      } else if (e.key === '3') {
        e.preventDefault();
        onChoose('below');
      } else if (e.key === '4') {
        e.preventDefault();
        onChoose('overlay');
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [pendingImage, onChoose, onCancel]);

  if (!pendingImage) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#050814]/75 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#0f172a] border border-indigo-500/35 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 bg-[#111b33] border-b border-indigo-500/20 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-100">
              How should we add this image?
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              Incoming: {pendingImage.width} × {pendingImage.height} px
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-4">
          <div className="h-32 mb-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden">
            <img
              src={pendingImage.dataUrl}
              alt="Incoming capture"
              className="max-w-full max-h-full object-contain"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => onChoose(opt.mode)}
                  className="p-3 rounded-xl bg-slate-900 hover:bg-indigo-600/25 border border-slate-800 hover:border-indigo-400/60 text-left flex items-start gap-2.5 transition-colors active:scale-[0.99]"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-400/25 flex items-center justify-center text-indigo-300 shrink-0">
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-slate-100">{opt.label}</span>
                      <kbd className="px-1.5 py-0.2 rounded bg-slate-950 border border-slate-700 text-[10px] font-mono text-slate-400">
                        {opt.keyHint}
                      </kbd>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{opt.sub}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(AnnotatorStitchModal);
