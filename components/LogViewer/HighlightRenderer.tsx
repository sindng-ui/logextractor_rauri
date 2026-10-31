import React, { useMemo } from 'react';
import { LogHighlight } from '../../types';

import { LOG_VIEW_CONFIG } from '../../constants/logViewUI';

interface HighlightRendererProps {
    text: string;
    highlights?: LogHighlight[];
    caseSensitive?: boolean;
}

// ✅ Performance: Move utility outside to avoid re-creation
const isCssColor = (color: string) => /^(#|rgb|hsl)/i.test(color.trim()) || (/^[a-z]+$/i.test(color.trim()) && !color.startsWith('bg-') && !color.startsWith('text-'));

export const HighlightRenderer = React.memo(({ text, highlights, caseSensitive = false }: HighlightRendererProps) => {
    const { pattern, highlightMap } = useMemo(() => {
        if (!highlights || highlights.length === 0) return { pattern: null, highlightMap: new Map() };
        const validHighlights = highlights.filter(h => h.keyword.trim() !== '');
        if (validHighlights.length === 0) return { pattern: null, highlightMap: new Map() };

        const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Sort by length descending to match longest keywords first
        const sorted = [...validHighlights].sort((a, b) => b.keyword.length - a.keyword.length);
        const regex = new RegExp(`(${sorted.map(h => escapeRegExp(h.keyword)).join('|')})`, caseSensitive ? 'g' : 'gi');

        // Create Map for O(1) lookup
        const map = new Map<string, LogHighlight>();
        for (let i = 0; i < sorted.length; i++) {
            const h = sorted[i];
            const key = caseSensitive ? h.keyword : h.keyword.toLowerCase();
            map.set(key, h);
        }

        return { pattern: regex, highlightMap: map };
    }, [highlights, caseSensitive]);

    const parts = useMemo(() => {
        if (!pattern) return null;
        return text.split(pattern); // Split by capturing group includes separators in result
    }, [text, pattern]);

    if (!parts) return <>{text}</>;

    return (
        <>
            {parts.map((part, i) => {
                if (!part) return null;

                const lookupKey = caseSensitive ? part : part.toLowerCase();
                const highlight = highlightMap.get(lookupKey);

                if (highlight) {
                    const isCss = isCssColor(highlight.color);
                    const style = {
                        ...(isCss ? { backgroundColor: highlight.color, color: '#0f172a' } : {}),
                        paddingTop: LOG_VIEW_CONFIG.SPACING.HIGHLIGHT_PADDING_Y,
                        paddingBottom: LOG_VIEW_CONFIG.SPACING.HIGHLIGHT_PADDING_Y,
                        paddingLeft: LOG_VIEW_CONFIG.SPACING.HIGHLIGHT_PADDING_X,
                        paddingRight: LOG_VIEW_CONFIG.SPACING.HIGHLIGHT_PADDING_X,
                    };
                    const className = `rounded-sm font-bold ${!isCss ? highlight.color + ' text-slate-900' : ''}`;
                    return <span key={i} className={className} style={style as any}>{part}</span>;
                }
                return part;
            })}
        </>
    );
});
