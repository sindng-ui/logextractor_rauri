import React, { useRef, useEffect, useState, useCallback, useMemo, useLayoutEffect } from 'react';
import { LogHighlight, LogViewPreferences } from '../../types';
import { LOG_VIEW_CONFIG } from '../../constants/logViewUI';

interface HyperLogRendererProps {
    totalCount: number;
    rowHeight: number;
    onScrollRequest: (startIndex: number, count: number) => Promise<{ lineNum: number; content: string }[]>;
    preferences?: LogViewPreferences;
    activeLineIndex?: number;
    selectedIndices?: Set<number>;
    bookmarks?: Set<number>;
    textHighlights?: LogHighlight[];
    lineHighlights?: LogHighlight[];
    lineHighlightRanges?: { start: number; end: number; color: string }[];
    highlightCaseSensitive?: boolean;
    levelMatchers?: { regex: RegExp; color: string }[];
    onLineClick?: (index: number, isShift?: boolean, isCtrl?: boolean) => void;
    onLineDoubleClick?: (index: number) => void;
    onAtBottomChange?: (isAtBottom: boolean) => void;
    onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
    absoluteOffset?: number;
    isRawMode?: boolean;
    performanceHeatmap?: number[];
    onKeyDown?: (e: React.KeyboardEvent) => void;
    onQuickHighlight?: (keyword: string) => void;
    onClearQuickHighlights?: () => void;

    isActive: boolean;
    clearCacheTick?: number;
    sharedBuffers?: {
        logBuffer: SharedArrayBuffer;
        lineOffsets: SharedArrayBuffer;
        lineLengths: SharedArrayBuffer;
        filteredIndices: SharedArrayBuffer;
        isStreamMode: boolean;
    } | null;
}

interface CachedLine {
    lineNum: number;
    content: string;
    decodedContent: string;
    levelColor?: string; // Pre-calculated for speed
}

export interface HyperLogHandle {
    scrollToIndex: (index: number, options?: { align: 'start' | 'center' | 'end' }) => void;
    scrollBy: (options: { top: number }) => void;
    scrollTo: (options: { top: number }) => void;
    getScrollTop: () => number;
    getCenterLineInfo: () => { index: number; offset: number; viewportHeight: number };
    focus: () => void;
}

// ✅ Common font stack to achieve 100% font rendering parity between Canvas and DOM layers.
const MONO_FONT_STACK = "'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace";
const DEFAULT_FONT_WEIGHT = '400';

// Helper to map tailwind bg classes to canvas colors
const mapColor = (color: string, opacity = 0.3) => {
    if (color.startsWith('#')) return color;
    if (color.startsWith('rgba')) return color;

    const palette: Record<string, string> = {
        'yellow-200': `rgba(254, 240, 138, ${opacity})`,
        'yellow-400': `rgba(250, 204, 21, ${opacity})`,
        'indigo-200': `rgba(199, 210, 254, ${opacity})`,
        'indigo-500': `rgba(99, 102, 241, ${opacity})`,
        'red-200': `rgba(FECACA, ${opacity})`,
        'red-500': `rgba(EF4444, ${opacity})`,
        'green-200': `rgba(BBF7D0, ${opacity})`,
        'blue-200': `rgba(BFDBFE, ${opacity})`,
        'slate-200': `rgba(E2E8F0, ${opacity})`,
        'orange-200': `rgba(FED7AA, ${opacity})`,
    };

    const clean = color.replace('bg-', '');
    return palette[clean] || `rgba(251, 191, 36, ${opacity})`;
};

// HTML entities must be fully decoded to prevent errors in font width calculation.
// HTML entities must be fully decoded to prevent errors in font width calculation.
const decodeHTMLEntities = (text: string) => {
    if (!text) return '';
    return text
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ') // 👈 added nbsp handling
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec)) // 👈 added numeric entity handling
        .replace(/\t/g, '    '); // 👈 replace tab characters with spaces for Canvas/DOM parity
};

export const HyperLogRenderer = React.memo(React.forwardRef<HyperLogHandle, HyperLogRendererProps>((props, ref) => {
    const {
        totalCount, rowHeight, onScrollRequest, preferences,
        selectedIndices, bookmarks, onLineClick, onLineDoubleClick,
        onAtBottomChange, onScroll, absoluteOffset, isRawMode, performanceHeatmap = [],
        onKeyDown, onQuickHighlight, onClearQuickHighlights, isActive, clearCacheTick,
        sharedBuffers

    } = props;

    // Apply default values for optional props
    const activeLineIndex = props.activeLineIndex ?? -1;
    const textHighlights = props.textHighlights ?? [];
    const lineHighlights = props.lineHighlights ?? [];
    const lineHighlightRanges = props.lineHighlightRanges ?? [];
    const highlightCaseSensitive = props.highlightCaseSensitive ?? false;
    const levelMatchers = props.levelMatchers ?? [];

    // ✅ Calculate layout constants inside the component to respond immediately to HMR or setting changes.
    const {
        GUTTER_STAR_WIDTH,
        GUTTER_INDEX_WIDTH,
        GUTTER_LINENUM_WIDTH,
        GUTTER_TOTAL_WIDTH,
        CONTENT_X_OFFSET
    } = useMemo(() => {
        const fontSize = preferences?.fontSize || 13;
        const star = LOG_VIEW_CONFIG.COLUMN_WIDTHS.BOOKMARK;
        const showLineNumbers = preferences?.showLineNumbers !== false; // ✅ Default is true

        // 🎯 Calculate by ratio without a fixed minimum width to prevent excessive spacing even when fonts are small! 🐧📐
        const charWidth = fontSize * 0.65; // 모노스페이스 폰트 대략적인 너비 비중

        // If line number display is off, set the width to 0! 🚀
        const index = showLineNumbers ? Math.ceil(charWidth * 7.0) : 0; // Index area (e.g., #999,999)
        const lineNum = showLineNumbers ? Math.ceil(charWidth * 6.0) : 0; // Original line number area 

        const total = star + index + lineNum;
        const offset = total + LOG_VIEW_CONFIG.SPACING.CONTENT_LEFT_OFFSET;
        return {
            GUTTER_STAR_WIDTH: star,
            GUTTER_INDEX_WIDTH: index,
            GUTTER_LINENUM_WIDTH: lineNum,
            GUTTER_TOTAL_WIDTH: total,
            CONTENT_X_OFFSET: offset
        };
    }, [preferences?.fontSize, preferences?.showLineNumbers]);

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const bgCanvasRef = useRef<HTMLCanvasElement>(null); // ✅ NEW: Background Layer
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const [stableScrollTop, setStableScrollTop] = useState(0);
    const [stableScrollLeft, setStableScrollLeft] = useState(0);
    const [stableScrollWidth, setStableScrollWidth] = useState(0); // ✅ NEW: Dynamic Width
    const [viewportHeight, setViewportHeight] = useState(0);
    const [viewportWidth, setViewportWidth] = useState(0); // ✅ NEW: Width tracking
    const [hoveredIndex, setHoveredIndex] = useState<number>(-1); // ✅ NEW: Hover Tracking
    const [cachedLines, setCachedLines] = useState<Map<number, CachedLine>>(new Map());
    const pendingIndices = useRef<Set<number>>(new Set());
    const isDraggingRef = useRef(false); // ✅ 상태가 아닌 Ref로 관리하여 재렌더링 방지
    const scrollTopRef = useRef(0);
    const scrollLeftRef = useRef(0); // ✅ NEW: Horizontal Scroll Ref
    const frameId = useRef<number | null>(null);

    // ✅ NEW: 줌 (rowHeight 변경) 시 1프레임 지터링 및 연속 줌 튀는 현상 방지를 위한 동기적 스크롤 보정
    const prevRowHeightRef = useRef(rowHeight);
    useLayoutEffect(() => {
        if (prevRowHeightRef.current !== rowHeight) {
            if (scrollContainerRef.current && viewportHeight > 0) {
                const prevRH = prevRowHeightRef.current;
                const currentScrollTop = scrollTopRef.current;

                // ✅ Correct zoom based on the top (First Visible Line) instead of the center.
                // This prevents the log from disappearing above the screen when there are only a few lines.
                const topFractionalIndex = currentScrollTop / prevRH;
                const newScrollTop = topFractionalIndex * rowHeight;

                scrollContainerRef.current.scrollTop = newScrollTop;
                scrollTopRef.current = newScrollTop;
            }
            prevRowHeightRef.current = rowHeight;
        }
    }, [rowHeight, viewportHeight]);


    const cachedLinesRef = useRef(cachedLines);
    useEffect(() => { cachedLinesRef.current = cachedLines; }, [cachedLines]);

    // ✅ Clear internal cache when clearCacheTick changes (syncs with wrapper's clear action).
    useEffect(() => {
        setCachedLines(new Map());
    }, [clearCacheTick]);

    // levelMatchers가 변경될 때 캐시되어 있는 라인들의 색상을 즉각 재평가하여 0ms 실시간 반영! ⚡
    useEffect(() => {
        if (cachedLines.size === 0) return;
        setCachedLines(prev => {
            const next = new Map(prev);
            let updated = false;
            next.forEach((cached, key) => {
                let newLevelColor = '#ccc';
                if (levelMatchers && levelMatchers.length > 0) {
                    const prefix = cached.decodedContent.substring(0, 100);
                    for (const m of levelMatchers) {
                        if (m.regex.test(prefix)) {
                            newLevelColor = m.color;
                            break;
                        }
                    }
                }
                if (cached.levelColor !== newLevelColor) {
                    next.set(key, { ...cached, levelColor: newLevelColor });
                    updated = true;
                }
            });
            if (updated) {
                cachedLinesRef.current = next;
                return next;
            }
            return prev;
        });
    }, [levelMatchers]);

    const scrollTaskRef = useRef<number | null>(null);

    // --- IMPERATIVE HANDLE ---
    React.useImperativeHandle(ref, () => ({
        scrollToIndex: (index: number, options?: { align: 'start' | 'center' | 'end' }) => {
            if (!scrollContainerRef.current) return;
            let targetTop = index * rowHeight;
            if (options?.align === 'center') targetTop -= viewportHeight / 2 - rowHeight / 2;
            else if (options?.align === 'end') targetTop -= viewportHeight - rowHeight;

            scrollContainerRef.current.scrollTop = Math.max(0, targetTop);
        },
        scrollBy: (options: { top: number }) => {
            if (scrollContainerRef.current) scrollContainerRef.current.scrollTop += options.top;
        },
        scrollTo: (options: { top: number }) => {
            if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = options.top;
        },
        getScrollTop: () => scrollTopRef.current,
        getCenterLineInfo: () => {
            if (!scrollContainerRef.current) return { index: 0, offset: 0, viewportHeight: 0 };
            const scrollTop = scrollTopRef.current;
            const centerAbsY = scrollTop + viewportHeight / 2;
            const centerIndex = Math.floor(centerAbsY / rowHeight);
            const centerOffset = centerAbsY % rowHeight;
            return { index: centerIndex, offset: centerOffset, viewportHeight };
        },
        focus: () => {
            if (scrollContainerRef.current) {
                scrollContainerRef.current.focus({ preventScroll: true });
            }
        }
    }));

    // Data Fetching Logic
    const loadVisibleLines = useCallback(async (startIdx: number, endIdx: number) => {
        const needed: number[] = [];
        const currentCache = cachedLinesRef.current;
        const isSAB = !!(sharedBuffers && sharedBuffers.isStreamMode && sharedBuffers.logBuffer);

        // 💡 Optimization: 5,000 lines are instant in SAB mode, but can be harmful in local file (IPC) mode.
        // For sparse logs, IPC communication frequency can surge, so significantly reduce the range in non-SAB mode. 🐧🛡️
        const PREFETCH_BUFFER = isSAB ? 5000 : 1000;
        const LOOKAHEAD_LIMIT = isSAB ? 3000 : 500;
        const LOOKBEHIND_LIMIT = isSAB ? 1000 : 200;

        const checkStart = Math.max(0, startIdx - LOOKBEHIND_LIMIT);
        const checkEnd = Math.min(totalCount - 1, endIdx + LOOKAHEAD_LIMIT);

        for (let i = checkStart; i <= checkEnd; i++) {
            if (!currentCache.has(i) && !pendingIndices.current.has(i)) {
                needed.push(i);
            }
        }

        if (needed.length > 0) {
            const batchStart = Math.max(0, needed[0] - LOOKBEHIND_LIMIT);
            const lastNeeded = needed[needed.length - 1];
            const batchCount = Math.min(totalCount - batchStart, (lastNeeded - batchStart) + PREFETCH_BUFFER);

            // --- Phase 2: Zero-copy Binary Load (SharedArrayBuffer) ---
            if (sharedBuffers && sharedBuffers.isStreamMode && sharedBuffers.logBuffer) {
                try {
                    const logArr = new Uint8Array(sharedBuffers.logBuffer);
                    const offsets = new Uint32Array(sharedBuffers.lineOffsets);
                    const lengths = new Uint32Array(sharedBuffers.lineLengths);
                    const indices = new Int32Array(sharedBuffers.filteredIndices);

                    const decodedLines = [];
                    const actualAbsoluteOffset = absoluteOffset || 0;

                    const decoder = new TextDecoder();
                    for (let i = batchStart; i < batchStart + batchCount; i++) {
                        const globalIdx = i + actualAbsoluteOffset;
                        if (globalIdx >= indices.length) break;
                        const realLineNum = indices[globalIdx];
                        const off = offsets[realLineNum];
                        const len = lengths[realLineNum];

                        const bytes = logArr.subarray(off, off + len);
                        const content = decoder.decode(bytes.slice());
                        decodedLines.push({ lineNum: globalIdx, content });
                    }

                    if (decodedLines.length > 0) {
                        // console.log(`[HyperLog] Zero-copy loaded ${decodedLines.length} lines`);
                        processLines(batchStart, batchCount, decodedLines);
                        return; // Done! No need for onScrollRequest
                    }
                } catch (err) {
                    console.error('[HyperLog] Binary load failed, falling back to IPC', err);
                }
            }

            // Fallback: Legacy IPC Fetch
            for (let i = batchStart; i < batchStart + batchCount; i++) pendingIndices.current.add(i);

            try {
                console.log(`[PINGU-DEBUG-RENDERER] loadVisibleLines requesting lines: start=${batchStart}, count=${batchCount}, totalCount=${totalCount}`);
                const lines = await onScrollRequest(batchStart, batchCount);
                if (!lines || lines.length === 0) {
                    console.warn(`[HyperLog] onScrollRequest(${batchStart}, ${batchCount}) returned NO lines! Total MatchCount: ${totalCount}`);
                    for (let i = batchStart; i < batchStart + batchCount; i++) pendingIndices.current.delete(i);
                    return;
                }
                console.log(`[PINGU-DEBUG-RENDERER] loadVisibleLines successfully received ${lines.length} lines for batch ${batchStart}`);
                processLines(batchStart, batchCount, lines);
            } catch (err) {
                console.error('[Renderer] Batch fetch failed', err);
            }
        }
    }, [totalCount, onScrollRequest, levelMatchers, sharedBuffers, absoluteOffset]);

    // Helper to unify processing
    const processLines = useCallback((batchStart: number, batchCount: number, lines: any[]) => {
        console.log(`[PINGU-DEBUG-RENDERER] processLines received lines count: ${lines.length}, batchStart: ${batchStart}`);
        setCachedLines(prev => {
            const next = new Map(prev);
            for (let i = batchStart; i < batchStart + batchCount; i++) {
                pendingIndices.current.delete(i);
            }

            lines.forEach((l, idx) => {
                if (!l) return;
                const content = typeof l === 'string' ? l : (l.content || '');
                const decodedContent = decodeHTMLEntities(content);

                let levelColor = '#ccc';
                if (levelMatchers && levelMatchers.length > 0) {
                    const prefix = content.substring(0, 100);
                    for (const m of levelMatchers) {
                        if (m.regex.test(prefix)) {
                            levelColor = m.color;
                            break;
                        }
                    }
                }

                const cached: CachedLine = {
                    lineNum: typeof l === 'string' ? batchStart + idx : (l.lineNum ?? batchStart + idx),
                    content: '',
                    decodedContent,
                    levelColor
                };
                next.set(batchStart + idx, cached);
            });

            if (next.size > 50000) {
                const keys = Array.from(next.keys());
                for (let k = 0; k < (keys.length - 30000); k++) next.delete(keys[k]);
            }
            return next;
        });
    }, [levelMatchers]); // Dependencies for processLines

    // 🔥 Pre-compile Regexes and Colors for Performance
    const compiledTextHighlights = useMemo(() => {
        // console.log('[HyperLog] Re-compiling highlights with caseSensitive:', highlightCaseSensitive);
        return textHighlights.map(h => ({
            ...h,
            regex: new RegExp(h.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), highlightCaseSensitive ? 'g' : 'gi'),
            canvasColor: mapColor(h.color, 0.8)
        }));
    }, [textHighlights, highlightCaseSensitive]);

    const compiledLineHighlights = useMemo(() => {
        return lineHighlights.map(h => ({
            ...h,
            canvasColor: mapColor(h.color, 0.25)
        }));
    }, [lineHighlights]);

    const compiledLineHighlightRanges = useMemo(() => {
        return lineHighlightRanges.map(r => ({
            ...r,
            canvasColor: mapColor(r.color, 0.2)
        }));
    }, [lineHighlightRanges]);

    const selectionColor = 'rgba(79, 70, 229, 0.55)'; // 👈 0.4 -> 0.55 상향
    const activeColor = 'rgba(79, 70, 229, 0.35)';    // 👈 0.2 -> 0.35 상향
    const bookmarkColor = 'rgba(234, 179, 8, 0.08)'; // 👈 0.3 -> 0.08로 대폭 하향 (가독성 & 눈의 편안함)
    const gutterColor = '#64748b';
    const defaultTextColor = '#ccc';

    // 🔥 Monospaced Font Metrics Cache
    const charWidthRef = useRef<number>(8); // Default fallback
    const measureCache = useRef<Map<string, number>>(new Map());

    // ✅ Prevent width calculation errors caused by late font loading.
    useEffect(() => {
        const handleFontsReady = () => {
            console.log('[HyperLog] 🖋️ Fonts loaded, clearing measure cache...');
            measureCache.current.clear();

            // Now that fonts are loaded, re-measure the default character width.
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const fontSize = preferences?.fontSize || 13;
                const fontFamily = preferences?.fontFamily || MONO_FONT_STACK;
                ctx.font = `${DEFAULT_FONT_WEIGHT} ${fontSize}px ${fontFamily}`;
                charWidthRef.current = ctx.measureText('M').width;
                console.log(` - Re-measured char width: ${charWidthRef.current}px`);
            }
            render(); // Re-render Canvas
        };

        if ('fonts' in document) {
            document.fonts.ready.then(handleFontsReady);
        }

        // Check once more during initial load
        handleFontsReady();
    }, [preferences?.fontSize, preferences?.fontFamily]);

    useLayoutEffect(() => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const fontSize = preferences?.fontSize || 13;
            const fontFamily = preferences?.fontFamily || MONO_FONT_STACK;
            ctx.font = `${DEFAULT_FONT_WEIGHT} ${fontSize}px ${fontFamily}`;
            charWidthRef.current = ctx.measureText('M').width;
            measureCache.current.clear(); // Clear cache when font changes
        }
    }, [preferences?.fontSize, preferences?.fontFamily]);

    // Fast width calculator
    // Fast width calculator
    const getCachedWidth = useCallback((ctx: CanvasRenderingContext2D, text: string) => {
        const key = `${ctx.font}_${text}`;
        let width = measureCache.current.get(key);
        if (width === undefined) {
            // ✅ Ensure settings match DOM precisely
            (ctx as any).fontVariantLigatures = 'none';
            (ctx as any).fontKerning = 'none';

            width = ctx.measureText(text).width;
            measureCache.current.set(key, width);
            if (measureCache.current.size > 2000) {
                const firstKey = measureCache.current.keys().next().value;
                if (firstKey) measureCache.current.delete(firstKey);
            }
        }
        return width;
    }, []);

    // Rendering Logic (Canvas)
    const render = useCallback(() => {
        if (!isActive) return; // ✅ Skip rendering when hidden

        const canvas = canvasRef.current;
        const bgCanvas = bgCanvasRef.current;
        if (!canvas || !bgCanvas) return;

        const ctx = canvas.getContext('2d', { alpha: true }); // Need alpha for text layer
        const bgCtx = bgCanvas.getContext('2d', { alpha: false }); // Background can be opaque
        if (!ctx || !bgCtx) return;

        // ✅ Explicitly disable ligatures and kerning to achieve 100% parity with DOM.
        (ctx as any).fontVariantLigatures = 'none';
        (ctx as any).fontKerning = 'none';
        (bgCtx as any).fontVariantLigatures = 'none';
        (bgCtx as any).fontKerning = 'none';

        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        const currentScrollTop = scrollTopRef.current;
        const currentScrollLeft = scrollLeftRef.current; // ✅ NEW
        const visibleStart = Math.floor(currentScrollTop / rowHeight);
        const visibleEnd = Math.ceil((currentScrollTop + height) / rowHeight);

        const startIdx = Math.max(0, visibleStart - 50);
        const endIdx = Math.min(totalCount - 1, visibleEnd + 150);

        loadVisibleLines(startIdx, endIdx);

        const fontSize = preferences?.fontSize || 13;
        const fontFamily = preferences?.fontFamily || MONO_FONT_STACK;

        // 🎯 Match line number size with body font size for improved visibility!
        const gutterFontSize = fontSize;
        const gutterFont = `${DEFAULT_FONT_WEIGHT} ${gutterFontSize}px ${fontFamily}`;
        const mainFont = `${DEFAULT_FONT_WEIGHT} ${fontSize}px ${fontFamily}`;

        // --- 1. RENDER BACKGROUND LAYER ---
        bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        bgCtx.fillStyle = '#020617'; // Slate-950 (Main Content Background)
        bgCtx.fillRect(0, 0, width, height);

        // --- 0.1 RENDER GUTTER BACKGROUND (Z-DEPTH) ---
        // Make the left area darker to clearly separate it from the body.
        bgCtx.fillStyle = '#010410'; // Darker than Slate-950
        bgCtx.fillRect(0, 0, GUTTER_TOTAL_WIDTH, height);

        // --- 0.2 RENDER VERTICAL DIVIDER ---
        // Here is the requested vertical divider! Adding a subtle gradient-like line.
        bgCtx.strokeStyle = 'rgba(71, 85, 105, 0.5)'; // Slate-500 with opacity
        bgCtx.lineWidth = 1;
        bgCtx.beginPath();
        bgCtx.moveTo(GUTTER_TOTAL_WIDTH, 0);
        bgCtx.lineTo(GUTTER_TOTAL_WIDTH, height);
        bgCtx.stroke();

        for (let i = startIdx; i <= endIdx; i++) {
            const y = (i * rowHeight) - currentScrollTop;
            if (y + rowHeight < 0 || y > height) continue;

            const globalIdx = i + (absoluteOffset || 0);

            let bgColor: string | null = null;
            if (selectedIndices?.has(globalIdx)) bgColor = selectionColor;
            else if (activeLineIndex === globalIdx) bgColor = activeColor;
            else if (hoveredIndex === i) bgColor = 'rgba(255, 255, 255, 0.04)'; // ✅ NEW: Subtle Hover Effect
            else {
                const rangeMatch = compiledLineHighlightRanges.find(r => globalIdx >= r.start && globalIdx <= r.end);
                if (rangeMatch) bgColor = rangeMatch.canvasColor;
            }

            // ✅ Log Level Background Color with Opacity % 실시간 연동! ⚡ (대소문자 무관 매칭 가드 적용)
            if (!bgColor) {
                const lineData = cachedLinesRef.current.get(i);
                if (lineData && lineData.levelColor) {
                    const isMatchedLevel = levelMatchers.some(m => m.color.toLowerCase() === lineData.levelColor!.toLowerCase());
                    if (isMatchedLevel) {
                        const opacity = preferences?.logLevelOpacity ?? 20;
                        const hexColor = lineData.levelColor;
                        if (hexColor.startsWith('#')) {
                            const alphaHex = Math.round(opacity / 100 * 255).toString(16).padStart(2, '0');
                            bgColor = `${hexColor}${alphaHex}`;
                        } else {
                            bgColor = hexColor.replace(')', `, ${opacity / 100})`).replace('rgb', 'rgba');
                        }
                    }
                }
            }

            // Keyword Line Background (Fallback)
            if (!bgColor && compiledLineHighlights.length > 0) {
                const lineData = cachedLinesRef.current.get(i);
                if (lineData) {
                    const lineContent = lineData.decodedContent;
                    const lowerContent = highlightCaseSensitive ? '' : lineContent.toLowerCase();
                    for (const h of compiledLineHighlights) {
                        const match = highlightCaseSensitive ? lineContent.includes(h.keyword) : lowerContent.includes(h.keyword.toLowerCase());
                        if (match) {
                            bgColor = h.canvasColor;
                            break;
                        }
                    }
                }
            }

            if (bgColor) {
                bgCtx.fillStyle = bgColor;
                bgCtx.fillRect(0, y, width, rowHeight);
            }

            /* ✅ Bookmark accent bar: (Commented out - enable if needed) 🐧💎
            if (bookmarks.has(globalIdx)) {
                bgCtx.fillStyle = 'rgba(234, 179, 8, 0.85)';
                bgCtx.fillRect(GUTTER_TOTAL_WIDTH, y, 4, rowHeight);
            }
            */
        }

        // --- 1.1 RENDER PERFORMANCE HEATMAP ---
        if (performanceHeatmap && performanceHeatmap.length > 0) {
            const stripWidth = 4;
            const x = width - 25; // Moved further left to avoid scrollbar overlap
            const points = performanceHeatmap.length;
            const pointHeight = height / points;

            // Draw Subtle Track Background
            bgCtx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            bgCtx.fillRect(x - 2, 0, stripWidth + 4, height);

            for (let i = 0; i < points; i++) {
                const val = performanceHeatmap[i];
                if (val <= 0) continue;

                const alpha = 0.3 + (val * 0.7);
                bgCtx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
                bgCtx.fillRect(x, i * pointHeight, stripWidth, Math.max(1, pointHeight));

                if (val > 0.5) {
                    bgCtx.fillStyle = `rgba(239, 68, 68, 0.4)`;
                    bgCtx.fillRect(x - 2, i * pointHeight, stripWidth + 2, Math.max(1, pointHeight));
                }
            }
        }

        // --- 2. RENDER TEXT LAYER ---
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        // --- 🛡️ Protection: Clip Content to protect Gutter ---
        ctx.save(); // [A] Save state before clipping

        // Gutter Styling
        ctx.font = gutterFont;
        ctx.fillStyle = gutterColor;

        for (let i = startIdx; i <= endIdx; i++) {
            const lineData = cachedLinesRef.current.get(i);
            const y = (i * rowHeight) - currentScrollTop;
            if (y + rowHeight < 0 || y > height) continue;
            const centerY = y + (rowHeight / 2);

            const globalIdx = i + (absoluteOffset || 0);

            // --- 🌟 Restoration: Bookmark Highlight in Gutter ---
            if (bookmarks.has(globalIdx)) {
                // Draw Star - smaller (11px) and brighter
                ctx.save();
                ctx.shadowBlur = 3;
                ctx.shadowColor = 'rgba(250, 204, 21, 0.4)';
                ctx.font = '11px sans-serif';
                ctx.fillStyle = '#fde047'; // yellow-300
                ctx.fillText('★', 6, centerY - 1); // 👈 Adjusted: Lifted up for alignment
                ctx.restore();

                // ❌ Removed: bgCtx.fillRect (No more yellow background for lines)
            }

            if (lineData && preferences?.showLineNumbers !== false) {
                ctx.font = gutterFont;
                // #Index - 🎯 Make index slightly darker!
                ctx.fillStyle = '#475569'; // Slate-500
                ctx.fillText(`#${globalIdx + 1}`, GUTTER_STAR_WIDTH, centerY);

                // Line Number - Yellow only if bookmarked, else neutral-400
                ctx.fillStyle = bookmarks.has(globalIdx) ? '#fef08a' : '#94a3b8'; // neutral-400
                ctx.fillText(String(lineData.lineNum), GUTTER_STAR_WIDTH + GUTTER_INDEX_WIDTH, centerY);
            }
        }

        // --- 🛡️ Dynamic Clipping: Protect gutter from scrolling content ---
        ctx.beginPath();
        ctx.rect(CONTENT_X_OFFSET - 2, 0, width - CONTENT_X_OFFSET + 2, height);
        ctx.clip(); // [B] Now everything below will stay inside this box

        let maxLineWidth = 0; // To track scrollable width

        for (let i = startIdx; i <= endIdx; i++) {
            const lineData = cachedLinesRef.current.get(i);
            const y = (i * rowHeight) - currentScrollTop;
            if (y + rowHeight < 0 || y > height) continue;
            const centerY = y + (rowHeight / 2);

            if (lineData) {
                ctx.font = mainFont;
                const displayContent = lineData.decodedContent;

                // ✅ Canvas rendering extreme performance tuning: Use indexOf instead of regex 🐧🚀
                const segments: { start: number, end: number, color: string | null }[] = [];
                if (compiledTextHighlights.length > 0) {
                    for (const h of compiledTextHighlights) {
                        // 1. Simple text matching decision (applies to most highlights)
                        const isSimpleKeyword = /^[a-zA-Z0-9_\-\s]+$/.test(h.keyword);

                        if (isSimpleKeyword) {
                            // Simple string matching: High-speed indexOf loop 🚀
                            const searchContent = highlightCaseSensitive ? displayContent : displayContent.toLowerCase();
                            const keyword = highlightCaseSensitive ? h.keyword : h.keyword.toLowerCase();
                            const kwLen = keyword.length;

                            let startIndex = 0;
                            let index;
                            while ((index = searchContent.indexOf(keyword, startIndex)) > -1) {
                                segments.push({
                                    start: index,
                                    end: index + kwLen,
                                    color: h.canvasColor
                                });
                                startIndex = index + kwLen;
                            }
                        } else {
                            // Complex regex matching: Legacy fallback 
                            h.regex.lastIndex = 0;
                            let match;
                            while ((match = h.regex.exec(displayContent)) !== null) {
                                segments.push({
                                    start: match.index,
                                    end: match.index + match[0].length,
                                    color: h.canvasColor
                                });
                            }
                        }
                    }
                }

                segments.sort((a, b) => (a.start - b.start) || ((b.end - b.start) - (a.end - a.start)));

                let currentX = CONTENT_X_OFFSET - currentScrollLeft;
                let lastIndex = 0;

                const drawSegment = (text: string, isHighlight: boolean, color: string | null) => {
                    const width = getCachedWidth(ctx, text);
                    if (isHighlight && color) {
                        ctx.fillStyle = color;
                        if (ctx.roundRect) {
                            ctx.beginPath();
                            ctx.roundRect(currentX, y + 1, width, rowHeight - 2, 4);
                            ctx.fill();
                        } else {
                            ctx.fillRect(currentX, y + 1, width, rowHeight - 2);
                        }
                        ctx.fillStyle = '#0f172a';
                    } else {
                        ctx.fillStyle = lineData.levelColor || defaultTextColor;
                    }
                    ctx.fillText(text, currentX, centerY);
                    currentX += width;
                };

                for (const seg of segments) {
                    if (seg.start > lastIndex) {
                        drawSegment(displayContent.substring(lastIndex, seg.start), false, null);
                    }
                    if (seg.start >= lastIndex) {
                        drawSegment(displayContent.substring(seg.start, seg.end), true, seg.color);
                        lastIndex = seg.end;
                    }
                }

                if (lastIndex < displayContent.length) {
                    drawSegment(displayContent.substring(lastIndex), false, null);
                }

                // ✅ For bookmarks, add a subtle underline below the text. (Premium Design) 🐧✨
                const globalIdx = i + (absoluteOffset || 0);
                if (bookmarks.has(globalIdx)) {
                    const textWidth = currentX - (CONTENT_X_OFFSET - currentScrollLeft);
                    ctx.fillStyle = 'rgba(234, 179, 8, 0.7)'; // 옅은 황금색 언더라인
                    ctx.fillRect(CONTENT_X_OFFSET - currentScrollLeft, y + rowHeight - 3, textWidth, 1);
                }

                // Calculate cumulative line width for dynamic scroll
                const totalLineWidth = (currentX + currentScrollLeft) - CONTENT_X_OFFSET;
                if (totalLineWidth > maxLineWidth) maxLineWidth = totalLineWidth;
            }
        }

        ctx.restore(); // [C] Restore state (clipping ends here)
    }, [stableScrollTop, cachedLines, totalCount, rowHeight, preferences, levelMatchers, selectedIndices, activeLineIndex, bookmarks, loadVisibleLines, compiledTextHighlights, compiledLineHighlights, highlightCaseSensitive, compiledLineHighlightRanges, getCachedWidth, performanceHeatmap, CONTENT_X_OFFSET, GUTTER_STAR_WIDTH, GUTTER_INDEX_WIDTH, isActive]);

    const renderHeatmap = useCallback(() => {
        render(); // 히트맵 렌더링은 이제 render 함수 통합됨
    }, [render]);

    useEffect(() => {
        const handleGlobalMouseUp = () => {
            isDraggingRef.current = false;
        };
        
        // ✅ Fully separate native text selection and custom line selection via Alt key tracking.
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Alt' || e.altKey) {
                containerRef.current?.classList.add('alt-pressed');
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Alt' || !e.altKey) {
                containerRef.current?.classList.remove('alt-pressed');
            }
        };
        const handleBlur = () => {
            containerRef.current?.classList.remove('alt-pressed');
        };

        window.addEventListener('mouseup', handleGlobalMouseUp);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);
        
        return () => {
            window.removeEventListener('mouseup', handleGlobalMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
        };
    }, []);

    useLayoutEffect(() => {
        if (!containerRef.current) return;
        let resizeRafId: number | null = null;
        let isFirstRender = true;

        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;

                setViewportWidth(prev => {
                    // 🐧⚡ Reset horizontal scroll to 0 when width changes significantly (especially when entering split mode)!
                    if (Math.abs(prev - width) > 50) {
                        if (scrollContainerRef.current) {
                            scrollContainerRef.current.scrollLeft = 0;
                            scrollLeftRef.current = 0;
                            setStableScrollLeft(0);
                        }
                    }
                    return width;
                });

                const applyResize = () => {
                    const dpr = window.devicePixelRatio || 1;
                    setViewportHeight(height);
                    if (bgCanvasRef.current) {
                        bgCanvasRef.current.width = width * dpr;
                        bgCanvasRef.current.height = height * dpr;
                        bgCanvasRef.current.style.width = width + 'px';
                        bgCanvasRef.current.style.height = height + 'px';
                        const bgCtx = bgCanvasRef.current.getContext('2d');
                        if (bgCtx) {
                            bgCtx.setTransform(1, 0, 0, 1, 0, 0);
                            bgCtx.scale(dpr, dpr);
                        }
                    }
                    if (canvasRef.current) {
                        canvasRef.current.width = width * dpr;
                        canvasRef.current.height = height * dpr;
                        canvasRef.current.style.width = width + 'px';
                        canvasRef.current.style.height = height + 'px';
                        const ctx = canvasRef.current.getContext('2d');
                        if (ctx) {
                            ctx.setTransform(1, 0, 0, 1, 0, 0);
                            ctx.scale(dpr, dpr);
                        }
                        render();
                        renderHeatmap();
                    }
                };

                applyResize();
            }
        });
        observer.observe(containerRef.current);
        return () => {
            if (resizeRafId) cancelAnimationFrame(resizeRafId);
            observer.disconnect();
        };
    }, [render, renderHeatmap]);

    useLayoutEffect(() => {
        render();
        renderHeatmap();
    }, [render, cachedLines, selectedIndices, activeLineIndex, hoveredIndex, bookmarks, performanceHeatmap, isActive, preferences?.logLevelOpacity]);

    // ✅ Dynamic Width Calculation (Sample based for performance)
    useEffect(() => {
        if (cachedLines.size === 0) return;

        // Measure a sample of lines to estimate max width
        // For performance, primarily check recently loaded lines instead of the entire set.
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.font = `${DEFAULT_FONT_WEIGHT} ${preferences?.fontSize || 13}px ${preferences?.fontFamily || MONO_FONT_STACK}`;

        let maxW = 0;
        const lineCount = cachedLines.size;
        const keys = Array.from(cachedLines.keys());
        // Check last 200 lines (most likely to be the new ones) + some samples
        const sampleSize = Math.min(lineCount, 500);
        for (let i = 0; i < sampleSize; i++) {
            const line = cachedLines.get(keys[lineCount - 1 - i]);
            if (line) {
                const w = ctx.measureText(line.decodedContent).width;
                if (w > maxW) maxW = w;
            }
        }

        const targetWidth = maxW + CONTENT_X_OFFSET + 100;
        setStableScrollWidth(prev => Math.abs(prev - targetWidth) > 50 ? targetWidth : prev);
    }, [cachedLines, preferences?.fontSize, preferences?.fontFamily]);



    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const top = e.currentTarget.scrollTop;
        const left = e.currentTarget.scrollLeft; // ✅ NEW
        const scrollHeight = e.currentTarget.scrollHeight;
        const clientHeight = e.currentTarget.clientHeight;
        scrollTopRef.current = top;
        scrollLeftRef.current = left; // ✅ NEW

        // 🔥 Canvas 즉시 업데이트 (60fps)
        if (frameId.current) cancelAnimationFrame(frameId.current);
        frameId.current = requestAnimationFrame(() => {
            render();
            if (onScroll) onScroll(top, scrollHeight, clientHeight);
        });

        // 👈 Delay Interaction Layer (DOM) updates slightly to reduce load during scrolling.
        if (scrollTaskRef.current) clearTimeout(scrollTaskRef.current);
        scrollTaskRef.current = window.setTimeout(() => {
            setStableScrollTop(top);
            setStableScrollLeft(left); // ✅ NEW
            if (onAtBottomChange) {
                const isAtBottom = top + clientHeight >= scrollHeight - 50;
                onAtBottomChange(isAtBottom);
            }
        }, 16);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!scrollContainerRef.current) return;
        const rect = scrollContainerRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const currentTop = scrollTopRef.current;
        const index = Math.floor((currentTop + y) / rowHeight);

        if (index >= 0 && index < totalCount) {
            if (hoveredIndex !== index) setHoveredIndex(index);
        } else {
            if (hoveredIndex !== -1) setHoveredIndex(-1);
        }
    };

    const handleMouseLeave = () => {
        if (hoveredIndex !== -1) setHoveredIndex(-1);
    };

    const visibleLines = useMemo(() => {
        const start = Math.floor(stableScrollTop / rowHeight);
        const end = Math.min(totalCount - 1, Math.ceil((stableScrollTop + viewportHeight) / rowHeight) + 2);
        const res = [];
        for (let i = start; i <= end; i++) {
            res.push({ index: i, line: cachedLines.get(i) });
        }
        return res;
    }, [stableScrollTop, viewportHeight, rowHeight, totalCount, cachedLines, isActive]);
    const handleLineAction = (e: React.MouseEvent, index: number, type: 'click' | 'dbclick' | 'enter') => {


        // ✅ Prevent native browser text selection on normal clicks when Alt key is not pressed.
        if (!e.altKey && type === 'click') {
            // Prevent default browser selection to allow only row selection.
            e.preventDefault(); 
            // Clear existing text selection ranges when a new row is selected.
            window.getSelection()?.removeAllRanges();
        }

        if (e.altKey) {
            // ✅ If Alt key is pressed, ensure the class is added to the container.
            containerRef.current?.classList.add('alt-pressed');

            if (type === 'dbclick' && onQuickHighlight) {
                const selection = window.getSelection()?.toString().trim();
                if (selection) {
                    onQuickHighlight(selection);
                }
                return;
            }

            if (type === 'click' && e.button === 2 && onQuickHighlight) {
                // ✅ Alt + Right-click clears all quick highlights.
                e.preventDefault();
                onClearQuickHighlights();
                return;
            }

            // ✅ Clear existing line selection (blue highlight) when starting text selection via Alt-click.
            if (type === 'click' && onLineClick) {
                onLineClick(-1, false, false);
            }
            // Do nothing in Alt mode to allow default browser text selection.
            return;
        }

        // Give focus to the scroll container on click to enable keyboard events.
        if (type === 'click' && scrollContainerRef.current) {
            scrollContainerRef.current.focus({ preventScroll: true });
        }

        // 👈 Use provided index directly instead of recalculating from Y coordinate
        // This is much more accurate as it matches the rendered interactive element.
        const lineIndex = index;

        if (type === 'click') {
            if (onLineClick) {
                const globalIndex = lineIndex + (absoluteOffset || 0);

                // ✅ Do not perform new line selection on right-click if there is a text selection or the line is already selected.
                const sel = window.getSelection();
                const hasText = sel && !sel.isCollapsed && sel.toString().trim().length > 0;

                if (e.button === 2 && (hasText || selectedIndices?.has(globalIndex))) {
                    return;
                }

                // Prevent browser selection during normal dragging for clean row selection.
                if (e.button === 0) {
                    isDraggingRef.current = true;
                }
                onLineClick(globalIndex, e.shiftKey, e.ctrlKey || e.metaKey);
            }
        } else if (type === 'enter' && isDraggingRef.current && onLineClick) {
            // Automatically expand selection range when mouse enters a line while dragging.
            onLineClick(lineIndex + (absoluteOffset || 0), true, false);
        } else if (type === 'dbclick' && onLineDoubleClick) {
            onLineDoubleClick(lineIndex + (absoluteOffset || 0));
        }
    };



    return (
        <div
            ref={containerRef}
            // 🎯 Fix container background to #020617 (Slate-950 HEX) to prevent white flickering during resize delays! 🐧🛡️
            className="flex-1 relative overflow-hidden bg-[#020617] font-mono hyper-log-container"
            style={{ height: '100%' }}
            onMouseDown={(e) => {
                if (!scrollContainerRef.current) return;
                const rect = containerRef.current!.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const hitAreaWidth = 25;

                // ✅ Global Heatmap Click Detection (Reserving space for scrollbar)
                const hitAreaStart = rect.width - 40;
                const hitAreaEnd = rect.width - 16; // Skip scrollbar (approx 16px)
                if (mouseX >= hitAreaStart && mouseX <= hitAreaEnd) {
                    const clickRatio = mouseY / rect.height;
                    const totalScrollHeight = totalCount * rowHeight;
                    const targetTop = (clickRatio * totalScrollHeight) - (rect.height / 2);
                    scrollContainerRef.current.scrollTop = Math.max(0, targetTop);

                    // Prevent text selection when clicking heatmap
                    e.preventDefault();
                }
            }}
        >
            <style>{`
                .hyper-log-container ::selection {
                    background: rgba(79, 70, 229, 0.4);
                    color: inherit;
                }
                .interaction-line::selection {
                    background: rgba(79, 70, 229, 0.4) !important;
                    color: inherit !important;
                    -webkit-text-fill-color: initial !important;
                }
                .interaction-line {
                    user-select: text !important; /* Keep selectable at all times (so the range doesn't disappear even when Alt is released!) */
                    color: transparent !important;
                    -webkit-text-fill-color: transparent !important;
                    letter-spacing: 0px !important; 
                    word-spacing: 0px !important; 
                    font-weight: 400 !important; 
                    font-variant-ligatures: none !important; 
                    font-feature-settings: "liga" 0, "clig" 0, "calt" 0 !important;
                    font-kerning: none !important; 
                    text-rendering: geometricPrecision !important;
                    text-indent: 0px !important; 
                    clip-path: inset(0 0 0 -200px); 
                }
                /* ✅ Clipping Box to protect Gutter from DOM text interaction */
                .interaction-scroll-layer::before {
                    content: '';
                    position: sticky;
                    left: 0;
                    top: 0;
                    width: ${CONTENT_X_OFFSET}px;
                    height: 100%;
                    background: #020617; /* match bg */
                    z-index: 20;
                    pointer-events: auto; /* ✅ Block selection behind gutter */
                }
                /* ✅ 히트맵 영역 마우스 포인터 표시 (스크롤바 왼쪽) */
                .hyper-log-container::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    right: 16px; /* Avoid scrollbar */
                    width: 24px; 
                    height: 100%;
                    cursor: pointer;
                    z-index: 50;
                    pointer-events: none; /* 🐧 Pass-through selection dragging to prevent it from getting stuck on the heatmap. Clicks are calculated via coordinates in JS! */
                }
                /* 하지만 실제 스크롤바 조작을 방해하지 않기 위해 로그 라인이 없을 때만 노출되거나 
                   투명하게 유지하여 클릭 이벤트는 JS에서 선점합니다. */
            `}</style>
            {/* 🎨 Double Layered Canvas Architecture */}
            {/* Layer 1: Backgrounds & Highlights */}
            <canvas
                ref={bgCanvasRef}
                className="absolute inset-0 pointer-events-none"
                style={{ zIndex: 1 }}
            />
            {/* Layer 2: Main Text & Overlays */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 pointer-events-none"
                style={{ zIndex: 2 }}
            />

            {/* 3. Unified Scroll & Interaction Layer (z-10) */}
            <div
                ref={scrollContainerRef}
                tabIndex={0}
                className="absolute inset-0 overflow-auto scrollbar-thin scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600 interaction-scroll-layer custom-scrollbar outline-none"
                style={{ zIndex: 10 }}
                onScroll={handleScroll}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onKeyDown={onKeyDown}
                onContextMenu={(e) => {
                    if (e.altKey || (e.ctrlKey && e.shiftKey && e.altKey)) {
                        e.preventDefault();
                    }
                }}
            >
                <div style={{
                    height: totalCount * rowHeight,
                    width: stableScrollWidth || '100%',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{ 
                        paddingTop: visibleLines.length > 0 ? visibleLines[0].index * rowHeight : 0,
                        paddingLeft: CONTENT_X_OFFSET
                    }}>
                        {/* Interaction Items (Now in normal document flow for perfect text selection) */}
                        {visibleLines.map(({ index, line }) => {
                            const fontSize = preferences?.fontSize || 13;
                            const fontFamily = preferences?.fontFamily || MONO_FONT_STACK;

                            return (
                                <div
                                    key={index}
                                    className="select-text whitespace-pre overflow-hidden pointer-events-auto active:bg-indigo-500/5 hover:bg-slate-500/5 interaction-line"
                                    style={{
                                    // 🐧 Significantly increased width to 10000px to prevent the selection area from jumping up even if the mouse goes far to the right! 
                                    // Don't worry, parent div has overflow: hidden so it won't affect the horizontal scrollbar! 🚀
                                    width: 10000, 
                                    height: rowHeight,
                                    lineHeight: `${rowHeight}px`,
                                    fontSize: `${fontSize}px`,
                                    fontFamily: fontFamily,
                                    fontWeight: DEFAULT_FONT_WEIGHT,
                                    letterSpacing: '0px',
                                    wordSpacing: '0px',
                                    paddingLeft: 0,
                                    boxSizing: 'border-box',
                                    WebkitFontSmoothing: 'antialiased',
                                    MozOsxFontSmoothing: 'grayscale',
                                    fontVariantLigatures: 'none',
                                    fontFeatureSettings: '"liga" 0, "clig" 0, "calt" 0',
                                    fontKerning: 'none',
                                    textRendering: 'geometricPrecision'
                                } as React.CSSProperties}
                                onMouseDown={(e) => handleLineAction(e, index, 'click')}
                                onMouseEnter={(e) => handleLineAction(e, index, 'enter')}
                                onDoubleClick={(e) => handleLineAction(e, index, 'dbclick')}
                            >{(line?.decodedContent || decodeHTMLEntities(line?.content || '')) + '\n'}</div>
                        );
                    })}
                    </div>
                </div>
            </div>
        </div>
    );
}));
HyperLogRenderer.displayName = 'HyperLogRenderer';
