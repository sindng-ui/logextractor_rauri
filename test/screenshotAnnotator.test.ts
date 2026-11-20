import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyHandleResize,
  cloneAnnotation,
  computeCutoutLayout,
  computeDocumentLayout,
  hitTestAnnotations,
  hitTestHandle,
  mapCollapsedToSource,
  normalizeRect,
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
