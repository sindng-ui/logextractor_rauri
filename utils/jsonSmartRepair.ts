import { JsonErrorDetail, JsonRepairInfo } from '../types/jsonBeautify';

export interface SmartParseSuccess {
  ok: true;
  data: unknown;
  repairInfo: JsonRepairInfo;
}

export interface SmartParseFailure {
  ok: false;
  error: JsonErrorDetail;
}

export type SmartParseResult = SmartParseSuccess | SmartParseFailure;

const STRIP_BOM_RE = /^\uFEFF/;

function stripJsonCommentsAndTrailingCommas(input: string): { text: string; removedComments: boolean; removedTrailingCommas: boolean } {
  let out = '';
  let inString = false;
  let escaped = false;
  let removedComments = false;
  const len = input.length;

  for (let i = 0; i < len; i++) {
    const ch = input[i];
    const next = i + 1 < len ? input[i + 1] : '';

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      removedComments = true;
      i += 2;
      while (i < len && input[i] !== '\n') i++;
      if (i < len) out += '\n';
      continue;
    }

    if (ch === '/' && next === '*') {
      removedComments = true;
      i += 2;
      while (i < len - 1 && !(input[i] === '*' && input[i + 1] === '/')) {
        if (input[i] === '\n') out += '\n';
        i++;
      }
      i++; // skip '/'
      continue;
    }

    out += ch;
  }

  let removedTrailingCommas = false;
  const cleaned = out.replace(/,(\s*[}\]])/g, (_m, closing) => {
    removedTrailingCommas = true;
    return closing;
  });

  return { text: cleaned, removedComments, removedTrailingCommas };
}

function extractValidJsonFromNoise(input: string): { data: unknown; text: string; reasons: string[] } | null {
  const len = input.length;
  for (let start = 0; start < len; start++) {
    const startCh = input[start];
    if (startCh !== '{' && startCh !== '[') continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < len; i++) {
      const ch = input[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{' || ch === '[') {
        depth++;
      } else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) {
          const candidate = input.slice(start, i + 1);
          if (candidate.length >= 2 && candidate.length < len) {
            try {
              const parsed = JSON.parse(candidate);
              if (parsed !== null && typeof parsed === 'object') {
                return {
                  data: parsed,
                  text: candidate,
                  reasons: ['Extracted JSON block from surrounding text/log'],
                };
              }
            } catch {
              const cleaned = stripJsonCommentsAndTrailingCommas(candidate);
              if (cleaned.removedComments || cleaned.removedTrailingCommas) {
                try {
                  const parsed = JSON.parse(cleaned.text);
                  if (parsed !== null && typeof parsed === 'object') {
                    const reasons = ['Extracted JSON block from surrounding text/log'];
                    if (cleaned.removedComments) reasons.push('Removed JSONC comments');
                    if (cleaned.removedTrailingCommas) reasons.push('Removed trailing commas');
                    return { data: parsed, text: cleaned.text, reasons };
                  }
                } catch {
                  // continue scanning next balanced candidate
                }
              }
            }
          }
          break;
        }
      }
    }
  }
  return null;
}

export function buildErrorDetail(rawText: string, err: unknown): JsonErrorDetail {
  const message = err instanceof Error ? err.message : String(err);
  let position: number | null = null;
  let line: number | null = null;
  let column: number | null = null;

  const posMatch = message.match(/position\s+(\d+)/i);
  if (posMatch) {
    position = parseInt(posMatch[1], 10);
  }

  const lineColMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineColMatch) {
    line = parseInt(lineColMatch[1], 10);
    column = parseInt(lineColMatch[2], 10);
  } else if (position !== null && Number.isFinite(position)) {
    const safePos = Math.max(0, Math.min(position, rawText.length));
    let curLine = 1;
    let lastNewline = -1;
    for (let i = 0; i < safePos; i++) {
      if (rawText.charCodeAt(i) === 10) {
        curLine++;
        lastNewline = i;
      }
    }
    line = curLine;
    column = safePos - lastNewline;
  }

  const snippet: JsonErrorDetail['snippet'] = [];
  if (line !== null) {
    const allLines = rawText.split(/\r?\n/);
    const startIdx = Math.max(0, line - 3);
    const endIdx = Math.min(allLines.length - 1, line + 1);
    for (let i = startIdx; i <= endIdx; i++) {
      const rawLine = allLines[i] ?? '';
      const isErr = i + 1 === line;
      let displayText = rawLine;
      let caretColumn = isErr && column !== null ? column : undefined;

      if (rawLine.length > 220 && isErr && column !== null) {
        const windowStart = Math.max(0, column - 80);
        displayText = (windowStart > 0 ? '…' : '') + rawLine.slice(windowStart, windowStart + 180) + (windowStart + 180 < rawLine.length ? '…' : '');
        caretColumn = column - windowStart + (windowStart > 0 ? 1 : 0);
      } else if (rawLine.length > 220) {
        displayText = rawLine.slice(0, 220) + '…';
      }

      snippet.push({
        lineNumber: i + 1,
        text: displayText,
        isErrorLine: isErr,
        caretColumn,
      });
    }
  }

  return { message, line, column, position, snippet };
}

export function smartParseJson(rawInput: string): SmartParseResult {
  const trimmed = rawInput.replace(STRIP_BOM_RE, '').trim();
  const originalLength = rawInput.length;

  if (!trimmed) {
    return {
      ok: false,
      error: {
        message: 'Input is empty.',
        line: 1,
        column: 1,
        position: 0,
        snippet: [],
      },
    };
  }

  // 1) Fast path: direct strict JSON.parse
  try {
    const parsed = JSON.parse(trimmed);
    // Detect double-encoded JSON string (e.g. "{\"a\":1}")
    if (typeof parsed === 'string') {
      const innerTrim = parsed.trim();
      if ((innerTrim.startsWith('{') && innerTrim.endsWith('}')) || (innerTrim.startsWith('[') && innerTrim.endsWith(']'))) {
        try {
          const innerParsed = JSON.parse(innerTrim);
          return {
            ok: true,
            data: innerParsed,
            repairInfo: {
              repaired: true,
              reasons: ['Unwrapped double-encoded JSON string'],
              originalLength,
              extractedLength: innerTrim.length,
            },
          };
        } catch {
          // keep original string
        }
      }
    }
    return {
      ok: true,
      data: parsed,
      repairInfo: {
        repaired: false,
        reasons: [],
        originalLength,
        extractedLength: trimmed.length,
      },
    };
  } catch (strictErr) {
    // 2) Try JSONC comments + trailing commas cleanup
    const reasons: string[] = [];
    const cleanedRes = stripJsonCommentsAndTrailingCommas(trimmed);
    if (cleanedRes.removedComments || cleanedRes.removedTrailingCommas) {
      try {
        const parsed = JSON.parse(cleanedRes.text);
        if (cleanedRes.removedComments) reasons.push('Removed JSONC comments');
        if (cleanedRes.removedTrailingCommas) reasons.push('Removed trailing commas');
        return {
          ok: true,
          data: parsed,
          repairInfo: {
            repaired: true,
            reasons,
            originalLength,
            extractedLength: cleanedRes.text.length,
          },
        };
      } catch {
        // continue
      }
    }

    // 3) Try unescaping escaped JSON snippet without outer quotes (e.g. {\"a\":1})
    if (trimmed.includes('\\"')) {
      const unescaped = trimmed.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      try {
        const parsed = JSON.parse(unescaped);
        return {
          ok: true,
          data: parsed,
          repairInfo: {
            repaired: true,
            reasons: ['Unescaped quoted JSON payload'],
            originalLength,
            extractedLength: unescaped.length,
          },
        };
      } catch {
        // continue
      }
    }

    // 4) Try extracting a valid balanced JSON block only when input has surrounding non-JSON text/log noise
    const looksLikeStandaloneJson =
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'));

    if (!looksLikeStandaloneJson) {
      const extracted = extractValidJsonFromNoise(trimmed);
      if (extracted) {
        return {
          ok: true,
          data: extracted.data,
          repairInfo: {
            repaired: true,
            reasons: extracted.reasons,
            originalLength,
            extractedLength: extracted.text.length,
          },
        };
      }
    }

    return {
      ok: false,
      error: buildErrorDetail(trimmed, strictErr),
    };
  }
}
