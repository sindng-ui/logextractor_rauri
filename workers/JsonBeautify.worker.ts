/// <reference lib="webworker" />

import { JsonWorkerRequest, JsonWorkerResponse } from '../types/jsonBeautify';
import { JsonArenaEngine } from './jsonArenaEngine';

const engine = new JsonArenaEngine();

const respond = (msg: JsonWorkerResponse) => {
  self.postMessage(msg);
};

self.onmessage = (event: MessageEvent<JsonWorkerRequest>) => {
  const req = event.data;
  if (!req || !req.type) return;

  try {
    switch (req.type) {
      case 'PARSE': {
        const res = engine.parse(req.payload.text, req.payload.initialDepth ?? 2);
        if (res.ok) {
          respond({
            type: 'PARSE_SUCCESS',
            requestId: req.requestId,
            payload: {
              stats: res.stats,
              repairInfo: res.repairInfo,
              rows: res.rows,
              expandedIds: res.expandedIds,
            },
          });
        } else {
          respond({
            type: 'PARSE_ERROR',
            requestId: req.requestId,
            payload: res.error,
          });
        }
        break;
      }

      case 'TOGGLE_NODE': {
        const payload = engine.toggleNode(req.payload.nodeId);
        respond({ type: 'TREE_ROWS', requestId: req.requestId, payload });
        break;
      }

      case 'EXPAND_DEPTH': {
        const payload = engine.expandToDepth(req.payload.depth);
        respond({ type: 'TREE_ROWS', requestId: req.requestId, payload });
        break;
      }

      case 'EXPAND_TO_NODE': {
        const payload = engine.expandToNode(req.payload.nodeId);
        respond({ type: 'TREE_ROWS', requestId: req.requestId, payload });
        break;
      }

      case 'SEARCH': {
        const payload = engine.search(
          req.payload.query,
          req.payload.mode,
          req.payload.caseSensitive ?? false
        );
        respond({ type: 'SEARCH_RESULT', requestId: req.requestId, payload });
        break;
      }

      case 'GET_NODE_DETAIL': {
        const payload = engine.getNodeDetail(req.payload.nodeId);
        respond({ type: 'NODE_DETAIL', requestId: req.requestId, payload });
        break;
      }

      case 'GET_COPY_TEXT': {
        const payload = engine.getCopyText(
          req.payload.nodeId,
          req.payload.mode,
          req.payload.indent,
          req.payload.sortKeys
        );
        respond({ type: 'COPY_TEXT', requestId: req.requestId, payload });
        break;
      }

      case 'GET_COLUMNS': {
        const payload = engine.getColumns(req.payload.pathIds);
        respond({ type: 'COLUMNS_DATA', requestId: req.requestId, payload });
        break;
      }

      case 'GET_GRAPH': {
        const payload = engine.getGraphScene(req.payload);
        respond({ type: 'GRAPH_DATA', requestId: req.requestId, payload });
        break;
      }

      case 'GET_TABLE': {
        const payload = engine.getTable(req.payload.arrayNodeId);
        respond({ type: 'TABLE_DATA', requestId: req.requestId, payload });
        break;
      }

      case 'GET_CODE': {
        const payload = engine.getCode(req.payload.indent, req.payload.sortKeys, req.payload.minified);
        respond({ type: 'CODE_DATA', requestId: req.requestId, payload });
        break;
      }

      case 'GET_TS_SCHEMA': {
        const code = engine.getTypeScriptSchema(req.payload.rootName);
        respond({ type: 'TS_SCHEMA', requestId: req.requestId, payload: { code } });
        break;
      }

      case 'CLEAR': {
        engine.clear();
        respond({ type: 'CLEARED', requestId: req.requestId });
        break;
      }
    }
  } catch (err) {
    respond({
      type: 'PARSE_ERROR',
      requestId: req.requestId,
      payload: {
        message: err instanceof Error ? err.message : String(err),
        line: null,
        column: null,
        position: null,
        snippet: [],
      },
    });
  }
};
