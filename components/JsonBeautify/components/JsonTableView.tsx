import React, { useState, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Table2, ArrowUpDown, Copy, Search, ExternalLink } from 'lucide-react';
import { ArrayTableCatalogItem, TablePayload } from '../../../types/jsonBeautify';

interface JsonTableViewProps {
  catalog: ArrayTableCatalogItem[];
  selectedArrayId: number | null;
  tableData: TablePayload | null;
  onSelectArray: (arrayNodeId: number) => void;
  onJumpToTree: (nodeId: number) => void;
  onCopyText: (text: string, label: string) => void;
}

const escapeCsv = (val: string): string => {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
};

const JsonTableView: React.FC<JsonTableViewProps> = ({
  catalog,
  selectedArrayId,
  tableData,
  onSelectArray,
  onJumpToTree,
  onCopyText,
}) => {
  const [filterText, setFilterText] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleToggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const processedRows = useMemo(() => {
    if (!tableData) return [];
    const q = filterText.trim().toLowerCase();
    let list = tableData.rows;

    if (q) {
      list = list.filter((row) =>
        tableData.columns.some((col) => (row.cells[col] || '').toLowerCase().includes(q))
      );
    }

    if (sortCol) {
      const col = sortCol;
      const mult = sortDir === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => {
        const av = a.cells[col] ?? '';
        const bv = b.cells[col] ?? '';
        const an = Number(av);
        const bn = Number(bv);
        if (av !== '' && bv !== '' && !Number.isNaN(an) && !Number.isNaN(bn)) {
          return (an - bn) * mult;
        }
        return av.localeCompare(bv) * mult;
      });
    }

    return list;
  }, [tableData, filterText, sortCol, sortDir]);

  const handleCopyCsv = () => {
    if (!tableData) return;
    const header = tableData.columns.map(escapeCsv).join(',');
    const body = processedRows
      .map((r) => tableData.columns.map((c) => escapeCsv(r.cells[c] ?? '')).join(','))
      .join('\n');
    onCopyText(`${header}\n${body}`, `CSV copied (${processedRows.length} rows)`);
  };

  const handleCopyMarkdown = () => {
    if (!tableData) return;
    const cols = tableData.columns;
    const header = `| # | ${cols.join(' | ')} |`;
    const sep = `| --- | ${cols.map(() => '---').join(' | ')} |`;
    const body = processedRows
      .slice(0, 500)
      .map(
        (r) =>
          `| ${r.index} | ${cols
            .map((c) => (r.cells[c] ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' '))
            .join(' | ')} |`
      )
      .join('\n');
    onCopyText(`${header}\n${sep}\n${body}`, `Markdown table copied (${Math.min(500, processedRows.length)} rows)`);
  };

  if (catalog.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
        <Table2 size={32} className="mb-3 opacity-40" />
        <p className="text-sm font-semibold text-slate-300 mb-1">No Object Arrays Detected</p>
        <p className="text-xs text-slate-500 max-w-md">
          Smart Table automatically detects arrays of JSON objects (like <code className="text-slate-300">devices[]</code> or <code className="text-slate-300">items[]</code>) for instant spreadsheet analysis.
        </p>
      </div>
    );
  }

  const visibleCols = tableData ? tableData.columns.slice(0, 30) : [];
  const colWidth = 170;
  const totalWidth = 64 + visibleCols.length * colWidth + 56;

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#0a0f1c]">
      {/* Toolbar */}
      <div className="shrink-0 px-3 py-2 border-b border-slate-800 bg-slate-900/70 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Table2 size={14} className="text-emerald-400" />
          <select
            value={selectedArrayId ?? ''}
            onChange={(e) => {
              setSortCol(null);
              setFilterText('');
              onSelectArray(Number(e.target.value));
            }}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 h-8 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 max-w-[320px]"
          >
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center bg-slate-950 border border-slate-800 focus-within:border-indigo-500 rounded-lg px-2.5 h-8 w-64">
          <Search size={12} className="text-slate-500 mr-2 shrink-0" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter table rows..."
            className="bg-transparent border-none text-xs text-slate-200 w-full focus:outline-none placeholder-slate-500"
          />
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[11px] font-mono text-slate-400 mr-2">
            {processedRows.length.toLocaleString()} rows • {visibleCols.length} cols
          </span>
          <button
            onClick={handleCopyCsv}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors"
          >
            <Copy size={12} /> CSV
          </button>
          <button
            onClick={handleCopyMarkdown}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
          >
            <Copy size={12} /> Markdown
          </button>
        </div>
      </div>

      {/* Scrollable Table Container */}
      {tableData && (
        <div className="flex-1 min-h-0 overflow-x-auto custom-scrollbar flex flex-col">
          <div style={{ minWidth: totalWidth }} className="flex-1 flex flex-col min-h-0">
            {/* Header Row */}
            <div className="shrink-0 flex items-center h-9 bg-slate-900 border-b border-slate-800 text-[11px] font-mono font-bold text-slate-300 select-none">
              <div className="w-16 px-2 text-right text-slate-500 shrink-0">#</div>
              {visibleCols.map((col) => (
                <button
                  key={col}
                  onClick={() => handleToggleSort(col)}
                  style={{ width: colWidth }}
                  className="px-2.5 h-full shrink-0 flex items-center justify-between gap-1 text-left border-l border-slate-800/80 hover:bg-slate-800/80 transition-colors"
                  title={`Sort by ${col}`}
                >
                  <span className="truncate">{col}</span>
                  <ArrowUpDown
                    size={11}
                    className={sortCol === col ? 'text-indigo-400 shrink-0' : 'text-slate-600 shrink-0'}
                  />
                </button>
              ))}
              <div className="w-14 px-2 text-center text-slate-500 border-l border-slate-800/80 shrink-0">
                Tree
              </div>
            </div>

            {/* Virtualized Rows */}
            <div className="flex-1 min-h-0">
              <Virtuoso
                style={{ height: '100%', width: '100%' }}
                totalCount={processedRows.length}
                overscan={200}
                itemContent={(idx) => {
                  const row = processedRows[idx];
                  if (!row) return null;
                  return (
                    <div
                      className={`flex items-center h-8 border-b border-slate-800/50 text-xs font-mono ${
                        idx % 2 === 0 ? 'bg-[#0a0f1c]' : 'bg-slate-900/35'
                      } hover:bg-indigo-600/15 transition-colors`}
                    >
                      <div className="w-16 px-2 text-right text-slate-500 shrink-0 text-[11px]">
                        {row.index}
                      </div>
                      {visibleCols.map((col) => {
                        const val = row.cells[col] ?? '';
                        const t = row.cellTypes[col];
                        const colorCls =
                          t === 'string'
                            ? 'text-emerald-300'
                            : t === 'number'
                              ? 'text-blue-300'
                              : t === 'boolean'
                                ? 'text-amber-300'
                                : t === 'object' || t === 'array'
                                  ? 'text-indigo-300'
                                  : 'text-slate-500';
                        return (
                          <div
                            key={col}
                            style={{ width: colWidth }}
                            className={`px-2.5 shrink-0 truncate border-l border-slate-800/40 ${colorCls}`}
                            title={val}
                          >
                            {val || '—'}
                          </div>
                        );
                      })}
                      <div className="w-14 shrink-0 flex justify-center border-l border-slate-800/40">
                        <button
                          onClick={() => onJumpToTree(row.nodeId)}
                          className="p-1 rounded hover:bg-indigo-600/40 text-slate-400 hover:text-indigo-200"
                          title="Inspect row in Tree View"
                        >
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    </div>
                  );
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(JsonTableView);
