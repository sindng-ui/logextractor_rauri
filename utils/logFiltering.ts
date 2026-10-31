import { LogRule } from '../types';

/**
 * Log Filtering Logic
 * 
 * Extracted from workers/LogProcessor.worker.ts for testability and reusability.
 * This module contains the core logic for determining if a log line matches filtering rules.
 */

/**
 * Check if a log line matches the given filtering rule
 * 
 * @param line - The log line to check
 * @param rule - The filtering rule to apply (or null for no filtering)
 * @param bypassShellFilter - Whether to apply shell output bypass logic (Force Include non-standard logs)
 * @returns true if the line should be included, false if it should be filtered out
 */
// --- Optimized Heuristics for Standard Log Detection ---
const RE_TIME_OR_DATE = /^\s*(\[?\d{2,4}[-/.]\d{2}[-/.]\d{2,4}|[\[]?\d{2}:\d{2}:\d{2})/;
const RE_LEVEL_LONG = /[ \[/](TRACE|DEBUG|INFO|WARN|ERROR|FATAL)[ /\]:]/i;
const RE_LEVEL_SHORT = /[ \[/](V|D|I|W|E|F)[ /\]:]/; // Case-sensitive for single letters to avoid "is", "in" etc.
const RE_PID = /[ \(]\d{4,6}[ /]/;

export const checkIsMatch = (line: string, rule: LogRule | null, bypassShellFilter: boolean, quickFilter?: 'none' | 'error' | 'exception', wasmEngine?: any, wasmMemory?: WebAssembly.Memory, textEncoder?: TextEncoder): boolean => {
    // 1. Quick Filters (Highly optimized, minimal overhead)
    if (quickFilter === 'error') {
        const lineUpper = line.toUpperCase();
        const isErrorLevel = lineUpper.includes(' E/') || lineUpper.includes('ERROR') || lineUpper.includes('FAIL') || lineUpper.includes('FATAL');
        if (!isErrorLevel) return false;
    } else if (quickFilter === 'exception') {
        if (!line.toLowerCase().includes('exception')) return false;
    }

    // Force include Simulated Logs (for Tizen Connection Test) regardless of rules
    if (bypassShellFilter && line.includes('[TEST_LOG_')) {
        return true;
    }

    if (!rule) return true;

    // 🐧 형님! 콤보나 블록리스트가 완전히 없는 빈 룰 상태라면 묻지도 따지지도 않고 무조건 true 패스합니다!
    // 실질적인 단어가 하나도 없는 가짜 콤보(예: [['']])도 확실하게 빈 룰로 판정하여 WASM 오작동을 차단합니다!
    const hasHappy = rule.includeGroups && rule.includeGroups.some(g => g.some(t => t.trim() !== ''));
    const hasBlock = rule.excludes && rule.excludes.some(e => e.trim() !== '');
    if (!hasHappy && !hasBlock && quickFilter === 'none') {
        return true;
    }

    // 2. Bypass Logic for Stream Mode (Heuristics to distinguish "Logs" from "Shell Output")
    if (bypassShellFilter && rule.showRawLogLines !== false) {
        const trimmedLine = line.trimStart();
        if (trimmedLine.length === 0) return true;

        // Cheap checks first
        let isStandard = trimmedLine[0] === '[';

        // RegEx checks only if cheap ones fail
        if (!isStandard) {
            isStandard = RE_TIME_OR_DATE.test(trimmedLine) || RE_LEVEL_LONG.test(trimmedLine) || RE_LEVEL_SHORT.test(trimmedLine) || RE_PID.test(trimmedLine);
        }

        if (!isStandard) {
            // It does not look like a log. Assume it is a stack trace, shell text, or raw output we want to bypass visually
            return true;
        }
    }

    // 3. Performance: Lazy lowercase line to avoid redundant work
    let lowerLine: string | undefined = undefined;

    // 3. Excludes (Block List)
    const excludes = rule.excludes;
    if (excludes.length > 0) {
        const lineForBlock = rule.blockListCaseSensitive ? line : (lowerLine = line.toLowerCase());
        for (let i = 0; i < excludes.length; i++) {
            if (lineForBlock.includes(excludes[i])) return false;
        }
    }

    // 4. Includes (Happy Combos)
    const groups = rule.includeGroups;
    if (groups.length === 0) return true;

    // ✅ WASM Path: Only use if no AND logic (all groups have 1 term) for maximum speed
    const isSimpleOrFilter = groups.every(g => g.length === 1);
    if (wasmEngine && isSimpleOrFilter) {
        // Zero-copy 지원 버전 (WASM 메모리에 직접 쓰기)
        if (wasmMemory && textEncoder) {
            const requiredSize = line.length * 3;
            wasmEngine.reserve_buffer(requiredSize);
            const ptr = wasmEngine.get_buffer_ptr();
            const view = new Uint8Array(wasmMemory.buffer, ptr, requiredSize);
            const { written } = textEncoder.encodeInto(line, view);
            return wasmEngine.check_match_ptr(written);
        }
        return wasmEngine.check_match(line);
    }

    // JS Fallback: OR of ANDs
    const lineForHappy = rule.happyCombosCaseSensitive ? line : (lowerLine || line.toLowerCase());

    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        let allTermsInGroupMatch = true;
        for (let j = 0; j < group.length; j++) {
            if (!lineForHappy.includes(group[j])) {
                allTermsInGroupMatch = false;
                break;
            }
        }
        if (allTermsInGroupMatch) return true;
    }

    return false;
};
