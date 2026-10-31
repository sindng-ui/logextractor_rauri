/**
 * Log Extractor UI Configuration Constants
 * 형님, 여기서 수치를 고치면 앱 전체에 반영됩니다! 😎
 */

export const LOG_VIEW_CONFIG = {
    // Virtual List Settings
    DEFAULT_ROW_HEIGHT: 24,
    OVERSCAN_COUNT: 120,
    OVERSCAN_COUNT_LOW: 50, // For real-time streaming

    // Column Layout (Pixels)
    COLUMN_WIDTHS: {
        BOOKMARK: 20,
        INDEX: 70,
        LINE_NUMBER: 90,
    },

    // Spacing & Padding
    SPACING: {
        CONTENT_LEFT_OFFSET: 8, // px-2 (0.5rem) equivalent
        HIGHLIGHT_PADDING_X: 0,
        HIGHLIGHT_PADDING_Y: 1, // py-[1px]
    },

    // Font Sizes (Pixels)
    FONT_SIZES: {
        INDEX: 11,
        LINE_NUMBER: 11,
        CONTENT: 12, // text-xs base
        DRAWER_HEADER: 14, // text-sm base
        DURATION_TAG: 10,
    },

    // Drawer Settings
    DRAWER: {
        WIDTH: 500,
        ANIMATION_DURATION: 300, // ms
    }
} as const;
