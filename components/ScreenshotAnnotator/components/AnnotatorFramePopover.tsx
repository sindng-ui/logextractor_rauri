import React from 'react';
import { Frame, X } from 'lucide-react';
import { FRAME_PRESETS, FrameConfig } from '../../../types/screenshotAnnotator';

interface AnnotatorFramePopoverProps {
  isOpen: boolean;
  config: FrameConfig;
  onChange: (patch: Partial<FrameConfig>) => void;
  onClose: () => void;
}

const AnnotatorFramePopover: React.FC<AnnotatorFramePopoverProps> = ({
  isOpen,
  config,
  onChange,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute top-[60px] left-1/2 -translate-x-1/2 z-40 w-[340px] bg-[#0f172a] border border-indigo-500/35 rounded-2xl shadow-2xl p-4 select-none">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Frame size={15} className="text-indigo-300" />
          <span className="text-xs font-bold text-slate-100">Pretty Frame</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ enabled: !config.enabled })}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
              config.enabled
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {config.enabled ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Background Presets */}
      <div className="mb-3">
        <div className="text-[11px] font-semibold text-slate-400 mb-1.5">Background</div>
        <div className="grid grid-cols-4 gap-2">
          {FRAME_PRESETS.map((preset) => {
            const active = config.presetId === preset.id;
            const bgStyle =
              preset.type === 'gradient'
                ? { backgroundImage: `linear-gradient(135deg, ${preset.colors.join(', ')})` }
                : { backgroundColor: preset.colors[0] };
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange({ enabled: true, presetId: preset.id })}
                className={`h-9 rounded-xl border transition-transform ${
                  active
                    ? 'ring-2 ring-indigo-400 border-white scale-105'
                    : 'border-white/15 hover:scale-105'
                }`}
                style={bgStyle}
                title={preset.label}
              />
            );
          })}
        </div>
      </div>

      {/* Padding Slider */}
      <div className="space-y-2.5 mb-3">
        <label className="flex items-center justify-between text-[11px] text-slate-300">
          <span>Padding</span>
          <span className="font-mono text-indigo-300">{config.padding}px</span>
        </label>
        <input
          type="range"
          min={12}
          max={96}
          step={4}
          value={config.padding}
          onChange={(e) => onChange({ enabled: true, padding: Number(e.target.value) })}
          className="w-full accent-indigo-500"
        />

        <label className="flex items-center justify-between text-[11px] text-slate-300">
          <span>Corner Radius</span>
          <span className="font-mono text-indigo-300">{config.borderRadius}px</span>
        </label>
        <input
          type="range"
          min={0}
          max={32}
          step={2}
          value={config.borderRadius}
          onChange={(e) => onChange({ enabled: true, borderRadius: Number(e.target.value) })}
          className="w-full accent-indigo-500"
        />
      </div>

      {/* Shadow & Inset Border Toggles */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
        <button
          type="button"
          onClick={() => onChange({ enabled: true, shadow: !config.shadow })}
          className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
            config.shadow
              ? 'bg-indigo-600/25 border-indigo-400/50 text-indigo-200'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          Soft Shadow
        </button>
        <button
          type="button"
          onClick={() => onChange({ enabled: true, insetBorder: !config.insetBorder })}
          className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
            config.insetBorder
              ? 'bg-indigo-600/25 border-indigo-400/50 text-indigo-200'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          Hairline Rim
        </button>
      </div>
    </div>
  );
};

export default React.memo(AnnotatorFramePopover);
