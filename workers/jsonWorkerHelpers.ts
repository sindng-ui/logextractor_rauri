import { JsonValueType, TablePayload, TableRowData } from '../types/jsonBeautify';

export function getJsonValueType(value: unknown): JsonValueType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'object') return 'object';
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  return 'string';
}

export function formatPrimitivePreview(value: unknown, maxLen = 180): string {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    const clean = value.length > maxLen ? value.slice(0, maxLen) + '…' : value;
    return JSON.stringify(clean);
  }
  return String(value);
}

const SUMMARY_PRIORITY_KEYS = ['id', 'name', 'label', 'title', 'type', 'status', 'key', 'code', 'state', 'event', 'method', 'message', 'error'];

export function buildObjectSummaryPreview(obj: Record<string, unknown>, maxFields = 3): string | undefined {
  const keys = Object.keys(obj);
  if (keys.length === 0) return undefined;

  const picked: string[] = [];
  const used = new Set<string>();

  for (const pk of SUMMARY_PRIORITY_KEYS) {
    if (picked.length >= maxFields) break;
    if (Object.prototype.hasOwnProperty.call(obj, pk)) {
      const v = obj[pk];
      if (v === null || typeof v !== 'object') {
        picked.push(`${pk}: ${formatPrimitivePreview(v, 28)}`);
        used.add(pk);
      }
    }
  }

  if (picked.length < 2) {
    for (const k of keys) {
      if (picked.length >= maxFields) break;
      if (used.has(k)) continue;
      const v = obj[k];
      if (v === null || typeof v !== 'object') {
        picked.push(`${k}: ${formatPrimitivePreview(v, 24)}`);
        used.add(k);
      }
    }
  }

  if (picked.length === 0) return undefined;
  const remaining = keys.length - picked.length;
  return remaining > 0 ? `{ ${picked.join(', ')}, +${remaining} }` : `{ ${picked.join(', ')} }`;
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
    for (const k of keys) {
      sorted[k] = sortKeysDeep(obj[k]);
    }
    return sorted;
  }
  return value;
}

export function extractArrayTable(
  arr: unknown[],
  arrayNodeId: number,
  path: string,
  childNodeIds: number[]
): TablePayload | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const colOrder: string[] = [];
  const colSet = new Set<string>();
  const sampleLimit = Math.min(arr.length, 200);

  for (let i = 0; i < sampleLimit; i++) {
    const item = arr[i];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      for (const k of Object.keys(item as Record<string, unknown>)) {
        if (!colSet.has(k)) {
          colSet.add(k);
          colOrder.push(k);
        }
      }
    }
  }

  if (colOrder.length === 0) return null;

  const rows: TableRowData[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const cells: Record<string, string> = {};
    const cellTypes: Record<string, JsonValueType> = {};

    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const rec = item as Record<string, unknown>;
      for (const col of colOrder) {
        if (Object.prototype.hasOwnProperty.call(rec, col)) {
          const val = rec[col];
          const t = getJsonValueType(val);
          cellTypes[col] = t;
          if (t === 'object') {
            const o = val as Record<string, unknown>;
            cells[col] = buildObjectSummaryPreview(o, 2) || `{ ${Object.keys(o).length} keys }`;
          } else if (t === 'array') {
            cells[col] = `[ ${(val as unknown[]).length} items ]`;
          } else if (t === 'string') {
            const s = val as string;
            cells[col] = s.length > 160 ? s.slice(0, 160) + '…' : s;
          } else {
            cells[col] = String(val);
          }
        } else {
          cells[col] = '';
          cellTypes[col] = 'null';
        }
      }
    } else {
      cells[colOrder[0]] = formatPrimitivePreview(item, 160);
      cellTypes[colOrder[0]] = getJsonValueType(item);
    }

    rows.push({
      nodeId: childNodeIds[i] ?? arrayNodeId,
      index: i,
      cells,
      cellTypes,
    });
  }

  return {
    arrayNodeId,
    path,
    columns: colOrder,
    rows,
    totalRows: rows.length,
  };
}

function toPascalCase(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  if (!cleaned) return 'Item';
  const pascal = cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return /^[0-9]/.test(pascal) ? `T${pascal}` : pascal;
}

/**
 * Infers clean TypeScript interfaces from parsed JSON data.
 */
export function generateTypeScriptInterfaces(data: unknown, rootName = 'RootPayload'): string {
  const interfaces = new Map<string, string>();
  const usedNames = new Set<string>();

  const claimName = (base: string): string => {
    const clean = toPascalCase(base);
    if (!usedNames.has(clean)) {
      usedNames.add(clean);
      return clean;
    }
    let idx = 2;
    while (usedNames.has(`${clean}${idx}`)) idx++;
    const next = `${clean}${idx}`;
    usedNames.add(next);
    return next;
  };

  const inferType = (val: unknown, hint: string, depth: number): string => {
    if (val === null) return 'null';
    if (typeof val === 'string') return 'string';
    if (typeof val === 'number') return 'number';
    if (typeof val === 'boolean') return 'boolean';
    if (depth > 8) return 'unknown';

    if (Array.isArray(val)) {
      if (val.length === 0) return 'unknown[]';
      const sample = val.slice(0, 30);
      const hasObjects = sample.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v));
      if (hasObjects) {
        const merged = mergeObjectSamples(sample as Record<string, unknown>[]);
        const typeName = claimName(hint.endsWith('s') && hint.length > 2 ? hint.slice(0, -1) : `${hint}Item`);
        buildInterface(typeName, merged.fields, merged.optionalKeys, depth + 1);
        return `${typeName}[]`;
      }
      const types = Array.from(new Set(sample.map((v) => inferType(v, hint, depth + 1))));
      return types.length === 1 ? `${types[0]}[]` : `(${types.join(' | ')})[]`;
    }

    if (typeof val === 'object') {
      const rec = val as Record<string, unknown>;
      const keys = Object.keys(rec);
      if (keys.length === 0) return 'Record<string, unknown>';
      const typeName = claimName(hint);
      const fields = new Map<string, unknown[]>();
      for (const k of keys) fields.set(k, [rec[k]]);
      buildInterface(typeName, fields, new Set(), depth + 1);
      return typeName;
    }

    return 'unknown';
  };

  const mergeObjectSamples = (objs: Record<string, unknown>[]) => {
    const fields = new Map<string, unknown[]>();
    const counts = new Map<string, number>();

    for (const obj of objs) {
      for (const k of Object.keys(obj)) {
        counts.set(k, (counts.get(k) || 0) + 1);
        const list = fields.get(k);
        if (list) list.push(obj[k]);
        else fields.set(k, [obj[k]]);
      }
    }

    const optionalKeys = new Set<string>();
    for (const [k, cnt] of counts.entries()) {
      if (cnt < objs.length) optionalKeys.add(k);
    }

    return { fields, optionalKeys };
  };

  const buildInterface = (
    name: string,
    fields: Map<string, unknown[]>,
    optionalKeys: Set<string>,
    depth: number
  ) => {
    const lines: string[] = [`export interface ${name} {`];
    for (const [k, vals] of fields.entries()) {
      const types = new Set<string>();
      for (const v of vals.slice(0, 12)) {
        types.add(inferType(v, k, depth));
      }
      const safeKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
      const opt = optionalKeys.has(k) ? '?' : '';
      lines.push(`  ${safeKey}${opt}: ${Array.from(types).join(' | ')};`);
    }
    lines.push('}');
    interfaces.set(name, lines.join('\n'));
  };

  const rootType = inferType(data, rootName, 0);
  const blocks = Array.from(interfaces.values());
  if (blocks.length === 0) {
    return `export type ${toPascalCase(rootName)} = ${rootType};`;
  }
  if (Array.isArray(data)) {
    blocks.unshift(`export type ${toPascalCase(rootName)} = ${rootType};`);
  }
  return blocks.join('\n\n');
}
