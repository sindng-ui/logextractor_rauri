
/**
 * Strip ANSI escape codes from a string.
 * This is used during loading to ensure filtering and rendering are fast.
 */
export const stripAnsi = (text: string): string => {
    if (!text) return text;
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
};

/**
 * Optimized version that also strips trailing CR (\r) for better line ending handling.
 */
export const cleanLineContent = (line: string): string => {
    if (!line) return line;
    // Strip ANSI and then strip \r if present (common in Windows logs)
    // eslint-disable-next-line no-control-regex
    return line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\r$/, '');
};
