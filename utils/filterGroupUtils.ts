import { LogRule } from '../types';

/**
 * 필터 그룹을 정제하는 순수 함수.
 * 동일한 root tag를 가진 그룹들 중 branch가 있으면 branch만 남기고, 없으면 그대로 반환합니다.
 */
export function refineGroups(rawGroups: string[][]): string[][] {
    const refinedGroups: string[][] = [];
    const groupsByRoot = new Map<string, string[][]>();
    rawGroups.forEach(group => {
        const root = (group[0] || '').trim();
        if (!root) return;
        if (!groupsByRoot.has(root)) groupsByRoot.set(root, []);
        groupsByRoot.get(root)!.push(group);
    });

    groupsByRoot.forEach((rootGroups) => {
        const hasBranches = rootGroups.some(g => g.length > 1 && g.slice(1).some(t => t.trim() !== ''));
        if (hasBranches) {
            const branchOnly = rootGroups.filter(g => g.length > 1 && g.slice(1).some(t => t.trim() !== ''));
            refinedGroups.push(...branchOnly);
        } else {
            refinedGroups.push(...rootGroups);
        }
    });
    return refinedGroups;
}

/**
 * 현재 설정(config)의 happyGroups 혹은 includeGroups를 조합하여
 * 실제 필터에 사용될 include groups 배열을 생성합니다.
 */
export function assembleIncludeGroups(config: LogRule): string[][] {
    // ✅ Master Toggle check removed as per 2nd refinement:
    // Now, filtering depends only on individual happyGroups' enabled states.
    // If all are disabled, it will naturally return an empty array and show all logs.

    const sourceGroups = config.happyGroups
        ? config.happyGroups.filter(h => h.enabled).map(h => h.tags)
        : config.includeGroups;

    return refineGroups(sourceGroups);
}
