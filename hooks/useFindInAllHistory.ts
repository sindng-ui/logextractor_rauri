/**
 * useFindInAllHistory.ts
 * 전체 찾기 검색 이력 관리 전담 훅 🐧⚡
 * - Dexie DB 기반 영구 저장 (앱 종료 후에도 유지)
 * - 최대 10개 이력 보관
 * - 마우스 호버 미리보기용 레이블 자동 생성
 */

import { useState, useCallback, useEffect } from 'react';
import { getStoredValue, setStoredValue } from '../utils/db';

const HISTORY_DB_KEY = 'find-in-all-history';
const MAX_HISTORY = 10;

export interface FindInAllRule {
    /** 해피콤보 키워드 목록 (OR 관계) */
    includeKeywords: string[];
    /** 블럭리스트 키워드 목록 */
    excludeKeywords: string[];
    /** 해피콤보 대소문자 구분 */
    caseSensitive: boolean;
    /** 블럭리스트 대소문자 구분 */
    blockListCaseSensitive: boolean;
    /** 특정 탭만 검색 대상인 경우 탭 ID 🐧⚡ */
    targetTabId?: string;
}

export interface FindInAllHistoryItem {
    id: string;
    timestamp: number;
    /** 한 줄 요약 레이블 (해피콤보 키워드 미리보기) */
    label: string;
    rule: FindInAllRule;
}

/** 룰에서 한 줄 요약 레이블 생성 */
export function buildHistoryLabel(rule: FindInAllRule): string {
    const keywords = rule.includeKeywords.filter(k => k.trim());
    if (keywords.length === 0) return '(no keywords)';
    const preview = keywords.slice(0, 3).join(', ');
    return keywords.length > 3 ? `${preview} ... (+${keywords.length - 3})` : preview;
}

export const useFindInAllHistory = () => {
    const [history, setHistory] = useState<FindInAllHistoryItem[]>([]);

    /** 앱 시작 시 DB에서 이력 로드 */
    useEffect(() => {
        const loadHistory = async () => {
            try {
                const stored = await getStoredValue(HISTORY_DB_KEY, []);
                if (Array.isArray(stored)) {
                    setHistory(stored);
                }
            } catch (e) {
                console.error('[FindInAllHistory] Failed to load history', e);
            }
        };
        loadHistory();
    }, []);

    /** 새 이력 추가 (맨 앞에 삽입, 최대 10개 유지, DB 즉시 저장) */
    const addHistory = useCallback(async (rule: FindInAllRule) => {
        const newItem: FindInAllHistoryItem = {
            id: `fh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            label: buildHistoryLabel(rule),
            rule,
        };

        setHistory(prev => {
            // 동일한 룰이 있으면 제거하고 맨 앞에 추가
            const deduplicated = prev.filter(item => {
                const sameKeywords =
                    JSON.stringify(item.rule.includeKeywords) ===
                    JSON.stringify(rule.includeKeywords);
                const sameExcludes =
                    JSON.stringify(item.rule.excludeKeywords) ===
                    JSON.stringify(rule.excludeKeywords);
                return !(sameKeywords && sameExcludes);
            });

            const next = [newItem, ...deduplicated].slice(0, MAX_HISTORY);

            // DB 비동기 저장 (렌더 블로킹 없음)
            setStoredValue(HISTORY_DB_KEY, next).catch(e =>
                console.error('[FindInAllHistory] Failed to save history', e)
            );

            return next;
        });
    }, []);

    /** 이력 전체 삭제 */
    const clearHistory = useCallback(async () => {
        setHistory([]);
        await setStoredValue(HISTORY_DB_KEY, []);
    }, []);

    return {
        history,
        addHistory,
        clearHistory,
    };
};
