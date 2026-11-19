import {
  GraphCardNode,
  GraphCardProperty,
  GraphEdge,
  GraphScenePayload,
  JsonValueType,
} from '../types/jsonBeautify';
import { layoutGraphTree } from '../utils/jsonGraphLayout';

export interface GraphArenaNodeLike {
  id: number;
  parentId: number;
  key: string;
  isArrayItem: boolean;
  type: JsonValueType;
  depth: number;
  path: string;
  value: unknown;
  childIds: number[];
  preview: string;
  hasEmbeddedJson: boolean;
}

const MAX_GRAPH_NODES = 600;
const DEFAULT_ARRAY_GRAPH_LIMIT = 25;
const MAX_CARD_PROPERTIES_COLLAPSED = 8;
const MAX_CARD_PROPERTIES_EXPANDED = 60;

function buildTooltipPreview(node: GraphArenaNodeLike): string | undefined {
  if (node.type === 'string' && typeof node.value === 'string') {
    const raw = node.value;
    if (raw.length > 600) return raw.slice(0, 600) + '…';
    return raw;
  }
  return node.preview;
}

export function buildGraphSceneFromArena(
  nodes: GraphArenaNodeLike[],
  graphExpandedSet: Set<number>,
  graphArrayLimits: Map<number, number>,
  graphExpandedPropCards: Set<number>,
  options: {
    expandedIds?: number[];
    extraArrayLimits?: Record<number, number>;
    expandedPropCardIds?: number[];
    wideCards?: boolean;
    autoInit?: boolean;
    focusNodeId?: number | null;
  }
): {
  scene: GraphScenePayload;
  expandedIds: number[];
  extraArrayLimits: Record<number, number>;
  expandedPropCardIds: number[];
} {
  if (nodes.length === 0) {
    return {
      scene: layoutGraphTree([], [], 0, false, options.wideCards ?? false),
      expandedIds: [],
      extraArrayLimits: {},
      expandedPropCardIds: [],
    };
  }

  if (options.autoInit) {
    graphExpandedSet.clear();
    graphArrayLimits.clear();
    graphExpandedPropCards.clear();
    const queue: number[] = [0];
    let budget = 80;
    while (queue.length > 0 && budget > 0) {
      const id = queue.shift()!;
      const n = nodes[id];
      if (!n || n.depth >= 2) continue;
      const containerKids = n.childIds.filter((cid) => {
        const c = nodes[cid];
        return c.type === 'object' || c.type === 'array';
      });
      if (containerKids.length > 0) {
        graphExpandedSet.add(id);
        const cap = n.type === 'array' ? Math.min(containerKids.length, 12) : Math.min(containerKids.length, 20);
        for (let i = 0; i < cap && budget > 0; i++) {
          queue.push(containerKids[i]);
          budget--;
        }
      }
    }
  } else {
    if (options.expandedIds) {
      graphExpandedSet.clear();
      for (const id of options.expandedIds) graphExpandedSet.add(id);
    }
    if (options.extraArrayLimits) {
      graphArrayLimits.clear();
      for (const [k, v] of Object.entries(options.extraArrayLimits)) {
        graphArrayLimits.set(Number(k), v);
      }
    }
    if (options.expandedPropCardIds) {
      graphExpandedPropCards.clear();
      for (const id of options.expandedPropCardIds) graphExpandedPropCards.add(id);
    }
  }

  if (options.focusNodeId !== undefined && options.focusNodeId !== null && nodes[options.focusNodeId]) {
    let cur: GraphArenaNodeLike | undefined = nodes[options.focusNodeId];
    while (cur && cur.parentId !== -1) {
      const parent: GraphArenaNodeLike = nodes[cur.parentId];
      graphExpandedSet.add(parent.id);
      if (parent.type === 'array') {
        const idx = parent.childIds.indexOf(cur.id);
        const curLim = graphArrayLimits.get(parent.id) || DEFAULT_ARRAY_GRAPH_LIMIT;
        if (idx >= curLim) {
          graphArrayLimits.set(parent.id, idx + 10);
        }
      }
      cur = parent;
    }
  }

  const cards: GraphCardNode[] = [];
  const edges: GraphEdge[] = [];
  let truncatedByLimit = false;
  let nextStubId = -10;

  const visitStack: number[] = [0];
  while (visitStack.length > 0) {
    if (cards.length >= MAX_GRAPH_NODES) {
      truncatedByLimit = true;
      break;
    }

    const id = visitStack.pop()!;
    const n = nodes[id];
    const isPropsExpanded = graphExpandedPropCards.has(id);
    const propCap = isPropsExpanded ? MAX_CARD_PROPERTIES_EXPANDED : MAX_CARD_PROPERTIES_COLLAPSED;

    const properties: GraphCardProperty[] = [];
    const containerChildren: number[] = [];

    if (n.type === 'object' || n.type === 'array') {
      for (const cid of n.childIds) {
        const c = nodes[cid];
        if (c.type === 'object' || c.type === 'array') {
          containerChildren.push(cid);
        } else if (properties.length < propCap) {
          properties.push({
            key: c.isArrayItem ? `[${c.key}]` : c.key,
            value: c.preview,
            fullPreview: buildTooltipPreview(c),
            type: c.type,
            nodeId: c.id,
            hasEmbeddedJson: c.hasEmbeddedJson,
          });
        }
      }
    } else {
      properties.push({
        key: 'value',
        value: n.preview,
        fullPreview: buildTooltipPreview(n),
        type: n.type,
        nodeId: n.id,
        hasEmbeddedJson: n.hasEmbeddedJson,
      });
    }

    const primitiveTotal = n.childIds.length - containerChildren.length;
    const extraPropertyCount = Math.max(0, primitiveTotal - properties.length);
    const isExpanded = containerChildren.length > 0 && graphExpandedSet.has(id);

    const arrayLimit = n.type === 'array' ? graphArrayLimits.get(id) || DEFAULT_ARRAY_GRAPH_LIMIT : 60;
    const shownCount = isExpanded ? Math.min(containerChildren.length, arrayLimit) : 0;

    cards.push({
      id: n.id,
      parentId: n.parentId,
      key: n.isArrayItem ? `[${n.key}]` : n.key,
      path: n.path,
      type: n.type,
      depth: n.depth,
      childCount: n.childIds.length,
      hasContainerChildren: containerChildren.length > 0,
      isExpanded,
      isPropsExpanded: isPropsExpanded && primitiveTotal > MAX_CARD_PROPERTIES_COLLAPSED,
      properties,
      extraPropertyCount,
      totalChildrenCount: containerChildren.length,
      shownChildrenCount: shownCount,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });

    if (isExpanded) {
      const remaining = containerChildren.length - shownCount;

      for (let i = 0; i < shownCount; i++) {
        const cid = containerChildren[i];
        const child = nodes[cid];
        edges.push({
          fromId: n.id,
          toId: cid,
          label: child.isArrayItem ? `[${child.key}]` : child.key,
        });
      }

      if (remaining > 0) {
        const stubId = nextStubId--;
        cards.push({
          id: stubId,
          parentId: n.id,
          key: `+ Show ${Math.min(25, remaining)} more (${remaining} left)`,
          path: n.path,
          type: 'array',
          depth: n.depth + 1,
          childCount: remaining,
          hasContainerChildren: false,
          isExpanded: false,
          properties: [],
          extraPropertyCount: 0,
          totalChildrenCount: 0,
          shownChildrenCount: 0,
          isMoreStub: true,
          stubParentId: n.id,
          stubRemaining: remaining,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
        });
        edges.push({ fromId: n.id, toId: stubId, label: '' });
      }

      for (let i = shownCount - 1; i >= 0; i--) {
        visitStack.push(containerChildren[i]);
      }
    }
  }

  const scene = layoutGraphTree(cards, edges, nodes.length, truncatedByLimit, options.wideCards ?? false);
  const limitsObj: Record<number, number> = {};
  for (const [k, v] of graphArrayLimits.entries()) {
    limitsObj[k] = v;
  }

  return {
    scene,
    expandedIds: Array.from(graphExpandedSet),
    extraArrayLimits: limitsObj,
    expandedPropCardIds: Array.from(graphExpandedPropCards),
  };
}
