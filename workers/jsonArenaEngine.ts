import {
  ArrayTableCatalogItem,
  CodeViewPayload,
  ColumnItem,
  ColumnLevelPayload,
  GraphScenePayload,
  HeavyNodeItem,
  JsonErrorDetail,
  JsonRepairInfo,
  JsonStats,
  JsonValueType,
  NodeBreadcrumbItem,
  NodeDetailPayload,
  SearchResultPayload,
  TablePayload,
  VisibleTreeRow,
} from '../types/jsonBeautify';
import { smartParseJson } from '../utils/jsonSmartRepair';
import { detectEmbeddedJsonString, formatJsonPathSegment } from '../utils/jsonValueDecoders';
import { buildGraphSceneFromArena } from './jsonGraphBuilder';
import {
  buildObjectSummaryPreview,
  extractArrayTable,
  formatPrimitivePreview,
  generateTypeScriptInterfaces,
  getJsonValueType,
  sortKeysDeep,
} from './jsonWorkerHelpers';

interface ArenaNode {
  id: number;
  parentId: number;
  key: string;
  isArrayItem: boolean;
  type: JsonValueType;
  depth: number;
  path: string;
  value: unknown;
  childIds: number[];
  byteSize: number;
  preview: string;
  summaryPreview?: string;
  hasEmbeddedJson: boolean;
  searchLowerKey: string;
  searchLowerVal: string;
}

export class JsonArenaEngine {
  private nodes: ArenaNode[] = [];
  private rootData: unknown = null;
  private stats: JsonStats | null = null;
  private expandedSet = new Set<number>();
  private activeSearchQuery = '';
  private activeSearchMode: 'jump' | 'filter' = 'jump';
  private activeSearchCaseSensitive = false;
  private activeMatchSet = new Set<number>();
  private activeFilterAllowedSet: Set<number> | null = null;
  private graphExpandedSet = new Set<number>();
  private graphArrayLimits = new Map<number, number>();
  private graphExpandedPropCards = new Set<number>();
  private codeCache = new Map<string, CodeViewPayload>();
  private tsSchemaCache: string | null = null;

  public clear(): void {
    this.nodes = [];
    this.rootData = null;
    this.stats = null;
    this.expandedSet.clear();
    this.activeSearchQuery = '';
    this.activeMatchSet.clear();
    this.activeFilterAllowedSet = null;
    this.graphExpandedSet.clear();
    this.graphArrayLimits.clear();
    this.graphExpandedPropCards.clear();
    this.codeCache.clear();
    this.tsSchemaCache = null;
  }

  public parse(
    rawText: string,
    initialDepth = 2
  ):
    | { ok: true; stats: JsonStats; repairInfo: JsonRepairInfo; rows: VisibleTreeRow[]; expandedIds: number[] }
    | { ok: false; error: JsonErrorDetail } {
    const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const parsed = smartParseJson(rawText);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    this.clear();
    this.rootData = parsed.data;
    const totalBytes = new TextEncoder().encode(rawText).byteLength;

    this.buildArenaIterative(parsed.data, totalBytes, startMs);
    this.expandToDepthInternal(initialDepth);

    return {
      ok: true,
      stats: this.stats!,
      repairInfo: parsed.repairInfo,
      rows: this.buildVisibleRows(),
      expandedIds: Array.from(this.expandedSet),
    };
  }

  private buildArenaIterative(rootVal: unknown, inputByteSize: number, startMs: number): void {
    const nodes: ArenaNode[] = [];
    let maxDepth = 0;
    let objectCount = 0;
    let arrayCount = 0;
    let stringCount = 0;
    let numberCount = 0;
    let booleanCount = 0;
    let nullCount = 0;
    const depthCounts = new Map<number, number>();
    const keyCounts = new Map<string, number>();

    const createNode = (
      parentId: number,
      key: string,
      isArrayItem: boolean,
      value: unknown,
      depth: number,
      path: string
    ): ArenaNode => {
      const id = nodes.length;
      const type = getJsonValueType(value);
      if (depth > maxDepth) maxDepth = depth;
      depthCounts.set(depth, (depthCounts.get(depth) || 0) + 1);

      if (parentId !== -1 && !isArrayItem) {
        keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
      }

      let preview = '';
      let summaryPreview: string | undefined;
      let hasEmbeddedJson = false;
      let selfByteEstimate = key.length + 4;
      let searchLowerVal = '';

      switch (type) {
        case 'object': {
          objectCount++;
          const obj = value as Record<string, unknown>;
          const len = Object.keys(obj).length;
          preview = `{ ${len} ${len === 1 ? 'key' : 'keys'} }`;
          summaryPreview = buildObjectSummaryPreview(obj, 3);
          selfByteEstimate += 2;
          break;
        }
        case 'array': {
          arrayCount++;
          const arr = value as unknown[];
          preview = `[ ${arr.length} ${arr.length === 1 ? 'item' : 'items'} ]`;
          selfByteEstimate += 2;
          break;
        }
        case 'string': {
          stringCount++;
          const s = value as string;
          preview = formatPrimitivePreview(s, 180);
          selfByteEstimate += s.length + 2;
          hasEmbeddedJson = detectEmbeddedJsonString(s);
          searchLowerVal = s.length > 512 ? s.slice(0, 512).toLowerCase() : s.toLowerCase();
          break;
        }
        case 'number': {
          numberCount++;
          preview = String(value);
          selfByteEstimate += preview.length;
          searchLowerVal = preview;
          break;
        }
        case 'boolean': {
          booleanCount++;
          preview = value ? 'true' : 'false';
          selfByteEstimate += preview.length;
          searchLowerVal = preview;
          break;
        }
        case 'null': {
          nullCount++;
          preview = 'null';
          selfByteEstimate += 4;
          searchLowerVal = 'null';
          break;
        }
      }

      const node: ArenaNode = {
        id,
        parentId,
        key,
        isArrayItem,
        type,
        depth,
        path,
        value,
        childIds: [],
        byteSize: selfByteEstimate,
        preview,
        summaryPreview,
        hasEmbeddedJson,
        searchLowerKey: key.toLowerCase(),
        searchLowerVal,
      };
      nodes.push(node);
      return node;
    };

    const rootNode = createNode(-1, 'root', false, rootVal, 0, '$');
    const stack: ArenaNode[] = [rootNode];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current.type === 'object') {
        const obj = current.value as Record<string, unknown>;
        const keys = Object.keys(obj);
        const childNodes: ArenaNode[] = [];
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          const childPath = formatJsonPathSegment(current.path, k, false);
          const child = createNode(current.id, k, false, obj[k], current.depth + 1, childPath);
          current.childIds.push(child.id);
          if (child.type === 'object' || child.type === 'array') {
            childNodes.push(child);
          }
        }
        for (let i = childNodes.length - 1; i >= 0; i--) {
          stack.push(childNodes[i]);
        }
      } else if (current.type === 'array') {
        const arr = current.value as unknown[];
        const childNodes: ArenaNode[] = [];
        for (let i = 0; i < arr.length; i++) {
          const k = String(i);
          const childPath = formatJsonPathSegment(current.path, k, true);
          const child = createNode(current.id, k, true, arr[i], current.depth + 1, childPath);
          current.childIds.push(child.id);
          if (child.type === 'object' || child.type === 'array') {
            childNodes.push(child);
          }
        }
        for (let i = childNodes.length - 1; i >= 0; i--) {
          stack.push(childNodes[i]);
        }
      }
    }

    // Bottom-up cumulative byte size aggregation (reverse index order is valid topological order)
    for (let i = nodes.length - 1; i > 0; i--) {
      const n = nodes[i];
      nodes[n.parentId].byteSize += n.byteSize;
    }

    const totalTreeBytes = Math.max(1, nodes[0]?.byteSize || inputByteSize || 1);

    // Collect Heavy Nodes (exclude root, pick top 15 by byteSize)
    const heavyCandidates: HeavyNodeItem[] = [];
    const arrayTables: ArrayTableCatalogItem[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (i > 0 && (n.type === 'object' || n.type === 'array' || n.byteSize >= 1024)) {
        heavyCandidates.push({
          id: n.id,
          path: n.path,
          key: n.isArrayItem ? `[${n.key}]` : n.key,
          type: n.type,
          byteSize: n.byteSize,
          percent: Math.min(100, (n.byteSize / totalTreeBytes) * 100),
          childCount: n.childIds.length,
        });
      }

      if (n.type === 'array' && n.childIds.length > 0) {
        const arr = n.value as unknown[];
        let objHits = 0;
        const colSet = new Set<string>();
        const probe = Math.min(arr.length, 20);
        for (let j = 0; j < probe; j++) {
          const item = arr[j];
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            objHits++;
            for (const col of Object.keys(item as Record<string, unknown>)) {
              colSet.add(col);
            }
          }
        }
        if (objHits > 0 && colSet.size > 0) {
          arrayTables.push({
            id: n.id,
            path: n.path,
            label: `${n.path} (${arr.length} rows, ${colSet.size} cols)`,
            rowCount: arr.length,
            columnCount: colSet.size,
          });
        }
      }
    }

    heavyCandidates.sort((a, b) => b.byteSize - a.byteSize);
    // Deduplicate overlapping direct single-child chains while keeping top 15 diverse entries
    const heavyNodes = heavyCandidates.slice(0, 15);
    arrayTables.sort((a, b) => b.rowCount - a.rowCount);

    const depthDistribution = Array.from(depthCounts.entries())
      .map(([depth, count]) => ({ depth, count }))
      .sort((a, b) => a.depth - b.depth);

    const topKeys = Array.from(keyCounts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const elapsedMs = Math.max(0.1, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs);

    this.nodes = nodes;
    this.stats = {
      byteSize: inputByteSize,
      parseTimeMs: Math.round(elapsedMs * 10) / 10,
      totalNodes: nodes.length,
      maxDepth,
      objectCount,
      arrayCount,
      stringCount,
      numberCount,
      booleanCount,
      nullCount,
      depthDistribution,
      topKeys,
      heavyNodes,
      arrayTables: arrayTables.slice(0, 40),
      rootType: nodes[0]?.type || 'object',
    };
  }

  private expandToDepthInternal(targetDepth: number): void {
    this.expandedSet.clear();
    if (this.nodes.length === 0) return;

    const maxAutoExpandedNodes = targetDepth >= 99 ? 25000 : 12000;
    let expandedCount = 0;

    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.childIds.length > 0 && n.depth < targetDepth) {
        this.expandedSet.add(n.id);
        expandedCount++;
        if (expandedCount >= maxAutoExpandedNodes) break;
      }
    }
  }

  public toggleNode(nodeId: number): { rows: VisibleTreeRow[]; expandedIds: number[] } {
    if (this.expandedSet.has(nodeId)) {
      this.expandedSet.delete(nodeId);
    } else if (this.nodes[nodeId]?.childIds.length > 0) {
      this.expandedSet.add(nodeId);
    }
    return { rows: this.buildVisibleRows(), expandedIds: Array.from(this.expandedSet) };
  }

  public expandToDepth(depth: number): { rows: VisibleTreeRow[]; expandedIds: number[] } {
    this.expandToDepthInternal(depth);
    return { rows: this.buildVisibleRows(), expandedIds: Array.from(this.expandedSet) };
  }

  public expandToNode(nodeId: number): { rows: VisibleTreeRow[]; expandedIds: number[] } {
    let cur = this.nodes[nodeId];
    while (cur && cur.parentId !== -1) {
      this.expandedSet.add(cur.parentId);
      cur = this.nodes[cur.parentId];
    }
    return { rows: this.buildVisibleRows(), expandedIds: Array.from(this.expandedSet) };
  }

  public search(query: string, mode: 'jump' | 'filter', caseSensitive = false): SearchResultPayload {
    const trimmed = query.trim();
    this.activeSearchQuery = trimmed;
    this.activeSearchMode = mode;
    this.activeSearchCaseSensitive = caseSensitive;
    this.activeMatchSet.clear();
    this.activeFilterAllowedSet = null;

    if (!trimmed || this.nodes.length === 0) {
      return {
        query: trimmed,
        mode,
        matchIds: [],
        totalMatches: 0,
        rows: this.buildVisibleRows(),
      };
    }

    const matchIds: number[] = [];
    const isJsonPathQuery = trimmed.startsWith('$.') || trimmed.startsWith('$[');

    if (isJsonPathQuery) {
      const regex = this.compileJsonPathRegex(trimmed);
      for (let i = 0; i < this.nodes.length; i++) {
        if (regex.test(this.nodes[i].path)) {
          matchIds.push(i);
          this.activeMatchSet.add(i);
        }
      }
    } else {
      const needle = caseSensitive ? trimmed : trimmed.toLowerCase();
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        let matched = false;
        if (caseSensitive) {
          if (n.key.includes(needle)) matched = true;
          else if (n.type !== 'object' && n.type !== 'array') {
            const rawStr = typeof n.value === 'string' ? n.value : n.preview;
            if (rawStr.includes(needle)) matched = true;
          }
        } else {
          if (n.searchLowerKey.includes(needle)) matched = true;
          else if (n.searchLowerVal.includes(needle)) matched = true;
          else if (n.type === 'string' && typeof n.value === 'string' && n.value.length > 512) {
            if (n.value.toLowerCase().includes(needle)) matched = true;
          }
        }

        if (matched) {
          matchIds.push(i);
          this.activeMatchSet.add(i);
        }
      }
    }

    if (mode === 'filter') {
      const allowed = new Set<number>();
      for (let m = 0; m < matchIds.length; m++) {
        let curId = matchIds[m];
        while (curId !== -1 && !allowed.has(curId)) {
          allowed.add(curId);
          const p = this.nodes[curId].parentId;
          if (p !== -1) this.expandedSet.add(p);
          curId = p;
        }
      }
      this.activeFilterAllowedSet = allowed;
    }

    return {
      query: trimmed,
      mode,
      matchIds,
      totalMatches: matchIds.length,
      rows: this.buildVisibleRows(),
    };
  }

  private compileJsonPathRegex(expr: string): RegExp {
    const escaped = expr
      .replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\[\\\*\\\]/g, '\\[\\d+\\]')
      .replace(/\\\*/g, '[^.\\[\\]]+');
    return new RegExp(`^${escaped}$`, this.activeSearchCaseSensitive ? '' : 'i');
  }

  public buildVisibleRows(): VisibleTreeRow[] {
    if (this.nodes.length === 0) return [];
    const rows: VisibleTreeRow[] = [];
    const allowed = this.activeSearchMode === 'filter' ? this.activeFilterAllowedSet : null;
    if (allowed && allowed.size === 0) return [];

    const stack: number[] = [0];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (allowed && !allowed.has(id)) continue;

      const n = this.nodes[id];
      const hasChildren = n.childIds.length > 0;
      const isExpanded = hasChildren && this.expandedSet.has(id);
      const isMatch = this.activeMatchSet.has(id);

      rows.push({
        id: n.id,
        parentId: n.parentId,
        key: n.key,
        isArrayItem: n.isArrayItem,
        type: n.type,
        depth: n.depth,
        path: n.path,
        childCount: n.childIds.length,
        isExpanded,
        preview: n.preview,
        summaryPreview: n.summaryPreview,
        byteSize: n.byteSize,
        isMatch,
        isFilterAncestor: Boolean(allowed && !isMatch),
        hasEmbeddedJson: n.hasEmbeddedJson,
      });

      if (isExpanded) {
        const kids = n.childIds;
        for (let i = kids.length - 1; i >= 0; i--) {
          stack.push(kids[i]);
        }
      }
    }

    return rows;
  }

  public getNodeDetail(nodeId: number): NodeDetailPayload | null {
    const n = this.nodes[nodeId];
    if (!n) return null;

    const totalTreeBytes = Math.max(1, this.nodes[0]?.byteSize || 1);
    const breadcrumbs: NodeBreadcrumbItem[] = [];
    let cur: ArenaNode | undefined = n;
    while (cur) {
      breadcrumbs.push({
        id: cur.id,
        label: cur.isArrayItem ? `[${cur.key}]` : cur.key,
        path: cur.path,
      });
      cur = cur.parentId !== -1 ? this.nodes[cur.parentId] : undefined;
    }
    breadcrumbs.reverse();

    let fullValueText = '';
    let isTruncated = false;
    let prettySubtreePreview = '';

    if (n.type === 'string') {
      const s = n.value as string;
      if (s.length > 20000) {
        fullValueText = s.slice(0, 20000);
        isTruncated = true;
      } else {
        fullValueText = s;
      }
      prettySubtreePreview = JSON.stringify(fullValueText);
    } else if (n.type === 'object' || n.type === 'array') {
      try {
        const rawJson = JSON.stringify(n.value, null, 2);
        if (rawJson.length > 12000) {
          prettySubtreePreview = rawJson.slice(0, 12000) + '\n... (truncated for preview, use Copy Subtree for full JSON)';
          isTruncated = true;
        } else {
          prettySubtreePreview = rawJson;
        }
        fullValueText = n.preview;
      } catch {
        prettySubtreePreview = n.preview;
        fullValueText = n.preview;
      }
    } else {
      fullValueText = String(n.value);
      prettySubtreePreview = fullValueText;
    }

    return {
      id: n.id,
      key: n.isArrayItem ? `[${n.key}]` : n.key,
      path: n.path,
      jsPath: n.path.replace(/^\$/, 'data'),
      type: n.type,
      depth: n.depth,
      byteSize: n.byteSize,
      percent: Math.min(100, (n.byteSize / totalTreeBytes) * 100),
      childCount: n.childIds.length,
      fullValueText,
      isTruncated,
      prettySubtreePreview,
      hasEmbeddedJson: n.hasEmbeddedJson,
      embeddedJsonRaw: n.hasEmbeddedJson && typeof n.value === 'string' ? n.value : undefined,
      breadcrumbs,
    };
  }

  public getCopyText(
    nodeId: number,
    mode: 'pretty' | 'minified' | 'value',
    indent = 2,
    sortKeys = false
  ): { text: string; label: string } {
    const target = nodeId >= 0 && this.nodes[nodeId] ? this.nodes[nodeId].value : this.rootData;
    if (mode === 'value') {
      const text = typeof target === 'string' ? target : JSON.stringify(target, null, indent);
      return { text, label: 'Value copied' };
    }
    const prepared = sortKeys ? sortKeysDeep(target) : target;
    if (mode === 'minified') {
      return { text: JSON.stringify(prepared), label: 'Minified JSON copied' };
    }
    return { text: JSON.stringify(prepared, null, indent), label: 'Formatted JSON copied' };
  }

  public getColumns(pathIds: number[]): { levels: ColumnLevelPayload[]; selectedPathIds: number[] } {
    if (this.nodes.length === 0) return { levels: [], selectedPathIds: [] };

    const validPath: number[] = [];
    if (pathIds.length === 0 || pathIds[0] !== 0) {
      validPath.push(0);
    }
    for (const id of pathIds) {
      if (this.nodes[id] && validPath[validPath.length - 1] !== id) {
        validPath.push(id);
      }
    }

    const levels: ColumnLevelPayload[] = [];
    for (const id of validPath) {
      const n = this.nodes[id];
      if (!n || (n.type !== 'object' && n.type !== 'array')) break;

      const items: ColumnItem[] = n.childIds.map((cid) => {
        const c = this.nodes[cid];
        return {
          id: c.id,
          key: c.isArrayItem ? `[${c.key}]` : c.key,
          isArrayItem: c.isArrayItem,
          type: c.type,
          childCount: c.childIds.length,
          preview: c.preview,
          summaryPreview: c.summaryPreview,
          byteSize: c.byteSize,
          path: c.path,
          hasEmbeddedJson: c.hasEmbeddedJson,
        };
      });

      levels.push({
        parentId: n.id,
        title: n.isArrayItem ? `[${n.key}]` : n.key,
        path: n.path,
        type: n.type,
        totalCount: items.length,
        items,
      });
    }

    return { levels, selectedPathIds: validPath };
  }

  public getGraphScene(options: {
    expandedIds?: number[];
    extraArrayLimits?: Record<number, number>;
    expandedPropCardIds?: number[];
    wideCards?: boolean;
    autoInit?: boolean;
    focusNodeId?: number | null;
  }): {
    scene: GraphScenePayload;
    expandedIds: number[];
    extraArrayLimits: Record<number, number>;
    expandedPropCardIds: number[];
  } {
    return buildGraphSceneFromArena(
      this.nodes,
      this.graphExpandedSet,
      this.graphArrayLimits,
      this.graphExpandedPropCards,
      options
    );
  }

  public getTable(arrayNodeId: number): TablePayload | null {
    const n = this.nodes[arrayNodeId];
    if (!n || n.type !== 'array') return null;
    return extractArrayTable(n.value as unknown[], n.id, n.path, n.childIds);
  }

  public getCode(indent: number, sortKeys: boolean, minified: boolean): CodeViewPayload {
    const cacheKey = `${indent}:${sortKeys ? 1 : 0}:${minified ? 1 : 0}`;
    const cached = this.codeCache.get(cacheKey);
    if (cached) return cached;

    const data = sortKeys ? sortKeysDeep(this.rootData) : this.rootData;
    const text = minified ? JSON.stringify(data) : JSON.stringify(data, null, indent);
    const lines = minified ? [text] : text.split('\n');
    const payload: CodeViewPayload = {
      lines,
      totalLines: lines.length,
      byteSize: new TextEncoder().encode(text).byteLength,
      indent,
      sortKeys,
      minified,
    };
    this.codeCache.set(cacheKey, payload);
    return payload;
  }

  public getTypeScriptSchema(rootName = 'RootPayload'): string {
    if (this.tsSchemaCache) return this.tsSchemaCache;
    this.tsSchemaCache = generateTypeScriptInterfaces(this.rootData, rootName);
    return this.tsSchemaCache;
  }
}
