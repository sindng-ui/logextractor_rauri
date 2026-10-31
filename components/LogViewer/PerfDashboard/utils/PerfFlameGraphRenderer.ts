import { AnalysisResult, AnalysisSegment } from '../../../../utils/perfAnalysis';

export interface DrawOptions {
    viewStart: number;
    viewDuration: number;
    width: number;
    height: number;
    palette: string[];
    searchTerms: string[];
    checkSegmentMatch: (s: AnalysisSegment, currentActiveTags: string[]) => boolean;
    showOnlyFail: boolean;
    lockedTid: string | null;
    selectedTid: string | null;
    selectedSegmentId: string | null;
    multiSelectedIds: string[];
    hoveredSegmentId: string | null;
    perfThreshold: number;
    mousePos: { time: number } | null;
    activeTags?: string[];
    ticks?: number[];
    highlightName?: string | null;
    milestones?: { time: number; label: string; color: string }[];
}

export class PerfFlameGraphRenderer {
    static drawCrosshair(
        ctx: CanvasRenderingContext2D,
        options: Pick<DrawOptions, 'mousePos' | 'viewStart' | 'viewDuration' | 'width' | 'height'>
    ) {
        const { mousePos, viewStart, viewDuration, width, height } = options;
        if (!mousePos) return;

        const x = ((mousePos.time - viewStart) / viewDuration) * width;
        if (x < 0 || x > width) return;

        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 20);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    static drawVerticalGrid(
        ctx: CanvasRenderingContext2D,
        options: Pick<DrawOptions, 'viewStart' | 'viewDuration' | 'width' | 'height' | 'ticks'>
    ) {
        const { ticks, viewStart, viewDuration, width, height } = options;
        if (!ticks || ticks.length === 0) return;

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;

        ticks.forEach(t => {
            const x = ((t - viewStart) / viewDuration) * width;
            if (x < 0 || x > width) return;
            ctx.moveTo(x, 0); // Start from top
            ctx.lineTo(x, height);
        });
        ctx.stroke();
    }

    static drawFlameChart(
        ctx: CanvasRenderingContext2D,
        result: AnalysisResult,
        flameSegments: AnalysisSegment[],
        options: DrawOptions
    ) {
        const {
            viewStart, viewDuration, width, height, palette,
            searchTerms, checkSegmentMatch, showOnlyFail,
            lockedTid, selectedTid, selectedSegmentId, multiSelectedIds,
            hoveredSegmentId, perfThreshold, mousePos, activeTags = [],
            highlightName = null
        } = options;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Draw background grid lines
        this.drawVerticalGrid(ctx, { ticks: options.ticks, viewStart, viewDuration, width, height });

        const viewEnd = viewStart + viewDuration;
        const visibleSegments = flameSegments.filter(s => s.endTime >= viewStart && s.startTime <= viewEnd);
        const pixelGrid = new Map<string, { x: number, y: number, w: number, color: string }>();

        visibleSegments.forEach(s => {
            const x = ((s.startTime - viewStart) / viewDuration) * width;
            const w = Math.max(s.duration === 0 ? 3 : 0.5, (s.duration / viewDuration) * width);
            const y = s.lane * 24 + 40;
            const h = 22;

            const isSelected = s.id === selectedSegmentId || multiSelectedIds.includes(s.id);
            const isHovered = s.id === hoveredSegmentId;
            const isMatch = (searchTerms.length > 0 || activeTags.length > 0) && checkSegmentMatch(s, []);
            const isGlobal = s.tid === 'Global';

            if (isSelected || isHovered || isMatch || w > 3) {
                const isFail = s.duration >= (perfThreshold || 1000);
                const effectiveSelectedTid = lockedTid || selectedTid;
                const isTidFocused = effectiveSelectedTid !== null && s.tid === effectiveSelectedTid;

                let baseOpacity = (isSelected || isHovered) ? 1 : (isGlobal ? 0.35 : 1.0);
                if (effectiveSelectedTid !== null && !isTidFocused) baseOpacity *= (lockedTid ? 0.1 : 0.3);

                // [SpeedScope Requirement] Fail Only mode: highlight only fails
                if (showOnlyFail && !isFail) baseOpacity = Math.min(baseOpacity, 0.08);

                if ((searchTerms.length > 0 || activeTags.length > 0) && !isMatch) {
                    baseOpacity = Math.min(baseOpacity, 0.08);
                }

                // [NEW] Spotlight Highlight Effect
                if (highlightName && s.name !== highlightName) {
                    baseOpacity = Math.min(baseOpacity, 0.05); // Dim others to almost invisible but enough to see context
                }

                const finalOpacity = baseOpacity;
                const baseColor = isSelected ? '#6366f1' : (s.color || s.dangerColor || palette[s.lane % palette.length]);

                ctx.globalAlpha = finalOpacity;
                ctx.fillStyle = baseColor;

                ctx.beginPath();
                ctx.rect(x, y, w, h); // Use sharp rect for original look
                ctx.fill();

                if (isSelected || isHovered) {
                    ctx.strokeStyle = isGlobal ? '#f59e0b' : 'white';
                    ctx.lineWidth = isSelected ? 2 : 1;
                    ctx.stroke();
                }
            } else {
                const pixX = Math.floor(x * 2) / 2;
                const key = `${s.lane}-${pixX}`;
                const isFail = s.duration >= (perfThreshold || 1000);
                const baseColor = (s.color || s.dangerColor || palette[s.lane % palette.length]);
                if (!pixelGrid.has(key) || isFail) {
                    pixelGrid.set(key, { x, y, w: Math.max(0.5, w), color: baseColor });
                } else {
                    const existing = pixelGrid.get(key)!;
                    existing.w = Math.max(existing.w, (x + w) - existing.x);
                }
            }
        });

        // Fail Only opacity override for dense segments
        ctx.globalAlpha = (showOnlyFail || searchTerms.length > 0 || activeTags.length > 0) ? 0.1 : 1.0;
        pixelGrid.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, Math.max(0.5, p.w), 22); // match segment height
        });
        ctx.globalAlpha = 1;

        this.drawVerticalGrid(ctx, { ticks: options.ticks, viewStart, viewDuration, width, height });

        // --- Milestone Guide Lines ---
        const { milestones = [] } = options;
        if (milestones.length > 0) {
            ctx.setLineDash([2, 4]);
            milestones.forEach(m => {
                if (m.time >= viewStart && m.time <= viewEnd) {
                    const x = ((m.time - viewStart) / viewDuration) * width;
                    ctx.strokeStyle = m.color + '44'; // 44 is hex for low opacity (alpha)
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, height);
                    ctx.stroke();
                }
            });
            ctx.setLineDash([]);
        }

        // --- Segment Name Text Rendering ---
        ctx.font = `700 10px 'Inter', system-ui, sans-serif`; // Sharper weight and slightly larger
        ctx.textBaseline = 'middle';
        visibleSegments.forEach(s => {
            const x = ((s.startTime - viewStart) / viewDuration) * width;
            const w = Math.max(s.duration === 0 ? 3 : 0.5, (s.duration / viewDuration) * width);
            const y = s.lane * 24 + 40;
            const h = 22;

            if (w < 30) return;

            const isSelected = s.id === selectedSegmentId || multiSelectedIds.includes(s.id);
            const isMatch = (searchTerms.length > 0 || activeTags.length > 0) && checkSegmentMatch(s, []);
            const isFail = s.duration >= (perfThreshold || 1000);
            const isGlobal = s.tid === 'Global';

            const effectiveSelectedTid = lockedTid || selectedTid;
            let opacity = isGlobal ? 0.35 : 0.9;
            if (effectiveSelectedTid && s.tid !== effectiveSelectedTid) opacity *= (lockedTid ? 0.1 : 0.3);
            if (showOnlyFail && !isFail) opacity = Math.min(opacity, 0.08);
            if ((searchTerms.length > 0 || activeTags.length > 0) && !isMatch) opacity = 0.08;
            if (highlightName && s.name !== highlightName) opacity = 0.05;

            if (opacity < 0.15) return;

            const PAD = 5;
            const maxTextW = w - PAD * 2;
            if (maxTextW < 10) return;

            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();

            ctx.globalAlpha = Math.min(1, opacity * 1.8); // Higher opacity for text
            ctx.fillStyle = (isSelected || isFail) ? '#ffffff' : '#ffffff'; // Solid white for maximum contrast

            let displayName = s.name || '';
            if (s.fileName && s.functionName) {
                displayName = `${s.fileName}: ${s.functionName}(${s.startLine})`;
            } else if (s.fileName) {
                displayName = `${s.fileName}(${s.startLine})`;
            }

            ctx.fillText(displayName, Math.round(x + PAD), Math.round(y + h / 2)); // No maxWidth to avoid blur, Round coordinates
            ctx.restore();
        });

        this.drawCrosshair(ctx, { mousePos, viewStart, viewDuration, width, height });
    }
}
