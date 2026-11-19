import React from 'react';
import { Flame, Gauge, Layers, Database, Sparkles } from 'lucide-react';
import { JsonRepairInfo, JsonStats } from '../../../types/jsonBeautify';
import { formatByteSize } from '../../../utils/jsonValueDecoders';

interface JsonInsightsBarProps {
  stats: JsonStats;
  repairInfo: JsonRepairInfo | null;
  onJumpToNode: (nodeId: number) => void;
}

const JsonInsightsBar: React.FC<JsonInsightsBarProps> = ({
  stats,
  repairInfo,
  onJumpToNode,
}) => {
  const topHeavy = stats.heavyNodes.slice(0, 5);

  return (
    <div className="shrink-0 bg-slate-900/95 border-b border-slate-800 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {/* Core Metrics */}
      <div className="flex items-center gap-3 text-slate-300 font-mono">
        <span className="flex items-center gap-1.5" title="Payload Byte Size">
          <Database size={13} className="text-indigo-400" />
          <strong className="text-white">{formatByteSize(stats.byteSize)}</strong>
        </span>
        <span className="text-slate-700">|</span>
        <span className="flex items-center gap-1.5" title="Worker Parse & Index Time">
          <Gauge size={13} className="text-emerald-400" />
          <strong className="text-emerald-300">{stats.parseTimeMs}ms</strong>
        </span>
        <span className="text-slate-700">|</span>
        <span title="Total Indexed Nodes">
          <strong className="text-slate-100">{stats.totalNodes.toLocaleString()}</strong>{' '}
          <span className="text-slate-500">nodes</span>
        </span>
        <span className="text-slate-700">|</span>
        <span className="flex items-center gap-1" title="Maximum Nesting Depth">
          <Layers size={13} className="text-cyan-400" />
          <span className="text-slate-400">Depth</span>{' '}
          <strong className="text-cyan-300">{stats.maxDepth}</strong>
        </span>
      </div>

      {/* Auto Repair Badge */}
      {repairInfo?.repaired && (
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold"
          title={repairInfo.reasons.join(' • ')}
        >
          <Sparkles size={11} />
          <span>Auto-Extracted</span>
        </div>
      )}

      {/* Heavy Nodes Jump Chips */}
      {topHeavy.length > 0 && (
        <div className="flex items-center gap-1.5 ml-auto min-w-0 overflow-x-auto no-scrollbar">
          <span className="flex items-center gap-1 text-[11px] font-bold text-orange-400 shrink-0 mr-0.5">
            <Flame size={12} /> Heavy:
          </span>
          {topHeavy.map((h) => (
            <button
              key={h.id}
              onClick={() => onJumpToNode(h.id)}
              className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500/50 text-[11px] font-mono text-slate-300 hover:text-white flex items-center gap-1.5 shrink-0 transition-colors"
              title={`Jump to ${h.path} (${formatByteSize(h.byteSize)})`}
            >
              <span className="max-w-[110px] truncate">{h.key}</span>
              <span className="text-orange-300 font-bold">{h.percent.toFixed(0)}%</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(JsonInsightsBar);
