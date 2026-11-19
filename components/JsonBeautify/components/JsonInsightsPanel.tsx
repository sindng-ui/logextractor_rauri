import React from 'react';
import { Flame, Layers, KeyRound, Code2, Copy } from 'lucide-react';
import { JsonStats } from '../../../types/jsonBeautify';
import { formatByteSize } from '../../../utils/jsonValueDecoders';

interface JsonInsightsPanelProps {
  stats: JsonStats;
  tsSchema: string;
  onJumpToNode: (nodeId: number) => void;
  onCopyText: (text: string, label: string) => void;
}

const JsonInsightsPanel: React.FC<JsonInsightsPanelProps> = ({
  stats,
  tsSchema,
  onJumpToNode,
  onCopyText,
}) => {
  const maxDepthCount = Math.max(1, ...stats.depthDistribution.map((d) => d.count));
  const maxKeyCount = Math.max(1, ...stats.topKeys.map((k) => k.count));

  const typeSegments = [
    { label: 'Objects', count: stats.objectCount, color: 'bg-indigo-500' },
    { label: 'Arrays', count: stats.arrayCount, color: 'bg-cyan-500' },
    { label: 'Strings', count: stats.stringCount, color: 'bg-emerald-500' },
    { label: 'Numbers', count: stats.numberCount, color: 'bg-blue-500' },
    { label: 'Booleans', count: stats.booleanCount, color: 'bg-amber-500' },
    { label: 'Nulls', count: stats.nullCount, color: 'bg-rose-500' },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 bg-[#090d16]">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1) Type Distribution & Heavy Subtrees */}
        <div className="space-y-5">
          <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Value Type Composition
            </h3>
            <div className="h-3 rounded-full overflow-hidden flex bg-slate-950 mb-3">
              {typeSegments.map((seg) => {
                const pct = stats.totalNodes > 0 ? (seg.count / stats.totalNodes) * 100 : 0;
                if (pct <= 0) return null;
                return (
                  <div
                    key={seg.label}
                    className={seg.color}
                    style={{ width: `${pct}%` }}
                    title={`${seg.label}: ${seg.count.toLocaleString()} (${pct.toFixed(1)}%)`}
                  />
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {typeSegments.map((seg) => (
                <div key={seg.label} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span className={`w-2 h-2 rounded-full ${seg.color}`} />
                    {seg.label}
                  </span>
                  <span className="font-mono font-bold text-slate-100">{seg.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
                <Flame size={14} /> Heavy Subtrees Top {stats.heavyNodes.length}
              </h3>
              <span className="text-[11px] text-slate-500">Click to jump in Tree</span>
            </div>
            <div className="space-y-2">
              {stats.heavyNodes.map((h) => (
                <button
                  key={h.id}
                  onClick={() => onJumpToNode(h.id)}
                  className="w-full text-left p-2 rounded-xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800/80 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs font-mono mb-1">
                    <span className="text-slate-200 truncate pr-2">{h.path}</span>
                    <span className="text-orange-300 font-bold shrink-0">
                      {formatByteSize(h.byteSize)} ({h.percent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-900 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-orange-500 rounded-full"
                      style={{ width: `${Math.max(2, h.percent)}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5 mb-3">
              <Layers size={14} /> Depth Distribution (Max L{stats.maxDepth})
            </h3>
            <div className="space-y-1.5">
              {stats.depthDistribution.map((d) => (
                <div key={d.depth} className="flex items-center gap-2 text-xs font-mono">
                  <span className="w-10 text-slate-400 shrink-0">L{d.depth}</span>
                  <div className="flex-1 h-4 rounded bg-slate-950 overflow-hidden">
                    <div
                      className="h-full bg-cyan-500/60"
                      style={{ width: `${Math.max(1, (d.count / maxDepthCount) * 100)}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-slate-300 shrink-0">
                    {d.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* 2) Auto-Generated TypeScript Interfaces & Top Keys */}
        <div className="space-y-5">
          <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                <Code2 size={14} /> Auto-Generated TypeScript Schema
              </h3>
              <button
                onClick={() => tsSchema && onCopyText(tsSchema, 'TypeScript interfaces copied')}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 transition-colors"
              >
                <Copy size={11} /> Copy TS
              </button>
            </div>
            <pre className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 font-mono text-[11.5px] leading-relaxed text-emerald-300 overflow-auto max-h-[420px] custom-scrollbar select-text">
              {tsSchema || '// Generating schema...'}
            </pre>
          </section>

          <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-3">
              <KeyRound size={14} /> Most Frequent Keys Top {stats.topKeys.length}
            </h3>
            <div className="space-y-1.5">
              {stats.topKeys.map((k) => (
                <div key={k.key} className="flex items-center gap-2 text-xs font-mono">
                  <span className="w-36 truncate text-sky-300 shrink-0" title={k.key}>
                    {k.key}
                  </span>
                  <div className="flex-1 h-3 rounded bg-slate-950 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500/60"
                      style={{ width: `${Math.max(2, (k.count / maxKeyCount) * 100)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-slate-300 shrink-0">{k.count}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default React.memo(JsonInsightsPanel);
