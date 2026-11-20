import React from 'react';
import {
  Braces,
  ClipboardPaste,
  FileUp,
  LayoutGrid,
  Trash2,
  GitBranch,
  Columns3,
  Table2,
  Code2,
  BarChart3,
  ListTree,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react';
import { JsonBeautifyViewMode, JsonStats } from '../../../types/jsonBeautify';

interface JsonBeautifyHeaderProps {
  stats: JsonStats | null;
  viewMode: JsonBeautifyViewMode;
  showInspector: boolean;
  onChangeViewMode: (mode: JsonBeautifyViewMode) => void;
  onToggleInspector: () => void;
  onPasteClipboard: () => void;
  onOpenFile: () => void;
  onClear: () => void;
  onOpenApps?: () => void;
}

const VIEW_TABS: { id: JsonBeautifyViewMode; label: string; icon: React.ReactNode }[] = [
  { id: 'tree', label: 'Tree', icon: <ListTree size={14} /> },
  { id: 'graph', label: 'Visual Graph', icon: <GitBranch size={14} /> },
  { id: 'columns', label: 'Columns', icon: <Columns3 size={14} /> },
  { id: 'table', label: 'Table', icon: <Table2 size={14} /> },
  { id: 'code', label: 'Code', icon: <Code2 size={14} /> },
  { id: 'insights', label: 'Insights & TS', icon: <BarChart3 size={14} /> },
];

const JsonBeautifyHeader: React.FC<JsonBeautifyHeaderProps> = ({
  stats,
  viewMode,
  showInspector,
  onChangeViewMode,
  onToggleInspector,
  onPasteClipboard,
  onOpenFile,
  onClear,
  onOpenApps,
}) => {
  return (
    <header className="relative h-14 shrink-0 title-drag pl-3 pr-[144px] bg-[#0f172a] border-b border-indigo-500/30 flex items-center justify-between gap-3 z-30">
      {/* Left Navigation */}
      <div className="flex items-center gap-2 no-drag">
        {onOpenApps && (
          <button
            onClick={onOpenApps}
            className="w-9 h-9 rounded-xl bg-indigo-500/15 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-300 hover:text-white flex items-center justify-center transition-colors active:scale-95"
            title="Switch Apps (Ctrl+Shift+P)"
          >
            <LayoutGrid size={16} />
          </button>
        )}

        <div className="h-5 w-px bg-slate-700 mx-1" />

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-400/25 flex items-center justify-center text-indigo-300">
            <Braces size={14} />
          </div>
          <h1 className="text-sm font-bold text-slate-100 leading-none tracking-tight">JSON Beautify</h1>
        </div>
      </div>

      {/* Center View Mode Switcher — Right action buttons keep constant width so tabs never shift */}
      {stats && (
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 no-drag shrink-0">
          {VIEW_TABS.map((tab) => {
            const active = viewMode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onChangeViewMode(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.id === 'table' && stats.arrayTables.length > 0 && (
                  <span className="px-1 rounded text-[10px] bg-white/15">
                    {stats.arrayTables.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Right Quick Actions */}
      <div className="flex items-center gap-1.5 no-drag">
        <button
          onClick={onPasteClipboard}
          className="px-2.5 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
          title="Paste JSON from Clipboard (or press Ctrl+V anywhere)"
        >
          <ClipboardPaste size={13} />
          <span>Paste</span>
        </button>
        <button
          onClick={onOpenFile}
          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          title="Open JSON / Text File"
        >
          <FileUp size={13} />
          <span>Open</span>
        </button>

        {stats && (
          <>
            <button
              onClick={onToggleInspector}
              disabled={viewMode !== 'tree' && viewMode !== 'graph'}
              className={`w-[30px] h-[30px] flex items-center justify-center rounded-lg border transition-colors ${
                viewMode !== 'tree' && viewMode !== 'graph'
                  ? 'opacity-0 pointer-events-none border-transparent'
                  : showInspector
                    ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
              title="Toggle Node Inspector"
            >
              {showInspector ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            </button>
            <button
              onClick={onClear}
              className="w-[30px] h-[30px] flex items-center justify-center rounded-lg bg-slate-800 hover:bg-rose-600/80 border border-slate-700 text-slate-400 hover:text-white transition-colors"
              title="Clear Current JSON"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </header>
  );
};

export default React.memo(JsonBeautifyHeader);
