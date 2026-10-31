import { useRef, useMemo, useCallback } from 'react';
import { LogViewPreferences } from '../../../types';
import { LOG_VIEW_CONFIG } from '../../../constants/logViewUI';

export const MONO_FONT_STACK = "'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace";
export const DEFAULT_FONT_WEIGHT = '400';

export const useHyperLogLayout = (preferences?: LogViewPreferences) => {
    const {
        GUTTER_STAR_WIDTH,
        GUTTER_INDEX_WIDTH,
        GUTTER_LINENUM_WIDTH,
        GUTTER_TOTAL_WIDTH,
        CONTENT_X_OFFSET
    } = useMemo(() => {
        const star = LOG_VIEW_CONFIG.COLUMN_WIDTHS.BOOKMARK;
        const index = LOG_VIEW_CONFIG.COLUMN_WIDTHS.INDEX;
        const lineNum = LOG_VIEW_CONFIG.COLUMN_WIDTHS.LINE_NUMBER;
        const total = star + index + lineNum;
        const offset = total + LOG_VIEW_CONFIG.SPACING.CONTENT_LEFT_OFFSET;
        return {
            GUTTER_STAR_WIDTH: star,
            GUTTER_INDEX_WIDTH: index,
            GUTTER_LINENUM_WIDTH: lineNum,
            GUTTER_TOTAL_WIDTH: total,
            CONTENT_X_OFFSET: offset
        };
    }, []);

    const charWidthRef = useRef<number>(8);
    const measureCache = useRef<Map<string, number>>(new Map());

    const clearMeasureCache = useCallback(() => {
        measureCache.current.clear();
    }, []);

    const initFontMetrics = useCallback((ctx: CanvasRenderingContext2D) => {
        const fontSize = preferences?.fontSize || 13;
        const fontFamily = preferences?.fontFamily || MONO_FONT_STACK;
        ctx.font = `${DEFAULT_FONT_WEIGHT} ${fontSize}px ${fontFamily}`;
        charWidthRef.current = ctx.measureText('M').width;
        clearMeasureCache();
        return charWidthRef.current;
    }, [preferences?.fontSize, preferences?.fontFamily, clearMeasureCache]);

    const getCachedWidth = useCallback((ctx: CanvasRenderingContext2D, text: string) => {
        const key = `${ctx.font}_${text}`;
        let width = measureCache.current.get(key);
        if (width === undefined) {
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

    return {
        GUTTER_STAR_WIDTH,
        GUTTER_INDEX_WIDTH,
        GUTTER_LINENUM_WIDTH,
        GUTTER_TOTAL_WIDTH,
        CONTENT_X_OFFSET,
        charWidthRef,
        initFontMetrics,
        getCachedWidth,
        clearMeasureCache,
        fontStack: MONO_FONT_STACK,
        fontWeight: DEFAULT_FONT_WEIGHT
    };
};
