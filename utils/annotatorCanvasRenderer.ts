import {
  AnnotationItem,
  AnnotatorDocument,
  CutoutStyle,
  FRAME_PRESETS,
  RectBox,
} from '../types/screenshotAnnotator';
import {
  computeDocumentLayout,
  DocumentLayout,
  estimateTextBounds,
  getAnnotationBounds,
  getAnnotationHandles,
} from './annotatorGeometry';

// Module-level reusable scratch canvases (zero per-frame allocation)
let mosaicScratchCanvas: HTMLCanvasElement | null = null;
let collapsedImageCache: {
  key: string;
  canvas: HTMLCanvasElement;
} | null = null;
let frameBgCache: {
  key: string;
  canvas: HTMLCanvasElement;
} | null = null;

function getMosaicScratch(): HTMLCanvasElement {
  if (!mosaicScratchCanvas) {
    mosaicScratchCanvas = document.createElement('canvas');
  }
  return mosaicScratchCanvas;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function getOrBuildCollapsedBase(
  baseImg: HTMLImageElement | HTMLCanvasElement,
  doc: AnnotatorDocument,
  layout: DocumentLayout
): HTMLCanvasElement {
  const seamSig = doc.cutouts.map((c) => `${c.axis}:${c.start}:${c.end}:${c.style}`).join('|');
  const key = `${doc.width}x${doc.height}:${doc.baseDataUrl.length}:${doc.baseDataUrl.slice(-24)}:${seamSig}`;
  if (collapsedImageCache && collapsedImageCache.key === key) {
    return collapsedImageCache.canvas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = layout.cutout.effectiveWidth;
  canvas.height = layout.cutout.effectiveHeight;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (const ys of layout.cutout.ySlices) {
      for (const xs of layout.cutout.xSlices) {
        ctx.drawImage(
          baseImg,
          xs.srcStart,
          ys.srcStart,
          xs.srcLen,
          ys.srcLen,
          xs.dstStart,
          ys.dstStart,
          xs.srcLen,
          ys.srcLen
        );
      }
    }
    // Draw crisp cutout seam indicators
    for (const seam of layout.cutout.seams) {
      drawCutoutSeam(ctx, seam.axis, seam.pos, canvas.width, canvas.height, seam.style);
    }
  }

  collapsedImageCache = { key, canvas };
  return canvas;
}

function drawCutoutSeam(
  ctx: CanvasRenderingContext2D,
  axis: 'x' | 'y',
  pos: number,
  width: number,
  height: number,
  style: CutoutStyle
): void {
  ctx.save();
  if (style === 'gap') {
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (axis === 'y') {
      ctx.moveTo(0, pos);
      ctx.lineTo(width, pos);
    } else {
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, height);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(248, 250, 252, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const step = style === 'zigzag' ? 12 : 16;
  const amp = style === 'zigzag' ? 4 : 3.5;

  const tracePath = (offset: number) => {
    ctx.beginPath();
    if (axis === 'y') {
      ctx.moveTo(0, pos + offset);
      let dir = 1;
      for (let x = 0; x < width; x += step) {
        if (style === 'zigzag') {
          ctx.lineTo(x + step / 2, pos + offset + dir * amp);
          ctx.lineTo(x + step, pos + offset);
        } else {
          ctx.quadraticCurveTo(x + step / 2, pos + offset + dir * amp * 1.4, x + step, pos + offset);
        }
        dir *= -1;
      }
    } else {
      ctx.moveTo(pos + offset, 0);
      let dir = 1;
      for (let y = 0; y < height; y += step) {
        if (style === 'zigzag') {
          ctx.lineTo(pos + offset + dir * amp, y + step / 2);
          ctx.lineTo(pos + offset, y + step);
        } else {
          ctx.quadraticCurveTo(pos + offset + dir * amp * 1.4, y + step / 2, pos + offset, y + step);
        }
        dir *= -1;
      }
    }
  };

  // Dark torn ribbon shadow + crisp bright seam line
  tracePath(0);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  tracePath(0);
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function getOrBuildFrameBackground(layout: DocumentLayout, doc: AnnotatorDocument): HTMLCanvasElement {
  const fc = doc.frameConfig;
  const key = `${layout.outputWidth}x${layout.outputHeight}:${fc.presetId}:${fc.padding}:${fc.borderRadius}:${fc.shadow ? 1 : 0}`;
  if (frameBgCache && frameBgCache.key === key) {
    return frameBgCache.canvas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = layout.outputWidth;
  canvas.height = layout.outputHeight;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const preset = FRAME_PRESETS.find((p) => p.id === fc.presetId) ?? FRAME_PRESETS[0];
    if (preset.type === 'gradient' && preset.colors.length >= 2) {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      preset.colors.forEach((c, idx) => {
        grad.addColorStop(idx / (preset.colors.length - 1), c);
      });
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (preset.type === 'solid') {
      ctx.fillStyle = preset.colors[0];
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Layered soft drop shadow baked once into frame cache (zero per-frame shadowBlur cost)
    if (fc.shadow) {
      const layers = [
        { dy: 14, spread: 14, alpha: 0.14 },
        { dy: 9, spread: 8, alpha: 0.18 },
        { dy: 4, spread: 3, alpha: 0.24 },
      ];
      for (const l of layers) {
        ctx.fillStyle = `rgba(2, 6, 23, ${l.alpha})`;
        drawRoundedRectPath(
          ctx,
          layout.contentX - l.spread / 2,
          layout.contentY + l.dy - l.spread / 3,
          layout.contentW + l.spread,
          layout.contentH + l.spread,
          fc.borderRadius + l.spread / 2
        );
        ctx.fill();
      }
    }
  }

  frameBgCache = { key, canvas };
  return canvas;
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  angle: number,
  headLen: number,
  color: string
): void {
  const wing = Math.PI / 6.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - headLen * Math.cos(angle - wing), tipY - headLen * Math.sin(angle - wing));
  ctx.lineTo(tipX - headLen * 0.72 * Math.cos(angle), tipY - headLen * 0.72 * Math.sin(angle));
  ctx.lineTo(tipX - headLen * Math.cos(angle + wing), tipY - headLen * Math.sin(angle + wing));
  ctx.closePath();
  ctx.fill();
}

function drawSmoothedPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  if (pts.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) {
    ctx.lineTo(pts[0].x + 0.1, pts[0].y + 0.1);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function drawMosaicItem(
  ctx: CanvasRenderingContext2D,
  item: Extract<AnnotationItem, { type: 'mosaic' }>,
  collapsedBase: HTMLCanvasElement
): void {
  if (item.w < 2 || item.h < 2) return;
  if (item.mode === 'solid') {
    ctx.save();
    ctx.fillStyle = item.fillColor || '#0f172a';
    drawRoundedRectPath(ctx, item.x, item.y, item.w, item.h, 4);
    ctx.fill();
    ctx.restore();
    return;
  }

  // GPU 2-pass pixelate: downscale into reusable scratch canvas, then upscale with smoothing off
  const block = Math.max(4, item.blockSize);
  const srcX = Math.max(0, Math.floor(item.x));
  const srcY = Math.max(0, Math.floor(item.y));
  const srcR = Math.min(collapsedBase.width, Math.ceil(item.x + item.w));
  const srcB = Math.min(collapsedBase.height, Math.ceil(item.y + item.h));
  const srcW = srcR - srcX;
  const srcH = srcB - srcY;
  if (srcW <= 0 || srcH <= 0) return;

  const tinyW = Math.max(1, Math.round(srcW / block));
  const tinyH = Math.max(1, Math.round(srcH / block));
  const scratch = getMosaicScratch();
  if (scratch.width !== tinyW) scratch.width = tinyW;
  if (scratch.height !== tinyH) scratch.height = tinyH;
  const sctx = scratch.getContext('2d');
  if (!sctx) return;

  sctx.imageSmoothingEnabled = true;
  sctx.clearRect(0, 0, tinyW, tinyH);
  sctx.drawImage(collapsedBase, srcX, srcY, srcW, srcH, 0, 0, tinyW, tinyH);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, tinyW, tinyH, srcX, srcY, srcW, srcH);
  ctx.restore();
}

function drawAnnotationItem(
  ctx: CanvasRenderingContext2D,
  item: AnnotationItem,
  collapsedBase: HTMLCanvasElement,
  overlayCache: Map<string, HTMLImageElement>
): void {
  ctx.save();
  switch (item.type) {
    case 'mosaic':
      drawMosaicItem(ctx, item, collapsedBase);
      break;
    case 'overlayImage': {
      const img = overlayCache.get(item.dataUrl);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, item.x, item.y, item.w, item.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        ctx.strokeRect(item.x, item.y, item.w, item.h);
      }
      break;
    }
    case 'rect': {
      drawRoundedRectPath(ctx, item.x, item.y, item.w, item.h, item.borderRadius);
      if (item.fillOpacity > 0) {
        ctx.save();
        ctx.globalAlpha = item.fillOpacity;
        ctx.fillStyle = item.color;
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.stroke();
      break;
    }
    case 'ellipse': {
      const rx = Math.max(0.5, item.w / 2);
      const ry = Math.max(0.5, item.h / 2);
      ctx.beginPath();
      ctx.ellipse(item.x + rx, item.y + ry, rx, ry, 0, 0, Math.PI * 2);
      if (item.fillOpacity > 0) {
        ctx.save();
        ctx.globalAlpha = item.fillOpacity;
        ctx.fillStyle = item.color;
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.strokeWidth;
      ctx.stroke();
      break;
    }
    case 'arrow': {
      const headLen = Math.max(12, item.strokeWidth * 3.8);
      const hasCurve = item.curved && item.cx !== undefined && item.cy !== undefined;
      const angle = hasCurve
        ? Math.atan2(item.y2 - item.cy!, item.x2 - item.cx!)
        : Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
      const shaftEndX = item.x2 - Math.cos(angle) * (headLen * 0.65);
      const shaftEndY = item.y2 - Math.sin(angle) * (headLen * 0.65);

      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.strokeWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(item.x1, item.y1);
      if (hasCurve) {
        ctx.quadraticCurveTo(item.cx!, item.cy!, shaftEndX, shaftEndY);
      } else {
        ctx.lineTo(shaftEndX, shaftEndY);
      }
      ctx.stroke();
      drawArrowHead(ctx, item.x2, item.y2, angle, headLen, item.color);
      break;
    }
    case 'step': {
      const r = item.size / 2;
      if (item.targetX !== undefined && item.targetY !== undefined) {
        const dist = Math.hypot(item.targetX - item.x, item.targetY - item.y);
        if (dist > r + 8) {
          const angle = Math.atan2(item.targetY - item.y, item.targetX - item.x);
          const headLen = Math.max(12, item.strokeWidth * 3.4);
          const sx = item.x + Math.cos(angle) * (r - 2);
          const sy = item.y + Math.sin(angle) * (r - 2);
          const ex = item.targetX - Math.cos(angle) * (headLen * 0.65);
          const ey = item.targetY - Math.sin(angle) * (headLen * 0.65);

          ctx.strokeStyle = item.color;
          ctx.lineWidth = Math.max(3, item.strokeWidth);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          drawArrowHead(ctx, item.targetX, item.targetY, angle, headLen, item.color);
        }
      }
      // White contrast ring + colored step badge
      ctx.beginPath();
      ctx.arc(item.x, item.y, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(item.x, item.y, r, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.round(item.size * 0.54)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(item.number), item.x, item.y + 1);
      break;
    }
    case 'text': {
      const lines = (item.text || '').split('\n');
      ctx.font = `700 ${item.fontSize}px "Segoe UI", system-ui, sans-serif`;
      const padX = item.variant === 'outline' ? 6 : 12;
      const padY = item.variant === 'outline' ? 4 : 8;
      const lineH = Math.round(item.fontSize * 1.32);
      const maxW = Math.max(24, ...lines.map((l) => ctx.measureText(l).width));
      const boxW = maxW + padX * 2;
      const boxH = lines.length * lineH + padY * 2;

      if (item.variant === 'callout' && item.tailX !== undefined && item.tailY !== undefined) {
        const cx = item.x + boxW / 2;
        const cy = item.y + boxH / 2;
        const angle = Math.atan2(item.tailY - cy, item.tailX - cx);
        const perp = angle + Math.PI / 2;
        const baseHalf = Math.min(10, boxH * 0.3);
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.moveTo(item.tailX, item.tailY);
        ctx.lineTo(cx + Math.cos(perp) * baseHalf, cy + Math.sin(perp) * baseHalf);
        ctx.lineTo(cx - Math.cos(perp) * baseHalf, cy - Math.sin(perp) * baseHalf);
        ctx.closePath();
        ctx.fill();
      }

      if (item.variant === 'pill' || item.variant === 'callout') {
        drawRoundedRectPath(ctx, item.x, item.y, boxW, boxH, 8);
        ctx.fillStyle = item.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = item.color === '#f8fafc' || item.color === '#eab308' ? '#0f172a' : '#ffffff';
        ctx.textBaseline = 'top';
        lines.forEach((line, idx) => {
          ctx.fillText(line, item.x + padX, item.y + padY + idx * lineH);
        });
      } else {
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(4, item.fontSize * 0.22);
        ctx.strokeStyle = item.color === '#0f172a' ? '#ffffff' : '#0f172a';
        ctx.fillStyle = item.color;
        lines.forEach((line, idx) => {
          const ty = item.y + padY + idx * lineH;
          ctx.strokeText(line, item.x + padX, ty);
          ctx.fillText(line, item.x + padX, ty);
        });
      }
      break;
    }
    case 'highlighter': {
      if (item.points.length < 2) break;
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = Math.max(14, item.strokeWidth * 4.5);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawSmoothedPath(ctx, item.points);
      ctx.stroke();
      break;
    }
    case 'freehand': {
      if (item.points.length < 2) break;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawSmoothedPath(ctx, item.points);
      ctx.stroke();
      break;
    }
    case 'spotlight':
      // Rendered in dedicated spotlight pass
      break;
  }
  ctx.restore();
}

function drawSpotlightPass(
  ctx: CanvasRenderingContext2D,
  spotlights: Extract<AnnotationItem, { type: 'spotlight' }>[],
  bounds: RectBox,
  dimOpacity: number
): void {
  if (spotlights.length === 0) return;
  ctx.save();
  ctx.fillStyle = `rgba(2, 6, 23, ${Math.max(0.1, Math.min(0.9, dimOpacity))})`;
  ctx.beginPath();
  ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h);
  for (const sp of spotlights) {
    if (sp.w < 2 || sp.h < 2) continue;
    if (sp.shape === 'ellipse') {
      ctx.moveTo(sp.x + sp.w, sp.y + sp.h / 2);
      ctx.ellipse(sp.x + sp.w / 2, sp.y + sp.h / 2, sp.w / 2, sp.h / 2, 0, 0, Math.PI * 2);
    } else {
      const r = Math.min(sp.borderRadius, sp.w / 2, sp.h / 2);
      ctx.moveTo(sp.x + r, sp.y);
      ctx.arcTo(sp.x + sp.w, sp.y, sp.x + sp.w, sp.y + sp.h, r);
      ctx.arcTo(sp.x + sp.w, sp.y + sp.h, sp.x, sp.y + sp.h, r);
      ctx.arcTo(sp.x, sp.y + sp.h, sp.x, sp.y, r);
      ctx.arcTo(sp.x, sp.y, sp.x + sp.w, sp.y, r);
      ctx.closePath();
    }
  }
  ctx.fill('evenodd');

  // Crisp subtle rim around spotlight cutouts
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1.5;
  for (const sp of spotlights) {
    if (sp.w < 2 || sp.h < 2) continue;
    if (sp.shape === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(sp.x + sp.w / 2, sp.y + sp.h / 2, sp.w / 2, sp.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      drawRoundedRectPath(ctx, sp.x, sp.y, sp.w, sp.h, sp.borderRadius);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export interface RenderSceneOptions {
  doc: AnnotatorDocument;
  baseImg: HTMLImageElement | HTMLCanvasElement;
  overlayCache: Map<string, HTMLImageElement>;
  draftAnnotation?: AnnotationItem | null;
  liveOverride?: AnnotationItem | null;
  selectedId?: string | null;
  cropDraft?: RectBox | null;
  cutoutDraft?: { axis: 'x' | 'y'; start: number; end: number } | null;
  includeSelectionUI: boolean;
  zoom?: number;
}

export function renderAnnotatorScene(
  ctx: CanvasRenderingContext2D,
  opts: RenderSceneOptions
): DocumentLayout {
  const { doc, baseImg, overlayCache, draftAnnotation, liveOverride, selectedId, includeSelectionUI } = opts;
  const layout = computeDocumentLayout(doc);
  const collapsedBase = getOrBuildCollapsedBase(baseImg, doc, layout);

  ctx.save();
  // 1. Optional Pretty Frame Background + Baked Soft Shadow
  if (doc.frameConfig.enabled) {
    const bgCanvas = getOrBuildFrameBackground(layout, doc);
    ctx.drawImage(bgCanvas, 0, 0);
  }

  // 2. Clipped Content Image (with optional rounded corners when frame is enabled)
  ctx.save();
  if (doc.frameConfig.enabled && doc.frameConfig.borderRadius > 0) {
    drawRoundedRectPath(ctx, layout.contentX, layout.contentY, layout.contentW, layout.contentH, doc.frameConfig.borderRadius);
    ctx.clip();
  }

  ctx.drawImage(
    collapsedBase,
    layout.crop.x,
    layout.crop.y,
    layout.crop.w,
    layout.crop.h,
    layout.contentX,
    layout.contentY,
    layout.contentW,
    layout.contentH
  );

  // Build effective annotations list (replacing actively dragged item + appending draft)
  const items: AnnotationItem[] = doc.annotations.map((it) =>
    liveOverride && it.id === liveOverride.id ? liveOverride : it
  );
  if (draftAnnotation) {
    items.push(draftAnnotation);
  }

  // Translate to collapsed image space so annotations align cleanly with crop + frame
  ctx.save();
  ctx.translate(layout.contentX - layout.crop.x, layout.contentY - layout.crop.y);

  // 3. Pass 1: Mosaic & Overlay stickers underneath spotlight
  for (const item of items) {
    if (item.type === 'mosaic' || item.type === 'overlayImage') {
      drawAnnotationItem(ctx, item, collapsedBase, overlayCache);
    }
  }

  // 4. Pass 2: Spotlight Dimming (1-pass evenodd)
  const spotlights = items.filter(
    (it): it is Extract<AnnotationItem, { type: 'spotlight' }> => it.type === 'spotlight'
  );
  if (spotlights.length > 0) {
    drawSpotlightPass(ctx, spotlights, layout.crop, doc.spotlightConfig.dimOpacity);
  }

  // 5. Pass 3: Highlighters inside clipped content
  for (const item of items) {
    if (item.type === 'highlighter') {
      drawAnnotationItem(ctx, item, collapsedBase, overlayCache);
    }
  }
  ctx.restore();
  ctx.restore(); // end image rounded clip

  // Subtle inset border on framed image
  if (doc.frameConfig.enabled && doc.frameConfig.insetBorder) {
    ctx.save();
    drawRoundedRectPath(ctx, layout.contentX, layout.contentY, layout.contentW, layout.contentH, doc.frameConfig.borderRadius);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // 6. Pass 4: Vector Annotations (allowed to extend cleanly into frame padding / overflow!)
  ctx.save();
  ctx.translate(layout.contentX - layout.crop.x, layout.contentY - layout.crop.y);

  for (const item of items) {
    if (
      item.type !== 'mosaic' &&
      item.type !== 'overlayImage' &&
      item.type !== 'spotlight' &&
      item.type !== 'highlighter'
    ) {
      drawAnnotationItem(ctx, item, collapsedBase, overlayCache);
    }
  }

  // 7. Interactive Selection Handles & Draft Guides (editor only, never exported)
  if (includeSelectionUI) {
    const invZoom = 1 / Math.max(0.25, opts.zoom ?? 1);
    const selectedItem = selectedId ? items.find((i) => i.id === selectedId) : null;
    if (selectedItem) {
      const bounds =
        selectedItem.type === 'text' ? estimateTextBounds(selectedItem) : getAnnotationBounds(selectedItem);
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5 * invZoom;
      ctx.setLineDash([5 * invZoom, 4 * invZoom]);
      ctx.strokeRect(bounds.x - 3 * invZoom, bounds.y - 3 * invZoom, bounds.w + 6 * invZoom, bounds.h + 6 * invZoom);
      ctx.setLineDash([]);

      const handles = getAnnotationHandles(selectedItem);
      const hs = 4.5 * invZoom;
      for (const h of handles) {
        ctx.fillStyle = h.shape === 'diamond' ? '#fbbf24' : '#ffffff';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.8 * invZoom;
        ctx.beginPath();
        if (h.shape === 'diamond') {
          ctx.moveTo(h.x, h.y - hs * 1.25);
          ctx.lineTo(h.x + hs * 1.25, h.y);
          ctx.lineTo(h.x, h.y + hs * 1.25);
          ctx.lineTo(h.x - hs * 1.25, h.y);
          ctx.closePath();
        } else {
          ctx.rect(h.x - hs, h.y - hs, hs * 2, hs * 2);
        }
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Active Cut-out Band Preview
    if (opts.cutoutDraft) {
      const { axis, start, end } = opts.cutoutDraft;
      const s = Math.min(start, end);
      const len = Math.abs(end - start);
      ctx.save();
      ctx.fillStyle = 'rgba(244, 63, 94, 0.28)';
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2 * invZoom;
      ctx.setLineDash([6 * invZoom, 4 * invZoom]);
      if (axis === 'y') {
        ctx.fillRect(layout.crop.x, s, layout.crop.w, len);
        ctx.strokeRect(layout.crop.x, s, layout.crop.w, len);
      } else {
        ctx.fillRect(s, layout.crop.y, len, layout.crop.h);
        ctx.strokeRect(s, layout.crop.y, len, layout.crop.h);
      }
      ctx.restore();
    }

    // Active Crop Box Preview
    if (opts.cropDraft && opts.cropDraft.w > 2 && opts.cropDraft.h > 2) {
      const cr = opts.cropDraft;
      ctx.save();
      ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
      ctx.beginPath();
      ctx.rect(layout.crop.x, layout.crop.y, layout.crop.w, layout.crop.h);
      ctx.rect(cr.x, cr.y, cr.w, cr.h);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2 * invZoom;
      ctx.strokeRect(cr.x, cr.y, cr.w, cr.h);
      ctx.restore();
    }
  }

  ctx.restore();
  ctx.restore();
  return layout;
}

export function clearAnnotatorRenderCaches(): void {
  collapsedImageCache = null;
  frameBgCache = null;
}
