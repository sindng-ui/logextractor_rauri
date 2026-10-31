import { useState, useEffect, useRef } from 'react';
import { getStoredValue, setStoredValue } from '../utils/db';
import { LogRule } from '../types';

// 🎯 전역 공유를 위한 Pub/Sub 싱글톤 관리 레이어
let globalSelectedRuleId: string = '';
const listeners = new Set<(id: string) => void>();

function setGlobalSelectedRuleId(id: string) {
    if (globalSelectedRuleId === id) return;
    globalSelectedRuleId = id;
    setStoredValue('lastSelectedRuleId', id);
    listeners.forEach(listener => listener(id));
}

/**
 * 선택된 Rule ID(프리셋)를 전역적으로 공유하고 유지하는 훅.
 * - 탭에 구애받지 않고 사용자가 선택한 미션이 전체 실시간 동기화되며, 앱 재시작 시에도 유지됩니다.
 */
export function useSelectedRuleId(rules: LogRule[], tabId: string) {
    const [selectedRuleId, setSelectedRuleId] = useState<string>(() => {
        // 이미 메모리에 로드된 전역 선택값이 있다면 최우선 적용
        return globalSelectedRuleId || (rules.length > 0 ? rules[0].id : '');
    });
    const hasRestoredFromDb = useRef(false);

    // 1. 전역 선택 변경 이벤트 구독 및 최초 DB 복원
    useEffect(() => {
        const listener = (id: string) => {
            setSelectedRuleId(id);
        };
        listeners.add(listener);

        if (rules.length > 0 && !hasRestoredFromDb.current) {
            hasRestoredFromDb.current = true;
            getStoredValue('lastSelectedRuleId').then((saved) => {
                const activeId = globalSelectedRuleId || saved;
                const target = activeId && rules.find(r => r.id === activeId) ? activeId : (rules[0]?.id || '');
                if (target) {
                    setGlobalSelectedRuleId(target);
                    setSelectedRuleId(target);
                }
            });
        }

        return () => {
            listeners.delete(listener); // 💥 언마운트 시 리스너 완벽 클린업 (메모리 누수 차단)
        };
    }, [rules]);

    // 2. 현재 선택된 Rule이 rules 목록에 실재하는지 무결성 검증 (삭제 및 초기 폴백 대응)
    useEffect(() => {
        if (rules.length === 0) return;

        // DB 복원이 끝났거나 rules가 갱신되었을 때, 선택한 룰이 목록에 없으면 첫 번째 룰로 안전 폴백
        if (selectedRuleId && !rules.find(r => r.id === selectedRuleId)) {
            const fallbackId = rules[0]?.id || '';
            setGlobalSelectedRuleId(fallbackId);
            setSelectedRuleId(fallbackId);
        }
    }, [rules, selectedRuleId]);

    // 3. 외부 노출용 커스텀 Setter 함수
    const updateSelectedRuleId = (id: string) => {
        setGlobalSelectedRuleId(id);
        setSelectedRuleId(id);
    };

    return { selectedRuleId, setSelectedRuleId: updateSelectedRuleId };
}

