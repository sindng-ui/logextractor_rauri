import { extractTimestamp, formatDuration } from './logTime';

/**
 * Confluence 테이블 셀 내부에서 안전하게 표시될 수 있도록 텍스트를 정제합니다.
 */
export const cleanConfluenceContent = (text: string): string => {
    // 1. 파이프(|)는 테이블 구분자이므로 ¦ (broken bar)로 교체하여 구조를 보호합니다.
    // 2. {, [ 는 매크로나 링크 동작을 유발하므로 탈출합니다.
    let safe = text
        .replace(/\|/g, '｜') // 전각 파이프로 교체 (테이블 구조 보호 + 시각적 동일성)
        .replace(/\{/g, '｛') // 전각 중괄호로 교체하여 매크로 오인식 방지
        .replace(/\}/g, '｝') // 전각 중괄호로 교체하여 매크로 오인식 방지
        .replace(/\[/g, '［') // 전각 대괄호로 교체하여 링크 오인식 방지
        .replace(/\]/g, '］') // 전각 대괄호로 교체하여 링크 오인식 방지
        .replace(/\n/g, ' ')
        .replace(/\r/g, '');

    // 3. 매우 긴 로그는 Confluence 파서 한계로 표 전체를 망가뜨리므로 10,000자로 제한합니다.
    if (safe.length > 10000) {
        safe = safe.substring(0, 10000) + '... (truncated for Confluence)';
    }

    return safe;
};

/**
 * 로그 데이터 배열을 Confluence Markdown 테이블 형식으로 변환합니다.
 * 형식: | Line | Time Diff | Acc. Time | Content |
 *       | :--- | :--- | :--- | :--- |
 */
export const convertToConfluenceTable = (lines: { 
    lineNum: string | number; 
    content: string;
    timeDiff?: string;
    accTime?: string;
}[]): string => {
    if (lines.length === 0) return '';

    let md = '| Line | Time Diff | Acc. Time | Content |\n| :--- | :--- | :--- | :--- |\n';
    const firstTs = lines.length > 0 ? extractTimestamp(lines[0].content) : null;

    lines.forEach((line, idx) => {
        let timeDiff = line.timeDiff || '';
        let accTime = line.accTime || '';
        
        // 값이 없을 경우에만 재계산 시도
        if (!timeDiff || !accTime) {
            const currTs = extractTimestamp(line.content);

            if (!timeDiff && idx > 0) {
                const prevTs = extractTimestamp(lines[idx - 1].content);
                if (prevTs !== null && currTs !== null) {
                    const diff = currTs - prevTs;
                    const absDiff = Math.abs(diff);
                    const sign = diff >= 0 ? '+' : '-';
                    const timeStr = absDiff < 60000 
                        ? (absDiff / 1000).toFixed(3) + 's' 
                        : formatDuration(absDiff);
                    timeDiff = `${sign}${timeStr}`;
                }
            } else if (!timeDiff && idx === 0) {
                // 첫 라인의 timeDiff는 비워둠 (UI와 동일)
            }

            if (!accTime) {
                if (idx === 0) {
                    accTime = '0.000s';
                } else if (firstTs !== null && currTs !== null) {
                    const accDiff = currTs - firstTs;
                    const absAccDiff = Math.abs(accDiff);
                    const accSign = accDiff >= 0 ? '' : '-';
                    let accText = absAccDiff < 60000 
                        ? (absAccDiff / 1000).toFixed(3) + 's' 
                        : formatDuration(absAccDiff);
                    accTime = `${accSign}${accText}`;
                }
            }
        }

        const safeContent = cleanConfluenceContent(line.content);
        md += `| ${line.lineNum} | ${timeDiff || '-'} | ${accTime || '-'} | ${safeContent} |\n`;
    });

    return md;
};
