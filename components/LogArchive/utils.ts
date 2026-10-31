/**
 * 로그 아카이브 유틸리티 함수들
 */

/**
 * 로그 내용에서 스마트 태그 추천
 * 우선순위: 자주 사용되는 태그가 먼저 오도록 정렬됨
 */
export function suggestTags(content: string, tagFrequency?: Record<string, number>): string[] {
    const suggestions: string[] = [];

    // ✅ Performance: Only scan the first 100KB for tag suggestions in large logs
    const scanLimit = 100 * 1024;
    const contentToScan = content.length > scanLimit ? content.substring(0, scanLimit) : content;

    // 패턴 매칭 (우선순위 높은 것부터)
    const patterns: Array<{ tag: string; regex: RegExp }> = [
        // ... (생략된 기존 패턴들)
        // 로그 레벨
        { tag: 'ERROR', regex: /\b(error|err|exception|fatal|critical)\b/i },
        { tag: 'WARNING', regex: /\b(warn|warning)\b/i },
        { tag: 'INFO', regex: /\b(info|information)\b/i },
        { tag: 'DEBUG', regex: /\b(debug|trace)\b/i },

        // 시스템 리소스
        { tag: 'CPU', regex: /\b(cpu|processor|core|thread|usage)\b/i },
        { tag: 'MEMORY', regex: /\b(memory|heap|stack|gc|garbage|oom|malloc|free)\b/i },
        { tag: 'PERF', regex: /\b(performance|slow|timeout|latency|fps|jank|bottleneck)\b/i },

        // UI / Lifecycle
        { tag: 'VIEW', regex: /\b(view|render|layout|draw|paint|ui|widget|window)\b/i },
        { tag: 'LIFECYCLE', regex: /\b(lifecycle|onCreate|onResume|onPause|onDestroy|onStart|onStop|activity|fragment)\b/i },

        // IoT / SmartThings
        { tag: 'ST-API', regex: /\b(smartthings|st-api|capability|command|component|attribute)\b/i },
        { tag: 'SSE', regex: /\b(sse|server-sent|eventsource|event-stream|subscription)\b/i },
        { tag: 'DEVICE', regex: /\b(device|sensor|actuator|switch|thermostat|light|plug|hub)\b/i },

        // 인프라
        { tag: 'NETWORK', regex: /\b(network|connection|socket|http|https|api|request|response)\b/i },
        { tag: 'DATABASE', regex: /\b(database|db|sql|query|transaction)\b/i },
        { tag: 'FILE_IO', regex: /\b(file|disk|io|read|write)\b/i },
        { tag: 'AUTH', regex: /\b(auth|login|logout|permission|access|token|oauth)\b/i },

        // Tizen / 모바일
        { tag: 'CRASH', regex: /\b(crash|segfault|sigsegv|sigabrt|backtrace|tombstone)\b/i },
        { tag: 'ANR', regex: /\b(anr|not responding|watchdog|deadlock|freeze)\b/i },
    ];

    for (const { tag, regex } of patterns) {
        if (regex.test(contentToScan)) {
            suggestions.push(tag);
        }
    }

    // 자주 사용하는 태그 우선 정렬
    if (tagFrequency && Object.keys(tagFrequency).length > 0) {
        suggestions.sort((a, b) => {
            const freqA = tagFrequency[a] || 0;
            const freqB = tagFrequency[b] || 0;
            return freqB - freqA; // 빈도 높은 순
        });
    }

    return Array.from(new Set(suggestions)); // 중복 제거
}

/**
 * HTML 엔티티 디코딩
 * 예: &quot; -> "
 */
export function decodeHtmlEntities(text: string): string {
    if (!text) return '';
    return text
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'");
}

/**
 * 로그 내용에서 첫 줄 추출 (제목용)
 * HTML 엔티티 디코딩 적용
 */
export function extractFirstLine(content: string, maxLength: number = 100): string {
    if (!content) return 'Untitled';

    // ✅ Performance: Avoid split('\n') for large content
    let firstLineEnd = content.indexOf('\n');
    let firstLine = firstLineEnd === -1 ? content.trim() : content.substring(0, firstLineEnd).trim();

    // If first line is empty, try to find the next non-empty line (up to 1KB scan)
    if (firstLine === '' && firstLineEnd !== -1) {
        const scanMax = Math.min(content.length, firstLineEnd + 1024);
        let nextStart = firstLineEnd + 1;
        while (nextStart < scanMax) {
            let nextEnd = content.indexOf('\n', nextStart);
            let candidate = nextEnd === -1
                ? content.substring(nextStart).trim()
                : content.substring(nextStart, nextEnd).trim();

            if (candidate !== '') {
                firstLine = candidate;
                break;
            }
            if (nextEnd === -1) break;
            nextStart = nextEnd + 1;
        }
    }

    if (firstLine === '') return 'Untitled';

    // HTML 엔티티 디코딩
    firstLine = decodeHtmlEntities(firstLine);

    if (firstLine.length <= maxLength) return firstLine;

    return firstLine.substring(0, maxLength) + '...';
}

/**
 * 날짜 포맷팅
 */
export function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // 1분 미만
    if (diff < 60 * 1000) {
        return 'Just now';
    }

    // 1시간 미만
    if (diff < 60 * 60 * 1000) {
        const minutes = Math.floor(diff / (60 * 1000));
        return `${minutes}m ago`;
    }

    // 24시간 미만
    if (diff < 24 * 60 * 60 * 1000) {
        const hours = Math.floor(diff / (60 * 60 * 1000));
        return `${hours}h ago`;
    }

    // 7일 미만
    if (diff < 7 * 24 * 60 * 60 * 1000) {
        const days = Math.floor(diff / (24 * 60 * 60 * 1000));
        return `${days}d ago`;
    }

    // 그 외 (날짜 표시)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    // 올해인 경우 년도 생략
    if (year === now.getFullYear()) {
        return `${month}-${day} ${hours}:${minutes}`;
    }

    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 상대적 날짜 포맷팅 (풀 버전)
 */
export function formatDateFull(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 파일 크기 포맷팅
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * RegEx 패턴 검증
 */
export function isValidRegex(pattern: string): boolean {
    try {
        new RegExp(pattern);
        return true;
    } catch {
        return false;
    }
}

/**
 * 텍스트에서 RegEx 매치 강조용 범위 추출
 */
export function findRegexMatches(text: string, pattern: string): Array<{ start: number; end: number; match: string }> {
    if (!isValidRegex(pattern)) return [];

    const regex = new RegExp(pattern, 'gi');
    const matches: Array<{ start: number; end: number; match: string }> = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        matches.push({
            start: match.index,
            end: match.index + match[0].length,
            match: match[0],
        });
    }

    return matches;
}

/**
 * 로그 라인 수 계산
 */
export function countLines(content: string): number {
    return content.split('\n').length;
}

/**
 * 태그 색상 생성 (해시 기반)
 */
export function getTagColor(tag: string): string {
    // 미리 정의된 색상 (일반적인 로그 레벨)
    const predefinedColors: Record<string, string> = {
        'ERROR': '#ef4444',
        'WARNING': '#f59e0b',
        'INFO': '#3b82f6',
        'DEBUG': '#8b5cf6',
        'NETWORK': '#06b6d4',
        'DATABASE': '#10b981',
        'MEMORY': '#ec4899',
        'FILE_IO': '#f97316',
        'AUTH': '#6366f1',
        'PERFORMANCE': '#eab308',
    };

    if (predefinedColors[tag]) {
        return predefinedColors[tag];
    }

    // 해시 기반 색상 생성
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 60%, 50%)`;
}

/**
 * 클립보드에 복사
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        return false;
    }
}

/**
 * JSON 파일 다운로드
 */
export function downloadJSON(data: string, filename: string): void {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * 파일 선택 다이얼로그 열기
 */
export function openFileDialog(accept: string = '.json'): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;

        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            resolve(file || null);
        };

        input.oncancel = () => {
            resolve(null);
        };

        input.click();
    });
}

/**
 * 파일 읽기
 */
export function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            resolve(e.target?.result as string);
        };

        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };

        reader.readAsText(file);
    });
}
