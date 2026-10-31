import React, { RefObject } from 'react';
import * as Lucide from 'lucide-react';
import { AnalysisResult, AnalysisSegment } from '../../../utils/perfAnalysis';
import { formatDuration } from '../../../utils/logTime';

interface PerfDashboardHeaderBarProps {
    result: AnalysisResult | null;
    isScanningStatus: boolean;
    trimRange: { startTime: number; endTime: number } | null;
    setTrimRange: (range: { startTime: number; endTime: number } | null) => void;
    applyZoom: (zoom: { startTime: number; endTime: number } | null) => void;
    activeTags: string[];
    isFullScreen: boolean;
    multiSelectedIds: string[];
    setMultiSelectedIds: (ids: string[]) => void;
    setSelectedSegmentId: (id: string | null) => void;
    showOnlyFail: boolean;
    setShowOnlyFail: (v: boolean) => void;
    navSegments: AnalysisSegment[];
    currentNavIndex: number;
    jumpToNavSegment: (direction: -1 | 1) => void;
    searchInput: string;
    setSearchInput: (v: string) => void;
    addSearchTerm: (term: string) => void;
    removeSearchTerm: (term: string) => void;
    searchTerms: string[];
    searchRef: RefObject<HTMLInputElement>;
    viewMode: 'chart' | 'list';
    setViewMode: (v: 'chart' | 'list') => void;
    handleExportImage: () => void;
    minimized: boolean;
    setMinimized: (v: boolean) => void;
    onClose: () => void;
    perfThreshold: number;
    setPerfThreshold: (v: number) => void;
}

export const PerfDashboardHeaderBar: React.FC<PerfDashboardHeaderBarProps> = ({
    result, isScanningStatus,
    trimRange, setTrimRange, applyZoom,
    activeTags, isFullScreen,
    multiSelectedIds, setMultiSelectedIds, setSelectedSegmentId,
    showOnlyFail, setShowOnlyFail,
    navSegments, currentNavIndex, jumpToNavSegment,
    searchInput, setSearchInput, addSearchTerm, removeSearchTerm, searchTerms, searchRef,
    viewMode, setViewMode, handleExportImage,
    minimized, setMinimized, onClose,
    perfThreshold, setPerfThreshold
}) => (
    <div className="h-10 shrink-0 flex items-center justify-between px-4 bg-slate-900 border-b border-white/5 select-none">
        {/* Left: Title & Info */}
        <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 ${isScanningStatus ? 'animate-pulse text-indigo-400' : 'text-slate-400'}`}>
                <Lucide.LayoutDashboard size={14} />
                <span className="text-xs font-bold uppercase tracking-wider">Performance Dashboard</span>
            </div>
            {result && (
                <>
                    <div className="h-3 w-px bg-slate-700 mx-1" />
                    <span className="text-[10px] text-slate-500 font-mono">
                        {result.totalDuration.toLocaleString()}ms • {result.segments.length} segments • Limit: {perfThreshold}ms
                    </span>
                </>
            )}
            {trimRange && (
                <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
                    <Lucide.Scissors size={9} className="text-amber-400" />
                    <span className="text-[9px] font-bold text-amber-400 font-mono">
                        TRIMMED {formatDuration(trimRange.endTime - trimRange.startTime)}
                    </span>
                    <button onClick={() => { setTrimRange(null); applyZoom(null); }} className="ml-0.5 text-amber-500 hover:text-white transition-colors" title="Reset Trim">
                        <Lucide.X size={9} />
                    </button>
                </div>
            )}
            {activeTags.length > 0 && (
                <div className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/30 rounded-full px-2 py-0.5">
                    <Lucide.Tag size={9} className="text-purple-400" />
                    <span className="text-[9px] font-bold text-purple-400">
                        {activeTags.length} TAG{activeTags.length > 1 ? 'S' : ''}
                    </span>
                </div>
            )}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1">
            {!isFullScreen && result && (
                <div className="flex items-center gap-1.5 bg-slate-950/40  rounded-xl p-1 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                    <div className="flex items-center gap-0.5">
                        <button
                            onClick={() => {
                                if (!result) return;
                                if (multiSelectedIds.length > 0) {
                                    setMultiSelectedIds([]);
                                } else {
                                    setSelectedSegmentId(null);
                                    const failIds = result.segments
                                        .filter(s => s.duration >= perfThreshold)
                                        .map(s => s.id);
                                    setMultiSelectedIds(failIds);
                                }
                            }}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-black uppercase transition-all duration-300 border ${multiSelectedIds.length > 0 ? 'bg-rose-500 text-white border-rose-400' : 'bg-white/5 text-slate-500 border-white/5 hover:bg-white/10 hover:text-slate-300'}`}
                            title="All Fails"
                        >
                            <Lucide.AlertCircle size={10} className={multiSelectedIds.length > 0 ? 'animate-pulse' : ''} />
                            <span className="text-[8px] leading-none">ALL</span>
                        </button>
                        <button
                            onClick={() => setShowOnlyFail(!showOnlyFail)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-black uppercase transition-all duration-300 border ${showOnlyFail ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-white/5 text-slate-500 border-white/5 hover:bg-white/10 hover:text-slate-300'}`}
                            title="Fail Only"
                        >
                            <Lucide.Filter size={10} />
                            <span className="text-[8px] leading-none">FAIL</span>
                        </button>
                    </div>
                    <div className="w-px h-4 bg-white/10 mx-0.5" />
                    <div className="flex items-center gap-0.5 bg-black/30 rounded-lg px-1.5 py-0.5 border border-white/5">
                        <button onClick={() => jumpToNavSegment(-1)} className={`p-0.5 transition-all ${navSegments.length > 0 ? 'hover:text-indigo-400 text-slate-500' : 'text-slate-800 cursor-not-allowed'}`} disabled={navSegments.length === 0}>
                            <Lucide.ChevronLeft size={12} />
                        </button>
                        <span className={`text-[9px] font-mono font-black min-w-[24px] text-center ${navSegments.length > 0 ? 'text-white' : 'text-slate-600'}`}>
                            {navSegments.length > 0 ? (currentNavIndex >= 0 ? currentNavIndex + 1 : '-') : '0'}
                            <span className="opacity-40 mx-0.5">/</span>
                            <span className="opacity-60">{navSegments.length}</span>
                        </span>
                        <button onClick={() => jumpToNavSegment(1)} className={`p-0.5 transition-all ${navSegments.length > 0 ? 'hover:text-indigo-400 text-slate-500' : 'text-slate-800 cursor-not-allowed'}`} disabled={navSegments.length === 0}>
                            <Lucide.ChevronRight size={12} />
                        </button>
                    </div>
                    <div className="w-px h-4 bg-white/10 mx-0.5" />
                    <div className="flex items-center bg-black/20 rounded-lg border border-white/10 px-2 py-1 focus-within:border-indigo-500/50 transition-colors">
                        <Lucide.Search size={10} className="text-slate-500 mr-1.5" />
                        <input
                            ref={searchRef}
                            type="text"
                            placeholder="Search..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="bg-transparent text-[9px] text-white w-20 focus:outline-none placeholder:text-slate-600 font-mono"
                        />
                    </div>
                    <div className="w-px h-4 bg-white/10 mx-0.5" />
                    <div className="flex p-0.5 bg-slate-950 rounded-lg border border-white/5 gap-0.5">
                        <button onClick={() => setViewMode('chart')} className={`p-1.5 rounded-md transition-all ${viewMode === 'chart' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-400'}`} title="Chart View">
                            <Lucide.Activity size={12} />
                        </button>
                        <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-400'}`} title="Bottlenecks List">
                            <Lucide.AlignLeft size={12} />
                        </button>
                        <div className="w-px h-3 bg-white/10 mx-0.5" />
                        <button onClick={handleExportImage} className="p-1.5 rounded-md transition-all text-slate-500 hover:text-emerald-400 hover:bg-emerald-400/10" title="Export as Image">
                            <Lucide.Camera size={12} />
                        </button>
                    </div>
                </div>
            )}
            <button onClick={() => setMinimized(!minimized)} className="p-1.5 hover:bg-white/10 rounded-md text-slate-400 transition-colors">
                {minimized ? <Lucide.ChevronDown size={14} /> : <Lucide.ChevronUp size={14} />}
            </button>
            {!isFullScreen && (
                <button onClick={onClose} className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-md text-slate-400 transition-colors">
                    <Lucide.X size={14} />
                </button>
            )}
        </div>
    </div>
);
