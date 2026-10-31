export interface ExtractedEntity {
    type: 'pid' | 'tid' | 'hex';
    value: string;
    label: string;
}

/**
 * Intelligent utility to extract key debug entities (PID, TID, Hex addresses) from a single log line.
 * It uses specialized regex rules to parse common log structures without cluttering.
 */
export function detectEntities(lineContent: string): ExtractedEntity[] {
    if (!lineContent || typeof lineContent !== 'string') return [];

    const entities: ExtractedEntity[] = [];
    const seen = new Set<string>();

    const addEntity = (type: 'pid' | 'tid' | 'hex', value: string, label: string) => {
        const key = `${type}:${value}`;
        if (!seen.has(key)) {
            seen.add(key);
            entities.push({ type, value, label });
        }
    };

    // 1. Android/System process-thread style: e.g., " 1234-5678/" or " 1234-5678 " or " 1234-5678:"
    // Matches patterns like: [whitespace/start] [digits] "-" [digits] [slash/whitespace/colon/boundary]
    const androidPidTidRegex = /(?:\s|^)([0-9]+)-([0-9]+)(?:\/|\s|:|\b)/g;
    let match;
    while ((match = androidPidTidRegex.exec(lineContent)) !== null) {
        const pid = match[1];
        const tid = match[2];
        // Basic sanity check to avoid matching short trivial numbers (e.g. date '05-20')
        if (pid.length >= 2 && tid.length >= 2) {
            addEntity('pid', pid, `PID: ${pid}`);
            addEntity('tid', tid, `TID: ${tid}`);
        }
    }

    // 2. Explicit PID indicators: e.g. "pid: 1234", "PID (1234)", "pid[1234]"
    const explicitPidRegex = /\b(?:pid|PID)[:\s\(\[\{]+([0-9]+)\b/g;
    while ((match = explicitPidRegex.exec(lineContent)) !== null) {
        const pid = match[1];
        addEntity('pid', pid, `PID: ${pid}`);
    }

    // 3. Explicit TID indicators: e.g. "tid: 5678", "TID (5678)", "tid[0x1a2b]", "tid: 0x7f1a"
    const explicitTidRegex = /\b(?:tid|TID)[:\s\(\[\{]+([0-9]+|0x[0-9a-fA-F]+)\b/g;
    while ((match = explicitTidRegex.exec(lineContent)) !== null) {
        const tid = match[1];
        addEntity('tid', tid, `TID: ${tid}`);
    }

    // 4. Kernel Bracket PID/TID: e.g., "[  123:  456]" or "[123:456]"
    const kernelBracketRegex = /\[\s*([0-9]+)\s*:\s*([0-9]+)\s*\]/g;
    while ((match = kernelBracketRegex.exec(lineContent)) !== null) {
        const pid = match[1];
        const tid = match[2];
        addEntity('pid', pid, `PID: ${pid}`);
        addEntity('tid', tid, `TID: ${tid}`);
    }

    // 5. Hexadecimal memory address/pointers: e.g., "0x7ffd1a2b", "0x00007f9c8d0e"
    // To ensure they are pointers, we match 4 to 16 hex digits after "0x".
    const hexRegex = /\b0x[0-9a-fA-F]{4,16}\b/g;
    while ((match = hexRegex.exec(lineContent)) !== null) {
        const hex = match[0];
        addEntity('hex', hex, `Addr: ${hex}`);
    }

    return entities;
}
