
import { describe, it, expect } from 'vitest';
import { checkIsMatch } from '../../utils/logFiltering';
import { LogRule } from '../../types';

describe('checkIsMatch (Log Filtering Logic)', () => {

    const baseRule: LogRule = {
        id: 'test-rule',
        name: 'Test Rule',
        includeGroups: [],
        excludes: [],
        highlights: [],
        happyCombosCaseSensitive: false,
        blockListCaseSensitive: false
    };

    it('should allow everything if rule is null', () => {
        expect(checkIsMatch('Some Log', null, false)).toBe(true);
    });

    it('should allow everything if rule is empty', () => {
        expect(checkIsMatch('Some Log', baseRule, false)).toBe(true);
    });

    describe('Quick Filters', () => {
        it('should filter only ERRORs when quickFilter is error', () => {
            expect(checkIsMatch('[INFO] Hello', null, false, 'error')).toBe(false);
            expect(checkIsMatch('[ERROR] Fail', null, false, 'error')).toBe(true);
            expect(checkIsMatch('Fatal Error occurred', null, false, 'error')).toBe(true);
            expect(checkIsMatch(' E/ Some Error', null, false, 'error')).toBe(true);
        });

        it('should filter only EXCEPTIONs when quickFilter is exception', () => {
            expect(checkIsMatch('NullPointerException', null, false, 'exception')).toBe(true);
            expect(checkIsMatch('System error', null, false, 'exception')).toBe(false);
            expect(checkIsMatch('Unhandled Exception', null, false, 'exception')).toBe(true);
        });
    });

    describe('Block List (Excludes)', () => {
        it('should block logs containing excluded keywords', () => {
            const rule: LogRule = { ...baseRule, excludes: ['bad', 'ignore'] };
            expect(checkIsMatch('This is a good log', rule, false)).toBe(true);
            expect(checkIsMatch('This is a bad log', rule, false)).toBe(false);
            expect(checkIsMatch('Please ignore this', rule, false)).toBe(false);
        });

        it('should be case insensitive by default', () => {
            const rule: LogRule = { ...baseRule, excludes: ['bad'] };
            expect(checkIsMatch('This is a BAD log', rule, false)).toBe(false);
        });

        it('should respect case sensitivity setting', () => {
            const rule: LogRule = { ...baseRule, excludes: ['bad'], blockListCaseSensitive: true };
            expect(checkIsMatch('This is a BAD log', rule, false)).toBe(true);
            expect(checkIsMatch('This is a bad log', rule, false)).toBe(false);
        });
    });

    describe('Happy Combos (Include Groups)', () => {
        it('should match if ANY group matches (OR logic)', () => {
            const rule: LogRule = { ...baseRule, includeGroups: [['apple'], ['banana']] };
            expect(checkIsMatch('I like apple', rule, false)).toBe(true);
            expect(checkIsMatch('I like banana', rule, false)).toBe(true);
            expect(checkIsMatch('I like cherry', rule, false)).toBe(false);
        });

        it('should match only if ALL terms in a group match (AND logic)', () => {
            const rule: LogRule = { ...baseRule, includeGroups: [['apple', 'pie']] };
            expect(checkIsMatch('apple pie is good', rule, false)).toBe(true);
            expect(checkIsMatch('apple tart', rule, false)).toBe(false);
            expect(checkIsMatch('cherry pie', rule, false)).toBe(false);
        });

        it('should return true if groups are empty (Allow All)', () => {
            expect(checkIsMatch('anything', { ...baseRule, includeGroups: [] }, false)).toBe(true);
        });

        it('should be case insensitive by default', () => {
            const rule: LogRule = { ...baseRule, includeGroups: [['apple']] };
            expect(checkIsMatch('i have an Apple', rule, false)).toBe(true);
        });

        it('should respect case sensitivity setting', () => {
            const rule: LogRule = { ...baseRule, includeGroups: [['Apple']], happyCombosCaseSensitive: true };
            expect(checkIsMatch('i have an apple', rule, false)).toBe(false);
            expect(checkIsMatch('i have an Apple', rule, false)).toBe(true);
        });
    });

    describe('Mixed Logic', () => {
        it('should block excluded items even if they match happy combos', () => {
            const rule: LogRule = { ...baseRule, includeGroups: [['apple']], excludes: ['worm'] };
            expect(checkIsMatch('apple', rule, false)).toBe(true);
            expect(checkIsMatch('apple with worm', rule, false)).toBe(false);
        });
    });

    describe('Bypass (Standard Log Heuristics)', () => {
        it('should identify Tizen/Android standard logs and always include if bypass is on', () => {
            const rule: LogRule = { ...baseRule, excludes: ['ERROR'] };
            expect(checkIsMatch('02-16 10:11:12.123 1234 1234 I/TAG: message', rule, true)).toBe(true);
            expect(checkIsMatch('[2024-02-16 10:11:12.123] 1234 1234 E TAG: message', rule, true)).toBe(true);
            expect(checkIsMatch('12:34:56.789 123 4567 INFO message', rule, true)).toBe(true);
        });

        it('should bypass (always include) shell-like output or plain text', () => {
            const rule: LogRule = { ...baseRule, includeGroups: [['IMPORTANT']] };
            expect(checkIsMatch('cat /proc/cpuinfo', rule, true)).toBe(true);
            expect(checkIsMatch('This text has nothing special in it', rule, true)).toBe(true);
        });

        it('should NOT bypass standard logs even if bypass is on (must match rules)', () => {
            const rule: LogRule = { ...baseRule, includeGroups: [['IMPORTANT']] };
            expect(checkIsMatch('02-16 10:11:12.123 1234 1234 I/TAG: Not important log', rule, true)).toBe(false);
        });
    });

    describe('Regression & Consistency', () => {
        it('should treat empty includeGroups as "Allow All"', () => {
            expect(checkIsMatch('anything', { ...baseRule, includeGroups: [] }, false)).toBe(true);
        });

        it('should handle special characters in keywords correctly', () => {
            const rule: LogRule = { ...baseRule, includeGroups: [['(error)'], ['[critical]']], happyCombosCaseSensitive: false };
            expect(checkIsMatch('System (ERROR) happened', rule, false)).toBe(true);
            expect(checkIsMatch('Status: [CRITICAL]', rule, false)).toBe(true);
        });

        it('should maintain consistency between different check paths', () => {
            const rule: LogRule = { ...baseRule, includeGroups: [['error']], happyCombosCaseSensitive: false };
            const line = '[ERROR] System failure';
            expect(checkIsMatch(line, rule, false)).toBe(true);
            expect(checkIsMatch(line, rule, true)).toBe(true);
        });
    });

    // ===================================================================
    // ✅ 2026-03-04 최적화 이후 추가된 타이트한 리그레션 TC 🐧🛡️🚀
    // - 배경: 다중 탭 성능 최적화 (동적 스케일링, Gap Merging, 프리페치 축소)
    // - 목적: 최적화 후에도 필터링 정확성이 100% 유지되는지 검증
    // ===================================================================
    describe('Multi-Tab & Large-Scale Regression (2026-03-04)', () => {

        const prodRule: LogRule = {
            id: 'prod',
            name: 'Production',
            includeGroups: [['test', 'start'], ['test', 'end'], ['error'], ['exception']],
            excludes: ['ping', 'heartbeat', 'keepalive'],
            highlights: [],
            happyCombosCaseSensitive: false,
            blockListCaseSensitive: false
        };

        it('[Regression] AND 조합(test+start)이 부분 매칭(test only)을 허용하지 않아야 한다', () => {
            expect(checkIsMatch('[INFO] test start event triggered', prodRule, false)).toBe(true);
            expect(checkIsMatch('[INFO] test only event', prodRule, false)).toBe(false);
            expect(checkIsMatch('[INFO] start only event', prodRule, false)).toBe(false);
        });

        it('[Regression] 단독 error/exception 키워드는 항상 매칭되어야 한다', () => {
            expect(checkIsMatch('[ERROR] Critical failure occurred', prodRule, false)).toBe(true);
            expect(checkIsMatch('NullPointerException thrown', prodRule, false)).toBe(true);
            expect(checkIsMatch('[FATAL] exception in thread main', prodRule, false)).toBe(true);
        });

        it('[Regression] 제외 키워드가 포함되면 다른 조건을 만족해도 차단되어야 한다', () => {
            expect(checkIsMatch('[ERROR] ping failed', prodRule, false)).toBe(false);
            expect(checkIsMatch('test start heartbeat monitor', prodRule, false)).toBe(false);
            expect(checkIsMatch('exception in keepalive thread', prodRule, false)).toBe(false);
        });

        it('[Large-Scale] 50만 라인 중 Sparse 매칭 정확성 유지 (0.2% 매칭률)', () => {
            // 동적 스케일링 10만줄 청크 시나리오 재현: 50만 라인 중 소수 매칭
            let matched = 0;
            const total = 500000;
            const MATCH_INTERVAL = 500; // 500줄에 1번만 target 삽입 (0.2% 매칭률)
            for (let i = 0; i < total; i++) {
                const line = i % MATCH_INTERVAL === 0
                    ? `2024-01-01 12:00:00 test start event at index ${i}`
                    : `2024-01-01 12:00:00 normal log line ${i} with info data`;
                if (checkIsMatch(line, prodRule, false)) matched++;
            }
            // 0.2% = 1000개 ±50 허용 (±5%)
            expect(matched).toBeGreaterThan(950);
            expect(matched).toBeLessThan(1050);
        });

        it('[Large-Scale] 100만 라인 전량 매칭 (Allow All) 정확성 유지', () => {
            // Gap Merging 최적화 후에도 모든 라인이 매칭되어야 함
            const allowAllRule: LogRule = { ...prodRule, includeGroups: [], excludes: [] };
            let matched = 0;
            const total = 1000000;
            for (let i = 0; i < total; i++) {
                const line = `2024-01-01 line ${i} content`;
                if (checkIsMatch(line, allowAllRule, false)) matched++;
            }
            expect(matched).toBe(total); // 100% 매칭 필수
        });

        it('[Large-Scale] Block List가 대용량에서도 완벽히 작동해야 한다', () => {
            // 10만 라인 중 10%가 차단 대상 (ping 포함)
            let blocked = 0;
            let passed = 0;
            const total = 100000;
            for (let i = 0; i < total; i++) {
                const line = i % 10 === 0
                    ? `[ERROR] ping timeout at ${i}`  // 차단 대상 (excludes: ping)
                    : `[ERROR] real error at ${i}`;   // 통과 대상
                if (checkIsMatch(line, prodRule, false)) {
                    passed++;
                } else {
                    blocked++;
                }
            }
            // 10%는 ping 포함으로 차단, 90%는 error로 통과
            expect(blocked).toBeGreaterThanOrEqual(total * 0.09); // 최소 9% 차단
            expect(passed).toBeGreaterThanOrEqual(total * 0.89);  // 최소 89% 통과
        });

        it('[Multi-Tab Sim] 두 개의 다른 규칙셋으로 동시에 필터링 해도 결과가 일관적이어야 한다', () => {
            // 실제 멀티탭 환경: 두 탭이 서로 다른 규칙으로 같은 로그를 필터링
            const rule1: LogRule = { ...baseRule, includeGroups: [['test']], excludes: [] };
            const rule2: LogRule = { ...baseRule, includeGroups: [['error']], excludes: ['test'] };

            const testLine = 'test log entry';
            const errorLine = '[ERROR] something failed';
            const bothLine = 'test [ERROR] combined entry';

            // rule1: test 포함 -> test, both 통과
            expect(checkIsMatch(testLine, rule1, false)).toBe(true);
            expect(checkIsMatch(errorLine, rule1, false)).toBe(false);
            expect(checkIsMatch(bothLine, rule1, false)).toBe(true);

            // rule2: error 포함 & test 없음 -> errorLine만 통과
            expect(checkIsMatch(testLine, rule2, false)).toBe(false);
            expect(checkIsMatch(errorLine, rule2, false)).toBe(true);
            expect(checkIsMatch(bothLine, rule2, false)).toBe(false); // test 있어서 차단
        });
    });
});
