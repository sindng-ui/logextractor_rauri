import { JsonValueType } from '../types/jsonBeautify';

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_COLOR_RE = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;
const URL_RE = /^https?:\/\/[^\s"'<>]+$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;

export interface DecodedBadge {
  kind: 'timestamp' | 'color' | 'url' | 'embedded-json';
  label: string;
  colorValue?: string;
  urlValue?: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatReadableDate(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function detectEmbeddedJsonString(raw: string): boolean {
  if (raw.length < 4 || raw.length > 2_000_000) return false;
  const t = raw.trim();
  if (!((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']')))) {
    return false;
  }
  try {
    const parsed = JSON.parse(t);
    return parsed !== null && typeof parsed === 'object';
  } catch {
    return false;
  }
}

export function decodeInlineBadge(
  type: JsonValueType,
  preview: string,
  hasEmbeddedJson?: boolean
): DecodedBadge | null {
  if (type === 'number') {
    const num = Number(preview);
    if (!Number.isFinite(num) || !Number.isInteger(num)) return null;
    // Unix seconds (2001-09-09 .. 2100-01-01)
    if (num >= 1_000_000_000 && num <= 4_102_444_800) {
      return { kind: 'timestamp', label: formatReadableDate(num * 1000) };
    }
    // Unix milliseconds (2001-09-09 .. 2100-01-01)
    if (num >= 1_000_000_000_000 && num <= 4_102_444_800_000) {
      return { kind: 'timestamp', label: formatReadableDate(num) };
    }
    return null;
  }

  if (type === 'string') {
    if (hasEmbeddedJson) {
      return { kind: 'embedded-json', label: 'Embedded JSON' };
    }
    const clean = preview.length >= 2 && preview.startsWith('"') && preview.endsWith('"')
      ? preview.slice(1, -1)
      : preview;

    if (clean.length <= 32 && (HEX_COLOR_RE.test(clean) || RGB_COLOR_RE.test(clean))) {
      return { kind: 'color', label: clean, colorValue: clean };
    }
    if (clean.length >= 10 && clean.length <= 35 && ISO_DATE_RE.test(clean)) {
      const ms = Date.parse(clean);
      if (!Number.isNaN(ms)) {
        return { kind: 'timestamp', label: formatReadableDate(ms) };
      }
    }
    if (clean.length <= 200 && URL_RE.test(clean)) {
      return { kind: 'url', label: 'URL', urlValue: clean };
    }
  }

  return null;
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatJsonPathSegment(parentPath: string, key: string, isArrayItem: boolean): string {
  if (isArrayItem) return `${parentPath}[${key}]`;
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
    return `${parentPath}.${key}`;
  }
  const escaped = key.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `${parentPath}['${escaped}']`;
}
