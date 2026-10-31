import React, { useRef, useEffect } from 'react';
import { AnalysisResult, AnalysisSegment } from '../../../utils/perfAnalysis';

export interface PerfMinimapProps {
    result: AnalysisResult | null;
    flameSegments: AnalysisSegment[];
    maxLane: number;
    searchTerms: string[];
    palette: string[];
    trimRange: { startTime: number; endTime: number } | null;
    flameZoom: { startTime: number; endTime: number } | null;
    applyZoom: (newZoom: { startTime: number; endTime: number } | null) => void;
    checkSegmentMatch: (s: AnalysisSegment, currentActiveTags: string[]) => boolean;
}

export const PerfMinimap: React.FC<PerfMinimapProps> = ({
    result,
    flameSegments,
    maxLane,
    searchTerms,
    palette,
    trimRange,
    flameZoom,
    applyZoom,
    checkSegmentMatch
}) => {
    const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
    const minimapRectCacheRef = useRef<DOMRect | null>(null);
    const dragCleanupRef = useRef<(() => void) | null>(null);

    // 1. Draw Static Minimap Image (only when search, bounds, or segments change)
    useEffect(() => {
        const drawMinimap = (): boolean => {
            const canvas = minimapCanvasRef.current;
            if (!canvas || !result) return false;
            const ctx = canvas.getContext('2d');
            if (!ctx) return false;

            const dpr = window.devicePixelRatio || 1;
            const rect = minimapRectCacheRef.current ?? canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                minimapRectCacheRef.current = rect;
            } else {
                return false;
            }
            const width = rect.width;
            const height = rect.height;

            const targetW = Math.round(rect.width * dpr);
            const targetH = Math.round(rect.height * dpr);
            if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            ctx.clearRect(0, 0, rect.width, rect.height);

            const totalDuration = Math.max(1, result.endTime - result.startTime);

            const miniPixelGrid = new Map<string, { x: number, yOffset: number, w: number, laneH: number, color: string, alpha: number }>();

            flameSegments.forEach(s => {
                if (s.duration === 0) return;
                const x = ((s.startTime - result.startTime) / totalDuration) * width;
                const w = (s.duration / totalDuration) * width;
                if (w < 0.05) return; // Ignore microscopic segments in minimap

                const yOffset = maxLane > 0 ? (s.lane / (maxLane + 1)) * (height - 4) : 0;
                const laneH = Math.max(2, height / (maxLane + 1));

                const isMatch = searchTerms.length > 0 && checkSegmentMatch(s, []);
                const finalOpacity = searchTerms.length > 0 ? (isMatch ? 0.8 : 0.1) : 0.8;

                if (w > 1.5 || (searchTerms.length > 0 && isMatch)) {
                    // Draw normally for visible or matched segments
                    ctx.globalAlpha = finalOpacity;
                    ctx.fillStyle = s.dangerColor || (s.duration >= (result.perfThreshold || 1000) ? '#be123c' : palette[s.lane % palette.length]);
                    ctx.fillRect(x, height - yOffset - laneH, Math.max(0.5, w), laneH);
                } else {
                    // Merge micro-segments in minimap
                    const pixX = Math.floor(x * 2) / 2; // 0.5px precision
                    const key = `${s.lane}-${pixX}`;
                    const existing = miniPixelGrid.get(key);
                    if (!existing) {
                        miniPixelGrid.set(key, {
                            x, yOffset, w, laneH,
                            color: s.dangerColor || (s.duration >= (result.perfThreshold || 1000) ? '#be123c' : palette[s.lane % palette.length]),
                            alpha: finalOpacity
                        });
                    } else {
                        existing.w = Math.max(existing.w, (x + w) - existing.x);
                    }
                }
            });

            // Draw merged minimap segments
            miniPixelGrid.forEach(m => {
                ctx.globalAlpha = m.alpha;
                ctx.fillStyle = m.color;
                ctx.fillRect(m.x, height - m.yOffset - m.laneH, Math.max(0.5, m.w), m.laneH);
            });

            ctx.globalAlpha = 1;
            return true;
        };

        let rafId: number;

        // Wait for elements to be painted before reading dimensions
        requestAnimationFrame(() => {
            const success = drawMinimap();
            if (!success) {
                // Resize Observer fallback if dimensions weren't ready
                let resizeTimer: ReturnType<typeof setTimeout> | null = null;
                const resizeObserver = new ResizeObserver(() => {
                    if (resizeTimer) clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(() => {
                        minimapRectCacheRef.current = null;
                        rafId = requestAnimationFrame(drawMinimap);
                    }, 100);
                });
                if (minimapCanvasRef.current) resizeObserver.observe(minimapCanvasRef.current);
                return () => {
                    if (resizeTimer) clearTimeout(resizeTimer);
                    resizeObserver.disconnect();
                };
            }
        });

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [result, flameSegments, maxLane, searchTerms, palette, checkSegmentMatch]);
    // Notice: zoom, scroll, trim excluded. Only static elements redraw minimap!

    if (!result || flameSegments.length === 0) return null;

    // 2. Viewport UI calculations (handled by React instantly, decoupled from heavy canvas)
    const totalDuration = Math.max(1, result.endTime - result.startTime);
    const viewStart = flameZoom?.startTime ?? result.startTime;
    const viewEnd = flameZoom?.endTime ?? result.endTime;
    const currentDuration = viewEnd - viewStart;

    const leftPercent = ((viewStart - result.startTime) / totalDuration) * 100;
    const widthPercent = (currentDuration / totalDuration) * 100;

    return (
        <div className="h-[48px] shrink-0 bg-slate-950 border-t border-white/5 relative select-none overflow-hidden shadow-inner">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent"></div>
            <div
                className="absolute inset-0 cursor-pointer"
                onMouseDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const clickFraction = Math.max(0, Math.min(1, x / rect.width));

                    let newStart = result.startTime + (clickFraction * totalDuration) - (currentDuration / 2);
                    let newEnd = newStart + currentDuration;

                    const boundStart = trimRange?.startTime ?? result.startTime;
                    const boundEnd = trimRange?.endTime ?? result.endTime;

                    if (newStart < boundStart) {
                        newStart = boundStart;
                        newEnd = newStart + currentDuration;
                    }
                    if (newEnd > boundEnd) {
                        newEnd = boundEnd;
                        newStart = newEnd - currentDuration;
                    }

                    applyZoom({ startTime: newStart, endTime: newEnd });
                }}
            >
                <canvas ref={minimapCanvasRef} className="absolute inset-0 w-full h-full" />

                {/* Viewport Overlay */}
                <div
                    className="absolute top-0 bottom-0 bg-indigo-500/10 border-x border-indigo-400 cursor-grab active:cursor-grabbing hover:bg-indigo-500/20 transition-colors z-10 shadow-[0_0_15px_rgba(99,102,241,0.2)] -[1px] group"
                    style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`
                    }}
                    onMouseDown={(e) => {
                        e.stopPropagation(); // Prevent jumping
                        const startX = e.clientX;
                        const initialStart = viewStart;
                        const initialEnd = viewEnd;
                        const containerWidth = e.currentTarget.parentElement?.clientWidth || window.innerWidth / 2;

                        let animationFrameId: number | null = null;

                        const onMove = (mv: MouseEvent) => {
                            if (animationFrameId) return;
                            animationFrameId = requestAnimationFrame(() => {
                                animationFrameId = null;
                                const deltaX = mv.clientX - startX;
                                const fractionMoved = deltaX / containerWidth;
                                const timeMoved = fractionMoved * totalDuration;

                                let newStart = initialStart + timeMoved;
                                let newEnd = initialEnd + timeMoved;

                                if (newStart < result.startTime) {
                                    newStart = result.startTime;
                                    newEnd = newStart + currentDuration;
                                }
                                if (newEnd > result.endTime) {
                                    newEnd = result.endTime;
                                    newStart = newEnd - currentDuration;
                                }

                                applyZoom({ startTime: newStart, endTime: newEnd });
                            });
                        };

                        const onUp = () => {
                            if (animationFrameId) cancelAnimationFrame(animationFrameId);
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                            dragCleanupRef.current = null;
                        };

                        dragCleanupRef.current = onUp;
                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                    }}
                >
                    {/* Left Handle */}
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-4 bg-indigo-300 dark:bg-indigo-400 rounded-sm shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    {/* Right Handle */}
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-1.5 h-4 bg-indigo-300 dark:bg-indigo-400 rounded-sm shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
            </div>
        </div>
    );
};
