import { GraphCardNode, GraphEdge, GraphScenePayload, JsonValueType } from '../types/jsonBeautify';
import { decodeInlineBadge } from './jsonValueDecoders';

export const GRAPH_CARD_MIN_WIDTH = 264;
export const GRAPH_CARD_MAX_COMPACT = 390;
export const GRAPH_CARD_MAX_WIDE = 560;
export const GRAPH_HEADER_HEIGHT = 34;
export const GRAPH_ROW_HEIGHT = 22;
export const GRAPH_FOOTER_HEIGHT = 24;
export const GRAPH_COL_GAP = 84;
export const GRAPH_ROW_GAP = 18;
export const GRAPH_STUB_HEIGHT = 38;
export const GRAPH_PROPS_TOP_PAD = 8;

export function computeCardWidth(node: GraphCardNode, wideCards: boolean): number {
  if (node.isMoreStub) return 264;

  const minW = wideCards ? 340 : GRAPH_CARD_MIN_WIDTH;
  const maxW = wideCards ? GRAPH_CARD_MAX_WIDE : GRAPH_CARD_MAX_COMPACT;

  // Header length estimate
  let longestPx = node.key.length * 7.6 + 108;

  // Property line length estimate
  for (const prop of node.properties) {
    const keyLen = Math.min(prop.key.length, 22);
    const valLen = Math.min(prop.value.length, wideCards ? 64 : 40);
    const badgeExtra = prop.hasEmbeddedJson ? 28 : 0;
    const estPx = 28 + (keyLen + 2 + valLen) * 6.75 + badgeExtra;
    if (estPx > longestPx) longestPx = estPx;
  }

  return Math.round(Math.max(minW, Math.min(maxW, longestPx)));
}

export function computeCardHeight(
  node: Pick<GraphCardNode, 'properties' | 'extraPropertyCount' | 'isPropsExpanded' | 'isMoreStub'>
): number {
  if (node.isMoreStub) return GRAPH_STUB_HEIGHT;
  const rows = node.properties.length;
  const hasFooter = node.extraPropertyCount > 0 || Boolean(node.isPropsExpanded);
  if (rows === 0 && !hasFooter) {
    return GRAPH_HEADER_HEIGHT + 14;
  }
  return GRAPH_HEADER_HEIGHT + GRAPH_PROPS_TOP_PAD + rows * GRAPH_ROW_HEIGHT + (hasFooter ? GRAPH_FOOTER_HEIGHT : 6);
}

/**
 * O(V) iterative post-order subtree height calculation & top-down left-to-right placement
 * with adaptive per-card width support.
 */
export function layoutGraphTree(
  nodes: GraphCardNode[],
  edges: GraphEdge[],
  totalArenaNodes: number,
  truncatedByLimit: boolean,
  wideCards = false
): GraphScenePayload {
  if (nodes.length === 0) {
    return {
      nodes: [],
      edges: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
      totalArenaNodes,
      renderedNodeCount: 0,
      truncatedByLimit,
    };
  }

  const nodeMap = new Map<number, GraphCardNode>();
  const childrenMap = new Map<number, number[]>();

  for (const n of nodes) {
    n.width = computeCardWidth(n, wideCards);
    n.height = computeCardHeight(n);
    nodeMap.set(n.id, n);
    childrenMap.set(n.id, []);
  }

  for (const e of edges) {
    const list = childrenMap.get(e.fromId);
    if (list) list.push(e.toId);
  }

  const rootId = nodes[0].id;

  const order: number[] = [];
  const stack: number[] = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    order.push(id);
    const kids = childrenMap.get(id);
    if (kids) {
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push(kids[i]);
      }
    }
  }

  const subtreeHeight = new Map<number, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const node = nodeMap.get(id)!;
    const kids = childrenMap.get(id) || [];
    if (kids.length === 0) {
      subtreeHeight.set(id, node.height);
    } else {
      let sum = 0;
      for (let k = 0; k < kids.length; k++) {
        sum += subtreeHeight.get(kids[k]) || GRAPH_STUB_HEIGHT;
        if (k > 0) sum += GRAPH_ROW_GAP;
      }
      subtreeHeight.set(id, Math.max(node.height, sum));
    }
  }

  interface PlaceFrame {
    id: number;
    x: number;
    topY: number;
  }

  const placeStack: PlaceFrame[] = [{ id: rootId, x: 40, topY: 40 }];
  while (placeStack.length > 0) {
    const frame = placeStack.pop()!;
    const node = nodeMap.get(frame.id)!;
    const totalH = subtreeHeight.get(frame.id) || node.height;
    node.x = frame.x;
    node.y = frame.topY + (totalH - node.height) / 2;

    const kids = childrenMap.get(frame.id) || [];
    if (kids.length > 0) {
      let kidsSum = 0;
      for (let k = 0; k < kids.length; k++) {
        kidsSum += subtreeHeight.get(kids[k]) || GRAPH_STUB_HEIGHT;
        if (k > 0) kidsSum += GRAPH_ROW_GAP;
      }
      let cursorY = frame.topY + (totalH - kidsSum) / 2;
      const childX = frame.x + node.width + GRAPH_COL_GAP;

      const frames: PlaceFrame[] = [];
      for (let k = 0; k < kids.length; k++) {
        const kidId = kids[k];
        const kidH = subtreeHeight.get(kidId) || GRAPH_STUB_HEIGHT;
        frames.push({ id: kidId, x: childX, topY: cursorY });
        cursorY += kidH + GRAPH_ROW_GAP;
      }
      for (let k = frames.length - 1; k >= 0; k--) {
        placeStack.push(frames[k]);
      }
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
  }

  const pad = 40;
  return {
    nodes,
    edges,
    bounds: {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    },
    totalArenaNodes,
    renderedNodeCount: nodes.length,
    truncatedByLimit,
  };
}

export interface GraphViewport {
  offsetX: number;
  offsetY: number;
  scale: number;
}

const VALUE_COLORS: Record<JsonValueType, string> = {
  string: '#34d399',
  number: '#60a5fa',
  boolean: '#fb923c',
  null: '#f87171',
  object: '#818cf8',
  array: '#38bdf8',
};

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncateText(text: string, maxChars: number): string {
  if (maxChars <= 1) return '…';
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + '…';
}

export function renderGraphCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: GraphScenePayload,
  viewport: GraphViewport,
  selectedNodeId: number | null,
  hoveredNodeId: number | null,
  ancestorPathSet: Set<number>,
  hoveredPropIndex: number | null = null,
  hoveredFooterNodeId: number | null = null
): void {
  ctx.save();
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, width, height);

  const gridStep = Math.max(16, 28 * viewport.scale);
  if (gridStep >= 14) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
    const startX = ((viewport.offsetX % gridStep) + gridStep) % gridStep;
    const startY = ((viewport.offsetY % gridStep) + gridStep) % gridStep;
    for (let gx = startX; gx < width; gx += gridStep) {
      for (let gy = startY; gy < height; gy += gridStep) {
        ctx.fillRect(gx, gy, 1.2, 1.2);
      }
    }
  }

  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.scale, viewport.scale);

  const margin = 120;
  const viewMinX = -viewport.offsetX / viewport.scale - margin;
  const viewMinY = -viewport.offsetY / viewport.scale - margin;
  const viewMaxX = (width - viewport.offsetX) / viewport.scale + margin;
  const viewMaxY = (height - viewport.offsetY) / viewport.scale + margin;

  const nodeMap = new Map<number, GraphCardNode>();
  for (const n of scene.nodes) nodeMap.set(n.id, n);

  // 1) Cubic Bezier Edges
  for (const edge of scene.edges) {
    const from = nodeMap.get(edge.fromId);
    const to = nodeMap.get(edge.toId);
    if (!from || !to) continue;

    const x1 = from.x + from.width;
    const y1 = from.y + GRAPH_HEADER_HEIGHT / 2;
    const x2 = to.x;
    const y2 = to.y + (to.isMoreStub ? to.height / 2 : GRAPH_HEADER_HEIGHT / 2);

    if (
      Math.max(x1, x2) < viewMinX ||
      Math.min(x1, x2) > viewMaxX ||
      Math.max(y1, y2) < viewMinY ||
      Math.min(y1, y2) > viewMaxY
    ) {
      continue;
    }

    const isHighlighted = ancestorPathSet.has(edge.fromId) && ancestorPathSet.has(edge.toId);
    const cpOffset = Math.max(32, (x2 - x1) * 0.48);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + cpOffset, y1, x2 - cpOffset, y2, x2, y2);
    ctx.strokeStyle = isHighlighted ? '#818cf8' : to.isMoreStub ? '#334155' : '#3b4a68';
    ctx.lineWidth = isHighlighted ? 2.4 : 1.4;
    if (to.isMoreStub) ctx.setLineDash([4, 4]);
    ctx.stroke();
    if (to.isMoreStub) ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(x2, y2, isHighlighted ? 3.5 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = isHighlighted ? '#a5b4fc' : '#64748b';
    ctx.fill();
  }

  // 2) Visible Cards
  const lowDetail = viewport.scale < 0.35;

  for (const node of scene.nodes) {
    if (
      node.x + node.width < viewMinX ||
      node.x > viewMaxX ||
      node.y + node.height < viewMinY ||
      node.y > viewMaxY
    ) {
      continue;
    }

    const isSelected = node.id === selectedNodeId;
    const isHovered = node.id === hoveredNodeId;
    const isOnPath = ancestorPathSet.has(node.id);

    if (node.isMoreStub) {
      drawRoundedRect(ctx, node.x, node.y, node.width, node.height, 10);
      ctx.fillStyle = isHovered ? '#1e293b' : '#111827';
      ctx.fill();
      ctx.strokeStyle = isHovered ? '#38bdf8' : '#334155';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (!lowDetail) {
        ctx.font = '600 12px Inter, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.key, node.x + 14, node.y + node.height / 2);
      }
      continue;
    }

    // Card Background
    drawRoundedRect(ctx, node.x, node.y, node.width, node.height, 12);
    ctx.fillStyle = isSelected ? '#172038' : '#111827';
    ctx.fill();
    ctx.strokeStyle = isSelected
      ? '#818cf8'
      : isHovered
        ? '#60a5fa'
        : isOnPath
          ? 'rgba(129, 140, 248, 0.55)'
          : '#1e293b';
    ctx.lineWidth = isSelected ? 2.2 : 1.2;
    ctx.stroke();

    // Header Band
    ctx.save();
    drawRoundedRect(ctx, node.x + 0.5, node.y + 0.5, node.width - 1, GRAPH_HEADER_HEIGHT, 11);
    ctx.fillStyle = node.type === 'array' ? 'rgba(56, 189, 248, 0.14)' : 'rgba(99, 102, 241, 0.16)';
    ctx.fill();
    ctx.restore();

    if (lowDetail) continue;

    // Header Accent Dot + Title
    ctx.beginPath();
    ctx.arc(node.x + 14, node.y + GRAPH_HEADER_HEIGHT / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = VALUE_COLORS[node.type] || '#818cf8';
    ctx.fill();

    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.fillStyle = '#f1f5f9';
    ctx.textBaseline = 'middle';
    const maxTitleChars = Math.max(12, Math.floor((node.width - (node.hasContainerChildren ? 96 : 72)) / 7.5));
    ctx.fillText(truncateText(node.key, maxTitleChars), node.x + 24, node.y + GRAPH_HEADER_HEIGHT / 2);

    // Count Badge
    const countText = node.type === 'array' ? `[${node.childCount}]` : `{${node.childCount}}`;
    ctx.font = '600 10.5px "JetBrains Mono", monospace';
    ctx.fillStyle = node.type === 'array' ? '#7dd3fc' : '#a5b4fc';
    const countW = ctx.measureText(countText).width;
    const badgeRight = node.hasContainerChildren ? node.x + node.width - 30 : node.x + node.width - 10;
    ctx.fillText(countText, badgeRight - countW, node.y + GRAPH_HEADER_HEIGHT / 2);

    // Expand/Collapse Toggle Circle
    if (node.hasContainerChildren) {
      const btnX = node.x + node.width - 15;
      const btnY = node.y + GRAPH_HEADER_HEIGHT / 2;
      ctx.beginPath();
      ctx.arc(btnX, btnY, 9, 0, Math.PI * 2);
      ctx.fillStyle = node.isExpanded ? '#312e81' : '#1e293b';
      ctx.fill();
      ctx.strokeStyle = node.isExpanded ? '#818cf8' : '#475569';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.font = '700 12px Inter, sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'center';
      ctx.fillText(node.isExpanded ? '−' : '+', btnX, btnY + 0.5);
      ctx.textAlign = 'left';
    }

    // Properties inside card with inline visual hints (color swatch, short date, embedded JSON tag)
    if (node.properties.length > 0) {
      let rowTop = node.y + GRAPH_HEADER_HEIGHT + GRAPH_PROPS_TOP_PAD;
      for (let pIdx = 0; pIdx < node.properties.length; pIdx++) {
        const prop = node.properties[pIdx];
        const rowCenterY = rowTop + GRAPH_ROW_HEIGHT / 2;

        // Subtle row hover tint for tooltip focus
        if (isHovered && hoveredPropIndex === pIdx) {
          ctx.fillStyle = 'rgba(99, 102, 241, 0.14)';
          ctx.fillRect(node.x + 5, rowTop + 1, node.width - 10, GRAPH_ROW_HEIGHT - 2);
        }

        ctx.font = '500 11px "JetBrains Mono", monospace';
        const keyTxt = truncateText(prop.key, 20) + ': ';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(keyTxt, node.x + 12, rowCenterY);

        const keyW = Math.min(node.width * 0.46, ctx.measureText(keyTxt).width);
        let valX = node.x + 12 + keyW;
        const rightEdge = node.x + node.width - 12;

        const badge = decodeInlineBadge(prop.type, prop.value, prop.hasEmbeddedJson);

        // Inline color swatch square
        if (badge?.kind === 'color' && badge.colorValue) {
          ctx.fillStyle = badge.colorValue;
          ctx.fillRect(valX, rowCenterY - 4.5, 9, 9);
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 0.8;
          ctx.strokeRect(valX, rowCenterY - 4.5, 9, 9);
          valX += 14;
        } else if (badge?.kind === 'embedded-json') {
          drawRoundedRect(ctx, valX, rowCenterY - 7, 20, 14, 3);
          ctx.fillStyle = 'rgba(99, 102, 241, 0.28)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(129, 140, 248, 0.5)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.font = '700 9.5px "JetBrains Mono", monospace';
          ctx.fillStyle = '#c7d2fe';
          ctx.fillText('{}', valX + 3.5, rowCenterY + 0.5);
          valX += 25;
          ctx.font = '500 11px "JetBrains Mono", monospace';
        }

        const availW = Math.max(32, rightEdge - valX);
        let displayVal = prop.value;

        // Inline short timestamp hint if room permits
        if (badge?.kind === 'timestamp' && availW > 130) {
          const shortDate = badge.label.slice(5, 16); // MM-DD HH:mm
          const valW = ctx.measureText(displayVal).width;
          if (valW + 86 < availW) {
            ctx.fillStyle = VALUE_COLORS[prop.type] || '#cbd5e1';
            ctx.fillText(displayVal, valX, rowCenterY);
            ctx.font = '500 10px "JetBrains Mono", monospace';
            ctx.fillStyle = 'rgba(52, 211, 153, 0.78)';
            ctx.fillText(`· ${shortDate}`, valX + valW + 6, rowCenterY);
            rowTop += GRAPH_ROW_HEIGHT;
            continue;
          }
        }

        const maxValChars = Math.max(5, Math.floor(availW / 6.7));
        ctx.fillStyle = VALUE_COLORS[prop.type] || '#cbd5e1';
        ctx.fillText(truncateText(displayVal, maxValChars), valX, rowCenterY);
        rowTop += GRAPH_ROW_HEIGHT;
      }
    }

    // Interactive Footer: +N more properties / − Show less
    const hasFooter = node.extraPropertyCount > 0 || Boolean(node.isPropsExpanded);
    if (hasFooter) {
      const footerY = node.y + node.height - GRAPH_FOOTER_HEIGHT;
      const isFooterHover = hoveredFooterNodeId === node.id;
      if (isFooterHover) {
        ctx.fillStyle = 'rgba(99, 102, 241, 0.16)';
        ctx.fillRect(node.x + 6, footerY + 2, node.width - 12, GRAPH_FOOTER_HEIGHT - 5);
      }
      ctx.font = '600 10.5px Inter, sans-serif';
      ctx.fillStyle = isFooterHover ? '#a5b4fc' : '#64748b';
      const label = node.isPropsExpanded
        ? '− Show fewer properties'
        : `+ ${node.extraPropertyCount} more properties (click to expand)`;
      ctx.fillText(label, node.x + 12, footerY + GRAPH_FOOTER_HEIGHT / 2);
    }
  }

  ctx.restore();
}
