import { useState, useEffect, useRef, useCallback } from 'react';
import JsonBeautifyWorker from '../../../workers/JsonBeautify.worker.ts?worker';
import {
  CodeViewPayload,
  ColumnLevelPayload,
  GraphScenePayload,
  JsonErrorDetail,
  JsonRepairInfo,
  JsonStats,
  JsonWorkerRequest,
  JsonWorkerResponse,
  NodeDetailPayload,
  SearchResultPayload,
  TablePayload,
  VisibleTreeRow,
} from '../../../types/jsonBeautify';

export function useJsonBeautifyWorker() {
  const workerRef = useRef<Worker | null>(null);
  const reqSeqRef = useRef(0);
  const copyCallbackMapRef = useRef<Map<string, (res: { text: string; label: string }) => void>>(new Map());

  const [isProcessing, setIsProcessing] = useState(false);
  const [stats, setStats] = useState<JsonStats | null>(null);
  const [repairInfo, setRepairInfo] = useState<JsonRepairInfo | null>(null);
  const [error, setError] = useState<JsonErrorDetail | null>(null);
  const [rows, setRows] = useState<VisibleTreeRow[]>([]);
  const [searchResult, setSearchResult] = useState<SearchResultPayload | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [nodeDetail, setNodeDetail] = useState<NodeDetailPayload | null>(null);

  const [columnLevels, setColumnLevels] = useState<ColumnLevelPayload[]>([]);
  const [columnPathIds, setColumnPathIds] = useState<number[]>([0]);

  const [graphScene, setGraphScene] = useState<GraphScenePayload | null>(null);
  const [graphExpandedIds, setGraphExpandedIds] = useState<number[]>([]);
  const [graphArrayLimits, setGraphArrayLimits] = useState<Record<number, number>>({});
  const [graphExpandedPropCardIds, setGraphExpandedPropCardIds] = useState<number[]>([]);

  const [tableData, setTableData] = useState<TablePayload | null>(null);
  const [codeData, setCodeData] = useState<CodeViewPayload | null>(null);
  const [tsSchema, setTsSchema] = useState<string>('');

  const nextReqId = useCallback((prefix: string) => {
    reqSeqRef.current += 1;
    return `${prefix}-${reqSeqRef.current}`;
  }, []);

  const post = useCallback((req: JsonWorkerRequest) => {
    workerRef.current?.postMessage(req);
  }, []);

  useEffect(() => {
    const worker = new JsonBeautifyWorker();
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<JsonWorkerResponse>) => {
      const msg = event.data;
      if (!msg) return;

      switch (msg.type) {
        case 'PARSE_SUCCESS':
          setIsProcessing(false);
          setError(null);
          setStats(msg.payload.stats);
          setRepairInfo(msg.payload.repairInfo);
          setRows(msg.payload.rows);
          setSearchResult(null);
          setSelectedNodeId(0);
          setColumnLevels([]);
          setColumnPathIds([0]);
          setGraphScene(null);
          setTableData(null);
          setCodeData(null);
          setTsSchema('');
          // Fetch root node detail immediately
          worker.postMessage({
            type: 'GET_NODE_DETAIL',
            requestId: nextReqId('detail'),
            payload: { nodeId: 0 },
          } as JsonWorkerRequest);
          break;

        case 'PARSE_ERROR':
          setIsProcessing(false);
          setError(msg.payload);
          setStats(null);
          setRepairInfo(null);
          setRows([]);
          setNodeDetail(null);
          setGraphScene(null);
          setColumnLevels([]);
          setTableData(null);
          setCodeData(null);
          setTsSchema('');
          break;

        case 'TREE_ROWS':
          setRows(msg.payload.rows);
          break;

        case 'SEARCH_RESULT':
          setSearchResult(msg.payload);
          setRows(msg.payload.rows);
          break;

        case 'NODE_DETAIL':
          setNodeDetail(msg.payload);
          break;

        case 'COPY_TEXT': {
          const cb = copyCallbackMapRef.current.get(msg.requestId);
          if (cb) {
            copyCallbackMapRef.current.delete(msg.requestId);
            cb(msg.payload);
          }
          break;
        }

        case 'COLUMNS_DATA':
          setColumnLevels(msg.payload.levels);
          setColumnPathIds(msg.payload.selectedPathIds);
          break;

        case 'GRAPH_DATA':
          setGraphScene(msg.payload.scene);
          setGraphExpandedIds(msg.payload.expandedIds);
          setGraphArrayLimits(msg.payload.extraArrayLimits);
          setGraphExpandedPropCardIds(msg.payload.expandedPropCardIds);
          break;

        case 'TABLE_DATA':
          setTableData(msg.payload);
          break;

        case 'CODE_DATA':
          setCodeData(msg.payload);
          break;

        case 'TS_SCHEMA':
          setTsSchema(msg.payload.code);
          break;

        case 'CLEARED':
          setIsProcessing(false);
          setStats(null);
          setRepairInfo(null);
          setError(null);
          setRows([]);
          setSearchResult(null);
          setSelectedNodeId(null);
          setNodeDetail(null);
          setColumnLevels([]);
          setColumnPathIds([0]);
          setGraphScene(null);
          setTableData(null);
          setCodeData(null);
          setTsSchema('');
          break;
      }
    };

    return () => {
      copyCallbackMapRef.current.clear();
      worker.terminate();
      workerRef.current = null;
    };
  }, [nextReqId]);

  const parseJson = useCallback(
    (text: string, initialDepth = 2) => {
      setIsProcessing(true);
      setError(null);
      post({
        type: 'PARSE',
        requestId: nextReqId('parse'),
        payload: { text, initialDepth },
      });
    },
    [post, nextReqId]
  );

  const toggleNode = useCallback(
    (nodeId: number) => {
      post({
        type: 'TOGGLE_NODE',
        requestId: nextReqId('toggle'),
        payload: { nodeId },
      });
    },
    [post, nextReqId]
  );

  const expandDepth = useCallback(
    (depth: number) => {
      post({
        type: 'EXPAND_DEPTH',
        requestId: nextReqId('depth'),
        payload: { depth },
      });
    },
    [post, nextReqId]
  );

  const expandToNode = useCallback(
    (nodeId: number) => {
      post({
        type: 'EXPAND_TO_NODE',
        requestId: nextReqId('expandTo'),
        payload: { nodeId },
      });
    },
    [post, nextReqId]
  );

  const search = useCallback(
    (query: string, mode: 'jump' | 'filter', caseSensitive = false) => {
      post({
        type: 'SEARCH',
        requestId: nextReqId('search'),
        payload: { query, mode, caseSensitive },
      });
    },
    [post, nextReqId]
  );

  const selectNode = useCallback(
    (nodeId: number) => {
      setSelectedNodeId(nodeId);
      post({
        type: 'GET_NODE_DETAIL',
        requestId: nextReqId('detail'),
        payload: { nodeId },
      });
    },
    [post, nextReqId]
  );

  const requestCopyText = useCallback(
    (
      nodeId: number,
      mode: 'pretty' | 'minified' | 'value',
      options?: { indent?: number; sortKeys?: boolean }
    ): Promise<{ text: string; label: string }> => {
      return new Promise((resolve) => {
        const requestId = nextReqId('copy');
        copyCallbackMapRef.current.set(requestId, resolve);
        post({
          type: 'GET_COPY_TEXT',
          requestId,
          payload: {
            nodeId,
            mode,
            indent: options?.indent,
            sortKeys: options?.sortKeys,
          },
        });
      });
    },
    [post, nextReqId]
  );

  const requestColumns = useCallback(
    (pathIds: number[]) => {
      post({
        type: 'GET_COLUMNS',
        requestId: nextReqId('cols'),
        payload: { pathIds },
      });
    },
    [post, nextReqId]
  );

  const requestGraph = useCallback(
    (payload: {
      expandedIds?: number[];
      extraArrayLimits?: Record<number, number>;
      expandedPropCardIds?: number[];
      wideCards?: boolean;
      autoInit?: boolean;
      focusNodeId?: number | null;
    }) => {
      post({
        type: 'GET_GRAPH',
        requestId: nextReqId('graph'),
        payload,
      });
    },
    [post, nextReqId]
  );

  const requestTable = useCallback(
    (arrayNodeId: number) => {
      post({
        type: 'GET_TABLE',
        requestId: nextReqId('table'),
        payload: { arrayNodeId },
      });
    },
    [post, nextReqId]
  );

  const requestCode = useCallback(
    (indent: number, sortKeys: boolean, minified: boolean) => {
      post({
        type: 'GET_CODE',
        requestId: nextReqId('code'),
        payload: { indent, sortKeys, minified },
      });
    },
    [post, nextReqId]
  );

  const requestTsSchema = useCallback(
    (rootName = 'RootPayload') => {
      post({
        type: 'GET_TS_SCHEMA',
        requestId: nextReqId('schema'),
        payload: { rootName },
      });
    },
    [post, nextReqId]
  );

  const clearAll = useCallback(() => {
    post({
      type: 'CLEAR',
      requestId: nextReqId('clear'),
    });
  }, [post, nextReqId]);

  return {
    isProcessing,
    stats,
    repairInfo,
    error,
    rows,
    searchResult,
    selectedNodeId,
    nodeDetail,
    columnLevels,
    columnPathIds,
    graphScene,
    graphExpandedIds,
    graphArrayLimits,
    graphExpandedPropCardIds,
    tableData,
    codeData,
    tsSchema,
    parseJson,
    toggleNode,
    expandDepth,
    expandToNode,
    search,
    selectNode,
    requestCopyText,
    requestColumns,
    requestGraph,
    requestTable,
    requestCode,
    requestTsSchema,
    clearAll,
  };
}
