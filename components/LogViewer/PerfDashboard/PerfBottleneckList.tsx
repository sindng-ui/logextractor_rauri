import React from 'react';
import * as Lucide from 'lucide-react';
import { AnalysisResult, AnalysisSegment } from '../../../utils/perfAnalysis';

export interface PerfBottleneckListProps {
    result: AnalysisResult;
    showOnlyFail: boolean;
    searchTerms: string[];
    checkSegmentMatch: (s: AnalysisSegment, currentActiveTags: string[]) => boolean;
    selectedSegmentId: string | null;
    setSelectedSegmentId: (id: string | null) => void;
    setMultiSelectedIds: (ids: string[]) => void;
    onJumpToRange?: (start: number, end: number) => void;
    onViewRawRange?: (originalStart: number, originalEnd: number, filteredIndex?: number) => void;
    perfThreshold: number;
}

export const PerfBottleneckList: React.FC<PerfBottleneckListProps> = ({
    result,
    showOnlyFail,
    searchTerms,
    checkSegmentMatch,
    selectedSegmentId,
    setSelectedSegmentId,
    setMultiSelectedIds,
    onJumpToRange,
    onViewRawRange,
    perfThreshold
}) => {
    return (
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-900 shadow-sm z-10">
                    <tr>
                        <th className="p-2 text-[9px] font-black uppercase text-slate-300 tracking-wider">Status</th>
                        <th className="p-2 text-[9px] font-black uppercase text-slate-300 tracking-wider">Name</th>
                        <th className="p-2 text-[9px] font-black uppercase text-slate-300 tracking-wider text-right">Duration</th>
                        <th className="p-2 text-[9px] font-black uppercase text-slate-300 tracking-wider text-right">Start</th>
                    </tr>
                </thead>
                <tbody>
                    {[...result.segments].filter(s => !showOnlyFail || s.duration >= perfThreshold).sort((a, b) => b.duration - a.duration).slice(0, 200)
                        .filter(s => checkSegmentMatch(s, []))
                        .map(s => {
                            const isGroup = s.id.startsWith('group-');
                            const isInterval = s.id.startsWith('interval-');
                            const isBottleneck = s.duration >= perfThreshold;

                            return (
                                <tr
                                    key={s.id}
                                    onClick={() => {
                                        setSelectedSegmentId(s.id);
                                        setMultiSelectedIds([]);
                                        onJumpToRange?.(s.startLine, s.endLine);
                                    }}
                                    onDoubleClick={() => {
                                        onViewRawRange?.(s.originalStartLine || s.startLine, s.originalEndLine || s.endLine, s.startLine + 1);
                                    }}
                                    className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${selectedSegmentId === s.id ? 'bg-indigo-500/10' : ''} ${isInterval ? 'opacity-60' : ''}`}
                                >
                                    <td className="p-2">
                                        <div className={`w-1.5 h-1.5 rounded-full ${isBottleneck ? 'bg-rose-500' : 'bg-emerald-500'} ${isGroup ? 'ring-2 ring-emerald-500/50' : ''}`}
                                            style={{ backgroundColor: s.dangerColor || undefined }} />
                                    </td>
                                    <td className={`p-2 text-[10px] font-medium max-w-[350px] ${isGroup ? 'text-white font-bold' : 'text-slate-200'}`}>
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-white font-bold" title={s.name}>{s.name}</span>
                                                {isGroup && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1 rounded font-black">GROUP</span>}
                                            </div>
                                            <div className="text-[10px] text-slate-300 font-mono truncate flex items-center gap-1 mt-0.5">
                                                <div className="flex items-center gap-1">
                                                    {s.fileName && <span className="text-indigo-300 font-bold">{s.fileName}</span>}
                                                    {s.fileName && s.functionName && <span className="text-slate-500">:</span>}
                                                    {s.functionName && <span className="text-emerald-400 font-bold">{s.functionName}</span>}
                                                </div>
                                                {((s.fileName !== s.endFileName) || (s.functionName !== s.endFunctionName)) && (
                                                    <>
                                                        <Lucide.MoveRight size={10} className="text-slate-500" />
                                                        <div className="flex items-center gap-1">
                                                            {s.endFileName && <span className="text-purple-300 font-bold">{s.endFileName}</span>}
                                                            {s.endFileName && s.endFunctionName && <span className="text-slate-500">:</span>}
                                                            {s.endFunctionName && <span className="text-pink-400 font-bold">{s.endFunctionName}</span>}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className={`p-2 text-[10px] font-mono font-bold text-right ${isBottleneck ? 'text-rose-400' : 'text-slate-300'}`}
                                        style={{ color: s.dangerColor || undefined }}>
                                        {s.duration}ms
                                    </td>
                                    <td className="p-2 text-[10px] font-mono text-slate-300 text-right font-black">
                                        L{(s.originalStartLine || s.startLine) === (s.originalEndLine || s.endLine) ? (s.originalStartLine || s.startLine) : `${(s.originalStartLine || s.startLine)}-${(s.originalEndLine || s.endLine)}`}
                                    </td>
                                </tr>
                            );
                        })}
                </tbody>
            </table>
        </div>
    );
};
