export type JsonValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export type JsonBeautifyViewMode = 'tree' | 'graph' | 'columns' | 'table' | 'code' | 'insights';

export interface JsonRepairInfo {
  repaired: boolean;
  reasons: string[];
  originalLength: number;
  extractedLength: number;
}

export interface JsonErrorDetail {
  message: string;
  line: number | null;
  column: number | null;
  position: number | null;
  snippet: { lineNumber: number; text: string; isErrorLine: boolean; caretColumn?: number }[];
}

export interface HeavyNodeItem {
  id: number;
  path: string;
  key: string;
  type: JsonValueType;
  byteSize: number;
  percent: number;
  childCount: number;
}

export interface ArrayTableCatalogItem {
  id: number;
  path: string;
  label: string;
  rowCount: number;
  columnCount: number;
}

export interface JsonStats {
  byteSize: number;
  parseTimeMs: number;
  totalNodes: number;
  maxDepth: number;
  objectCount: number;
  arrayCount: number;
  stringCount: number;
  numberCount: number;
  booleanCount: number;
  nullCount: number;
  depthDistribution: { depth: number; count: number }[];
  topKeys: { key: string; count: number }[];
  heavyNodes: HeavyNodeItem[];
  arrayTables: ArrayTableCatalogItem[];
  rootType: JsonValueType;
}

export interface VisibleTreeRow {
  id: number;
  parentId: number;
  key: string;
  isArrayItem: boolean;
  type: JsonValueType;
  depth: number;
  path: string;
  childCount: number;
  isExpanded: boolean;
  preview: string;
  summaryPreview?: string;
  byteSize: number;
  isMatch?: boolean;
  isFilterAncestor?: boolean;
  hasEmbeddedJson?: boolean;
}

export interface NodeBreadcrumbItem {
  id: number;
  label: string;
  path: string;
}

export interface NodeDetailPayload {
  id: number;
  key: string;
  path: string;
  jsPath: string;
  type: JsonValueType;
  depth: number;
  byteSize: number;
  percent: number;
  childCount: number;
  fullValueText: string;
  isTruncated: boolean;
  prettySubtreePreview: string;
  hasEmbeddedJson: boolean;
  embeddedJsonRaw?: string;
  breadcrumbs: NodeBreadcrumbItem[];
}

export interface ColumnItem {
  id: number;
  key: string;
  isArrayItem: boolean;
  type: JsonValueType;
  childCount: number;
  preview: string;
  summaryPreview?: string;
  byteSize: number;
  path: string;
  hasEmbeddedJson?: boolean;
}

export interface ColumnLevelPayload {
  parentId: number;
  title: string;
  path: string;
  type: JsonValueType;
  totalCount: number;
  items: ColumnItem[];
}

export interface GraphCardProperty {
  key: string;
  value: string;
  fullPreview?: string;
  type: JsonValueType;
  nodeId: number;
  hasEmbeddedJson?: boolean;
}

export interface GraphCardNode {
  id: number;
  parentId: number;
  key: string;
  path: string;
  type: JsonValueType;
  depth: number;
  childCount: number;
  hasContainerChildren: boolean;
  isExpanded: boolean;
  isPropsExpanded?: boolean;
  properties: GraphCardProperty[];
  extraPropertyCount: number;
  totalChildrenCount: number;
  shownChildrenCount: number;
  isMoreStub?: boolean;
  stubParentId?: number;
  stubRemaining?: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphEdge {
  fromId: number;
  toId: number;
  label: string;
}

export interface GraphScenePayload {
  nodes: GraphCardNode[];
  edges: GraphEdge[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
  totalArenaNodes: number;
  renderedNodeCount: number;
  truncatedByLimit: boolean;
}

export interface TableRowData {
  nodeId: number;
  index: number;
  cells: Record<string, string>;
  cellTypes: Record<string, JsonValueType>;
}

export interface TablePayload {
  arrayNodeId: number;
  path: string;
  columns: string[];
  rows: TableRowData[];
  totalRows: number;
}

export interface CodeViewPayload {
  lines: string[];
  totalLines: number;
  byteSize: number;
  indent: number;
  sortKeys: boolean;
  minified: boolean;
}

export interface SearchResultPayload {
  query: string;
  mode: 'jump' | 'filter';
  matchIds: number[];
  totalMatches: number;
  rows: VisibleTreeRow[];
}

export interface JsonSnapshotItem {
  id: string;
  label: string;
  source: 'clipboard' | 'file' | 'embedded' | 'manual' | 'sample';
  byteSize: number;
  createdAt: number;
  persisted?: boolean;
}

export type JsonWorkerRequest =
  | { type: 'PARSE'; requestId: string; payload: { text: string; initialDepth?: number } }
  | { type: 'TOGGLE_NODE'; requestId: string; payload: { nodeId: number } }
  | { type: 'EXPAND_DEPTH'; requestId: string; payload: { depth: number } }
  | { type: 'EXPAND_TO_NODE'; requestId: string; payload: { nodeId: number } }
  | { type: 'SEARCH'; requestId: string; payload: { query: string; mode: 'jump' | 'filter'; caseSensitive?: boolean } }
  | { type: 'GET_NODE_DETAIL'; requestId: string; payload: { nodeId: number } }
  | { type: 'GET_COPY_TEXT'; requestId: string; payload: { nodeId: number; mode: 'pretty' | 'minified' | 'value'; indent?: number; sortKeys?: boolean } }
  | { type: 'GET_COLUMNS'; requestId: string; payload: { pathIds: number[] } }
  | {
      type: 'GET_GRAPH';
      requestId: string;
      payload: {
        expandedIds?: number[];
        extraArrayLimits?: Record<number, number>;
        expandedPropCardIds?: number[];
        wideCards?: boolean;
        autoInit?: boolean;
        focusNodeId?: number | null;
      };
    }
  | { type: 'GET_TABLE'; requestId: string; payload: { arrayNodeId: number } }
  | { type: 'GET_CODE'; requestId: string; payload: { indent: number; sortKeys: boolean; minified: boolean } }
  | { type: 'GET_TS_SCHEMA'; requestId: string; payload: { rootName?: string } }
  | { type: 'CLEAR'; requestId: string };

export type JsonWorkerResponse =
  | {
      type: 'PARSE_SUCCESS';
      requestId: string;
      payload: {
        stats: JsonStats;
        repairInfo: JsonRepairInfo;
        rows: VisibleTreeRow[];
        expandedIds: number[];
      };
    }
  | { type: 'PARSE_ERROR'; requestId: string; payload: JsonErrorDetail }
  | { type: 'TREE_ROWS'; requestId: string; payload: { rows: VisibleTreeRow[]; expandedIds: number[] } }
  | { type: 'SEARCH_RESULT'; requestId: string; payload: SearchResultPayload }
  | { type: 'NODE_DETAIL'; requestId: string; payload: NodeDetailPayload | null }
  | { type: 'COPY_TEXT'; requestId: string; payload: { text: string; label: string } }
  | { type: 'COLUMNS_DATA'; requestId: string; payload: { levels: ColumnLevelPayload[]; selectedPathIds: number[] } }
  | {
      type: 'GRAPH_DATA';
      requestId: string;
      payload: {
        scene: GraphScenePayload;
        expandedIds: number[];
        extraArrayLimits: Record<number, number>;
        expandedPropCardIds: number[];
      };
    }
  | { type: 'TABLE_DATA'; requestId: string; payload: TablePayload | null }
  | { type: 'CODE_DATA'; requestId: string; payload: CodeViewPayload }
  | { type: 'TS_SCHEMA'; requestId: string; payload: { code: string } }
  | { type: 'CLEARED'; requestId: string };
