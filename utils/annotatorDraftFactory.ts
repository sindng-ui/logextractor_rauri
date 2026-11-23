import {
  AnnotationItem,
  AnnotatorDocument,
  AnnotatorStyleState,
  AnnotatorTool,
  Point,
} from '../types/screenshotAnnotator';
import {
  measureTextLayout,
  normalizeRect,
  positionTextBoxForArrowStart,
  simplifyPoints,
  snapAnglePoint,
  snapAxisPoint,
  snapSquareRect,
} from './annotatorGeometry';

const svgToCursor = (svg: string, hx: number, hy: number): string =>
  `url("data:image/svg+xml,${encodeURIComponent(svg.trim())}") ${hx} ${hy}, crosshair`;

/** Open-center 10px crosshair (high contrast dark+light stroke, zero tip obstruction) */
export const CURSOR_OPEN_CROSSHAIR = svgToCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <g fill="none" stroke-linecap="round">
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="#020617" stroke-width="3.2"/>
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="#ffffff" stroke-width="1.4"/>
    </g>
  </svg>`,
  12,
  12
);

/** Ultra-minimal hollow ring active while dragging so arrow tips and corners remain 100% visible */
export const CURSOR_DRAG_MICRO_RING = svgToCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="5" fill="none" stroke="#020617" stroke-width="1.8" stroke-opacity="0.5"/>
    <circle cx="8" cy="8" r="5" fill="none" stroke="#ffffff" stroke-width="1" stroke-opacity="0.7"/>
  </svg>`,
  8,
  8
);

export function createDraftAnnotation(
  id: string,
  tool: AnnotatorTool,
  pt: Point,
  style: AnnotatorStyleState,
  doc: AnnotatorDocument
): AnnotationItem | null {
  switch (tool) {
    case 'rect':
      return {
        id,
        type: 'rect',
        x: pt.x,
        y: pt.y,
        w: 0,
        h: 0,
        color: style.color,
        strokeWidth: style.strokeWidth,
        fillOpacity: style.fillOpacity,
        borderRadius: 6,
      };
    case 'ellipse':
      return {
        id,
        type: 'ellipse',
        x: pt.x,
        y: pt.y,
        w: 0,
        h: 0,
        color: style.color,
        strokeWidth: style.strokeWidth,
        fillOpacity: style.fillOpacity,
      };
    case 'arrow':
      return {
        id,
        type: 'arrow',
        x1: pt.x,
        y1: pt.y,
        x2: pt.x,
        y2: pt.y,
        curved: style.arrowCurved,
        arrowHead: style.arrowHead,
        color: style.color,
        strokeWidth: style.strokeWidth,
      };
    case 'step':
      return {
        id,
        type: 'step',
        x: pt.x,
        y: pt.y,
        number: doc.nextStepNumber,
        size: Math.max(26, style.strokeWidth * 6 + 10),
        color: style.color,
        strokeWidth: style.strokeWidth,
      };
    case 'text': {
      const baseText: Extract<AnnotationItem, { type: 'text' }> = {
        id,
        type: 'text',
        x: pt.x,
        y: pt.y,
        text: '',
        color: style.color,
        strokeWidth: style.strokeWidth,
        fontSize: style.fontSize,
        variant: style.textVariant,
      };
      const box = measureTextLayout(baseText).box;
      const pos = positionTextBoxForArrowStart(box.w, box.h, pt, null);
      return { ...baseText, x: pos.x, y: pos.y };
    }
    case 'highlighter':
      return {
        id,
        type: 'highlighter',
        points: [pt],
        color: style.color,
        strokeWidth: style.strokeWidth,
      };
    case 'freehand':
      return {
        id,
        type: 'freehand',
        points: [pt],
        color: style.color,
        strokeWidth: style.strokeWidth,
      };
    case 'mosaic':
      return {
        id,
        type: 'mosaic',
        x: pt.x,
        y: pt.y,
        w: 0,
        h: 0,
        mode: style.mosaicMode,
        blockSize: style.mosaicBlockSize,
        fillColor: '#0f172a',
        color: style.color,
        strokeWidth: style.strokeWidth,
      };
    case 'spotlight':
      return {
        id,
        type: 'spotlight',
        x: pt.x,
        y: pt.y,
        w: 0,
        h: 0,
        shape: style.spotlightShape,
        borderRadius: 10,
        color: '#ffffff',
        strokeWidth: 2,
      };
    default:
      return null;
  }
}

export function updateDraftAnnotation(
  draft: AnnotationItem,
  start: Point,
  pt: Point,
  shiftKey: boolean
): AnnotationItem {
  switch (draft.type) {
    case 'rect':
    case 'ellipse':
    case 'mosaic':
    case 'spotlight': {
      const box = shiftKey
        ? snapSquareRect(start.x, start.y, pt.x, pt.y)
        : normalizeRect(start.x, start.y, pt.x, pt.y);
      return { ...draft, x: box.x, y: box.y, w: box.w, h: box.h };
    }
    case 'arrow': {
      const end = shiftKey ? snapAnglePoint(start, pt) : pt;
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      return {
        ...draft,
        x2: end.x,
        y2: end.y,
        cx: draft.curved ? midX - dy * 0.22 : undefined,
        cy: draft.curved ? midY + dx * 0.22 : undefined,
      };
    }
    case 'step': {
      const dist = Math.hypot(pt.x - start.x, pt.y - start.y);
      if (dist > 14) {
        const target = shiftKey ? snapAnglePoint(start, pt) : pt;
        return { ...draft, targetX: target.x, targetY: target.y };
      }
      return { ...draft, targetX: undefined, targetY: undefined };
    }
    case 'text': {
      const dist = Math.hypot(pt.x - start.x, pt.y - start.y);
      const box = measureTextLayout(draft).box;
      if (dist > 14) {
        const target = shiftKey ? snapAnglePoint(start, pt) : pt;
        const pos = positionTextBoxForArrowStart(box.w, box.h, start, target);
        return { ...draft, x: pos.x, y: pos.y, targetX: target.x, targetY: target.y };
      }
      const pos = positionTextBoxForArrowStart(box.w, box.h, start, null);
      return { ...draft, x: pos.x, y: pos.y, targetX: undefined, targetY: undefined };
    }
    case 'highlighter': {
      if (shiftKey) {
        return { ...draft, points: [start, { x: pt.x, y: start.y }] };
      }
      return { ...draft, points: [...draft.points, pt] };
    }
    case 'freehand': {
      if (shiftKey) {
        return { ...draft, points: [start, snapAxisPoint(start, pt)] };
      }
      return { ...draft, points: [...draft.points, pt] };
    }
    default:
      return draft;
  }
}

export function finalizeDraftAnnotation(item: AnnotationItem): AnnotationItem | null {
  if (
    item.type === 'rect' ||
    item.type === 'ellipse' ||
    item.type === 'mosaic' ||
    item.type === 'spotlight'
  ) {
    return item.w >= 4 && item.h >= 4 ? item : null;
  }
  if (item.type === 'arrow') {
    return Math.hypot(item.x2 - item.x1, item.y2 - item.y1) >= 8 ? item : null;
  }
  if (item.type === 'freehand' || item.type === 'highlighter') {
    const simplified = { ...item, points: simplifyPoints(item.points, 2.5) };
    return simplified.points.length >= 2 ? simplified : null;
  }
  return item;
}
