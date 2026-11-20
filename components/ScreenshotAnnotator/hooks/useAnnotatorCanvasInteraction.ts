import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AnnotationItem,
  AnnotatorDocument,
  AnnotatorStyleState,
  AnnotatorTool,
  CutoutRegion,
  Point,
  RectBox,
  TextAnnotation,
} from '../../../types/screenshotAnnotator';
import {
  applyHandleResize,
  cloneAnnotation,
  computeDocumentLayout,
  hitTestAnnotations,
  hitTestHandle,
  mapCollapsedToSource,
  measureTextLayout,
  normalizeRect,
  positionTextBoxForArrowStart,
  ResizeHandleId,
  translateAnnotation,
} from '../../../utils/annotatorGeometry';
import {
  createDraftAnnotation,
  CURSOR_DRAG_MICRO_RING,
  CURSOR_OPEN_CROSSHAIR,
  finalizeDraftAnnotation,
  updateDraftAnnotation,
} from '../../../utils/annotatorDraftFactory';
import { renderAnnotatorScene } from '../../../utils/annotatorCanvasRenderer';
import { generateUUID } from '../../../utils/uuid';
import { useAnnotatorModifierKeys } from './useAnnotatorModifierKeys';

export interface InlineTextEditState {
  id: string | null; // null = creating new text
  x: number;
  y: number;
  anchorX?: number;
  anchorY?: number;
  initialText: string;
  targetX?: number;
  targetY?: number;
}

interface UseAnnotatorCanvasInteractionParams {
  isActive: boolean;
  doc: AnnotatorDocument | null;
  baseImgRef: React.MutableRefObject<HTMLImageElement | null>;
  overlayCacheRef: React.MutableRefObject<Map<string, HTMLImageElement>>;
  baseImgVersion: number;
  tool: AnnotatorTool;
  style: AnnotatorStyleState;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  setTool: (tool: AnnotatorTool) => void;
  onAddAnnotation: (item: AnnotationItem) => void;
  onUpdateAnnotation: (item: AnnotationItem) => void;
  onAddCutout: (cutout: CutoutRegion) => void;
  onSetCropRect: (rect: RectBox) => void;
}

type DragMode =
  | { kind: 'none' }
  | { kind: 'pan'; startClientX: number; startClientY: number; startPanX: number; startPanY: number }
  | { kind: 'draw'; startPt: Point; tool: AnnotatorTool }
  | { kind: 'move'; startPt: Point; original: AnnotationItem }
  | { kind: 'duplicate'; startPt: Point; sourceId: string; original: AnnotationItem }
  | { kind: 'resize'; handle: ResizeHandleId; original: AnnotationItem }
  | { kind: 'crop'; startPt: Point }
  | { kind: 'cutout'; startPt: Point };

export function useAnnotatorCanvasInteraction({
  isActive,
  doc,
  baseImgRef,
  overlayCacheRef,
  baseImgVersion,
  tool,
  style,
  selectedId,
  setSelectedId,
  onAddAnnotation,
  onUpdateAnnotation,
  onAddCutout,
  onSetCropRect,
}: UseAnnotatorCanvasInteractionParams) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { spaceRef, ctrlRef, isSpaceHeld, isCtrlSelectHeld, isDuplicateCursor } =
    useAnnotatorModifierKeys(isActive);

  // Zoom & Pan stored in ref for 60fps interaction + mirrored zoom state for UI badge
  const viewportRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  const [zoomDisplay, setZoomDisplay] = useState(100);
  const [editingText, setEditingText] = useState<InlineTextEditState | null>(null);

  // Mutable zero-rerender drag buffers
  const dragModeRef = useRef<DragMode>({ kind: 'none' });
  const draftAnnotationRef = useRef<AnnotationItem | null>(null);
  const liveOverrideRef = useRef<AnnotationItem | null>(null);
  const cropDraftRef = useRef<RectBox | null>(null);
  const cutoutDraftRef = useRef<{ axis: 'x' | 'y'; start: number; end: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const docRef = useRef(doc);
  docRef.current = doc;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const editingTextRef = useRef<InlineTextEditState | null>(null);
  editingTextRef.current = editingText;
  const styleRef = useRef(style);
  styleRef.current = style;

  const paintNow = useCallback(() => {
    rafIdRef.current = null;
    if (!isActive) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const currentDoc = docRef.current;
    const baseImg = baseImgRef.current;
    if (!canvas || !container || !currentDoc || !baseImg || !baseImg.complete) return;

    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(1, Math.floor(rect.width * dpr));
    const targetH = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const { zoom, panX, panY } = viewportRef.current;
    const layout = computeDocumentLayout(currentDoc);
    const originX = (rect.width - layout.outputWidth * zoom) / 2 + panX;
    const originY = (rect.height - layout.outputHeight * zoom) / 2 + panY;

    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(zoom, zoom);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1 / zoom;
    ctx.strokeRect(-0.5 / zoom, -0.5 / zoom, layout.outputWidth + 1 / zoom, layout.outputHeight + 1 / zoom);

    const activeEdit = editingTextRef.current;
    const pendingTextPreview: AnnotationItem | null =
      !draftAnnotationRef.current && activeEdit && !activeEdit.id && activeEdit.targetX !== undefined
        ? {
            id: '__pending_text__',
            type: 'text',
            x: activeEdit.x,
            y: activeEdit.y,
            text: '',
            color: styleRef.current.color,
            strokeWidth: styleRef.current.strokeWidth,
            fontSize: styleRef.current.fontSize,
            variant: styleRef.current.textVariant,
            targetX: activeEdit.targetX,
            targetY: activeEdit.targetY,
          }
        : null;

    renderAnnotatorScene(ctx, {
      doc: currentDoc,
      baseImg,
      overlayCache: overlayCacheRef.current,
      draftAnnotation: draftAnnotationRef.current ?? pendingTextPreview,
      liveOverride: liveOverrideRef.current,
      selectedId: selectedIdRef.current,
      cropDraft: cropDraftRef.current,
      cutoutDraft: cutoutDraftRef.current,
      includeSelectionUI: true,
      zoom,
    });

    ctx.restore();
  }, [isActive, baseImgRef, overlayCacheRef]);

  const scheduleRedraw = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = window.requestAnimationFrame(paintNow);
  }, [paintNow]);

  const fitToViewport = useCallback(() => {
    const container = containerRef.current;
    const currentDoc = docRef.current;
    if (!container || !currentDoc) return;
    const rect = container.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const layout = computeDocumentLayout(currentDoc);
    const pad = 56;
    const fitZoom = Math.min(
      1,
      (rect.width - pad) / Math.max(1, layout.outputWidth),
      (rect.height - pad) / Math.max(1, layout.outputHeight)
    );
    const clamped = Math.max(0.15, Math.min(2, Number(fitZoom.toFixed(3))));
    viewportRef.current = { zoom: clamped, panX: 0, panY: 0 };
    setZoomDisplay(Math.round(clamped * 100));
    scheduleRedraw();
  }, [scheduleRedraw]);

  const setZoomPercent = useCallback(
    (percent: number) => {
      const next = Math.max(0.15, Math.min(6, percent / 100));
      viewportRef.current.zoom = next;
      setZoomDisplay(Math.round(next * 100));
      scheduleRedraw();
    },
    [scheduleRedraw]
  );

  const clientToImagePoint = useCallback((clientX: number, clientY: number): Point | null => {
    const container = containerRef.current;
    const currentDoc = docRef.current;
    if (!container || !currentDoc) return null;
    const rect = container.getBoundingClientRect();
    const { zoom, panX, panY } = viewportRef.current;
    const layout = computeDocumentLayout(currentDoc);
    const originX = (rect.width - layout.outputWidth * zoom) / 2 + panX;
    const originY = (rect.height - layout.outputHeight * zoom) / 2 + panY;

    const outX = (clientX - rect.left - originX) / zoom;
    const outY = (clientY - rect.top - originY) / zoom;
    return {
      x: outX - layout.contentX + layout.crop.x,
      y: outY - layout.contentY + layout.crop.y,
    };
  }, []);

  const imagePointToClientOffset = useCallback((pt: Point): Point | null => {
    const container = containerRef.current;
    const currentDoc = docRef.current;
    if (!container || !currentDoc) return null;
    const rect = container.getBoundingClientRect();
    const { zoom, panX, panY } = viewportRef.current;
    const layout = computeDocumentLayout(currentDoc);
    const originX = (rect.width - layout.outputWidth * zoom) / 2 + panX;
    const originY = (rect.height - layout.outputHeight * zoom) / 2 + panY;
    const outX = pt.x + layout.contentX - layout.crop.x;
    const outY = pt.y + layout.contentY - layout.crop.y;
    return {
      x: originX + outX * zoom,
      y: originY + outY * zoom,
    };
  }, []);

  useEffect(() => {
    if (isActive) scheduleRedraw();
    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isActive, doc, selectedId, editingText, baseImgVersion, scheduleRedraw]);

  const lastSizeKeyRef = useRef<string>('');
  useEffect(() => {
    if (!doc || !isActive) return;
    const sizeKey = `${doc.baseDataUrl.slice(-18)}:${doc.width}x${doc.height}`;
    if (sizeKey !== lastSizeKeyRef.current) {
      lastSizeKeyRef.current = sizeKey;
      window.requestAnimationFrame(fitToViewport);
    }
  }, [doc, isActive, fitToViewport]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => scheduleRedraw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [scheduleRedraw]);

  // Ctrl+Wheel cursor-anchored zoom + regular Wheel pan
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isActive) return;
    const onWheel = (e: WheelEvent) => {
      if (!docRef.current) return;
      e.preventDefault();
      const vp = viewportRef.current;
      if (e.ctrlKey || e.metaKey) {
        const rect = container.getBoundingClientRect();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const nextZoom = Math.max(0.15, Math.min(6, vp.zoom * factor));
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        const ratio = nextZoom / vp.zoom;
        vp.panX = cx - (cx - vp.panX) * ratio;
        vp.panY = cy - (cy - vp.panY) * ratio;
        vp.zoom = nextZoom;
        setZoomDisplay(Math.round(nextZoom * 100));
      } else {
        vp.panX -= e.deltaX;
        vp.panY -= e.deltaY;
      }
      scheduleRedraw();
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [isActive, scheduleRedraw]);

  // Direct DOM cursor swap during active drawing drag (Cursor Mode D, 0 React re-renders)
  const setCanvasDragCursor = useCallback(
    (active: boolean) => {
      const el = canvasRef.current;
      if (!el) return;
      if (active) {
        el.style.cursor = CURSOR_DRAG_MICRO_RING;
      } else if (!spaceRef.current && !ctrlRef.current && tool !== 'select') {
        el.style.cursor = CURSOR_OPEN_CROSSHAIR;
      } else {
        el.style.removeProperty('cursor');
      }
    },
    [spaceRef, ctrlRef, tool]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const currentDoc = docRef.current;
      if (!currentDoc || editingText) return;

      e.currentTarget.setPointerCapture(e.pointerId);

      if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
        dragModeRef.current = {
          kind: 'pan',
          startClientX: e.clientX,
          startClientY: e.clientY,
          startPanX: viewportRef.current.panX,
          startPanY: viewportRef.current.panY,
        };
        return;
      }

      if (e.button !== 0) return;
      const pt = clientToImagePoint(e.clientX, e.clientY);
      if (!pt) return;
      const tol = 9 / Math.max(0.25, viewportRef.current.zoom);
      const effectiveTool: AnnotatorTool =
        (ctrlRef.current || e.ctrlKey) && tool !== 'select' ? 'select' : tool;

      if (effectiveTool === 'crop') {
        dragModeRef.current = { kind: 'crop', startPt: pt };
        cropDraftRef.current = { x: pt.x, y: pt.y, w: 0, h: 0 };
        setCanvasDragCursor(true);
        scheduleRedraw();
        return;
      }

      if (effectiveTool === 'cutout') {
        dragModeRef.current = { kind: 'cutout', startPt: pt };
        cutoutDraftRef.current = { axis: 'y', start: pt.y, end: pt.y };
        setCanvasDragCursor(true);
        scheduleRedraw();
        return;
      }

      if (effectiveTool === 'text') {
        const hit = hitTestAnnotations(currentDoc.annotations, pt, tol);
        if (hit && hit.type === 'text') {
          setSelectedId(hit.id);
          setEditingText({ id: hit.id, x: hit.x, y: hit.y, initialText: hit.text });
          return;
        }
        setSelectedId(null);
        dragModeRef.current = { kind: 'draw', startPt: pt, tool: 'text' };
        draftAnnotationRef.current = createDraftAnnotation(generateUUID(), 'text', pt, style, currentDoc);
        setCanvasDragCursor(true);
        scheduleRedraw();
        return;
      }

      if (effectiveTool === 'select') {
        const isDuplicateGesture = (ctrlRef.current || e.ctrlKey) && e.shiftKey;
        if (!isDuplicateGesture && selectedIdRef.current) {
          const currentSelected = currentDoc.annotations.find((a) => a.id === selectedIdRef.current);
          if (currentSelected) {
            const handle = hitTestHandle(currentSelected, pt, tol + 2);
            if (handle) {
              dragModeRef.current = { kind: 'resize', handle, original: currentSelected };
              liveOverrideRef.current = currentSelected;
              setCanvasDragCursor(true);
              return;
            }
          }
        }
        const hit = hitTestAnnotations(currentDoc.annotations, pt, tol);
        if (hit) {
          if (isDuplicateGesture) {
            const cloned = cloneAnnotation(hit, generateUUID(), currentDoc.nextStepNumber);
            setSelectedId(cloned.id);
            dragModeRef.current = { kind: 'duplicate', startPt: pt, sourceId: hit.id, original: cloned };
            draftAnnotationRef.current = cloned;
            scheduleRedraw();
          } else {
            setSelectedId(hit.id);
            dragModeRef.current = { kind: 'move', startPt: pt, original: hit };
            liveOverrideRef.current = hit;
            scheduleRedraw();
          }
        } else {
          setSelectedId(null);
        }
        return;
      }

      setSelectedId(null);
      dragModeRef.current = { kind: 'draw', startPt: pt, tool };
      draftAnnotationRef.current = createDraftAnnotation(generateUUID(), tool, pt, style, currentDoc);
      setCanvasDragCursor(true);
      scheduleRedraw();
    },
    [clientToImagePoint, ctrlRef, editingText, scheduleRedraw, setCanvasDragCursor, setSelectedId, spaceRef, style, tool]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const mode = dragModeRef.current;
      if (mode.kind === 'none') return;

      if (mode.kind === 'pan') {
        viewportRef.current.panX = mode.startPanX + (e.clientX - mode.startClientX);
        viewportRef.current.panY = mode.startPanY + (e.clientY - mode.startClientY);
        scheduleRedraw();
        return;
      }

      const pt = clientToImagePoint(e.clientX, e.clientY);
      if (!pt) return;

      if (mode.kind === 'move') {
        liveOverrideRef.current = translateAnnotation(
          mode.original,
          pt.x - mode.startPt.x,
          pt.y - mode.startPt.y
        );
        scheduleRedraw();
        return;
      }

      if (mode.kind === 'duplicate') {
        draftAnnotationRef.current = translateAnnotation(
          mode.original,
          pt.x - mode.startPt.x,
          pt.y - mode.startPt.y
        );
        scheduleRedraw();
        return;
      }

      if (mode.kind === 'resize') {
        liveOverrideRef.current = applyHandleResize(mode.original, mode.handle, pt, e.shiftKey);
        scheduleRedraw();
        return;
      }

      if (mode.kind === 'crop') {
        cropDraftRef.current = normalizeRect(mode.startPt.x, mode.startPt.y, pt.x, pt.y);
        scheduleRedraw();
        return;
      }

      if (mode.kind === 'cutout') {
        const dx = Math.abs(pt.x - mode.startPt.x);
        const dy = Math.abs(pt.y - mode.startPt.y);
        cutoutDraftRef.current =
          dy >= dx
            ? { axis: 'y', start: mode.startPt.y, end: pt.y }
            : { axis: 'x', start: mode.startPt.x, end: pt.x };
        scheduleRedraw();
        return;
      }

      if (mode.kind === 'draw' && draftAnnotationRef.current) {
        draftAnnotationRef.current = updateDraftAnnotation(
          draftAnnotationRef.current,
          mode.startPt,
          pt,
          e.shiftKey
        );
        scheduleRedraw();
      }
    },
    [clientToImagePoint, scheduleRedraw]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const mode = dragModeRef.current;
      dragModeRef.current = { kind: 'none' };
      setCanvasDragCursor(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore if not captured
      }

      if (mode.kind === 'move' || mode.kind === 'resize') {
        const finalItem = liveOverrideRef.current;
        liveOverrideRef.current = null;
        if (finalItem && finalItem !== mode.original) {
          onUpdateAnnotation(finalItem);
        }
        scheduleRedraw();
        return;
      }

      if (mode.kind === 'duplicate') {
        const duplicated = draftAnnotationRef.current;
        draftAnnotationRef.current = null;
        if (duplicated && duplicated !== mode.original) {
          onAddAnnotation(duplicated);
          setSelectedId(duplicated.id);
        } else {
          setSelectedId(mode.sourceId);
        }
        scheduleRedraw();
        return;
      }

      if (mode.kind === 'crop') {
        const cr = cropDraftRef.current;
        cropDraftRef.current = null;
        if (cr && cr.w >= 12 && cr.h >= 12) {
          onSetCropRect(cr);
        }
        scheduleRedraw();
        return;
      }

      if (mode.kind === 'cutout') {
        const cd = cutoutDraftRef.current;
        cutoutDraftRef.current = null;
        const currentDoc = docRef.current;
        if (cd && currentDoc && Math.abs(cd.end - cd.start) >= 12) {
          const layout = computeDocumentLayout(currentDoc);
          const slices = cd.axis === 'y' ? layout.cutout.ySlices : layout.cutout.xSlices;
          const srcStart = mapCollapsedToSource(Math.min(cd.start, cd.end), slices);
          const srcEnd = mapCollapsedToSource(Math.max(cd.start, cd.end), slices);
          if (srcEnd - srcStart >= 10) {
            onAddCutout({
              id: generateUUID(),
              axis: cd.axis,
              start: srcStart,
              end: srcEnd,
              style: style.cutoutStyle,
            });
          }
        }
        scheduleRedraw();
        return;
      }

      if (mode.kind === 'draw' && draftAnnotationRef.current) {
        const rawItem = draftAnnotationRef.current;
        draftAnnotationRef.current = null;

        if (rawItem.type === 'text') {
          setEditingText({
            id: null,
            x: rawItem.x,
            y: rawItem.y,
            anchorX: mode.startPt.x,
            anchorY: mode.startPt.y,
            initialText: '',
            targetX: rawItem.targetX,
            targetY: rawItem.targetY,
          });
          scheduleRedraw();
          return;
        }

        const finalized = finalizeDraftAnnotation(rawItem);
        if (finalized) {
          onAddAnnotation(finalized);
        }
        scheduleRedraw();
      }
    },
    [onAddAnnotation, onAddCutout, onSetCropRect, onUpdateAnnotation, scheduleRedraw, setCanvasDragCursor, setSelectedId, style.cutoutStyle]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const currentDoc = docRef.current;
      if (!currentDoc) return;
      const pt = clientToImagePoint(e.clientX, e.clientY);
      if (!pt) return;
      const hit = hitTestAnnotations(currentDoc.annotations, pt, 10 / Math.max(0.25, viewportRef.current.zoom));
      if (hit && hit.type === 'text') {
        setSelectedId(hit.id);
        setEditingText({ id: hit.id, x: hit.x, y: hit.y, initialText: hit.text });
      }
    },
    [clientToImagePoint, setSelectedId]
  );

  const commitInlineText = useCallback(
    (value: string) => {
      const edit = editingText;
      setEditingText(null);
      if (!edit) return;
      const trimmed = value.trim();
      if (!trimmed) return;

      if (edit.id && docRef.current) {
        const existing = docRef.current.annotations.find(
          (a): a is TextAnnotation => a.id === edit.id && a.type === 'text'
        );
        if (existing) {
          onUpdateAnnotation({ ...existing, text: trimmed });
          return;
        }
      }

      const nextText: TextAnnotation = {
        id: generateUUID(),
        type: 'text',
        x: edit.x,
        y: edit.y,
        text: trimmed,
        color: style.color,
        strokeWidth: style.strokeWidth,
        fontSize: style.fontSize,
        variant: style.textVariant,
        targetX: edit.targetX,
        targetY: edit.targetY,
      };
      if (edit.anchorX !== undefined && edit.anchorY !== undefined) {
        const box = measureTextLayout(nextText).box;
        const target =
          edit.targetX !== undefined && edit.targetY !== undefined
            ? { x: edit.targetX, y: edit.targetY }
            : null;
        const pos = positionTextBoxForArrowStart(box.w, box.h, { x: edit.anchorX, y: edit.anchorY }, target);
        nextText.x = pos.x;
        nextText.y = pos.y;
      }
      onAddAnnotation(nextText);
    },
    [editingText, onAddAnnotation, onUpdateAnnotation, style]
  );

  return {
    containerRef,
    canvasRef,
    zoomDisplay,
    isSpaceHeld,
    isCtrlSelectHeld,
    isDuplicateCursor,
    editingText,
    setEditingText,
    commitInlineText,
    imagePointToClientOffset,
    fitToViewport,
    setZoomPercent,
    scheduleRedraw,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
  };
}
