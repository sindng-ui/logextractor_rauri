import React from 'react';
import * as Lucide from 'lucide-react';
import LogViewerPane, { LogViewerHandle } from './LogViewerPane';
import { MAX_SEGMENT_SIZE } from '../../hooks/useLogExtractorLogic';

const { X, GripVertical, ChevronsUpDown } = Lucide;

interface SplitRawContextViewerProps {
    leftFileName: string;
    rightFileName: string;
    leftTargetLine: { lineNum: number; content: string; formattedLineIndex?: number | string };
    rightTargetLine: { lineNum: number; content: string; formattedLineIndex?: number | string };
    onClose: () => void;
    heightPercent: number;
    onResizeStart: (e: React.MouseEvent) => void;
    leftTotalLines: number;
    rightTotalLines: number;
    requestLeftRawLines: (start: number, count: number) => Promise<any>;
    requestRightRawLines: (start: number, count: number) => Promise<any>;
    preferences?: any;
    leftHighlightRange?: { start: number; end: number } | null;
    rightHighlightRange?: { start: number; end: number } | null;
    clearCacheTick?: number;
}

export const SplitRawContextViewer: React.FC<SplitRawContextViewerProps> = ({
    leftFileName, rightFileName, leftTargetLine, rightTargetLine, onClose, heightPercent, onResizeStart,
    leftTotalLines, rightTotalLines, requestLeftRawLines, requestRightRawLines, preferences,
    leftHighlightRange, rightHighlightRange,
    clearCacheTick
}) => {
    const leftRawViewerRef = React.useRef<LogViewerHandle>(null);
    const rightRawViewerRef = React.useRef<LogViewerHandle>(null);

    // ESC to Close
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Left Calc
    const leftTargetIndex = leftTargetLine.lineNum - 1;
    const leftSegIdx = Math.floor(leftTargetIndex / MAX_SEGMENT_SIZE);
    const leftSegOffset = leftSegIdx * MAX_SEGMENT_SIZE;
    const leftSegLen = Math.min(MAX_SEGMENT_SIZE, Math.max(0, leftTotalLines - leftSegOffset));

    // Right Calc
    const rightTargetIndex = rightTargetLine.lineNum - 1;
    const rightSegIdx = Math.floor(rightTargetIndex / MAX_SEGMENT_SIZE);
    const rightSegOffset = rightSegIdx * MAX_SEGMENT_SIZE;
    const rightSegLen = Math.min(MAX_SEGMENT_SIZE, Math.max(0, rightTotalLines - rightSegOffset));

    const handleLeftScrollRequest = React.useCallback((start: number, count: number) => {
        return requestLeftRawLines(start + leftSegOffset, count);
    }, [leftSegOffset, requestLeftRawLines]);

    const handleRightScrollRequest = React.useCallback((start: number, count: number) => {
        return requestRightRawLines(start + rightSegOffset, count);
    }, [rightSegOffset, requestRightRawLines]);

    return (
        <div className="fixed left-0 right-0 top-[65px] bottom-0 z-[99999] flex flex-col pointer-events-none no-drag">
            <div className="flex flex-col bg-slate-950 pointer-events-auto border-b-2 border-indigo-500 shadow-2xl relative overflow-hidden" style={{ height: `${heightPercent}%` }}>
                <div className="bg-indigo-950/80 px-4 py-1 flex justify-between items-center border-b border-indigo-500/30 shrink-0 z-10 no-drag">
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">Split Raw View</span>
                        <div className="h-4 w-px bg-indigo-500/30" />
                        <span className="text-[10px] text-indigo-400 font-medium">
                            Left: {leftFileName} (#{leftTargetLine.lineNum})
                            <span className="mx-2 opacity-30">|</span>
                            Right: {rightFileName} (#{rightTargetLine.lineNum})
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-indigo-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 flex min-h-0 overflow-hidden">
                    {/* Left Pane */}
                    <div className="flex-1 flex flex-col min-w-0 border-r border-indigo-500/20">
                        <LogViewerPane
                            key={`split-raw-left-${leftTargetIndex}`}
                            ref={leftRawViewerRef}
                            workerReady={true}
                            totalMatches={leftSegLen}
                            onScrollRequest={handleLeftScrollRequest}
                            absoluteOffset={leftSegOffset}
                            placeholderText=""
                            isRawMode={true}
                            activeLineIndex={leftTargetIndex}
                            initialScrollIndex={leftTargetIndex}
                            isActive={true}
                            preferences={preferences}
                            lineHighlightRanges={leftHighlightRange ? [{
                                start: leftHighlightRange.start - 1,
                                end: leftHighlightRange.end - 1,
                                color: 'rgba(99, 102, 241, 0.3)'
                            }] : []}
                            clearCacheTick={clearCacheTick}
                        />
                    </div>

                    {/* Right Pane */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <LogViewerPane
                            key={`split-raw-right-${rightTargetIndex}`}
                            ref={rightRawViewerRef}
                            workerReady={true}
                            totalMatches={rightSegLen}
                            onScrollRequest={handleRightScrollRequest}
                            absoluteOffset={rightSegOffset}
                            placeholderText=""
                            isRawMode={true}
                            activeLineIndex={rightTargetIndex}
                            initialScrollIndex={rightTargetIndex}
                            isActive={true}
                            preferences={preferences}
                            lineHighlightRanges={rightHighlightRange ? [{
                                start: rightHighlightRange.start - 1,
                                end: rightHighlightRange.end - 1,
                                color: 'rgba(99, 102, 241, 0.3)'
                            }] : []}
                            clearCacheTick={clearCacheTick}
                        />
                    </div>
                </div>

                {/* Resizer Handle */}
                <div
                    className="absolute -bottom-3.5 left-0 right-0 h-5 cursor-ns-resize z-[100] flex justify-end px-12 group/resizer"
                    onMouseDown={onResizeStart}
                >
                    <div className="w-14 h-4 bg-gradient-to-b from-indigo-500 to-indigo-700 rounded-b-xl flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.6)] border-x border-b border-white/20 group-hover/resizer:h-5 group-hover/resizer:from-indigo-400 group-hover/resizer:to-indigo-600 transition-all duration-200 origin-top">
                        <ChevronsUpDown size={11} className="text-white/90 animate-pulse pointer-events-none" />
                    </div>
                </div>
            </div>
        </div>
    );
};
