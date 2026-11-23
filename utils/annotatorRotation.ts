import {
  AnnotationItem,
  CutoutRegion,
  Point,
  RectBox,
} from '../types/screenshotAnnotator';
import { measureTextLayout } from './annotatorGeometry';

function rotatePoint90CW(x: number, y: number, oldHeight: number): Point {
  return { x: oldHeight - y, y: x };
}

export function rotateAnnotation90CW(
  item: AnnotationItem,
  effectiveHeight: number,
  rotatedOverlayDataUrl?: string
): AnnotationItem {
  switch (item.type) {
    case 'rect':
    case 'ellipse':
    case 'mosaic':
    case 'spotlight':
      return {
        ...item,
        x: effectiveHeight - (item.y + item.h),
        y: item.x,
        w: item.h,
        h: item.w,
      };
    case 'overlayImage':
      return {
        ...item,
        x: effectiveHeight - (item.y + item.h),
        y: item.x,
        w: item.h,
        h: item.w,
        dataUrl: rotatedOverlayDataUrl ?? item.dataUrl,
      };
    case 'arrow': {
      const p1 = rotatePoint90CW(item.x1, item.y1, effectiveHeight);
      const p2 = rotatePoint90CW(item.x2, item.y2, effectiveHeight);
      const cp =
        item.cx !== undefined && item.cy !== undefined
          ? rotatePoint90CW(item.cx, item.cy, effectiveHeight)
          : undefined;
      return {
        ...item,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        cx: cp?.x,
        cy: cp?.y,
      };
    }
    case 'step': {
      const center = rotatePoint90CW(item.x, item.y, effectiveHeight);
      const target =
        item.targetX !== undefined && item.targetY !== undefined
          ? rotatePoint90CW(item.targetX, item.targetY, effectiveHeight)
          : undefined;
      return {
        ...item,
        x: center.x,
        y: center.y,
        targetX: target?.x,
        targetY: target?.y,
      };
    }
    case 'text': {
      // Keep text upright while rotating its center position around the canvas
      const box = measureTextLayout(item).box;
      const center = rotatePoint90CW(box.x + box.w / 2, box.y + box.h / 2, effectiveHeight);
      const target =
        item.targetX !== undefined && item.targetY !== undefined
          ? rotatePoint90CW(item.targetX, item.targetY, effectiveHeight)
          : undefined;
      return {
        ...item,
        x: center.x - box.w / 2,
        y: center.y - box.h / 2,
        targetX: target?.x,
        targetY: target?.y,
      };
    }
    case 'highlighter':
    case 'freehand':
      return {
        ...item,
        points: item.points.map((p) => rotatePoint90CW(p.x, p.y, effectiveHeight)),
      };
  }
}

export function rotateCutout90CW(cutout: CutoutRegion, oldHeight: number): CutoutRegion {
  if (cutout.axis === 'y') {
    return {
      ...cutout,
      axis: 'x',
      start: oldHeight - cutout.end,
      end: oldHeight - cutout.start,
    };
  }
  return {
    ...cutout,
    axis: 'y',
  };
}

export function rotateCropRect90CW(crop: RectBox, effectiveHeight: number): RectBox {
  return {
    x: effectiveHeight - (crop.y + crop.h),
    y: crop.x,
    w: crop.h,
    h: crop.w,
  };
}
