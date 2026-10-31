import React, { useMemo, useState } from 'react';
import { HistogramData, HistogramBucket } from '../../types';
import { BarChart3, Clock, X } from 'lucide-react';

interface LogHistogramPanelProps {
  data: HistogramData | null;
  paneId: 'left' | 'right';
  onJump: (visualIndex: number, paneId: 'left' | 'right') => void;
  onClose: () => void;
}

const formatTimestamp = (ts: number): string => {
  if (ts < 86400000) {
    // Relative Monotonic seconds format (e.g. 123.456s)
    const totalSec = ts / 1000;
    return `${totalSec.toFixed(3)}s`;
  }
  const date = new Date(ts);
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `${h}:${m}:${s}.${ms}`;
};

export const LogHistogramPanel: React.FC<LogHistogramPanelProps> = ({
  data,
  paneId,
  onJump,
  onClose,
}) => {
  const [hoveredBucket, setHoveredBucket] = useState<{
    bucket: HistogramBucket;
    x: number;
    y: number;
  } | null>(null);

  // Memoized SVG layout variables to avoid overhead
  const chartHeight = 80;
  const paddingBottom = 4;
  const barPadding = 1.5;

  const buckets = data?.buckets || [];
  const maxCount = data?.maxCount || 0;
  const totalCount = data?.totalCount || 0;

  const chartWidth = 1000; // Fixed inner coordinate space for SVG scaling

  const renderedBars = useMemo(() => {
    if (buckets.length === 0 || maxCount === 0) return [];

    const barWidth = chartWidth / buckets.length;
    return buckets.map((bucket, index) => {
      const x = index * barWidth;
      // Scale height relative to maxCount, minimum height 2px if count > 0 for visibility
      const height = bucket.count > 0 
        ? Math.max(2, (bucket.count / maxCount) * (chartHeight - paddingBottom))
        : 0;
      const y = chartHeight - height - paddingBottom;
      const width = Math.max(0.5, barWidth - barPadding);

      return {
        bucket,
        x,
        y,
        width,
        height,
      };
    });
  }, [buckets, maxCount]);

  if (!data || buckets.length === 0) {
    return (
      <div className="flex items-center justify-center h-28 bg-slate-900/60 border border-slate-800 rounded-xl px-4 select-none">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Clock className="w-4 h-4 animate-pulse text-indigo-400" />
          <span>시간 정보가 없거나 분석 중입니다...</span>
        </div>
      </div>
    );
  }

  const handleBarClick = (bucket: HistogramBucket) => {
    if (bucket.firstVisualIndex !== undefined) {
      onJump(bucket.firstVisualIndex, paneId);
    }
  };

  const handleMouseMove = (e: React.MouseEvent, bucket: HistogramBucket) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgRect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!svgRect) return;

    // Position tooltip relative to the main component container
    const x = rect.left - svgRect.left + rect.width / 2;
    const y = rect.top - svgRect.top - 8;

    setHoveredBucket({ bucket, x, y });
  };

  return (
    <div className="relative w-full bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 select-none transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4.5 h-4.5 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
          <span className="text-sm font-semibold text-slate-200">
            Log Frequency Timeline ({paneId === 'left' ? 'Left Pane' : 'Right Pane'})
          </span>
          <span className="text-xs text-slate-500 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800">
            {totalCount.toLocaleString()} matched lines
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-900 border border-transparent hover:border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          title="Close Histogram Chart"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* SVG Neon Chart Container */}
      <div className="relative w-full h-20 bg-slate-900/30 rounded-xl overflow-visible border border-slate-900/50">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible"
        >
          <defs>
            {/* Soft gradient background glow */}
            <linearGradient id="neonGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#c084fc" stopOpacity="0.25" />
            </linearGradient>
            {/* Fallback pattern for empty buckets */}
            <linearGradient id="neonGlowHover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a5b4fc" stopOpacity="1" />
              <stop offset="100%" stopColor="#e9d5ff" stopOpacity="0.5" />
            </linearGradient>
          </defs>

          {renderedBars.map((bar, index) => {
            const hasData = bar.bucket.count > 0;
            return (
              <rect
                key={index}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                fill={
                  hoveredBucket?.bucket.startTime === bar.bucket.startTime
                    ? 'url(#neonGlowHover)'
                    : 'url(#neonGlow)'
                }
                rx={Math.min(1.5, bar.width / 2)}
                className={`transition-all duration-150 ${
                  hasData 
                    ? 'cursor-pointer hover:brightness-125' 
                    : 'opacity-10'
                }`}
                onMouseMove={(e) => hasData && handleMouseMove(e, bar.bucket)}
                onMouseLeave={() => setHoveredBucket(null)}
                onClick={() => hasData && handleBarClick(bar.bucket)}
                style={{
                  filter: hoveredBucket?.bucket.startTime === bar.bucket.startTime
                    ? 'drop-shadow(0px 0px 3px rgba(165,180,252,0.8))'
                    : 'none',
                }}
              />
            );
          })}
        </svg>

        {/* Lightweight dynamic tooltip overlay */}
        {hoveredBucket && (
          <div
            className="absolute z-50 pointer-events-none bg-slate-950/95 border border-slate-800 rounded-lg px-3 py-1.5 shadow-2xl text-xs text-slate-200"
            style={{
              left: `${(hoveredBucket.x / window.innerWidth) * 100}%`, // Rough bounding check
              transform: 'translateX(-50%)',
              top: `${hoveredBucket.y - 45}px`,
              maxWidth: '220px',
            }}
          >
            <div className="font-semibold text-indigo-400 mb-0.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {formatTimestamp(hoveredBucket.bucket.startTime)} ~ {formatTimestamp(hoveredBucket.bucket.endTime)}
              </span>
            </div>
            <div className="text-slate-400">
              Logs: <span className="font-bold text-slate-200">{hoveredBucket.bucket.count.toLocaleString()}</span>
              {hoveredBucket.bucket.firstVisualIndex !== undefined && (
                <span className="text-[10px] text-slate-500 block mt-0.5">Click to jump to this region</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="flex justify-between items-center mt-2 text-[10px] text-slate-500">
        <span>{formatTimestamp(buckets[0].startTime)}</span>
        <span>Drag your cursor over the chart to see density details • Click to Hyper-Jump</span>
        <span>{formatTimestamp(buckets[buckets.length - 1].endTime)}</span>
      </div>
    </div>
  );
};
