import React from 'react';
import * as Lucide from 'lucide-react';
import LogViewerPane, { LogViewerHandle } from './LogViewerPane';
import { MAX_SEGMENT_SIZE } from '../../hooks/useLogExtractorLogic';
import { EntityChipBar } from './EntityChipBar';

const { X, ChevronsUpDown } = Lucide;

interface RawContextViewerProps {
    sourcePane: 'left' | 'right';
    leftFileName: string;
    rightFileName: string;
    targetLine: { lineNum: number; content: string; formattedLineIndex?: number | string };
    onClose: () => void;
    heightPercent: number;
    onResizeStart: (e: React.MouseEvent) => void;
    leftTotalLines: number;
    rightTotalLines: number;
    requestLeftRawLines: (start: number, count: number) => Promise<any>;
    requestRightRawLines: (start: number, count: number) => Promise<any>;
    highlightCaseSensitive?: boolean;
    preferences?: any;
    highlightRange?: { start: number; end: number } | null;
    clearCacheTick?: number;
    onApplyFilter?: (value: string) => void;
    onAddHighlight?: (value: string) => void;
}

export const RawContextViewer: React.FC<RawContextViewerProps> = ({
    sourcePane, leftFileName, rightFileName, targetLine, onClose, heightPercent, onResizeStart,
    leftTotalLines, rightTotalLines, requestLeftRawLines, requestRightRawLines, preferences,
    highlightRange,
    clearCacheTick,
    onApplyFilter,
    onAddHighlight
}) => {
    const rawViewerRef = React.useRef<LogViewerHandle>(null);
    const rawTotalLines = sourcePane === 'left' ? leftTotalLines : rightTotalLines;
    const rawTargetLineIndex = targetLine.lineNum - 1;
    const rawSegmentIndex = Math.floor(rawTargetLineIndex / MAX_SEGMENT_SIZE);
    const rawSegmentOffset = rawSegmentIndex * MAX_SEGMENT_SIZE;
    const rawSegmentLength = Math.min(MAX_SEGMENT_SIZE, Math.max(0, rawTotalLines - rawSegmentOffset));

    const handleRawScrollRequest = React.useCallback((start: number, count: number) => {
        const globalStart = start + rawSegmentOffset;
        const fn = sourcePane === 'left' ? requestLeftRawLines : requestRightRawLines;
        return fn(globalStart, count);
    }, [rawSegmentOffset, sourcePane, requestLeftRawLines, requestRightRawLines]);

    return (
        <div className="fixed left-0 right-0 top-[65px] bottom-0 z-[99999] flex flex-col pointer-events-none no-drag">
            <div className="flex flex-col bg-slate-950 pointer-events-auto border-b-2 border-indigo-500 shadow-2xl relative overflow-hidden" style={{ height: `${heightPercent}%` }}>
                <div className="bg-indigo-950/80 px-4 py-1 flex justify-between items-center border-b border-indigo-500/30 shrink-0 z-10 no-drag">
                    <span className="text-xs font-bold text-indigo-300">
                        Raw View ({sourcePane === 'left' ? leftFileName : rightFileName})
                        <span className="mx-2 opacity-50">|</span>
                        Original Line: <span className="text-white">{targetLine.lineNum}</span>
                        <span className="mx-2 opacity-50">|</span>
                        Filtered Row: <span className="text-yellow-400">#{targetLine.formattedLineIndex ?? '?'}</span>
                    </span>
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('[RawContextViewer] onClose triggered (Click)');
                            onClose();
                        }}
                        className="p-2 mr-4 text-indigo-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer no-drag active:scale-90"
                        title="Close Raw View"
                        type="button"
                    >
                        <X size={18} />
                    </button>
                </div>
                {onApplyFilter && onAddHighlight && (
                    <EntityChipBar
                        logLineContent={targetLine.content}
                        onApplyFilter={onApplyFilter}
                        onAddHighlight={onAddHighlight}
                    />
                )}
                <LogViewerPane
                    key={`raw-${sourcePane}-${rawTargetLineIndex}`}
                    ref={rawViewerRef}
                    workerReady={true}
                    totalMatches={rawSegmentLength}
                    onScrollRequest={handleRawScrollRequest}
                    absoluteOffset={rawSegmentOffset}
                    placeholderText=""
                    isRawMode={true}
                    activeLineIndex={rawTargetLineIndex}
                    initialScrollIndex={rawTargetLineIndex}
                    isActive={true} // Raw View is an modal-like overlay, usually only active when visible
                    preferences={preferences}
                    lineHighlightRanges={highlightRange ? [{
                        start: highlightRange.start - 1,
                        end: highlightRange.end - 1,
                        color: 'rgba(99, 102, 241, 0.3)'
                    }] : []}
                    clearCacheTick={clearCacheTick}
                />
                {/* Resizer Handle (Bottom) - Refined Pill Design */}
                <div
                    className="absolute -bottom-3.5 left-0 right-0 h-5 cursor-ns-resize z-[100] flex justify-end px-12 group/resizer"
                    onMouseDown={onResizeStart}
                >
                    <div className="w-14 h-4 bg-gradient-to-b from-indigo-500 to-indigo-700 rounded-b-xl flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.6)] border-x border-b border-white/20 group-hover/resizer:h-5 group-hover/resizer:from-indigo-400 group-hover/resizer:to-indigo-600 transition-all duration-200 origin-top">
                        <ChevronsUpDown size={11} className="text-white/90 animate-pulse pointer-events-none" />
                    </div>
                </div>
            </div>
        </div >
    );
};
