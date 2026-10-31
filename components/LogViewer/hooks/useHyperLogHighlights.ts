import { useMemo } from 'react';
import { LogHighlight } from '../../../types';

export const mapHighlightColor = (color: string, opacity = 0.3) => {
    if (color.startsWith('#')) return color;
    if (color.startsWith('rgba')) return color;

    const palette: Record<string, string> = {
        'yellow-200': `rgba(254, 240, 138, ${opacity})`,
        'yellow-400': `rgba(250, 204, 21, ${opacity})`,
        'indigo-200': `rgba(199, 210, 254, ${opacity})`,
        'indigo-500': `rgba(99, 102, 241, ${opacity})`,
        'red-200': `rgba(254, 202, 202, ${opacity})`,
        'red-500': `rgba(239, 68, 68, ${opacity})`,
        'green-200': `rgba(187, 247, 208, ${opacity})`,
        'blue-200': `rgba(191, 219, 254, ${opacity})`,
        'slate-200': `rgba(226, 232, 240, ${opacity})`,
        'orange-200': `rgba(254, 215, 170, ${opacity})`,
    };

    const clean = color.replace('bg-', '');
    return palette[clean] || `rgba(251, 191, 36, ${opacity})`;
};

export const useHyperLogHighlights = (
    textHighlights: LogHighlight[] = [],
    lineHighlights: LogHighlight[] = [],
    highlightCaseSensitive: boolean = false
) => {
    const compiledTextHighlights = useMemo(() => {
        return textHighlights.map(h => ({
            ...h,
            regex: new RegExp(h.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), highlightCaseSensitive ? 'g' : 'gi'),
            canvasColor: mapHighlightColor(h.color, 0.8)
        }));
    }, [textHighlights, highlightCaseSensitive]);

    const compiledLineHighlights = useMemo(() => {
        return lineHighlights.map(h => ({
            ...h,
            canvasColor: mapHighlightColor(h.color, 0.25)
        }));
    }, [lineHighlights]);

    return { compiledTextHighlights, compiledLineHighlights };
};
