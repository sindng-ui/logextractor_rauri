import React from 'react';
import { LogHighlight, LogViewPreferences } from '../../types';
import { HighlightRenderer } from './HighlightRenderer';
import { LOG_VIEW_CONFIG } from '../../constants/logViewUI';

interface LogLineProps {
    index: number;
    style: React.CSSProperties;
    data?: { lineNum: number, content: string };
    isActive: boolean;
    isSelected?: boolean; // Multi-select support
    hasBookmark: boolean;
    isRawMode?: boolean;
    textHighlights?: LogHighlight[];
    lineHighlights?: LogHighlight[];
    highlightCaseSensitive?: boolean;
    onClick?: (index: number, event: React.MouseEvent) => void;
    onDoubleClick?: (index: number) => void;
    onMouseDown?: (index: number, event: React.MouseEvent) => void;
    onMouseEnter?: (index: number, event: React.MouseEvent) => void;
    preferences?: LogViewPreferences;
    levelMatchers?: { regex: RegExp; color: string }[];
    overrideBackgroundColor?: string;
}

// ✅ Performance: Move utilities outside component to avoid re-creation
const isCssColor = (color: string) => /^(#|rgb|hsl)/i.test(color.trim()) || (/^[a-z]+$/i.test(color.trim()) && !color.startsWith('bg-') && !color.startsWith('text-'));

export const LogLine = React.memo(({ index, style, data, isActive, isSelected, hasBookmark, isRawMode = false, textHighlights, lineHighlights, highlightCaseSensitive = false, onClick, onDoubleClick, onMouseDown, onMouseEnter, preferences, levelMatchers, overrideBackgroundColor }: LogLineProps) => {
    const isLoading = !data;

    // Decode HTML entities for display and matching
    const decodedContent = React.useMemo(() => {
        if (!data?.content) return '';
        // Fast regex replacement for common entities
        return data.content
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&apos;/g, "'")
            .replace(/&#39;/g, "'");
    }, [data]);

    // Determine Log Level Style
    const customBgStyle = React.useMemo(() => {
        if (!decodedContent) return undefined;

        // Optimization: only search first 100 chars
        const prefix = decodedContent.substring(0, 100);

        if (levelMatchers) {
            for (let i = 0; i < levelMatchers.length; i++) {
                if (levelMatchers[i].regex.test(prefix)) return levelMatchers[i].color;
            }
        }
        return undefined;
    }, [decodedContent, levelMatchers, preferences]); // preferences added back as needed if levelMatchers is not passed

    const matchingHighlight = React.useMemo(() => {
        if (!lineHighlights || !decodedContent) return undefined;
        // Standardizing to lowerCase once if needed
        const contentForMatch = highlightCaseSensitive ? decodedContent : decodedContent.toLowerCase();

        return lineHighlights.find(h => {
            const keyword = highlightCaseSensitive ? h.keyword : h.keyword.toLowerCase();
            return contentForMatch.includes(keyword);
        });
    }, [lineHighlights, decodedContent, highlightCaseSensitive]);

    return (
        <div
            className={`group flex items-center text-xs whitespace-pre cursor-pointer
                ${isSelected
                    ? 'bg-indigo-500/10 dark:bg-indigo-500/20 font-medium'
                    : isActive
                        ? 'bg-indigo-500/5 dark:bg-indigo-500/10'
                        : matchingHighlight
                            ? (isCssColor(matchingHighlight.color)
                                ? ''
                                : `${matchingHighlight.color} bg-opacity-30`) // Use bg-opacity utility
                            : hasBookmark
                                ? 'bg-yellow-50/50 dark:bg-yellow-500/10 hover:bg-slate-200/50 dark:hover:bg-indigo-500/5'
                                : overrideBackgroundColor ? '' // Handled by inline style
                                    : 'hover:bg-slate-200/50 dark:hover:bg-indigo-500/5'
                }`}
            style={{
                ...style,
                // Override height/lineHeight from preferences if provided
                ...(preferences ? { height: preferences.rowHeight, lineHeight: `${preferences.rowHeight}px`, fontSize: preferences.fontSize, fontFamily: preferences.fontFamily } : {}),

                // Background color priority: Active > Highlight > CUSTOM OVERRIDE > Custom Level > Bookmark > Hover
                // Since Active is handled by class, we handle Custom Level/Override via style if not active/highlight
                ...(!(isActive || isSelected || matchingHighlight)
                    ? (overrideBackgroundColor
                        ? { backgroundColor: overrideBackgroundColor }
                        : (customBgStyle
                            ? { backgroundColor: `${customBgStyle}${Math.round((preferences?.logLevelOpacity ?? 20) / 100 * 255).toString(16).padStart(2, '0')}` }
                            : {}))
                    : {}),

                ...(matchingHighlight && isCssColor(matchingHighlight.color)
                    ? { backgroundColor: matchingHighlight.color.startsWith('#') ? `${matchingHighlight.color}80` : matchingHighlight.color.replace(')', ', 0.5)').replace('rgb', 'rgba').replace('hsl', 'hsla') } // Attempt to add alpha
                    : {})
            }}
            onDragStart={(e) => {
                if (e.altKey) return; // Allow native text selection drag
                e.preventDefault();
                return false;
            }}
            onMouseDown={(e) => onMouseDown && onMouseDown(index, e)}
            onMouseEnter={(e) => onMouseEnter && onMouseEnter(index, e)}
            onDoubleClick={(e) => {
                e.stopPropagation(); // Prevent bubbling
                onDoubleClick && onDoubleClick(index);
            }}
        >
            {/* Sticky Bookmark Column */}
            <div
                className="sticky left-0 z-10 h-full shrink-0 flex items-center justify-center border-r border-slate-200 dark:border-white/5"
                style={{ width: LOG_VIEW_CONFIG.COLUMN_WIDTHS.BOOKMARK }}
            >
                {/* Background Blocker (matches pane bg but opaque for scrolling content underneath) */}
                <div className="absolute inset-0 bg-slate-50 dark:bg-[#020617]" />

                {/* State Overlay (matches row state) */}
                <div className={`absolute inset-0
                    ${isSelected
                        ? 'bg-indigo-500/10 dark:bg-indigo-500/20'
                        : isActive
                            ? 'bg-indigo-500/5 dark:bg-indigo-500/10'
                            : matchingHighlight
                                ? (isCssColor(matchingHighlight.color)
                                    ? ''
                                    : `${matchingHighlight.color} bg-opacity-30`)
                                : hasBookmark
                                    ? 'bg-yellow-50/50 dark:bg-yellow-500/10 group-hover:bg-slate-200/50 dark:group-hover:bg-indigo-500/5'
                                    : 'group-hover:bg-slate-200/50 dark:group-hover:bg-indigo-500/5'
                    }`}
                    style={matchingHighlight && isCssColor(matchingHighlight.color)
                        ? { backgroundColor: matchingHighlight.color.startsWith('#') ? `${matchingHighlight.color}33` : matchingHighlight.color.replace(')', ', 0.2)').replace('rgb', 'rgba').replace('hsl', 'hsla') }
                        : {}}
                />

                {/* Left Active Indicator (Shadow 제거 최적화) */}
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-indigo-500" />}

                <div className="relative z-10">
                    {hasBookmark && <span className="text-yellow-600 dark:text-yellow-400 font-bold text-[10px]">★</span>}
                </div>
            </div>

            {/* Item Index # */}
            {!isRawMode && (
                <div
                    className="log-line-index shrink-0 text-right pr-2 select-none border-r border-slate-200 dark:border-white/5 mr-2 flex items-center justify-end font-mono"
                    style={{
                        minWidth: LOG_VIEW_CONFIG.COLUMN_WIDTHS.INDEX,
                        width: LOG_VIEW_CONFIG.COLUMN_WIDTHS.INDEX,
                        fontSize: LOG_VIEW_CONFIG.FONT_SIZES.INDEX
                    }}
                    data-content={`#${index + 1}`}
                />
            )}

            {/* Line Number */}
            <div
                className={`log-line-number shrink-0 text-right pr-3 select-none flex justify-end gap-1 items-center font-mono 
                ${matchingHighlight
                        ? 'text-slate-900 dark:text-slate-100 font-bold'
                        : hasBookmark ? 'text-yellow-600 dark:text-yellow-400 font-bold' : 'text-slate-400 dark:text-slate-600'}`}
                style={{
                    minWidth: LOG_VIEW_CONFIG.COLUMN_WIDTHS.LINE_NUMBER,
                    width: LOG_VIEW_CONFIG.COLUMN_WIDTHS.LINE_NUMBER,
                    fontSize: LOG_VIEW_CONFIG.FONT_SIZES.LINE_NUMBER
                }}
                data-content={isLoading ? '' : String(data?.lineNum || '')}
            />

            {/* Content */}
            <div
                className={`min-w-0 flex-1 ${isActive
                    ? 'text-slate-900 dark:text-slate-100'
                    : matchingHighlight
                        ? 'text-slate-900 dark:text-slate-100 font-medium' // High contrast text for both modes
                        : 'text-slate-600 dark:text-slate-300'}`}
                style={{ paddingLeft: LOG_VIEW_CONFIG.SPACING.CONTENT_LEFT_OFFSET, paddingRight: LOG_VIEW_CONFIG.SPACING.CONTENT_LEFT_OFFSET }}
            >
                {isLoading ? (
                    <div className="h-3 w-48 bg-slate-200 dark:bg-slate-800/50 rounded animate-pulse mt-1" />
                ) : (
                    isRawMode
                        ? decodedContent
                        : <HighlightRenderer
                            text={decodedContent}
                            highlights={textHighlights}
                            caseSensitive={highlightCaseSensitive}
                        />
                )}
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.data?.lineNum === nextProps.data?.lineNum &&
        prevProps.data?.content === nextProps.data?.content &&
        prevProps.isActive === nextProps.isActive &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.hasBookmark === nextProps.hasBookmark &&
        prevProps.isRawMode === nextProps.isRawMode &&
        prevProps.highlightCaseSensitive === nextProps.highlightCaseSensitive &&
        // Shallow check for objects/arrays that are stable
        prevProps.preferences === nextProps.preferences &&
        prevProps.levelMatchers === nextProps.levelMatchers &&
        prevProps.textHighlights === nextProps.textHighlights &&
        prevProps.lineHighlights === nextProps.lineHighlights &&
        prevProps.overrideBackgroundColor === nextProps.overrideBackgroundColor
    );
});
