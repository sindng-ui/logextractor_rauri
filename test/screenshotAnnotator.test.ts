import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyHandleResize,
  cloneAnnotation,
  computeCutoutLayout,
  computeDocumentLayout,
  computeTextArrowStart,
  hitTestAnnotations,
  hitTestHandle,
  mapCollapsedToSource,
  measureTextLayout,
  normalizeRect,
  positionTextBoxForArrowStart,
  simplifyPoints,
  snapAnglePoint,
  snapAxisPoint,
  translateAnnotation,
} from '../utils/annotatorGeometry';
import {
  AnnotationItem,
  AnnotatorDocument,
  DEFAULT_FRAME_CONFIG,
  DEFAULT_SPOTLIGHT_CONFIG,
} from '../types/screenshotAnnotator';
import {
  clearAnnotatorHistory,
  deleteAnnotatorHistoryEntry,
  loadAnnotatorHistoryDocument,
  loadAnnotatorHistoryMeta,
  MAX_ANNOTATOR_HISTORY,
  saveAnnotatorHistoryEntry,
} from '../utils/annotatorHistoryStorage';
import {
  ANNOTATOR_PREFS_STORAGE_KEY,
  getDefaultAnnotatorPreferences,
  loadAnnotatorPreferences,
  saveAnnotatorPreferences,
} from '../utils/annotatorPreferences';

function makeDoc(partial?: Partial<AnnotatorDocument>): AnnotatorDocument {
  return {
    baseDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    width: 1000,
    height: 800,
    annotations: [],
    cutouts: [],
    cropRect: null,
    frameConfig: { ...DEFAULT_FRAME_CONFIG },
    spotlightConfig: { ...DEFAULT_SPOTLIGHT_CONFIG },
    nextStepNumber: 1,
    ...partial,
  };
}

describe('annotatorGeometry', () => {
  it('normalizes reversed drag coordinates into positive width/height box', () => {
    expect(normalizeRect(200, 150, 50, 30)).toEqual({ x: 50, y: 30, w: 150, h: 120 });
  });

  it('snaps angles to 45-degree increments', () => {
    const snapped = snapAnglePoint({ x: 100, y: 100 }, { x: 200, y: 112 }, 45);
    expect(Math.round(snapped.y)).toBe(100);
    expect(snapped.x).toBeGreaterThan(195);
  });

  it('snaps freehand pen strictly to horizontal or vertical axis based on dominant drag delta', () => {
    // Horizontal dominant
    expect(snapAxisPoint({ x: 100, y: 100 }, { x: 240, y: 135 })).toEqual({ x: 240, y: 100 });
    expect(snapAxisPoint({ x: 100, y: 100 }, { x: 30, y: 120 })).toEqual({ x: 30, y: 100 });
    // Vertical dominant
    expect(snapAxisPoint({ x: 100, y: 100 }, { x: 125, y: 260 })).toEqual({ x: 100, y: 260 });
    expect(snapAxisPoint({ x: 100, y: 100 }, { x: 85, y: 20 })).toEqual({ x: 100, y: 20 });
  });

  it('simplifies dense freehand paths while keeping endpoints', () => {
    const dense = Array.from({ length: 100 }, (_, i) => ({ x: i * 0.5, y: 0 }));
    const simplified = simplifyPoints(dense, 5);
    expect(simplified.length).toBeLessThan(20);
    expect(simplified[0]).toEqual(dense[0]);
    expect(simplified[simplified.length - 1]).toEqual(dense[dense.length - 1]);
  });

  it('merges overlapping cutouts and maps collapsed coordinates back to source accurately', () => {
    const layout = computeCutoutLayout(1000, 800, [
      { id: 'c1', axis: 'y', start: 200, end: 400, style: 'zigzag' },
      { id: 'c2', axis: 'y', start: 350, end: 500, style: 'wave' },
    ]);
    // Removed 200..500 (300px) from 800px => 500px
    expect(layout.effectiveHeight).toBe(500);
    expect(layout.effectiveWidth).toBe(1000);
    expect(layout.seams).toHaveLength(1);
    expect(layout.seams[0]).toEqual({ axis: 'y', pos: 200, style: 'wave' });

    // Point 100 stays 100; point 250 in collapsed space maps to 550 in source
    expect(mapCollapsedToSource(100, layout.ySlices)).toBe(100);
    expect(mapCollapsedToSource(250, layout.ySlices)).toBe(550);
  });

  it('computes document layout with cutout + crop + pretty frame padding', () => {
    const doc = makeDoc({
      cutouts: [{ id: 'c1', axis: 'y', start: 100, end: 300, style: 'zigzag' }],
      cropRect: { x: 50, y: 20, w: 600, h: 400 },
      frameConfig: { ...DEFAULT_FRAME_CONFIG, enabled: true, padding: 40 },
    });
    const layout = computeDocumentLayout(doc);
    expect(layout.cutout.effectiveHeight).toBe(600);
    expect(layout.contentW).toBe(600);
    expect(layout.contentH).toBe(400);
    expect(layout.outputWidth).toBe(680);
    expect(layout.outputHeight).toBe(480);
    expect(layout.contentX).toBe(40);
    expect(layout.contentY).toBe(40);
  });

  it('hit tests top-most annotations and supports handle resize + translation', () => {
    const rect: AnnotationItem = {
      id: 'r1',
      type: 'rect',
      x: 100,
      y: 100,
      w: 200,
      h: 120,
      color: '#ef4444',
      strokeWidth: 4,
      fillOpacity: 0,
      borderRadius: 6,
    };
    const step: AnnotationItem = {
      id: 's1',
      type: 'step',
      x: 150,
      y: 150,
      number: 1,
      size: 32,
      color: '#ef4444',
      strokeWidth: 4,
      targetX: 240,
      targetY: 200,
    };
    const arrow: AnnotationItem = {
      id: 'a1',
      type: 'arrow',
      x1: 20,
      y1: 20,
      x2: 120,
      y2: 20,
      curved: false,
      color: '#ef4444',
      strokeWidth: 4,
    };

    // Border hit on rect
    expect(hitTestAnnotations([rect, step], { x: 100, y: 140 })?.id).toBe('r1');
    // Step badge hit inside rect hollow interior
    expect(hitTestAnnotations([rect, step], { x: 152, y: 150 })?.id).toBe('s1');
    // Curved handle drag bends arrow
    expect(hitTestHandle(arrow, { x: 70, y: 20 })).toBe('control');
    const curved = applyHandleResize(arrow, 'control', { x: 70, y: 80 }, false);
    expect(curved.type === 'arrow' && curved.curved && curved.cy === 80).toBe(true);

    // Translation preserves relative offsets
    const movedStep = translateAnnotation(step, 25, -10);
    expect(movedStep.type === 'step' && movedStep.x === 175 && movedStep.targetY === 190).toBe(true);

    // Cloning assigns new ID, deep-copies points, and increments step badge number
    const clonedRect = cloneAnnotation(rect, 'r-copy');
    expect(clonedRect.id).toBe('r-copy');
    expect(clonedRect.type === 'rect' && clonedRect.x === 100 && clonedRect.w === 200).toBe(true);
    const clonedStep = cloneAnnotation(step, 's-copy', 2);
    expect(clonedStep.type === 'step' && clonedStep.id === 's-copy' && clonedStep.number === 2).toBe(true);

    // Bordered text label + attached arrow hit-test, handle move, and translation
    const labeledArrow: AnnotationItem = {
      id: 't1',
      type: 'text',
      x: 50,
      y: 50,
      text: 'Retry API',
      fontSize: 16,
      variant: 'border',
      color: '#ef4444',
      strokeWidth: 4,
      targetX: 220,
      targetY: 160,
    };
    expect(hitTestAnnotations([labeledArrow], { x: 200, y: 147 })?.id).toBe('t1');
    expect(hitTestHandle(labeledArrow, { x: 220, y: 160 })).toBe('end');
    const retargeted = applyHandleResize(labeledArrow, 'end', { x: 300, y: 200 }, false);
    expect(retargeted.type === 'text' && retargeted.targetX === 300 && retargeted.targetY === 200).toBe(true);
    const movedLabel = translateAnnotation(labeledArrow, 10, 20);
    expect(movedLabel.type === 'text' && movedLabel.x === 60 && movedLabel.targetY === 180).toBe(true);
  });

  it('locks text position and arrow angle across border/pill/outline modes with zero outline overlap', () => {
    const baseText: Extract<AnnotationItem, { type: 'text' }> = {
      id: 'tp1',
      type: 'text',
      x: 200,
      y: 100,
      text: 'text',
      fontSize: 26,
      variant: 'border',
      color: '#ef4444',
      strokeWidth: 4,
      targetX: 80,
      targetY: 220,
    };
    const fakeCtx = {
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      measureText: () => ({
        width: 48,
        actualBoundingBoxLeft: 24,
        actualBoundingBoxRight: 24,
        actualBoundingBoxAscent: 13.5,
        actualBoundingBoxDescent: 5.5,
      }),
    } as unknown as CanvasRenderingContext2D;

    const borderLayout = measureTextLayout({ ...baseText, variant: 'border' }, fakeCtx);
    const pillLayout = measureTextLayout({ ...baseText, variant: 'pill' }, fakeCtx);
    const outlineLayout = measureTextLayout({ ...baseText, variant: 'outline' }, fakeCtx);

    // 1. Sub-pixel vertical & horizontal centering
    const topGap = (borderLayout.firstDrawY - 13.5) - borderLayout.box.y;
    const bottomGap = (borderLayout.box.y + borderLayout.box.h) - (borderLayout.firstDrawY + 5.5);
    expect(Math.abs(topGap - bottomGap)).toBeLessThan(0.01);
    expect(borderLayout.centerX).toBe(borderLayout.box.x + borderLayout.box.w / 2);

    // 2. Switching between border / pill / outline never moves text or changes box geometry
    expect(pillLayout.box).toEqual(borderLayout.box);
    expect(outlineLayout.box).toEqual(borderLayout.box);
    expect(pillLayout.centerX).toBe(borderLayout.centerX);
    expect(outlineLayout.centerX).toBe(borderLayout.centerX);
    expect(pillLayout.firstDrawY).toBe(borderLayout.firstDrawY);
    expect(outlineLayout.firstDrawY).toBe(borderLayout.firstDrawY);

    // 3. Arrow angle & start anchor stay bit-for-bit identical across all 3 variants
    const aBorder = computeTextArrowStart(borderLayout.box, 80, 220);
    const aPill = computeTextArrowStart(pillLayout.box, 80, 220);
    const aOutline = computeTextArrowStart(outlineLayout.box, 80, 220);
    expect(aBorder).not.toBeNull();
    expect(aPill).toEqual(aBorder);
    expect(aOutline).toEqual(aBorder);

    // 4. Arrow start always stays strictly outside glyph ink + outline stroke halo in all directions
    const haloHalf = Math.max(4, baseText.fontSize * 0.22) / 2;
    const inkMinX = outlineLayout.centerX - 24 - haloHalf;
    const inkMaxX = outlineLayout.centerX + 24 + haloHalf;
    const inkMinY = outlineLayout.firstDrawY - 13.5 - haloHalf;
    const inkMaxY = outlineLayout.firstDrawY + 5.5 + haloHalf;
    const cx = outlineLayout.box.x + outlineLayout.box.w / 2;
    const cy = outlineLayout.box.y + outlineLayout.box.h / 2;
    const targets = [
      { x: 50, y: cy },
      { x: 400, y: cy },
      { x: cx, y: 10 },
      { x: cx, y: 260 },
      { x: 80, y: 220 },
      { x: 360, y: 20 },
    ];
    for (const t of targets) {
      const attach = computeTextArrowStart(outlineLayout.box, t.x, t.y);
      expect(attach).not.toBeNull();
      const overlapsGlyph =
        attach!.startX >= inkMinX &&
        attach!.startX <= inkMaxX &&
        attach!.startY >= inkMinY &&
        attach!.startY <= inkMaxY;
      expect(overlapsGlyph).toBe(false);
    }

    // 5. Anchoring text box from clicked arrow start keeps arrow origin locked at clicked anchor
    const anchor = { x: 300, y: 200 };
    const dragTarget = { x: 140, y: 310 };
    const pos = positionTextBoxForArrowStart(120, 34, anchor, dragTarget);
    const anchoredAttach = computeTextArrowStart({ x: pos.x, y: pos.y, w: 120, h: 34 }, dragTarget.x, dragTarget.y);
    expect(anchoredAttach).not.toBeNull();
    expect(Math.abs(anchoredAttach!.startX - anchor.x)).toBeLessThan(0.01);
    expect(Math.abs(anchoredAttach!.startY - anchor.y)).toBeLessThan(0.01);
    expect(Math.abs(anchoredAttach!.angle - Math.atan2(dragTarget.y - anchor.y, dragTarget.x - anchor.x))).toBeLessThan(0.001);
  });
});

describe('annotatorHistoryStorage', () => {
  beforeEach(async () => {
    await clearAnnotatorHistory();
  });

  it('persists, restores, deletes, and enforces FIFO cap of 15 entries', async () => {
    const doc = makeDoc({
      annotations: [
        {
          id: 'st1',
          type: 'step',
          x: 50,
          y: 60,
          number: 1,
          size: 30,
          color: '#ef4444',
          strokeWidth: 4,
        },
      ],
    });

    for (let i = 0; i < MAX_ANNOTATOR_HISTORY + 3; i++) {
      await saveAnnotatorHistoryEntry(
        {
          id: `item-${i}`,
          title: `Capture ${i}`,
          updatedAt: 1000 + i,
          width: 1000,
          height: 800,
          annotationCount: 1,
          thumbnailDataUrl: 'data:image/jpeg;base64,abc',
          byteSize: 0,
        },
        doc
      );
    }

    const meta = await loadAnnotatorHistoryMeta();
    expect(meta).toHaveLength(MAX_ANNOTATOR_HISTORY);
    expect(meta[0].id).toBe(`item-${MAX_ANNOTATOR_HISTORY + 2}`);

    // Evicted oldest item should no longer exist in storage
    const evicted = await loadAnnotatorHistoryDocument('item-0');
    expect(evicted).toBeNull();

    // Latest item restores full vector annotations
    const latest = await loadAnnotatorHistoryDocument(`item-${MAX_ANNOTATOR_HISTORY + 2}`);
    expect(latest?.annotations).toHaveLength(1);
    expect(latest?.annotations[0].id).toBe('st1');

    // Delete single item
    const afterDelete = await deleteAnnotatorHistoryEntry(meta[0].id);
    expect(afterDelete).toHaveLength(MAX_ANNOTATOR_HISTORY - 1);
  });
});

describe('annotatorPreferences', () => {
  beforeEach(() => {
    window.localStorage.removeItem(ANNOTATOR_PREFS_STORAGE_KEY);
  });

  it('persists and restores tool, style, frame, and spotlight preferences safely', () => {
    const defaults = getDefaultAnnotatorPreferences();
    expect(loadAnnotatorPreferences()).toEqual(defaults);

    const custom = {
      tool: 'text' as const,
      style: {
        ...defaults.style,
        color: '#22c55e',
        fontSize: 26,
        textVariant: 'pill' as const,
        strokeWidth: 6,
      },
      frameConfig: {
        ...defaults.frameConfig,
        enabled: true,
        presetId: 'ocean-slate',
        padding: 56,
      },
      spotlightConfig: {
        dimOpacity: 0.72,
      },
    };
    saveAnnotatorPreferences(custom);
    expect(loadAnnotatorPreferences()).toEqual(custom);

    // Falls back gracefully for deprecated variants or corrupted JSON
    window.localStorage.setItem(
      ANNOTATOR_PREFS_STORAGE_KEY,
      JSON.stringify({ tool: 'invalid-tool', style: { textVariant: 'callout', fontSize: 20 } })
    );
    const sanitized = loadAnnotatorPreferences();
    expect(sanitized.tool).toBe(defaults.tool);
    expect(sanitized.style.textVariant).toBe('border');
    expect(sanitized.style.fontSize).toBe(20);
  });
});
