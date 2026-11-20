import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AnnotationItem,
  AnnotatorDocument,
  AnnotatorHistoryMeta,
  AnnotatorStyleState,
  AnnotatorTool,
  CutoutRegion,
  DEFAULT_FRAME_CONFIG,
  DEFAULT_SPOTLIGHT_CONFIG,
  DEFAULT_STYLE_STATE,
  FrameConfig,
  RectBox,
  SpotlightConfig,
} from '../../../types/screenshotAnnotator';
import {
  clearAnnotatorHistory,
  deleteAnnotatorHistoryEntry,
  loadAnnotatorHistoryDocument,
  loadAnnotatorHistoryMeta,
  saveAnnotatorHistoryEntry,
} from '../../../utils/annotatorHistoryStorage';
import {
  createThumbnailDataUrl,
  renderDocumentToExportCanvas,
} from '../../../utils/annotatorImageOps';
import { generateUUID } from '../../../utils/uuid';

const MAX_UNDO_DEPTH = 50;

export function createEmptyDocument(
  baseDataUrl: string,
  width: number,
  height: number
): AnnotatorDocument {
  return {
    baseDataUrl,
    width,
    height,
    annotations: [],
    cutouts: [],
    cropRect: null,
    frameConfig: { ...DEFAULT_FRAME_CONFIG },
    spotlightConfig: { ...DEFAULT_SPOTLIGHT_CONFIG },
    nextStepNumber: 1,
  };
}

export function useAnnotatorState(
  baseImgRef: React.MutableRefObject<HTMLImageElement | null>,
  overlayCacheRef: React.MutableRefObject<Map<string, HTMLImageElement>>
) {
  const [doc, setDoc] = useState<AnnotatorDocument | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState<string>('Untitled Capture');
  const [undoStack, setUndoStack] = useState<AnnotatorDocument[]>([]);
  const [redoStack, setRedoStack] = useState<AnnotatorDocument[]>([]);

  const [tool, setTool] = useState<AnnotatorTool>('arrow');
  const [style, setStyle] = useState<AnnotatorStyleState>(DEFAULT_STYLE_STATE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyMeta, setHistoryMeta] = useState<AnnotatorHistoryMeta[]>([]);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);

  const docRef = useRef<AnnotatorDocument | null>(null);
  docRef.current = doc;
  const docIdRef = useRef<string | null>(null);
  docIdRef.current = docId;
  const docTitleRef = useRef<string>(docTitle);
  docTitleRef.current = docTitle;

  const autoSaveTimerRef = useRef<number | null>(null);

  // Hydrate lightweight history metadata once on mount
  useEffect(() => {
    let active = true;
    loadAnnotatorHistoryMeta().then((meta) => {
      if (active) {
        setHistoryMeta(meta);
        setIsHistoryLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const persistCurrentToHistory = useCallback(
    async (targetDoc?: AnnotatorDocument | null, targetId?: string | null, targetTitle?: string) => {
      const d = targetDoc ?? docRef.current;
      const id = targetId ?? docIdRef.current;
      const img = baseImgRef.current;
      if (!d || !id || !img || !img.complete || img.naturalWidth === 0) return;

      try {
        const rendered = renderDocumentToExportCanvas(d, img, overlayCacheRef.current);
        const thumbnailDataUrl = createThumbnailDataUrl(rendered, 220);
        const meta: AnnotatorHistoryMeta = {
          id,
          title: targetTitle ?? docTitleRef.current,
          updatedAt: Date.now(),
          width: rendered.width,
          height: rendered.height,
          annotationCount: d.annotations.length,
          thumbnailDataUrl,
          byteSize: 0,
        };
        const updated = await saveAnnotatorHistoryEntry(meta, d);
        setHistoryMeta(updated);
      } catch (err) {
        console.warn('[SnapStudio] Failed to persist history entry:', err);
      }
    },
    [baseImgRef, overlayCacheRef]
  );

  // Debounced auto-save whenever doc changes
  useEffect(() => {
    if (!doc || !docId) return;
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      persistCurrentToHistory();
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [doc, docId, persistCurrentToHistory]);

  const commitDocChange = useCallback(
    (updater: (prev: AnnotatorDocument) => AnnotatorDocument) => {
      setDoc((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        if (next === prev) return prev;
        setUndoStack((stack) => {
          const nextStack = [...stack, prev];
          return nextStack.length > MAX_UNDO_DEPTH
            ? nextStack.slice(nextStack.length - MAX_UNDO_DEPTH)
            : nextStack;
        });
        setRedoStack([]);
        return next;
      });
    },
    []
  );

  const loadNewDocument = useCallback(
    async (baseDataUrl: string, width: number, height: number, title?: string) => {
      // Save existing work to history before replacing
      if (docRef.current && docIdRef.current) {
        await persistCurrentToHistory();
      }
      const nextId = generateUUID();
      const now = new Date();
      const timeTag = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const nextTitle = title || `Capture ${timeTag}`;
      const nextDoc = createEmptyDocument(baseDataUrl, width, height);

      setDocId(nextId);
      setDocTitle(nextTitle);
      setDoc(nextDoc);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedId(null);
    },
    [persistCurrentToHistory]
  );

  const restoreHistoryItem = useCallback(
    async (id: string): Promise<boolean> => {
      const loaded = await loadAnnotatorHistoryDocument(id);
      if (!loaded) return false;
      const meta = historyMeta.find((m) => m.id === id);
      setDocId(id);
      setDocTitle(meta?.title ?? 'Restored Capture');
      setDoc(loaded);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedId(null);
      return true;
    },
    [historyMeta]
  );

  const deleteHistoryItem = useCallback(async (id: string) => {
    const next = await deleteAnnotatorHistoryEntry(id);
    setHistoryMeta(next);
  }, []);

  const clearHistory = useCallback(async () => {
    await clearAnnotatorHistory();
    setHistoryMeta([]);
  }, []);

  const addAnnotation = useCallback(
    (item: AnnotationItem) => {
      commitDocChange((prev) => ({
        ...prev,
        annotations: [...prev.annotations, item],
        nextStepNumber:
          item.type === 'step' ? Math.max(prev.nextStepNumber, item.number + 1) : prev.nextStepNumber,
      }));
      if (item.type === 'text' || item.type === 'overlayImage') {
        setSelectedId(item.id);
      }
    },
    [commitDocChange]
  );

  const updateAnnotation = useCallback(
    (updated: AnnotationItem) => {
      commitDocChange((prev) => ({
        ...prev,
        annotations: prev.annotations.map((it) => (it.id === updated.id ? updated : it)),
      }));
    },
    [commitDocChange]
  );

  const deleteAnnotation = useCallback(
    (id: string) => {
      commitDocChange((prev) => ({
        ...prev,
        annotations: prev.annotations.filter((it) => it.id !== id),
      }));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [commitDocChange]
  );

  const clearAnnotations = useCallback(() => {
    commitDocChange((prev) => ({
      ...prev,
      annotations: [],
      nextStepNumber: 1,
    }));
    setSelectedId(null);
  }, [commitDocChange]);

  const addCutout = useCallback(
    (cutout: CutoutRegion) => {
      commitDocChange((prev) => ({
        ...prev,
        cutouts: [...prev.cutouts, cutout],
        cropRect: null, // Reset crop so newly collapsed dimensions remain consistent
      }));
    },
    [commitDocChange]
  );

  const clearCutouts = useCallback(() => {
    commitDocChange((prev) => ({
      ...prev,
      cutouts: [],
    }));
  }, [commitDocChange]);

  const setCropRect = useCallback(
    (cropRect: RectBox | null) => {
      commitDocChange((prev) => ({
        ...prev,
        cropRect,
      }));
    },
    [commitDocChange]
  );

  const replaceBaseImage = useCallback(
    (baseDataUrl: string, width: number, height: number) => {
      commitDocChange((prev) => ({
        ...prev,
        baseDataUrl,
        width,
        height,
        cropRect: null,
        cutouts: [],
      }));
    },
    [commitDocChange]
  );

  const updateFrameConfig = useCallback(
    (patch: Partial<FrameConfig>) => {
      commitDocChange((prev) => ({
        ...prev,
        frameConfig: { ...prev.frameConfig, ...patch },
      }));
    },
    [commitDocChange]
  );

  const updateSpotlightConfig = useCallback(
    (patch: Partial<SpotlightConfig>) => {
      commitDocChange((prev) => ({
        ...prev,
        spotlightConfig: { ...prev.spotlightConfig, ...patch },
      }));
    },
    [commitDocChange]
  );

  const resetStepNumber = useCallback(
    (num = 1) => {
      commitDocChange((prev) => ({
        ...prev,
        nextStepNumber: Math.max(1, num),
      }));
    },
    [commitDocChange]
  );

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0 || !docRef.current) return stack;
      const previous = stack[stack.length - 1];
      const current = docRef.current;
      setRedoStack((r) => [...r, current]);
      setDoc(previous);
      setSelectedId(null);
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0 || !docRef.current) return stack;
      const next = stack[stack.length - 1];
      const current = docRef.current;
      setUndoStack((u) => [...u, current]);
      setDoc(next);
      setSelectedId(null);
      return stack.slice(0, -1);
    });
  }, []);

  const clearDocument = useCallback(() => {
    setDoc(null);
    setDocId(null);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedId(null);
  }, []);

  const updateSelectedStyle = useCallback(
    (patch: Partial<AnnotatorStyleState>) => {
      setStyle((prev) => ({ ...prev, ...patch }));
      if (!selectedId || !docRef.current) return;
      const target = docRef.current.annotations.find((a) => a.id === selectedId);
      if (!target) return;

      const updated: AnnotationItem = { ...target };
      if (patch.color !== undefined) updated.color = patch.color;
      if (patch.strokeWidth !== undefined) updated.strokeWidth = patch.strokeWidth;
      if (patch.fillOpacity !== undefined && (updated.type === 'rect' || updated.type === 'ellipse')) {
        updated.fillOpacity = patch.fillOpacity;
      }
      if (patch.arrowCurved !== undefined && updated.type === 'arrow') {
        updated.curved = patch.arrowCurved;
        if (patch.arrowCurved && updated.cx === undefined) {
          const midX = (updated.x1 + updated.x2) / 2;
          const midY = (updated.y1 + updated.y2) / 2;
          const dx = updated.x2 - updated.x1;
          const dy = updated.y2 - updated.y1;
          updated.cx = midX - dy * 0.22;
          updated.cy = midY + dx * 0.22;
        }
      }
      if (patch.textVariant !== undefined && updated.type === 'text') {
        updated.variant = patch.textVariant;
        if (patch.textVariant === 'callout' && updated.tailX === undefined) {
          updated.tailX = updated.x - 24;
          updated.tailY = updated.y + 44;
        }
      }
      if (patch.fontSize !== undefined && updated.type === 'text') {
        updated.fontSize = patch.fontSize;
      }
      if (patch.mosaicMode !== undefined && updated.type === 'mosaic') {
        updated.mode = patch.mosaicMode;
      }
      if (patch.mosaicBlockSize !== undefined && updated.type === 'mosaic') {
        updated.blockSize = patch.mosaicBlockSize;
      }
      if (patch.spotlightShape !== undefined && updated.type === 'spotlight') {
        updated.shape = patch.spotlightShape;
      }
      updateAnnotation(updated);
    },
    [selectedId, updateAnnotation]
  );

  return {
    doc,
    docId,
    docTitle,
    setDocTitle,
    tool,
    setTool,
    style,
    setStyle,
    updateSelectedStyle,
    selectedId,
    setSelectedId,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    historyMeta,
    isHistoryLoaded,
    loadNewDocument,
    restoreHistoryItem,
    deleteHistoryItem,
    clearHistory,
    persistCurrentToHistory,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    clearAnnotations,
    addCutout,
    clearCutouts,
    setCropRect,
    replaceBaseImage,
    updateFrameConfig,
    updateSpotlightConfig,
    resetStepNumber,
    undo,
    redo,
    clearDocument,
  };
}
