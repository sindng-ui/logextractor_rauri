import React, { useState, useEffect, useRef } from 'react';
import * as Lucide from 'lucide-react';

const { Activity, Cpu, MemoryStick, X, Minimize2 } = Lucide;

interface PerformanceMetrics {
    fps: number;
    memoryUsage: number; // MB
    renderCount: number;
    lastRenderTime: number;
}

interface PerformanceMonitorProps {
    enabled?: boolean;
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({ enabled = true }) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const [metrics, setMetrics] = useState<PerformanceMetrics>({
        fps: 60,
        memoryUsage: 0,
        renderCount: 0,
        lastRenderTime: 0
    });

    const frameCountRef = useRef(0);
    const lastFrameTimeRef = useRef(performance.now());
    const renderCountRef = useRef(0);
    const fpsHistoryRef = useRef<number[]>([]);

    useEffect(() => {
        if (!enabled) return;

        renderCountRef.current++;

        // FPS Calculation
        const measureFPS = () => {
            frameCountRef.current++;
            const now = performance.now();
            const delta = now - lastFrameTimeRef.current;

            if (delta >= 1000) {
                const fps = Math.round((frameCountRef.current * 1000) / delta);
                fpsHistoryRef.current.push(fps);
                if (fpsHistoryRef.current.length > 60) fpsHistoryRef.current.shift();

                setMetrics(prev => ({
                    ...prev,
                    fps,
                    renderCount: renderCountRef.current,
                    lastRenderTime: delta
                }));

                frameCountRef.current = 0;
                lastFrameTimeRef.current = now;
            }

            requestAnimationFrame(measureFPS);
        };

        const fpsRAF = requestAnimationFrame(measureFPS);

        // Memory Usage (if available)
        const memoryInterval = setInterval(() => {
            if ((performance as any).memory) {
                const memory = (performance as any).memory;
                const usedMB = memory.usedJSHeapSize / 1024 / 1024;
                setMetrics(prev => ({ ...prev, memoryUsage: usedMB }));
            }
        }, 1000);

        return () => {
            cancelAnimationFrame(fpsRAF);
            clearInterval(memoryInterval);
        };
    }, [enabled]);

    if (!enabled) return null;

    const avgFPS = fpsHistoryRef.current.length > 0
        ? Math.round(fpsHistoryRef.current.reduce((a, b) => a + b, 0) / fpsHistoryRef.current.length)
        : 60;

    const fpsColor = metrics.fps >= 50 ? 'text-emerald-500' : metrics.fps >= 30 ? 'text-yellow-500' : 'text-red-500';
    const memColor = metrics.memoryUsage < 200 ? 'text-emerald-500' : metrics.memoryUsage < 500 ? 'text-yellow-500' : 'text-red-500';

    if (isMinimized) {
        return (
            <div
                className="fixed bottom-4 right-4 z-[9999] cursor-pointer"
                onClick={() => setIsMinimized(false)}
            >
                <div className="p-2 bg-slate-900/95  border border-indigo-500/30 rounded-lg shadow-xl hover:shadow-indigo-500/20 transition-all">
                    <div className="flex items-center gap-2">
                        <Activity size={14} className={fpsColor} />
                        <span className={`text-xs font-mono font-bold ${fpsColor}`}>{metrics.fps}</span>
                        <span className="text-xs text-slate-500">FPS</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 z-[9999] no-drag">
            <div className="bg-slate-900/95  border border-indigo-500/30 rounded-lg shadow-xl p-3 min-w-[240px]">
                {/* Header */}
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <Activity size={14} className="text-indigo-400" />
                        <span className="text-xs font-bold text-slate-200">Performance</span>
                    </div>
                    <div className="flex gap-1">
                        <button
                            onClick={() => setIsMinimized(true)}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                            title="Minimize"
                        >
                            <Minimize2 size={12} className="text-slate-400" />
                        </button>
                    </div>
                </div>

                {/* Metrics */}
                <div className="space-y-2">
                    {/* FPS */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Cpu size={12} className={fpsColor} />
                            <span className="text-xs text-slate-400">FPS</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-sm font-mono font-bold ${fpsColor}`}>
                                {metrics.fps}
                            </span>
                            <span className="text-[10px] text-slate-500">
                                (avg: {avgFPS})
                            </span>
                        </div>
                    </div>

                    {/* Memory */}
                    {metrics.memoryUsage > 0 && (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <MemoryStick size={12} className={memColor} />
                                <span className="text-xs text-slate-400">Memory</span>
                            </div>
                            <span className={`text-sm font-mono font-bold ${memColor}`}>
                                {metrics.memoryUsage.toFixed(1)} MB
                            </span>
                        </div>
                    )}

                    {/* Render Count */}
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Renders</span>
                        <span className="text-sm font-mono font-bold text-blue-400">
                            {metrics.renderCount.toLocaleString()}
                        </span>
                    </div>

                    {/* FPS Graph (Mini) */}
                    <div className="pt-2 border-t border-white/5">
                        <div className="h-8 flex items-end gap-[2px]">
                            {fpsHistoryRef.current.slice(-30).map((fps, i) => (
                                <div
                                    key={i}
                                    className="flex-1 rounded-t transition-all"
                                    style={{
                                        height: `${(fps / 60) * 100}%`,
                                        backgroundColor:
                                            fps >= 50
                                                ? '#10b981'
                                                : fps >= 30
                                                    ? '#eab308'
                                                    : '#ef4444',
                                        opacity: 0.3 + (i / 30) * 0.7
                                    }}
                                    title={`${fps} FPS`}
                                />
                            ))}
                        </div>
                        <div className="flex justify-between mt-1">
                            <span className="text-[9px] text-slate-600">30s ago</span>
                            <span className="text-[9px] text-slate-600">now</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-2 pt-2 border-t border-white/5">
                    <div className="text-[9px] text-slate-600 text-center">
                        Dev Mode Only • Press Ctrl+Shift+P to toggle
                    </div>
                </div>
            </div>
        </div>
    );
};
