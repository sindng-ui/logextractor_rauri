import React, { useState } from 'react';
import { Braces, ClipboardPaste, FileUp, AlertCircle } from 'lucide-react';
import { JsonErrorDetail } from '../../../types/jsonBeautify';

interface JsonEmptyStateProps {
  onPasteClipboard: () => void;
  onOpenFile: () => void;
  onLoadSample: () => void;
  onSubmitManualText: (text: string) => void;
  error: JsonErrorDetail | null;
  isDragging: boolean;
}

const JsonEmptyState: React.FC<JsonEmptyStateProps> = ({
  onPasteClipboard,
  onOpenFile,
  onLoadSample,
  onSubmitManualText,
  error,
  isDragging,
}) => {
  const [showManual, setShowManual] = useState(false);
  const [manualText, setManualText] = useState('');

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-6 overflow-y-auto custom-scrollbar bg-[#090d16]">
      <div
        className={`w-full max-w-lg rounded-2xl border border-dashed px-8 py-10 transition-colors duration-200 ${
          isDragging
            ? 'border-indigo-400/70 bg-indigo-950/25'
            : 'border-slate-800 bg-[#0d1322]/70'
        }`}
      >
        <div className="flex flex-col items-center text-center">
          {/* Quiet Icon Badge */}
          <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-400/20 flex items-center justify-center text-indigo-300 mb-4">
            <Braces size={20} strokeWidth={2} />
          </div>

          {/* Minimal Heading */}
          <h2 className="text-[15px] font-semibold text-slate-200 tracking-tight">
            Drop a JSON file or press{' '}
            <kbd className="px-1.5 py-0.5 mx-0.5 rounded-md bg-slate-900 border border-slate-700/80 text-indigo-300 font-mono text-xs font-medium">
              Ctrl+V
            </kbd>
          </h2>
          <p className="text-xs text-slate-500 mt-1.5 mb-6">
            .json, .txt, or clipboard text
          </p>

          {/* Clean Primary Actions */}
          <div className="flex items-center justify-center gap-2.5">
            <button
              onClick={onPasteClipboard}
              className="px-4 py-2 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors active:scale-95"
            >
              <ClipboardPaste size={14} />
              Paste
            </button>
            <button
              onClick={onOpenFile}
              className="px-4 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/80 font-medium text-xs flex items-center gap-1.5 transition-colors active:scale-95"
            >
              <FileUp size={14} />
              Open File
            </button>
          </div>

          {/* Quiet Secondary Links */}
          <div className="flex items-center gap-3 mt-5 text-[11px] text-slate-500">
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              className="hover:text-slate-300 transition-colors"
            >
              {showManual ? 'Hide raw input' : 'Raw input'}
            </button>
            <span className="text-slate-700">·</span>
            <button
              type="button"
              onClick={onLoadSample}
              className="hover:text-slate-300 transition-colors"
            >
              Load sample
            </button>
          </div>

          {/* Optional Manual Input */}
          {showManual && (
            <div className="w-full mt-5 text-left">
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder='{"key": "value"}'
                spellCheck={false}
                className="w-full h-40 rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500/60 resize-y custom-scrollbar"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => manualText.trim() && onSubmitManualText(manualText)}
                  disabled={!manualText.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium transition-colors"
                >
                  Parse
                </button>
              </div>
            </div>
          )}

          {/* Parse Error Report */}
          {error && (
            <div className="w-full mt-6 text-left rounded-xl bg-rose-950/35 border border-rose-500/35 p-3.5">
              <div className="flex items-center gap-2 text-rose-300 font-semibold text-xs mb-1.5">
                <AlertCircle size={14} />
                <span>Invalid JSON</span>
                {error.line !== null && (
                  <span className="ml-auto text-[11px] font-mono px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-200">
                    Ln {error.line}{error.column !== null ? `, Col ${error.column}` : ''}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-rose-200/85 mb-2.5 break-all">{error.message}</p>
              {error.snippet.length > 0 && (
                <div className="rounded-lg bg-slate-950 border border-rose-500/20 p-2.5 font-mono text-[11px] overflow-x-auto">
                  {error.snippet.map((s) => (
                    <div
                      key={s.lineNumber}
                      className={`px-1.5 py-0.5 rounded ${s.isErrorLine ? 'bg-rose-500/20 text-rose-200' : 'text-slate-400'}`}
                    >
                      <span className="inline-block w-8 text-right mr-3 text-slate-600 select-none">
                        {s.lineNumber}
                      </span>
                      <span className="whitespace-pre">{s.text}</span>
                      {s.isErrorLine && s.caretColumn !== undefined && s.caretColumn > 0 && (
                        <div className="text-rose-400 font-bold whitespace-pre">
                          {' '.repeat(11 + Math.max(0, s.caretColumn - 1))}^
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(JsonEmptyState);
