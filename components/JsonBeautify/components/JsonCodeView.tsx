import React, { useEffect } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Copy, Download, ArrowDownAZ, Minimize2, AlignLeft } from 'lucide-react';
import { CodeViewPayload } from '../../../types/jsonBeautify';
import { formatByteSize } from '../../../utils/jsonValueDecoders';

interface JsonCodeViewProps {
  codeData: CodeViewPayload | null;
  indent: number;
  sortKeys: boolean;
  minified: boolean;
  onChangeOptions: (opts: { indent: number; sortKeys: boolean; minified: boolean }) => void;
  onCopyAll: () => void;
  onSaveFile: () => void;
}

const KEY_LINE_RE = /^(\s*)("(?:[^"\\]|\\.)*")(\s*:\s*)(.*)$/;

const renderHighlightedLine = (line: string) => {
  if (line.length > 600) {
    return <span className="text-slate-300">{line.slice(0, 600)}… (long minified line)</span>;
  }

  const m = KEY_LINE_RE.exec(line);
  if (m) {
    const [, spaces, keyToken, colon, rest] = m;
    let valClass = 'text-slate-300';
    if (rest.startsWith('"')) valClass = 'text-emerald-400';
    else if (/^-?\d/.test(rest)) valClass = 'text-blue-400';
    else if (rest.startsWith('true') || rest.startsWith('false')) valClass = 'text-amber-400';
    else if (rest.startsWith('null')) valClass = 'text-rose-400';

    return (
      <>
        <span>{spaces}</span>
        <span className="text-sky-300 font-semibold">{keyToken}</span>
        <span className="text-slate-500">{colon}</span>
        <span className={valClass}>{rest}</span>
      </>
    );
  }

  const trimmed = line.trim();
  if (trimmed.startsWith('"')) return <span className="text-emerald-400">{line}</span>;
  if (/^-?\d/.test(trimmed)) return <span className="text-blue-400">{line}</span>;
  if (trimmed.startsWith('true') || trimmed.startsWith('false')) return <span className="text-amber-400">{line}</span>;
  if (trimmed.startsWith('null')) return <span className="text-rose-400">{line}</span>;
  return <span className="text-slate-400">{line}</span>;
};

const JsonCodeView: React.FC<JsonCodeViewProps> = ({
  codeData,
  indent,
  sortKeys,
  minified,
  onChangeOptions,
  onCopyAll,
  onSaveFile,
}) => {
  useEffect(() => {
    if (!codeData) {
      onChangeOptions({ indent, sortKeys, minified });
    }
  }, [codeData, indent, sortKeys, minified, onChangeOptions]);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#090d16]">
      {/* Toolbar */}
      <div className="shrink-0 px-3 py-2 border-b border-slate-800 bg-slate-900/70 flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
          <button
            onClick={() => onChangeOptions({ indent, sortKeys, minified: false })}
            className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 ${
              !minified ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlignLeft size={12} /> Pretty
          </button>
          <button
            onClick={() => onChangeOptions({ indent, sortKeys, minified: true })}
            className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 ${
              minified ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Minimize2 size={12} /> Minified
          </button>
        </div>

        {!minified && (
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            {[2, 4].map((sp) => (
              <button
                key={sp}
                onClick={() => onChangeOptions({ indent: sp, sortKeys, minified: false })}
                className={`px-2 py-1 rounded-md font-mono text-[11px] ${
                  indent === sp ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sp}sp
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => onChangeOptions({ indent, sortKeys: !sortKeys, minified })}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            sortKeys
              ? 'bg-emerald-600/25 border-emerald-500/50 text-emerald-300'
              : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
          }`}
          title="Sort all object keys alphabetically (A → Z)"
        >
          <ArrowDownAZ size={13} /> Sort Keys
        </button>

        <div className="flex items-center gap-2 ml-auto">
          {codeData && (
            <span className="font-mono text-[11px] text-slate-400 mr-1">
              {codeData.totalLines.toLocaleString()} lines • {formatByteSize(codeData.byteSize)}
            </span>
          )}
          <button
            onClick={onCopyAll}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1.5 transition-colors"
          >
            <Copy size={12} /> Copy JSON
          </button>
          <button
            onClick={onSaveFile}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download size={12} /> Save .json
          </button>
        </div>
      </div>

      {/* Virtualized Code Lines */}
      <div className="flex-1 min-h-0 font-mono text-[12.5px]">
        {!codeData ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-xs">
            Formatting code in worker...
          </div>
        ) : (
          <Virtuoso
            style={{ height: '100%', width: '100%' }}
            totalCount={codeData.lines.length}
            overscan={300}
            itemContent={(idx) => (
              <div className="flex items-start px-3 leading-[22px] hover:bg-slate-800/40 whitespace-pre">
                <span className="w-14 pr-4 text-right text-slate-600 select-none shrink-0 text-[11px]">
                  {idx + 1}
                </span>
                <span className="select-text">{renderHighlightedLine(codeData.lines[idx])}</span>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
};

export default React.memo(JsonCodeView);
