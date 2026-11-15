import { describe, it, expect } from 'vitest';
import {
    compileFilterRule,
    filterByteBuffer,
    matchCompiledLine,
    type QuickFilterMode,
} from '../../utils/byteLogFiltering';
import { checkIsMatch } from '../../utils/logFiltering';
import type { LogRule } from '../../types';

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1B\[[0-9;]*[a-zA-Z]/g;

const normalizeForRef = (rule: LogRule): LogRule => {
    const isHappyCS = !!rule.happyCombosCaseSensitive;
    const isBlockCS = !!rule.blockListCaseSensitive;
    return {
        ...rule,
        excludes: (rule.excludes || [])
            .map(e => (isBlockCS ? e.trim() : e.trim().toLowerCase()))
            .filter(Boolean),
        includeGroups: (rule.includeGroups || [])
            .map(g => g.map(t => (isHappyCS ? t.trim() : t.trim().toLowerCase())).filter(Boolean))
            .filter(g => g.length > 0),
    };
};

const referenceFilterText = (rawText: string, rule: LogRule, quickFilter: QuickFilterMode): number[] => {
    const normalized = normalizeForRef(rule);
    const lines = rawText.split('\n');
    if (rawText.endsWith('\n')) lines.pop();
    const out: number[] = [];
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.endsWith('\r')) line = line.slice(0, -1);
        const clean = line.includes('\x1b') ? line.replace(ANSI_REGEX, '') : line;
        if (checkIsMatch(clean, normalized, false, quickFilter)) {
            out.push(i);
        }
    }
    return out;
};

const encoder = new TextEncoder();

describe('byteLogFiltering differential & parity tests', () => {
    const sampleCorpus = [
        'AUDIOSERVICE: 376.084 W/AUDIOSERVICE(P 3464): network.cpp> Socket timeout\r',
        'BLUETOOTH: 3682.884 E/BLUETOOTH(P 4201): ui_manager.js> Battery level changed\r',
        'INFO: bluetooth lowercase socket error',
        '',
        '\x1b[31mBlue\x1b[0mtooth split across ANSI codes',
        '\x1B[1;33mWIFISERVICE\x1B[0m: fail exception detected',
        '단일 한글 로그 블루투스 연결 성공',
        'BLUETOOTH: excluded debug trace',
        'SingleChar X match test',
        'Tail without newline bluetooth',
    ].join('\n');

    const rules: Array<{ name: string; rule: LogRule; quickFilter: QuickFilterMode }> = [
        {
            name: 'simple ASCII case-insensitive (bluetooth)',
            quickFilter: 'none',
            rule: {
                id: 'r1',
                name: 'r1',
                includeGroups: [['bluetooth']],
                excludes: [],
                happyCombosCaseSensitive: false,
                blockListCaseSensitive: false,
                highlights: [],
                showRawLogLines: false,
            },
        },
        {
            name: 'ASCII case-sensitive (BLUETOOTH)',
            quickFilter: 'none',
            rule: {
                id: 'r2',
                name: 'r2',
                includeGroups: [['BLUETOOTH']],
                excludes: ['excluded'],
                happyCombosCaseSensitive: true,
                blockListCaseSensitive: false,
                highlights: [],
                showRawLogLines: false,
            },
        },
        {
            name: 'OR of ANDs + blockList case sensitive',
            quickFilter: 'none',
            rule: {
                id: 'r3',
                name: 'r3',
                includeGroups: [['bluetooth', 'socket'], ['wifiservice', 'fail']],
                excludes: ['DEBUG'],
                happyCombosCaseSensitive: false,
                blockListCaseSensitive: true,
                highlights: [],
                showRawLogLines: false,
            },
        },
        {
            name: 'single-char keyword',
            quickFilter: 'none',
            rule: {
                id: 'r4',
                name: 'r4',
                includeGroups: [['X']],
                excludes: [],
                happyCombosCaseSensitive: true,
                blockListCaseSensitive: false,
                highlights: [],
                showRawLogLines: false,
            },
        },
        {
            name: 'quickFilter=error with excludes',
            quickFilter: 'error',
            rule: {
                id: 'r5',
                name: 'r5',
                includeGroups: [],
                excludes: ['wifiservice'],
                happyCombosCaseSensitive: false,
                blockListCaseSensitive: false,
                highlights: [],
                showRawLogLines: false,
            },
        },
        {
            name: 'quickFilter=exception',
            quickFilter: 'exception',
            rule: {
                id: 'r6',
                name: 'r6',
                includeGroups: [['wifiservice']],
                excludes: [],
                happyCombosCaseSensitive: false,
                blockListCaseSensitive: false,
                highlights: [],
                showRawLogLines: false,
            },
        },
        {
            name: 'non-ASCII Korean keyword fallback',
            quickFilter: 'none',
            rule: {
                id: 'r7',
                name: 'r7',
                includeGroups: [['블루투스']],
                excludes: [],
                happyCombosCaseSensitive: false,
                blockListCaseSensitive: false,
                highlights: [],
                showRawLogLines: false,
            },
        },
        {
            name: 'empty rule matches every line',
            quickFilter: 'none',
            rule: {
                id: 'r8',
                name: 'r8',
                includeGroups: [['   ']],
                excludes: [],
                happyCombosCaseSensitive: false,
                blockListCaseSensitive: false,
                highlights: [],
                showRawLogLines: false,
            },
        },
    ];

    for (const tc of rules) {
        it(`matches reference checkIsMatch identically: ${tc.name} (with and without trailing newline)`, () => {
            for (const text of [sampleCorpus, sampleCorpus + '\n']) {
                const buf = encoder.encode(text);
                const compiled = compileFilterRule(tc.rule, tc.quickFilter);
                const res = filterByteBuffer(buf, 100, compiled);
                const expected = referenceFilterText(text, tc.rule, tc.quickFilter).map(idx => idx + 100);
                expect(Array.from(res.matches)).toEqual(expected);
            }
        });
    }

    it('detects ASCII vs non-ASCII optimization flag accurately', () => {
        const ascii = compileFilterRule({
            id: '1',
            name: 'a',
            includeGroups: [['bluetooth']],
            excludes: ['debug'],
            happyCombosCaseSensitive: false,
            blockListCaseSensitive: false,
            highlights: [],
            showRawLogLines: false,
        });
        expect(ascii.canUseAsciiByteScan).toBe(true);

        const unicode = compileFilterRule({
            id: '2',
            name: 'u',
            includeGroups: [['블루투스']],
            excludes: [],
            happyCombosCaseSensitive: false,
            blockListCaseSensitive: false,
            highlights: [],
            showRawLogLines: false,
        });
        expect(unicode.canUseAsciiByteScan).toBe(false);
    });

    it('matchCompiledLine handles string mode consistently', () => {
        const compiled = compileFilterRule({
            id: 's1',
            name: 's1',
            includeGroups: [['bluetooth']],
            excludes: ['ignore'],
            happyCombosCaseSensitive: false,
            blockListCaseSensitive: false,
            highlights: [],
            showRawLogLines: false,
        });
        expect(matchCompiledLine('E/BLUETOOTH: ready', compiled)).toBe(true);
        expect(matchCompiledLine('E/BLUETOOTH: ignore me', compiled)).toBe(false);
        expect(matchCompiledLine('E/WIFISERVICE: ready', compiled)).toBe(false);
    });
});
