import {
  AnnotationItem,
  AnnotatorDocument,
  CutoutRegion,
  CutoutStyle,
  Point,
  RectBox,
} from '../types/screenshotAnnotator';

export type ResizeHandleId =
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'start'
  | 'end'
  | 'control'
  | 'tail';

export interface AxisSlice {
  srcStart: number;
  srcLen: number;
  dstStart: number;
}

export interface CutoutSeam {
  axis: 'x' | 'y';
  pos: number;
  style: CutoutStyle;
}

export interface CutoutLayout {
  xSlices: AxisSlice[];
  ySlices: AxisSlice[];
  seams: CutoutSeam[];
  effectiveWidth: number;
  effectiveHeight: number;
}

export interface DocumentLayout {
  cutout: CutoutLayout;
  crop: RectBox;
  framePadding: number;
  contentX: number;
  contentY: number;
  contentW: number;
  contentH: number;
  outputWidth: number;
  outputHeight: number;
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): RectBox {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

export function snapSquareRect(x1: number, y1: number, x2: number, y2: number): RectBox {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = dx >= 0 ? x1 : x1 - side;
  const sy = dy >= 0 ? y1 : y1 - side;
  return { x: sx, y: sy, w: side, h: side };
}

export function snapAnglePoint(origin: Point, target: Point, stepDeg = 45): Point {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-3) return target;
  const radStep = (stepDeg * Math.PI) / 180;
  const angle = Math.round(Math.atan2(dy, dx) / radStep) * radStep;
  return {
    x: origin.x + Math.cos(angle) * dist,
    y: origin.y + Math.sin(angle) * dist,
  };
}

/** Snap to pure horizontal line when |dx| >= |dy|, or pure vertical line when |dy| > |dx|. */
export function snapAxisPoint(origin: Point, target: Point): Point {
  const dx = Math.abs(target.x - origin.x);
  const dy = Math.abs(target.y - origin.y);
  return dx >= dy
    ? { x: target.x, y: origin.y }
    : { x: origin.x, y: target.y };
}

export function simplifyPoints(points: Point[], minDist = 2.5): Point[] {
  if (points.length <= 2) return points;
  const out: Point[] = [points[0]];
  let last = points[0];
  const minDistSq = minDist * minDist;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (dx * dx + dy * dy >= minDistSq) {
      out.push(p);
      last = p;
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function buildAxisSlices(
  total: number,
  regions: { start: number; end: number; style: CutoutStyle }[],
  axis: 'x' | 'y'
): { slices: AxisSlice[]; seams: CutoutSeam[]; effectiveSize: number } {
  if (total <= 0) {
    return { slices: [], seams: [], effectiveSize: 0 };
  }
  const normalized = regions
    .map((r) => ({
      start: Math.max(0, Math.min(total, Math.min(r.start, r.end))),
      end: Math.max(0, Math.min(total, Math.max(r.start, r.end))),
      style: r.style,
    }))
    .filter((r) => r.end - r.start >= 4)
    .sort((a, b) => a.start - b.start);

  if (normalized.length === 0) {
    return {
      slices: [{ srcStart: 0, srcLen: total, dstStart: 0 }],
      seams: [],
      effectiveSize: total,
    };
  }

  // Merge overlapping cutout bands
  const merged: { start: number; end: number; style: CutoutStyle }[] = [];
  for (const seg of normalized) {
    const prev = merged[merged.length - 1];
    if (prev && seg.start <= prev.end) {
      prev.end = Math.max(prev.end, seg.end);
      prev.style = seg.style;
    } else {
      merged.push({ ...seg });
    }
  }

  const slices: AxisSlice[] = [];
  const seams: CutoutSeam[] = [];
  let srcCursor = 0;
  let dstCursor = 0;

  for (const cut of merged) {
    if (cut.start > srcCursor) {
      const len = cut.start - srcCursor;
      slices.push({ srcStart: srcCursor, srcLen: len, dstStart: dstCursor });
      dstCursor += len;
    }
    if (dstCursor > 0 && cut.end < total) {
      seams.push({ axis, pos: dstCursor, style: cut.style });
    }
    srcCursor = cut.end;
  }

  if (srcCursor < total) {
    const len = total - srcCursor;
    slices.push({ srcStart: srcCursor, srcLen: len, dstStart: dstCursor });
    dstCursor += len;
  }

  if (slices.length === 0) {
    // Guard: never collapse image to 0px
    const fallback = Math.min(total, 16);
    return {
      slices: [{ srcStart: 0, srcLen: fallback, dstStart: 0 }],
      seams: [],
      effectiveSize: fallback,
    };
  }

  return { slices, seams, effectiveSize: Math.max(1, Math.round(dstCursor)) };
}

/** Map a coordinate on the cutout-collapsed image back to the original base image axis. */
export function mapCollapsedToSource(coord: number, slices: AxisSlice[]): number {
  for (const s of slices) {
    if (coord >= s.dstStart && coord <= s.dstStart + s.srcLen) {
      return s.srcStart + (coord - s.dstStart);
    }
  }
  const last = slices[slices.length - 1];
  return last ? last.srcStart + last.srcLen : coord;
}

export function computeCutoutLayout(
  width: number,
  height: number,
  cutouts: CutoutRegion[]
): CutoutLayout {
  const xRegions = cutouts.filter((c) => c.axis === 'x');
  const yRegions = cutouts.filter((c) => c.axis === 'y');
  const xRes = buildAxisSlices(width, xRegions, 'x');
  const yRes = buildAxisSlices(height, yRegions, 'y');

  return {
    xSlices: xRes.slices,
    ySlices: yRes.slices,
    seams: [...xRes.seams, ...yRes.seams],
    effectiveWidth: xRes.effectiveSize,
    effectiveHeight: yRes.effectiveSize,
  };
}

export function computeDocumentLayout(doc: AnnotatorDocument): DocumentLayout {
  const cutout = computeCutoutLayout(doc.width, doc.height, doc.cutouts);
  const rawCrop = doc.cropRect;
  const crop: RectBox = rawCrop
    ? {
        x: Math.max(0, Math.min(cutout.effectiveWidth - 4, rawCrop.x)),
        y: Math.max(0, Math.min(cutout.effectiveHeight - 4, rawCrop.y)),
        w: Math.max(4, Math.min(cutout.effectiveWidth - Math.max(0, rawCrop.x), rawCrop.w)),
        h: Math.max(4, Math.min(cutout.effectiveHeight - Math.max(0, rawCrop.y), rawCrop.h)),
      }
    : { x: 0, y: 0, w: cutout.effectiveWidth, h: cutout.effectiveHeight };

  const framePadding = doc.frameConfig.enabled ? Math.max(0, doc.frameConfig.padding) : 0;
  return {
    cutout,
    crop,
    framePadding,
    contentX: framePadding,
    contentY: framePadding,
    contentW: Math.round(crop.w),
    contentH: Math.round(crop.h),
    outputWidth: Math.round(crop.w + framePadding * 2),
    outputHeight: Math.round(crop.h + framePadding * 2),
  };
}

export function estimateTextBounds(
  item: Extract<AnnotationItem, { type: 'text' }>
): RectBox {
  const lines = (item.text || 'Text').split('\n');
  const maxChars = Math.max(1, ...lines.map((l) => l.length));
  const padX = item.variant === 'outline' ? 6 : item.variant === 'border' ? 10 : 12;
  const padY = item.variant === 'outline' ? 4 : item.variant === 'border' ? 5 : 8;
  const lineH = Math.round(item.fontSize * 1.32);
  const approxCharW = item.fontSize * 0.62;
  const w = Math.max(36, Math.round(maxChars * approxCharW + padX * 2));
  const h = Math.max(item.fontSize + padY * 2, lines.length * lineH + padY * 2);
  return { x: item.x, y: item.y, w, h };
}

export function getAnnotationBounds(item: AnnotationItem): RectBox {
  switch (item.type) {
    case 'rect':
    case 'ellipse':
    case 'mosaic':
    case 'spotlight':
    case 'overlayImage':
      return { x: item.x, y: item.y, w: item.w, h: item.h };
    case 'arrow': {
      const xs = [item.x1, item.x2, ...(item.curved && item.cx !== undefined ? [item.cx] : [])];
      const ys = [item.y1, item.y2, ...(item.curved && item.cy !== undefined ? [item.cy] : [])];
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, w: Math.max(1, Math.max(...xs) - minX), h: Math.max(1, Math.max(...ys) - minY) };
    }
    case 'step': {
      const r = item.size / 2;
      const xs = [item.x - r, item.x + r, ...(item.targetX !== undefined ? [item.targetX] : [])];
      const ys = [item.y - r, item.y + r, ...(item.targetY !== undefined ? [item.targetY] : [])];
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
    }
    case 'text': {
      const b = estimateTextBounds(item);
      if (item.targetX !== undefined && item.targetY !== undefined) {
        const minX = Math.min(b.x, item.targetX);
        const minY = Math.min(b.y, item.targetY);
        const maxX = Math.max(b.x + b.w, item.targetX);
        const maxY = Math.max(b.y + b.h, item.targetY);
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
      return b;
    }
    case 'highlighter':
    case 'freehand': {
      if (item.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of item.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
    }
  }
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function hitTestSingleAnnotation(item: AnnotationItem, pt: Point, tol = 8): boolean {
  switch (item.type) {
    case 'rect':
    case 'mosaic':
    case 'spotlight':
    case 'overlayImage': {
      const inside =
        pt.x >= item.x - tol &&
        pt.x <= item.x + item.w + tol &&
        pt.y >= item.y - tol &&
        pt.y <= item.y + item.h + tol;
      if (!inside) return false;
      if (item.type === 'rect' && item.fillOpacity === 0 && item.w > tol * 4 && item.h > tol * 4) {
        const inner =
          pt.x > item.x + tol + item.strokeWidth &&
          pt.x < item.x + item.w - tol - item.strokeWidth &&
          pt.y > item.y + tol + item.strokeWidth &&
          pt.y < item.y + item.h - tol - item.strokeWidth;
        return !inner;
      }
      return true;
    }
    case 'ellipse': {
      const rx = item.w / 2;
      const ry = item.h / 2;
      if (rx < 1 || ry < 1) return false;
      const cx = item.x + rx;
      const cy = item.y + ry;
      const nx = (pt.x - cx) / (rx + tol);
      const ny = (pt.y - cy) / (ry + tol);
      const outer = nx * nx + ny * ny <= 1;
      if (!outer) return false;
      if (item.fillOpacity === 0 && rx > tol * 2 && ry > tol * 2) {
        const inx = (pt.x - cx) / Math.max(1, rx - tol - item.strokeWidth);
        const iny = (pt.y - cy) / Math.max(1, ry - tol - item.strokeWidth);
        return inx * inx + iny * iny >= 1;
      }
      return true;
    }
    case 'arrow': {
      const hitTol = Math.max(tol, item.strokeWidth + 6);
      if (item.curved && item.cx !== undefined && item.cy !== undefined) {
        let prev: Point = { x: item.x1, y: item.y1 };
        for (let i = 1; i <= 12; i++) {
          const t = i / 12;
          const inv = 1 - t;
          const cur: Point = {
            x: inv * inv * item.x1 + 2 * inv * t * item.cx + t * t * item.x2,
            y: inv * inv * item.y1 + 2 * inv * t * item.cy + t * t * item.y2,
          };
          if (distToSegment(pt, prev, cur) <= hitTol) return true;
          prev = cur;
        }
        return false;
      }
      return distToSegment(pt, { x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 }) <= hitTol;
    }
    case 'step': {
      const r = item.size / 2 + tol;
      if (Math.hypot(pt.x - item.x, pt.y - item.y) <= r) return true;
      if (item.targetX !== undefined && item.targetY !== undefined) {
        return distToSegment(pt, { x: item.x, y: item.y }, { x: item.targetX, y: item.targetY }) <= tol + 4;
      }
      return false;
    }
    case 'text': {
      const b = estimateTextBounds(item);
      if (pt.x >= b.x - tol && pt.x <= b.x + b.w + tol && pt.y >= b.y - tol && pt.y <= b.y + b.h + tol) {
        return true;
      }
      if (item.targetX !== undefined && item.targetY !== undefined) {
        const center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        return distToSegment(pt, center, { x: item.targetX, y: item.targetY }) <= tol + 4;
      }
      return false;
    }
    case 'highlighter':
    case 'freehand': {
      const hitTol = Math.max(tol, item.strokeWidth / 2 + 5);
      for (let i = 1; i < item.points.length; i++) {
        if (distToSegment(pt, item.points[i - 1], item.points[i]) <= hitTol) return true;
      }
      return false;
    }
  }
}

export function hitTestAnnotations(
  annotations: AnnotationItem[],
  pt: Point,
  tol = 8
): AnnotationItem | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    if (hitTestSingleAnnotation(annotations[i], pt, tol)) {
      return annotations[i];
    }
  }
  return null;
}

export interface HandleDescriptor {
  id: ResizeHandleId;
  x: number;
  y: number;
  shape: 'square' | 'diamond';
}

export function getAnnotationHandles(item: AnnotationItem): HandleDescriptor[] {
  if (item.type === 'arrow') {
    const cx = item.cx ?? (item.x1 + item.x2) / 2;
    const cy = item.cy ?? (item.y1 + item.y2) / 2;
    return [
      { id: 'start', x: item.x1, y: item.y1, shape: 'square' },
      { id: 'end', x: item.x2, y: item.y2, shape: 'square' },
      { id: 'control', x: cx, y: cy, shape: 'diamond' },
    ];
  }
  if (item.type === 'step') {
    if (item.targetX !== undefined && item.targetY !== undefined) {
      return [{ id: 'end', x: item.targetX, y: item.targetY, shape: 'square' }];
    }
    return [];
  }
  if (item.type === 'text') {
    const handles: HandleDescriptor[] = [];
    if (item.targetX !== undefined && item.targetY !== undefined) {
      handles.push({ id: 'end', x: item.targetX, y: item.targetY, shape: 'square' });
    }
    if (item.variant === 'callout' && item.tailX !== undefined && item.tailY !== undefined) {
      handles.push({ id: 'tail', x: item.tailX, y: item.tailY, shape: 'diamond' });
    }
    return handles;
  }
  if (
    item.type === 'rect' ||
    item.type === 'ellipse' ||
    item.type === 'mosaic' ||
    item.type === 'spotlight' ||
    item.type === 'overlayImage'
  ) {
    return [
      { id: 'nw', x: item.x, y: item.y, shape: 'square' },
      { id: 'ne', x: item.x + item.w, y: item.y, shape: 'square' },
      { id: 'sw', x: item.x, y: item.y + item.h, shape: 'square' },
      { id: 'se', x: item.x + item.w, y: item.y + item.h, shape: 'square' },
    ];
  }
  return [];
}

export function hitTestHandle(
  item: AnnotationItem,
  pt: Point,
  radius = 9
): ResizeHandleId | null {
  const handles = getAnnotationHandles(item);
  for (const h of handles) {
    if (Math.hypot(pt.x - h.x, pt.y - h.y) <= radius) {
      return h.id;
    }
  }
  return null;
}

export function cloneAnnotation(
  item: AnnotationItem,
  newId: string,
  nextStepNumber?: number
): AnnotationItem {
  if (item.type === 'freehand' || item.type === 'highlighter') {
    return {
      ...item,
      id: newId,
      points: item.points.map((p) => ({ x: p.x, y: p.y })),
    };
  }
  if (item.type === 'step' && nextStepNumber !== undefined) {
    return {
      ...item,
      id: newId,
      number: nextStepNumber,
    };
  }
  return {
    ...item,
    id: newId,
  };
}

export function translateAnnotation(item: AnnotationItem, dx: number, dy: number): AnnotationItem {
  switch (item.type) {
    case 'rect':
    case 'ellipse':
    case 'mosaic':
    case 'spotlight':
    case 'overlayImage':
      return { ...item, x: item.x + dx, y: item.y + dy };
    case 'arrow':
      return {
        ...item,
        x1: item.x1 + dx,
        y1: item.y1 + dy,
        x2: item.x2 + dx,
        y2: item.y2 + dy,
        cx: item.cx !== undefined ? item.cx + dx : undefined,
        cy: item.cy !== undefined ? item.cy + dy : undefined,
      };
    case 'step':
      return {
        ...item,
        x: item.x + dx,
        y: item.y + dy,
        targetX: item.targetX !== undefined ? item.targetX + dx : undefined,
        targetY: item.targetY !== undefined ? item.targetY + dy : undefined,
      };
    case 'text':
      return {
        ...item,
        x: item.x + dx,
        y: item.y + dy,
        tailX: item.tailX !== undefined ? item.tailX + dx : undefined,
        tailY: item.tailY !== undefined ? item.tailY + dy : undefined,
        targetX: item.targetX !== undefined ? item.targetX + dx : undefined,
        targetY: item.targetY !== undefined ? item.targetY + dy : undefined,
      };
    case 'highlighter':
    case 'freehand':
      return {
        ...item,
        points: item.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
  }
}

export function applyHandleResize(
  item: AnnotationItem,
  handle: ResizeHandleId,
  pt: Point,
  shiftKey: boolean
): AnnotationItem {
  if (item.type === 'arrow') {
    if (handle === 'start') {
      const next = shiftKey ? snapAnglePoint({ x: item.x2, y: item.y2 }, pt) : pt;
      return { ...item, x1: next.x, y1: next.y };
    }
    if (handle === 'end') {
      const next = shiftKey ? snapAnglePoint({ x: item.x1, y: item.y1 }, pt) : pt;
      return { ...item, x2: next.x, y2: next.y };
    }
    if (handle === 'control') {
      return { ...item, curved: true, cx: pt.x, cy: pt.y };
    }
    return item;
  }
  if (item.type === 'step' && handle === 'end') {
    return { ...item, targetX: pt.x, targetY: pt.y };
  }
  if (item.type === 'text' && handle === 'tail') {
    return { ...item, tailX: pt.x, tailY: pt.y };
  }
  if (item.type === 'text' && handle === 'end') {
    const b = estimateTextBounds(item);
    const origin = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const next = shiftKey ? snapAnglePoint(origin, pt) : pt;
    return { ...item, targetX: next.x, targetY: next.y };
  }
  if (
    item.type === 'rect' ||
    item.type === 'ellipse' ||
    item.type === 'mosaic' ||
    item.type === 'spotlight' ||
    item.type === 'overlayImage'
  ) {
    const right = item.x + item.w;
    const bottom = item.y + item.h;
    const anchorX = handle === 'nw' || handle === 'sw' ? right : item.x;
    const anchorY = handle === 'nw' || handle === 'ne' ? bottom : item.y;
    const keepRatio = shiftKey || item.type === 'overlayImage';
    if (keepRatio && item.w > 0 && item.h > 0) {
      const aspect = item.type === 'overlayImage' ? item.w / item.h : 1;
      const dx = pt.x - anchorX;
      const dy = pt.y - anchorY;
      const absW = Math.max(8, Math.abs(dx));
      const absH = Math.max(8, absW / aspect);
      const x = dx >= 0 ? anchorX : anchorX - absW;
      const y = dy >= 0 ? anchorY : anchorY - absH;
      return { ...item, x, y, w: absW, h: absH };
    }
    const rect = normalizeRect(anchorX, anchorY, pt.x, pt.y);
    return { ...item, x: rect.x, y: rect.y, w: Math.max(8, rect.w), h: Math.max(8, rect.h) };
  }
  return item;
}
