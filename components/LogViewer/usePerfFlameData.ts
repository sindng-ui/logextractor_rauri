import { useMemo } from 'react';
import { AnalysisResult } from '../../utils/perfAnalysis';

interface UsePerfFlameDataProps {
    result: AnalysisResult | null;
    showOnlyFail?: boolean;
    activeTags?: string[];
    trimRange?: { startTime: number; endTime: number } | null;
}

/**
 * 플레임 차트 렌더링에 필요한 세그먼트 데이터 계산을 담당하는 Hook
 * - flameSegments: 정렬 + 레인 배치 완료된 세그먼트 배열
 * - maxLane: 최대 레인 수
 * - laneTidMap: 레인별 TID 매핑
 */
export function usePerfFlameData({
    result,
    showOnlyFail,
    activeTags = [],
    trimRange
}: UsePerfFlameDataProps) {
    const flameSegments = useMemo(() => {
        if (!result) return [];

        let baseSegments = [...result.segments];
        // Note: showOnlyFail does NOT filter here — it affects opacity in drawFlameChart.
        // Removing segments from flameSegments would drop lanes causing layout collapse.

        // Tag filter: show only segments whose logs contain at least one active tag
        if (activeTags.length > 0) {
            const lowerTags = activeTags.map(t => t.toLowerCase());
            baseSegments = baseSegments.filter(s =>
                s.logs?.some(log => {
                    const lowerLog = log.toLowerCase();
                    return lowerTags.some(tag => lowerLog.includes(tag));
                })
            );
        }
        // Trim filter: show only segments that overlap the trim window
        if (trimRange) {
            baseSegments = baseSegments.filter(s =>
                s.startTime < trimRange.endTime && s.endTime > trimRange.startTime
            );
        }

        const sorted = baseSegments.sort((a, b) => (a.startTime - b.startTime) || (b.duration - a.duration));
        const lanes: number[] = [];

        return sorted.map(s => {
            let lane = s.lane !== undefined ? s.lane : 0;

            if (s.lane === undefined) {
                while (lanes[lane] !== undefined && lanes[lane] > s.startTime) {
                    lane++;
                }
            }

            lanes[lane] = Math.max(lanes[lane] || 0, s.endTime);

            return {
                ...s,
                lane,
                relStart: (s.startTime - result.startTime) / 1000,
                relEnd: (s.endTime - result.startTime) / 1000,
            };
        });
    }, [result, showOnlyFail, activeTags, trimRange]);

    const maxLane = useMemo(() => {
        if (!flameSegments.length) return 4;
        const actualMax = flameSegments.reduce((max, s) => Math.max(max, s.lane || 0), 0);
        return Math.max(4, actualMax);
    }, [flameSegments]);

    const laneTidMap = useMemo(() => {
        const map = new Map<number, string>();
        flameSegments.forEach(s => {
            if (s.lane !== undefined && !map.has(s.lane)) {
                if (s.lane === 0) {
                    map.set(s.lane, 'Global');
                } else {
                    let tid = s.tid;
                    if (!tid || tid === 'Main') {
                        const firstLog = s.logs?.[0];
                        if (firstLog) {
                            const pidMatch = firstLog.match(/\[\s*(\d+)\s*\]/) || firstLog.match(/PID[:\s]*(\d+)/i);
                            if (pidMatch) tid = pidMatch[1];
                        }
                    }
                    map.set(s.lane, tid || 'Process');
                }
            }
        });
        return map;
    }, [flameSegments]);

    return { flameSegments, maxLane, laneTidMap };
}
