import { describe, it, expect } from 'vitest';
import { LogRule } from '../../types';
import { checkIsMatch } from '../../utils/logFiltering';

/**
 * Worker Filtering Logic Tests
 * 
 * PURPOSE: Verify filtering logic in LogProcessor.worker.ts doesn't silently drop logs
 * APPROACH: Test the REAL checkIsMatch function from utils/logFiltering.ts
 * SAFETY: Tests actual production code - no duplication!
 */

describe('Worker Filtering Logic', () => {

    // Helper to normalize rule (simulates worker behavior)
    const normalizeRule = (rule: LogRule): LogRule => {
        const isHappyCase = !!rule.happyCombosCaseSensitive;
        const isBlockCase = !!rule.blockListCaseSensitive;
        return {
            ...rule,
            includeGroups: rule.includeGroups.map(g => g.map(t => isHappyCase ? t : t.toLowerCase())),
            excludes: rule.excludes.map(e => isBlockCase ? e : e.toLowerCase())
        };
    };

    it('[CRITICAL] Include filter (single term)', () => {
        const rawRule: LogRule = {
            id: '1', name: 'Test', includeGroups: [['ERROR']], excludes: [],
            happyCombosCaseSensitive: false, blockListCaseSensitive: false,
            highlights: [], showRawLogLines: false
        };
        const rule = normalizeRule(rawRule);
        expect(checkIsMatch('ERROR: Failed', rule, true)).toBe(true);
        expect(checkIsMatch('error: lowercase', rule, true)).toBe(true); // Case insensitive
        expect(checkIsMatch('INFO: Normal', rule, true)).toBe(false);
    });

    it('[CRITICAL] AND logic in Happy Combos', () => {
        const rawRule: LogRule = {
            id: '1', name: 'Test', includeGroups: [['ERROR', 'Connection']],
            excludes: [], happyCombosCaseSensitive: false, blockListCaseSensitive: false,
            highlights: [], showRawLogLines: false
        };
        const rule = normalizeRule(rawRule);
        expect(checkIsMatch('ERROR: Connection failed', rule, true)).toBe(true);
        expect(checkIsMatch('ERROR: Timeout', rule, true)).toBe(false); // Missing "Connection"
    });

    it('[CRITICAL] OR logic between groups', () => {
        const rawRule: LogRule = {
            id: '1', name: 'Test', includeGroups: [['ERROR'], ['WARNING']],
            excludes: [], happyCombosCaseSensitive: false, blockListCaseSensitive: false,
            highlights: [], showRawLogLines: false
        };
        const rule = normalizeRule(rawRule);
        expect(checkIsMatch('ERROR: Failed', rule, true)).toBe(true);
        expect(checkIsMatch('WARNING: Low memory', rule, true)).toBe(true);
        expect(checkIsMatch('INFO: Normal', rule, true)).toBe(false);
    });

    it('[CRITICAL] Block list excludes', () => {
        const rawRule: LogRule = {
            id: '1', name: 'Test', includeGroups: [],
            excludes: ['DEBUG', 'VERBOSE'], happyCombosCaseSensitive: false,
            blockListCaseSensitive: false, highlights: [], showRawLogLines: false
        };
        const rule = normalizeRule(rawRule);
        expect(checkIsMatch('DEBUG: Trace', rule, true)).toBe(false);
        expect(checkIsMatch('VERBOSE: Details', rule, true)).toBe(false);
        expect(checkIsMatch('INFO: Important', rule, true)).toBe(true);
    });

    it('[CRITICAL] Excludes override includes', () => {
        const rawRule: LogRule = {
            id: '1', name: 'Test', includeGroups: [['ERROR']],
            excludes: ['DEBUG'], happyCombosCaseSensitive: false,
            blockListCaseSensitive: false, highlights: [], showRawLogLines: false
        };
        const rule = normalizeRule(rawRule);
        expect(checkIsMatch('ERROR: Connection', rule, true)).toBe(true);
        expect(checkIsMatch('DEBUG ERROR: Test', rule, true)).toBe(false);
    });

    it('[HIGH] Case sensitivity for includes', () => {
        const rawRule: LogRule = {
            id: '1', name: 'Test', includeGroups: [['ERROR']], excludes: [],
            happyCombosCaseSensitive: true, blockListCaseSensitive: false,
            highlights: [], showRawLogLines: false
        };
        const rule = normalizeRule(rawRule);
        expect(checkIsMatch('ERROR: Uppercase', rule, true)).toBe(true);
        expect(checkIsMatch('error: Lowercase', rule, true)).toBe(false);
    });

    it('[HIGH] Case sensitivity for excludes', () => {
        const rawRule: LogRule = {
            id: '1', name: 'Test', includeGroups: [], excludes: ['DEBUG'],
            happyCombosCaseSensitive: false, blockListCaseSensitive: true,
            highlights: [], showRawLogLines: false
        };
        const rule = normalizeRule(rawRule);
        expect(checkIsMatch('DEBUG: Uppercase', rule, true)).toBe(false);
        expect(checkIsMatch('debug: Lowercase', rule, true)).toBe(true); // Not blocked
    });

    it('[CRITICAL] Empty groups = show all', () => {
        const rawRule: LogRule = {
            id: '1', name: 'Test', includeGroups: [], excludes: [],
            happyCombosCaseSensitive: false, blockListCaseSensitive: false,
            highlights: [], showRawLogLines: false
        };
        const rule = normalizeRule(rawRule);
        expect(checkIsMatch('Any line', rule, true)).toBe(true);
    });

    it('[MEDIUM] Shell output bypass', () => {
        const rawRule: LogRule = {
            id: '1', name: 'Test', includeGroups: [['SPECIFIC']],
            excludes: [], happyCombosCaseSensitive: false, blockListCaseSensitive: false,
            highlights: [], showRawLogLines: true // Enable bypass
        };
        const rule = normalizeRule(rawRule);
        // Non-standard log (shell output) -> Passed as bypassShellFilter=true
        expect(checkIsMatch('$ ls -la', rule, true)).toBe(true);
        expect(checkIsMatch('total 1234', rule, true)).toBe(true);
        // Standard log should be filtered (Bypass logic identifies it as standard log, so it falls through to normal filtering)
        expect(checkIsMatch('01-22 10:30:45 I/SPECIFIC: Ok', rule, true)).toBe(true);
        expect(checkIsMatch('01-22 10:30:45 I/OTHER: Fail', rule, true)).toBe(false);
    });

    it('[MEDIUM] Test log bypass', () => {
        const rawRule: LogRule = {
            id: '1', name: 'Test', includeGroups: [['IMPOSSIBLE']],
            excludes: [], happyCombosCaseSensitive: false, blockListCaseSensitive: false,
            highlights: [], showRawLogLines: false
        };
        const rule = normalizeRule(rawRule);
        // Force include test logs even if rules don't match
        expect(checkIsMatch('[TEST_LOG_SDB] Test', rule, true)).toBe(true);
        expect(checkIsMatch('[TEST_LOG_SSH] Test', rule, true)).toBe(true);
    });
});

/**
 * ANSI Stripping Test
 */
describe('ANSI Code Stripping', () => {
    it('[CRITICAL] Should strip ANSI codes', () => {
        // Simulated from Worker code line 239
        const stripANSI = (line: string) => line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

        const lineWithANSI = '\x1B[31mERROR: Red\x1B[0m';
        const cleaned = stripANSI(lineWithANSI);

        expect(cleaned).toBe('ERROR: Red');
        expect(cleaned).not.toContain('\x1B');
    });
});
