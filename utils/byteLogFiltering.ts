import { LogRule } from '../types';

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_REGEX = /\x1B\[[0-9;]*[a-zA-Z]/g;
const sharedEncoder = new TextEncoder();
const sharedDecoder = new TextDecoder();

export type QuickFilterMode = 'none' | 'error' | 'exception';

export interface AsciiBytePattern {
    lower: Uint8Array;
    upper: Uint8Array;
    badCharShift: Uint8Array;
    len: number;
    lastL: number;
    lastU: number;
}

export interface CompiledFilterRule {
    isEmpty: boolean;
    quickFilter: QuickFilterMode;
    happyCaseSensitive: boolean;
    blockCaseSensitive: boolean;
    excludes: string[];
    includeGroups: string[][];
    canUseAsciiByteScan: boolean;
    excludeBytePatterns: AsciiBytePattern[];
    includeByteGroups: AsciiBytePattern[][];
}

const isPureAscii = (text: string): boolean => {
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) >= 0x80) return false;
    }
    return true;
};

export const compileAsciiBytePattern = (term: string, caseSensitive: boolean): AsciiBytePattern => {
    const raw = sharedEncoder.encode(term);
    const len = raw.length;
    const lower = new Uint8Array(len);
    const upper = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
        const b = raw[i];
        if (!caseSensitive && b >= 65 && b <= 90) {
            // A-Z
            lower[i] = b + 32;
            upper[i] = b;
        } else if (!caseSensitive && b >= 97 && b <= 122) {
            // a-z
            lower[i] = b;
            upper[i] = b - 32;
        } else {
            lower[i] = b;
            upper[i] = b;
        }
    }

    const badCharShift = new Uint8Array(256).fill(Math.max(1, len));
    for (let k = 0; k < len - 1; k++) {
        const shift = len - 1 - k;
        badCharShift[lower[k]] = shift;
        badCharShift[upper[k]] = shift;
    }

    return {
        lower,
        upper,
        badCharShift,
        len,
        lastL: len > 0 ? lower[len - 1] : 0,
        lastU: len > 0 ? upper[len - 1] : 0,
    };
};

const QUICK_ERROR_PATTERNS: AsciiBytePattern[] = [
    compileAsciiBytePattern(' e/', false),
    compileAsciiBytePattern('error', false),
    compileAsciiBytePattern('fail', false),
    compileAsciiBytePattern('fatal', false),
];
const QUICK_EXCEPTION_PATTERN: AsciiBytePattern = compileAsciiBytePattern('exception', false);

export const matchAsciiBytePattern = (
    buf: Uint8Array,
    start: number,
    end: number,
    pat: AsciiBytePattern
): boolean => {
    const nLen = pat.len;
    if (nLen === 0) return true;
    if (end - start < nLen) return false;

    const lastL = pat.lastL;
    const lastU = pat.lastU;

    if (nLen === 1) {
        for (let p = start; p < end; p++) {
            const b = buf[p];
            if (b === lastL || b === lastU) return true;
        }
        return false;
    }

    const lower = pat.lower;
    const upper = pat.upper;
    const badCharShift = pat.badCharShift;
    const nMinus1 = nLen - 1;

    let p = start + nMinus1;
    while (p < end) {
        const lb = buf[p];
        if (lb === lastL || lb === lastU) {
            const candStart = p - nMinus1;
            let ok = true;
            for (let k = 0; k < nMinus1; k++) {
                const cb = buf[candStart + k];
                if (cb !== lower[k] && cb !== upper[k]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        p += badCharShift[lb];
    }
    return false;
};

export const compileFilterRule = (
    rule: LogRule | null | undefined,
    quickFilter: QuickFilterMode = 'none'
): CompiledFilterRule => {
    if (!rule) {
        return {
            isEmpty: quickFilter === 'none',
            quickFilter,
            happyCaseSensitive: false,
            blockCaseSensitive: false,
            excludes: [],
            includeGroups: [],
            canUseAsciiByteScan: true,
            excludeBytePatterns: [],
            includeByteGroups: [],
        };
    }

    const happyCaseSensitive = !!rule.happyCombosCaseSensitive;
    const blockCaseSensitive = !!rule.blockListCaseSensitive;

    const rawExcludes = rule.excludes || [];
    const rawIncludeGroups = rule.includeGroups || [];

    const excludes: string[] = [];
    for (let i = 0; i < rawExcludes.length; i++) {
        const t = rawExcludes[i].trim();
        if (t !== '') excludes.push(blockCaseSensitive ? t : t.toLowerCase());
    }

    const includeGroups: string[][] = [];
    for (let i = 0; i < rawIncludeGroups.length; i++) {
        const rawGroup = rawIncludeGroups[i];
        const group: string[] = [];
        for (let j = 0; j < rawGroup.length; j++) {
            const t = rawGroup[j].trim();
            if (t !== '') group.push(happyCaseSensitive ? t : t.toLowerCase());
        }
        if (group.length > 0) includeGroups.push(group);
    }

    const isEmpty = includeGroups.length === 0 && excludes.length === 0 && quickFilter === 'none';

    let canUseAsciiByteScan = true;
    const excludeBytePatterns: AsciiBytePattern[] = [];
    for (let i = 0; i < excludes.length; i++) {
        if (!isPureAscii(excludes[i])) {
            canUseAsciiByteScan = false;
            break;
        }
        excludeBytePatterns.push(compileAsciiBytePattern(excludes[i], blockCaseSensitive));
    }

    const includeByteGroups: AsciiBytePattern[][] = [];
    if (canUseAsciiByteScan) {
        for (let i = 0; i < includeGroups.length; i++) {
            const g = includeGroups[i];
            const compiledGroup: AsciiBytePattern[] = [];
            for (let j = 0; j < g.length; j++) {
                if (!isPureAscii(g[j])) {
                    canUseAsciiByteScan = false;
                    break;
                }
                compiledGroup.push(compileAsciiBytePattern(g[j], happyCaseSensitive));
            }
            if (!canUseAsciiByteScan) break;
            includeByteGroups.push(compiledGroup);
        }
    }

    return {
        isEmpty,
        quickFilter,
        happyCaseSensitive,
        blockCaseSensitive,
        excludes,
        includeGroups,
        canUseAsciiByteScan,
        excludeBytePatterns,
        includeByteGroups,
    };
};

export const matchCompiledLine = (line: string, compiled: CompiledFilterRule): boolean => {
    if (compiled.quickFilter === 'error') {
        const lineUpper = line.toUpperCase();
        if (
            !lineUpper.includes(' E/') &&
            !lineUpper.includes('ERROR') &&
            !lineUpper.includes('FAIL') &&
            !lineUpper.includes('FATAL')
        ) {
            return false;
        }
    } else if (compiled.quickFilter === 'exception') {
        if (!line.toLowerCase().includes('exception')) return false;
    }

    if (compiled.isEmpty) return true;

    let lowerLine: string | undefined;

    const excludes = compiled.excludes;
    if (excludes.length > 0) {
        const lineForBlock = compiled.blockCaseSensitive ? line : (lowerLine = line.toLowerCase());
        for (let i = 0; i < excludes.length; i++) {
            if (lineForBlock.includes(excludes[i])) return false;
        }
    }

    const groups = compiled.includeGroups;
    if (groups.length === 0) return true;

    const lineForHappy = compiled.happyCaseSensitive ? line : (lowerLine ?? line.toLowerCase());
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        let allMatch = true;
        for (let j = 0; j < group.length; j++) {
            if (!lineForHappy.includes(group[j])) {
                allMatch = false;
                break;
            }
        }
        if (allMatch) return true;
    }
    return false;
};

const matchAsciiByteSlice = (
    buf: Uint8Array,
    start: number,
    end: number,
    compiled: CompiledFilterRule
): boolean => {
    if (compiled.quickFilter === 'error') {
        let isErr = false;
        for (let i = 0; i < QUICK_ERROR_PATTERNS.length; i++) {
            if (matchAsciiBytePattern(buf, start, end, QUICK_ERROR_PATTERNS[i])) {
                isErr = true;
                break;
            }
        }
        if (!isErr) return false;
    } else if (compiled.quickFilter === 'exception') {
        if (!matchAsciiBytePattern(buf, start, end, QUICK_EXCEPTION_PATTERN)) return false;
    }

    const exPats = compiled.excludeBytePatterns;
    for (let i = 0; i < exPats.length; i++) {
        if (matchAsciiBytePattern(buf, start, end, exPats[i])) return false;
    }

    const incGroups = compiled.includeByteGroups;
    if (incGroups.length === 0) return true;

    for (let i = 0; i < incGroups.length; i++) {
        const group = incGroups[i];
        let allMatch = true;
        for (let j = 0; j < group.length; j++) {
            if (!matchAsciiBytePattern(buf, start, end, group[j])) {
                allMatch = false;
                break;
            }
        }
        if (allMatch) return true;
    }
    return false;
};

const hasByteInRange = (buf: Uint8Array, start: number, end: number, target: number): boolean => {
    for (let i = start; i < end; i++) {
        if (buf[i] === target) return true;
    }
    return false;
};

const decodeSliceSafe = (decoder: TextDecoder, slice: Uint8Array): string => {
    const isShared = typeof SharedArrayBuffer !== 'undefined' && slice.buffer instanceof SharedArrayBuffer;
    return decoder.decode(isShared ? slice.slice() : slice);
};

export interface ByteFilterChunkResult {
    matches: Int32Array;
    lineCount: number;
}

/**
 * Evaluate a single line slice `[start, effectiveEnd)` (excluding trailing `\r`/`\n`)
 * against a pre-compiled filter rule.
 * Shared across full-chunk scanning and sparse incremental candidate re-filtering
 * so both paths guarantee identical match semantics.
 */
export const matchByteSpan = (
    buf: Uint8Array,
    start: number,
    effectiveEnd: number,
    compiled: CompiledFilterRule,
    decoder: TextDecoder = sharedDecoder,
    chunkHasAnsi?: boolean
): boolean => {
    if (compiled.isEmpty) return true;

    const mightHaveAnsi = chunkHasAnsi === undefined ? hasByteInRange(buf, start, effectiveEnd, 0x1b) : (chunkHasAnsi && hasByteInRange(buf, start, effectiveEnd, 0x1b));

    if (!compiled.canUseAsciiByteScan || mightHaveAnsi) {
        let line = decodeSliceSafe(decoder, buf.subarray(start, effectiveEnd));
        if (mightHaveAnsi) {
            line = line.replace(ANSI_ESCAPE_REGEX, '');
        }
        return matchCompiledLine(line, compiled);
    }

    return matchAsciiByteSlice(buf, start, effectiveEnd, compiled);
};

/**
 * Filter a raw UTF-8 chunk buffer into matching original line indices.
 * Uses zero-decode Boyer-Moore-Horspool byte scanning whenever keywords are pure ASCII,
 * seamlessly falling back per-line for ANSI escape sequences or per-chunk for non-ASCII keywords.
 */
export const filterByteBuffer = (
    buf: Uint8Array,
    offset: number,
    compiled: CompiledFilterRule,
    decoder: TextDecoder = sharedDecoder
): ByteFilterChunkResult => {
    const len = buf.length;
    const matches: number[] = [];
    let relIdx = 0;
    let pos = 0;

    if (compiled.isEmpty) {
        while (pos < len) {
            const nl = buf.indexOf(10, pos);
            matches.push(offset + relIdx);
            relIdx++;
            if (nl === -1) break;
            pos = nl + 1;
        }
        return { matches: new Int32Array(matches), lineCount: relIdx };
    }

    const chunkHasAnsi = buf.indexOf(0x1b) !== -1;

    if (compiled.canUseAsciiByteScan) {
        while (pos < len) {
            const nl = buf.indexOf(10, pos);
            const rawEnd = nl === -1 ? len : nl;
            const effectiveEnd = rawEnd > pos && buf[rawEnd - 1] === 13 ? rawEnd - 1 : rawEnd;

            if (matchByteSpan(buf, pos, effectiveEnd, compiled, decoder, chunkHasAnsi)) {
                matches.push(offset + relIdx);
            }
            relIdx++;
            if (nl === -1) break;
            pos = nl + 1;
        }
        return { matches: new Int32Array(matches), lineCount: relIdx };
    }

    // Non-ASCII keyword fallback: contiguous decode + pre-compiled JS matcher (zero WASM boundary overhead)
    const text = decodeSliceSafe(decoder, buf);
    const lines = text.split('\n');
    if (text.endsWith('\n')) lines.pop();

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.endsWith('\r')) line = line.slice(0, -1);
        const cleanLine = chunkHasAnsi && line.includes('\x1b') ? line.replace(ANSI_ESCAPE_REGEX, '') : line;
        if (matchCompiledLine(cleanLine, compiled)) {
            matches.push(offset + i);
        }
    }

    return { matches: new Int32Array(matches), lineCount: lines.length };
};
