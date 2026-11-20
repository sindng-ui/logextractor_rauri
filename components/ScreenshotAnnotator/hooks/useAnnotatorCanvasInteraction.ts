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
  normalizeRect,
  ResizeHandleId,
  simplifyPoints,
  snapAnglePoint,
  snapAxisPoint,
  snapSquareRect,
  translateAnnotation,
} from '../../../utils/annotatorGeometry';
import { renderAnnotatorScene } from '../../../utils/annotatorCanvasRenderer';
import { generateUUID } from '../../../utils/uuid';

export interface InlineTextEditState {
  id: string | null; // null = creating new text
  x: number;
  y: number;
  initialText: string;
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

  // Zoom & Pan stored in ref for 60fps interaction + mirrored zoom state for UI badge
  const viewportRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  const [zoomDisplay, setZoomDisplay] = useState(100);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [isCtrlSelectHeld, setIsCtrlSelectHeld] = useState(false);
  const [isDuplicateCursor, setIsDuplicateCursor] = useState(false);
  const [editingText, setEditingText] = useState<InlineTextEditState | null>(null);

  // Mutable zero-rerender drag buffers
  const dragModeRef = useRef<DragMode>({ kind: 'none' });
  const draftAnnotationRef = useRef<AnnotationItem | null>(null);
  const liveOverrideRef = useRef<AnnotationItem | null>(null);
  const cropDraftRef = useRef<RectBox | null>(null);
  const cutoutDraftRef = useRef<{ axis: 'x' | 'y'; start: number; end: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const spaceRef = useRef(false);
  const ctrlRef = useRef(false);

  const docRef = useRef(doc);
  docRef.current = doc;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

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

    // Subtle canvas perimeter border so white screenshots remain clearly framed
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1 / zoom;
    ctx.strokeRect(-0.5 / zoom, -0.5 / zoom, layout.outputWidth + 1 / zoom, layout.outputHeight + 1 / zoom);

    renderAnnotatorScene(ctx, {
      doc: currentDoc,
      baseImg,
      overlayCache: overlayCacheRef.current,
      draftAnnotation: draftAnnotationRef.current,
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

  // Fit current document nicely inside viewport
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

  // Convert client pointer position to collapsed-image space (annotation coordinate system)
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

  // Convert annotation-space point to container-relative CSS px (for inline text box)
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

  // Redraw whenever doc, selection, image decode, or active state changes
  useEffect(() => {
    if (isActive) {
      scheduleRedraw();
    }
    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isActive, doc, selectedId, baseImgVersion, scheduleRedraw]);

  // Fit on new image dimensions
  const lastSizeKeyRef = useRef<string>('');
  useEffect(() => {
    if (!doc || !isActive) return;
    const sizeKey = `${doc.baseDataUrl.slice(-18)}:${doc.width}x${doc.height}`;
    if (sizeKey !== lastSizeKeyRef.current) {
      lastSizeKeyRef.current = sizeKey;
      window.requestAnimationFrame(fitToViewport);
    }
  }, [doc, isActive, fitToViewport]);

  // ResizeObserver for crisp DPR canvas sizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => scheduleRedraw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [scheduleRedraw]);

  // Track Spacebar (Pan), Ctrl (temporary Select), and Ctrl+Shift (Duplicate drag cursor)
  useEffect(() => {
    if (!isActive) {
      spaceRef.current = false;
      ctrlRef.current = false;
      setIsSpaceHeld(false);
      setIsCtrlSelectHeld(false);
      setIsDuplicateCursor(false);
      return;
    }
    const isCtrlEvent = (e: KeyboardEvent) =>
      e.key === 'Control' || e.code === 'ControlLeft' || e.code === 'ControlRight';
    const isShiftEvent = (e: KeyboardEvent) =>
      e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight';

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space' && !e.repeat) {
        spaceRef.current = true;
        setIsSpaceHeld(true);
      } else if (isCtrlEvent(e)) {
        if (!ctrlRef.current) {
          ctrlRef.current = true;
          setIsCtrlSelectHeld(true);
        }
        setIsDuplicateCursor(e.shiftKey);
      } else if (isShiftEvent(e) && (ctrlRef.current || e.ctrlKey)) {
        setIsDuplicateCursor(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        setIsSpaceHeld(false);
      } else if (isCtrlEvent(e)) {
        ctrlRef.current = false;
        setIsCtrlSelectHeld(false);
        setIsDuplicateCursor(false);
      } else if (isShiftEvent(e)) {
        setIsDuplicateCursor(false);
      }
    };
    const onBlur = () => {
      spaceRef.current = false;
      ctrlRef.current = false;
      setIsSpaceHeld(false);
      setIsCtrlSelectHeld(false);
      setIsDuplicateCursor(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [isActive]);

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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const currentDoc = docRef.current;
      if (!currentDoc) return;
      if (editingText) return;

      e.currentTarget.setPointerCapture(e.pointerId);

      // Middle click or Space+LeftClick => Pan
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
        scheduleRedraw();
        return;
      }

      if (effectiveTool === 'cutout') {
        dragModeRef.current = { kind: 'cutout', startPt: pt };
        cutoutDraftRef.current = { axis: 'y', start: pt.y, end: pt.y };
        scheduleRedraw();
        return;
      }

      if (effectiveTool === 'text') {
        // Check if clicking an existing text annotation to edit
        const hit = hitTestAnnotations(currentDoc.annotations, pt, tol);
        if (hit && hit.type === 'text') {
          setSelectedId(hit.id);
          setEditingText({ id: hit.id, x: hit.x, y: hit.y, initialText: hit.text });
        } else {
          setEditingText({ id: null, x: pt.x, y: pt.y, initialText: '' });
        }
        return;
      }

      if (effectiveTool === 'select') {
        const isDuplicateGesture = (ctrlRef.current || e.ctrlKey) && e.shiftKey;

        // 1. Check active selection handles first (skip when Ctrl+Shift duplicating)
        if (!isDuplicateGesture && selectedIdRef.current) {
          const currentSelected = currentDoc.annotations.find((a) => a.id === selectedIdRef.current);
          if (currentSelected) {
            const handle = hitTestHandle(currentSelected, pt, tol + 2);
            if (handle) {
              dragModeRef.current = { kind: 'resize', handle, original: currentSelected };
              liveOverrideRef.current = currentSelected;
              return;
            }
          }
        }
        // 2. Hit test annotations top-down
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

      // Drawing tools
      setSelectedId(null);
      dragModeRef.current = { kind: 'draw', startPt: pt, tool };
      const id = generateUUID();

      switch (tool) {
        case 'rect':
          draftAnnotationRef.current = {
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
          break;
        case 'ellipse':
          draftAnnotationRef.current = {
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
          break;
        case 'arrow':
          draftAnnotationRef.current = {
            id,
            type: 'arrow',
            x1: pt.x,
            y1: pt.y,
            x2: pt.x,
            y2: pt.y,
            curved: style.arrowCurved,
            color: style.color,
            strokeWidth: style.strokeWidth,
          };
          break;
        case 'step':
          draftAnnotationRef.current = {
            id,
            type: 'step',
            x: pt.x,
            y: pt.y,
            number: currentDoc.nextStepNumber,
            size: Math.max(26, style.strokeWidth * 6 + 10),
            color: style.color,
            strokeWidth: style.strokeWidth,
          };
          break;
        case 'highlighter':
          draftAnnotationRef.current = {
            id,
            type: 'highlighter',
            points: [pt],
            color: style.color,
            strokeWidth: style.strokeWidth,
          };
          break;
        case 'freehand':
          draftAnnotationRef.current = {
            id,
            type: 'freehand',
            points: [pt],
            color: style.color,
            strokeWidth: style.strokeWidth,
          };
          break;
        case 'mosaic':
          draftAnnotationRef.current = {
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
          break;
        case 'spotlight':
          draftAnnotationRef.current = {
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
          break;
      }
      scheduleRedraw();
    },
    [clientToImagePoint, editingText, scheduleRedraw, setSelectedId, style, tool]
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
        // Dragging vertically removes a horizontal strip (axis: 'y'); dragging horizontally removes a vertical strip
        if (dy >= dx) {
          cutoutDraftRef.current = { axis: 'y', start: mode.startPt.y, end: pt.y };
        } else {
          cutoutDraftRef.current = { axis: 'x', start: mode.startPt.x, end: pt.x };
        }
        scheduleRedraw();
        return;
      }

      if (mode.kind === 'draw' && draftAnnotationRef.current) {
        const draft = draftAnnotationRef.current;
        const start = mode.startPt;
        switch (draft.type) {
          case 'rect':
          case 'ellipse':
          case 'mosaic':
          case 'spotlight': {
            const box = e.shiftKey
              ? snapSquareRect(start.x, start.y, pt.x, pt.y)
              : normalizeRect(start.x, start.y, pt.x, pt.y);
            draftAnnotationRef.current = { ...draft, x: box.x, y: box.y, w: box.w, h: box.h };
            break;
          }
          case 'arrow': {
            const end = e.shiftKey ? snapAnglePoint(start, pt) : pt;
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            draftAnnotationRef.current = {
              ...draft,
              x2: end.x,
              y2: end.y,
              cx: draft.curved ? midX - dy * 0.22 : undefined,
              cy: draft.curved ? midY + dx * 0.22 : undefined,
            };
            break;
          }
          case 'step': {
            const dist = Math.hypot(pt.x - start.x, pt.y - start.y);
            if (dist > 14) {
              const target = e.shiftKey ? snapAnglePoint(start, pt) : pt;
              draftAnnotationRef.current = { ...draft, targetX: target.x, targetY: target.y };
            } else {
              draftAnnotationRef.current = { ...draft, targetX: undefined, targetY: undefined };
            }
            break;
          }
          case 'highlighter': {
            if (e.shiftKey) {
              draftAnnotationRef.current = { ...draft, points: [start, { x: pt.x, y: start.y }] };
            } else {
              draftAnnotationRef.current = { ...draft, points: [...draft.points, pt] };
            }
            break;
          }
          case 'freehand': {
            if (e.shiftKey) {
              draftAnnotationRef.current = { ...draft, points: [start, snapAxisPoint(start, pt)] };
            } else {
              draftAnnotationRef.current = { ...draft, points: [...draft.points, pt] };
            }
            break;
          }
        }
        scheduleRedraw();
      }
    },
    [clientToImagePoint, scheduleRedraw]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const mode = dragModeRef.current;
      dragModeRef.current = { kind: 'none' };
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
        let item = draftAnnotationRef.current;
        draftAnnotationRef.current = null;

        let valid = true;
        if (
          item.type === 'rect' ||
          item.type === 'ellipse' ||
          item.type === 'mosaic' ||
          item.type === 'spotlight'
        ) {
          valid = item.w >= 4 && item.h >= 4;
        } else if (item.type === 'arrow') {
          valid = Math.hypot(item.x2 - item.x1, item.y2 - item.y1) >= 8;
        } else if (item.type === 'freehand' || item.type === 'highlighter') {
          item = { ...item, points: simplifyPoints(item.points, 2.5) };
          valid = item.points.length >= 2;
        }

        if (valid) {
          onAddAnnotation(item);
        }
        scheduleRedraw();
      }
    },
    [onAddAnnotation, onAddCutout, onSetCropRect, onUpdateAnnotation, scheduleRedraw, style.cutoutStyle]
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
        tailX: style.textVariant === 'callout' ? edit.x - 24 : undefined,
        tailY: style.textVariant === 'callout' ? edit.y + 44 : undefined,
      };
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
