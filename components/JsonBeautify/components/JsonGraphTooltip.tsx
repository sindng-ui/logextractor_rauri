import React, { useMemo } from 'react';
import { Clock, Braces } from 'lucide-react';
import { GraphCardProperty } from '../../../types/jsonBeautify';
import { decodeInlineBadge } from '../../../utils/jsonValueDecoders';

interface JsonGraphTooltipProps {
  prop: GraphCardProperty;
  cardKey: string;
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
}

const JsonGraphTooltip: React.FC<JsonGraphTooltipProps> = ({
  prop,
  cardKey,
  x,
  y,
  containerWidth,
  containerHeight,
}) => {
  const displayText = prop.fullPreview ?? prop.value;
  const badge = useMemo(
    () => decodeInlineBadge(prop.type, prop.value, prop.hasEmbeddedJson),
    [prop.type, prop.value, prop.hasEmbeddedJson]
  );

  // Clamp tooltip inside canvas bounds without overlapping cursor
  const tooltipMaxW = 380;
  const estH = Math.min(220, 64 + Math.ceil(displayText.length / 46) * 18);
  const left = x + 16 + tooltipMaxW > containerWidth ? Math.max(12, x - tooltipMaxW - 14) : x + 16;
  const top = y + 14 + estH > containerHeight ? Math.max(12, y - estH - 12) : y + 14;

  return (
    <div
      style={{ left, top, maxWidth: tooltipMaxW }}
      className="absolute z-40 pointer-events-none rounded-xl bg-[#0c1222] border border-indigo-400/40 shadow-[0_16px_44px_rgba(0,0,0,0.85)] p-3 text-xs"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="font-mono text-[11px] font-bold text-indigo-300 truncate">
          <span className="text-slate-500">{cardKey}.</span>
          {prop.key}
        </div>
        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9.5px] font-mono uppercase text-slate-400 shrink-0">
          {prop.type}
        </span>
      </div>

      <div className="font-mono text-[11.5px] leading-relaxed text-slate-100 whitespace-pre-wrap break-all max-h-[140px] overflow-hidden bg-slate-950/90 border border-slate-800 rounded-lg px-2.5 py-1.5">
        {displayText}
      </div>

      {badge?.kind === 'timestamp' && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono text-emerald-300">
          <Clock size={12} /> {badge.label}
        </div>
      )}

      {badge?.kind === 'color' && badge.colorValue && (
        <div className="mt-2 flex items-center gap-2 text-[11px] font-mono text-slate-300">
          <span
            className="w-4 h-4 rounded border border-white/25 inline-block"
            style={{ backgroundColor: badge.colorValue }}
          />
          <span>{badge.colorValue}</span>
        </div>
      )}

      {badge?.kind === 'embedded-json' && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-indigo-300">
          <Braces size={12} /> Contains nested JSON string
        </div>
      )}
    </div>
  );
};

export default React.memo(JsonGraphTooltip);
