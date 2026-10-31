import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { LogHighlight } from '../types';
import { HighlightRenderer } from './LogViewer/HighlightRenderer';
import { extractTimestamp, formatDuration } from '../utils/logTime';
import { convertToConfluenceTable } from '../utils/confluenceUtils';
import { Copy, FileJson, Download, Table, ChevronDown, X, Trash2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Virtuoso } from 'react-virtuoso';

interface BookmarksModalProps {
    isOpen: boolean;
    onClose: () => void;
    requestLines: (indices: number[]) => Promise<{ lineNum: number, content: string, formattedLineIndex: number }[]>;
    bookmarks: Set<number>;
    onJump: (index: number) => void;
    onSelectRange?: (start: number, end: number) => void;
    highlights?: LogHighlight[];
    caseSensitive?: boolean;
    title?: string;
    onClearAll?: () => void;
    onDeleteBookmark?: (index: number) => void;
}

interface BookmarkLine {
    lineNum: number;
    content: string;
    formattedLineIndex: number;
    originalLineNum?: string;
    timeDiffStr?: string;
    timeDiffClass?: string;
    accumulatedTimeStr?: string;
    accumulatedTimeClass?: string;
}

export const BookmarksModal: React.FC<BookmarksModalProps> = React.memo(({
    isOpen, onClose, requestLines, bookmarks, onJump, highlights, caseSensitive, title = "Bookmarks",
    onClearAll, onDeleteBookmark, onSelectRange
}) => {
    const [lines, setLines] = useState<BookmarkLine[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [shiftAnchorIdx, setShiftAnchorIdx] = useState<number | null>(null);
    const [shiftEndIdx, setShiftEndIdx] = useState<number | null>(null);
    const { addToast } = useToast();

    // Reset shift selection when modal opens/closes or bookmarks change
    useEffect(() => {
        setShiftAnchorIdx(null);
        setShiftEndIdx(null);
    }, [isOpen, bookmarks]);

    // Export Dropdown State
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const exportMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
                setIsExportMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isExportMenuOpen) setIsExportMenuOpen(false);
                else if (isOpen) onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, isExportMenuOpen]);

    useEffect(() => {
        if (isOpen && bookmarks.size > 0) {
            setIsLoading(true);
            const indices = Array.from(bookmarks).sort((a, b) => a - b);
            requestLines(indices).then(fetched => {
                if (!fetched) {
                    setLines([]);
                    setIsLoading(false);
                    return;
                }

                // ✅ 전처리: 렌더링 루프 밖에서 미리 모든 계산을 끝냅니다.
                const firstTs = fetched.length > 0 ? extractTimestamp(fetched[0].content) : null;

                const processedLines: BookmarkLine[] = fetched.map((item, idx) => {
                    let timeDiffStr = "";
                    let timeDiffClass = "";
                    let accumulatedTimeStr = "";
                    let accumulatedTimeClass = "text-slate-400 dark:text-slate-500";

                    const currentTs = extractTimestamp(item.content);

                    if (idx > 0) {
                        const prevItem = fetched[idx - 1];
                        const prevTs = extractTimestamp(prevItem.content);

                        if (currentTs !== null && prevTs !== null) {
                            const diff = currentTs - prevTs;
                            const absDiff = Math.abs(diff);
                            const sign = diff >= 0 ? "+" : "-";
                            let text = absDiff < 60000 ? (absDiff / 1000).toFixed(3) + "s" : formatDuration(absDiff);

                            if (absDiff >= 1000) {
                                timeDiffClass = "text-orange-600 dark:text-orange-400 font-bold";
                            } else if (absDiff >= 100) {
                                timeDiffClass = "text-blue-600 dark:text-blue-400 font-semibold";
                            } else {
                                timeDiffClass = "text-slate-400 dark:text-slate-500";
                            }
                            timeDiffStr = `${sign}${text}`;
                        }
                    } else if (idx === 0) {
                        accumulatedTimeStr = "0.000s";
                        accumulatedTimeClass = "text-slate-400 dark:text-slate-500 font-bold";
                    }

                    if (idx > 0 && firstTs !== null && currentTs !== null) {
                        const accDiff = currentTs - firstTs;
                        const absAccDiff = Math.abs(accDiff);
                        const accSign = accDiff >= 0 ? "" : "-";
                        let accText = absAccDiff < 60000 ? (absAccDiff / 1000).toFixed(3) + "s" : formatDuration(absAccDiff);
                        accumulatedTimeStr = `${accSign}${accText}`;
                        accumulatedTimeClass = "text-emerald-600 dark:text-emerald-400 font-medium";
                    }

                    return {
                        ...item,
                        timeDiffStr,
                        timeDiffClass,
                        accumulatedTimeStr,
                        accumulatedTimeClass
                    };
                });

                setLines(processedLines);
                setIsLoading(false);
            });
        } else {
            setLines([]);
        }
    }, [isOpen, bookmarks, requestLines]);

    const handleExport = async (format: 'json' | 'confluence' | 'download_json') => {
        if (lines.length === 0) {
            addToast('No bookmarks to export', 'error');
            return;
        }

        const data = lines.map((line, idx) => {
            // Calculate Time Diff
            let timeDiff = '';
            if (idx > 0) {
                const prev = lines[idx - 1];
                const currTs = extractTimestamp(line.content);
                const prevTs = extractTimestamp(prev.content);
                if (currTs !== null && prevTs !== null) {
                    const diff = currTs - prevTs;
                    timeDiff = (diff >= 0 ? '+' : '-') + (Math.abs(diff) < 60000 ? (Math.abs(diff) / 1000).toFixed(3) + 's' : formatDuration(Math.abs(diff)));
                }
            }
            
            let accumulatedTime = '';
            if (lines.length > 0) {
                const firstTs = extractTimestamp(lines[0].content);
                const currTs = extractTimestamp(line.content);
                if (firstTs !== null && currTs !== null) {
                    const accDiff = currTs - firstTs;
                    accumulatedTime = (accDiff >= 0 ? '' : '-') + (Math.abs(accDiff) < 60000 ? (Math.abs(accDiff) / 1000).toFixed(3) + 's' : formatDuration(Math.abs(accDiff)));
                }
            }

            return {
                line: line.originalLineNum || line.lineNum,
                content: line.content,
                timeDiff,
                accumulatedTime
            };
        });

        if (format === 'json' || format === 'download_json') {
            const jsonStr = JSON.stringify(data, null, 2);

            if (format === 'download_json') {
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `bookmarks_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                addToast('Bookmarks downloaded as JSON', 'success');
            } else {
                await navigator.clipboard.writeText(jsonStr);
                addToast('Bookmarks copied to clipboard as JSON', 'success');
            }
        } else if (format === 'confluence') {
            const confluenceTable = convertToConfluenceTable(lines.map(l => ({ 
                lineNum: l.originalLineNum || l.lineNum, 
                content: l.content,
                timeDiff: l.timeDiffStr,
                accTime: l.accumulatedTimeStr
            })));
            await navigator.clipboard.writeText(confluenceTable);
            addToast('Bookmarks copied as Confluence Table', 'success');
        }

        setIsExportMenuOpen(false);
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={onClose}>
            <div
                className="bg-white dark:bg-slate-900 w-[1400px] h-[600px] rounded-lg shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-150"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="h-12 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 bg-slate-50 dark:bg-slate-950/50">
                    <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="text-yellow-500">★</span>
                        {title}
                        <span className="text-xs font-normal text-slate-400 ml-2">({bookmarks.size} lines)</span>
                    </h2>
                    <div className="flex items-center gap-2">
                        {/* Export Dropdown */}
                        <div className="relative" ref={exportMenuRef}>
                            <button
                                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-2"
                            >
                                <Download size={14} />
                                Export
                                <ChevronDown size={12} className={`transition-transform duration-200 ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isExportMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                                    <button
                                        onClick={() => handleExport('json')}
                                        className="w-full text-left px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                                    >
                                        <Copy size={14} className="text-slate-400" /> Copy as JSON
                                    </button>
                                    <button
                                        onClick={() => handleExport('confluence')}
                                        className="w-full text-left px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                                    >
                                        <Table size={14} className="text-blue-400" /> Copy as Confluence Table
                                    </button>
                                    <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                                    <button
                                        onClick={() => handleExport('download_json')}
                                        className="w-full text-left px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                                    >
                                        <FileJson size={14} className="text-amber-400" /> Download JSON
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

                        {onClearAll && bookmarks.size > 0 && (
                            <button
                                onClick={onClearAll}
                                className="px-2 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 rounded transition-colors flex items-center gap-1"
                                title="Clear all bookmarks"
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Clear All
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-500 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden bg-white dark:bg-slate-900">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full text-slate-400">
                            Loading bookmarks...
                        </div>
                    ) : lines.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                            <span className="text-2xl opacity-50">★</span>
                            <p>No bookmarks found.</p>
                            <p className="text-sm opacity-70">Double-click the line number column to bookmark lines.</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-950/30 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                                <div className="w-16 shrink-0 py-1 px-3 text-right border-r border-slate-200 dark:border-slate-800">Line</div>
                                <div className="w-28 shrink-0 py-1 px-3 text-right border-r border-slate-200 dark:border-slate-800">Time Diff</div>
                                <div className="w-28 shrink-0 py-1 px-3 text-right border-r border-slate-200 dark:border-slate-800">Acc. Time</div>
                                <div className="flex-1 py-1 px-3">Content</div>
                            </div>
                            <Virtuoso
                                style={{ height: 'calc(100% - 20px)' }}
                                data={lines}
                                itemContent={(index, item) => (
                                    <BookmarkRow
                                        key={item.formattedLineIndex}
                                        item={item}
                                        onJump={onJump}
                                        onShiftClick={(idx) => {
                                            if (shiftAnchorIdx === null || (shiftAnchorIdx !== null && shiftEndIdx !== null)) {
                                                // Start new selection or reset previous (1st click)
                                                setShiftAnchorIdx(idx);
                                                setShiftEndIdx(null);
                                            } else {
                                                // Complete range (2nd click)
                                                setShiftEndIdx(idx);
                                                if (onSelectRange) {
                                                    onSelectRange(shiftAnchorIdx, idx);
                                                }
                                                // ✅ Do NOT call onClose() here as requested
                                            }
                                        }}
                                        shiftAnchorIdx={shiftAnchorIdx}
                                        shiftEndIdx={shiftEndIdx}
                                        onClose={onClose}
                                        onDelete={onDeleteBookmark}
                                        highlights={highlights}
                                        caseSensitive={caseSensitive}
                                    />
                                )}
                            />
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="h-10 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 px-4 flex items-center justify-end text-xs text-slate-500 gap-4">
                    <div>
                        Click a line to jump to it
                    </div>
                    <button onClick={onClose} className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
});

// ✅ 북마크 개별 행 컴포넌트 메모이제이션
const BookmarkRow: React.FC<{
    item: BookmarkLine;
    onJump: (index: number) => void;
    onShiftClick: (index: number) => void;
    shiftAnchorIdx: number | null;
    shiftEndIdx: number | null;
    onClose: () => void;
    onDelete?: (index: number) => void;
    highlights?: LogHighlight[];
    caseSensitive?: boolean;
}> = React.memo(({ item, onJump, onShiftClick, shiftAnchorIdx, shiftEndIdx, onClose, onDelete, highlights, caseSensitive }) => {
    
    // ✅ Calculate if current row is part of the shift-selection range
    const isHighlighted = useMemo(() => {
        if (shiftAnchorIdx === null) return false;
        
        const current = item.formattedLineIndex;
        if (shiftEndIdx === null) {
            return current === shiftAnchorIdx;
        }
        
        const start = Math.min(shiftAnchorIdx, shiftEndIdx);
        const end = Math.max(shiftAnchorIdx, shiftEndIdx);
        return current >= start && current <= end;
    }, [item.formattedLineIndex, shiftAnchorIdx, shiftEndIdx]);

    return (
        <div
            onMouseDown={(e) => {
                if (e.shiftKey) {
                    e.preventDefault(); // ✅ Shift+클릭 시 텍스트 선택 방지
                }
            }}
            onClick={(e) => {
                if (e.shiftKey) {
                    onShiftClick(item.formattedLineIndex);
                } else {
                    onJump(item.formattedLineIndex);
                    onClose();
                }
            }}
            className={`group flex cursor-pointer border-b border-slate-100 dark:border-slate-800 transition-colors ${
                isHighlighted 
                ? "bg-blue-100/60 dark:bg-blue-900/40 ring-1 ring-inset ring-blue-500/50" 
                : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
            }`}
        >
            {/* Line Number */}
            <div className="w-16 shrink-0 py-2 px-3 text-right font-mono text-xs text-slate-400 border-r border-slate-100 dark:border-slate-800 group-hover:text-yellow-600 dark:group-hover:text-yellow-500">
                {item.originalLineNum || item.lineNum}
            </div>

            {/* Time Diff Column */}
            <div className={`w-28 shrink-0 py-2 px-3 text-right font-mono text-[11px] border-r border-slate-100 dark:border-slate-800 whitespace-nowrap overflow-hidden text-ellipsis ${item.timeDiffStr ? (item.timeDiffClass || 'text-slate-500 dark:text-slate-400') : 'text-transparent'}`}>
                {item.timeDiffStr || "-"}
            </div>

            {/* Accumulated Time Column */}
            <div className={`w-28 shrink-0 py-2 px-3 text-right font-mono text-[11px] border-r border-slate-100 dark:border-slate-800 whitespace-nowrap overflow-hidden text-ellipsis ${item.accumulatedTimeStr ? (item.accumulatedTimeClass || 'text-slate-500 dark:text-slate-400') : 'text-transparent'}`}>
                {item.accumulatedTimeStr || "-"}
            </div>

            {/* Content */}
            <div className="flex-1 py-1 px-3 font-mono text-xs text-slate-700 dark:text-slate-300 break-all whitespace-pre-wrap overflow-hidden">
                <HighlightRenderer text={item.content} highlights={highlights} caseSensitive={caseSensitive} />
            </div>

            {/* Delete Action */}
            {onDelete && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.formattedLineIndex);
                    }}
                    className="w-8 shrink-0 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all opacity-0 group-hover:opacity-100"
                    title="Remove bookmark"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
});
