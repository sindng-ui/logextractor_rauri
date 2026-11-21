import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { isTauriEnvironment } from '../../utils/tauriBridge';
import {
  AnnotatorTool,
  OverlayImageAnnotation,
  StitchMode,
} from '../../types/screenshotAnnotator';
import { cloneAnnotation, computeDocumentLayout, translateAnnotation } from '../../utils/annotatorGeometry';
import { clearAnnotatorRenderCaches } from '../../utils/annotatorCanvasRenderer';
import {
  blobToDataUrl,
  canvasToBlob,
  createSampleScreenshotDataUrl,
  loadImageElement,
  renderDocumentToExportCanvas,
  rgbaToDataUrl,
  stitchImages,
} from '../../utils/annotatorImageOps';
import { generateUUID } from '../../utils/uuid';
import { useAnnotatorState } from './hooks/useAnnotatorState';
import { useAnnotatorCanvasInteraction } from './hooks/useAnnotatorCanvasInteraction';
import { useAnnotatorSdbCapture } from './hooks/useAnnotatorSdbCapture';
import AnnotatorHeader from './components/AnnotatorHeader';
import AnnotatorToolRail from './components/AnnotatorToolRail';
import AnnotatorStyleBar from './components/AnnotatorStyleBar';
import AnnotatorCanvasStage from './components/AnnotatorCanvasStage';
import AnnotatorEmptyState from './components/AnnotatorEmptyState';
import AnnotatorFramePopover from './components/AnnotatorFramePopover';
import AnnotatorSdbPopover from './components/AnnotatorSdbPopover';
import AnnotatorStitchModal from './components/AnnotatorStitchModal';
import AnnotatorHistoryDrawer from './components/AnnotatorHistoryDrawer';

interface ScreenshotAnnotatorProps {
  isActive?: boolean;
  onOpenApps?: () => void;
  onAppReady?: () => void;
}

const TOOL_KEY_MAP: Record<string, AnnotatorTool> = {
  KeyV: 'select',
  Digit1: 'rect',
  Digit2: 'ellipse',
  Digit3: 'arrow',
  Digit4: 'step',
  Digit5: 'text',
  Digit6: 'highlighter',
  Digit7: 'mosaic',
  Digit8: 'freehand',
  KeyS: 'spotlight',
  KeyX: 'cutout',
  KeyC: 'crop',
};

const ScreenshotAnnotator: React.FC<ScreenshotAnnotatorProps> = ({
  isActive = true,
  onOpenApps,
  onAppReady,
}) => {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const baseImgRef = useRef<HTMLImageElement | null>(null);
  const overlayCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [baseImgVersion, setBaseImgVersion] = useState(0);

  const [isFrameOpen, setIsFrameOpen] = useState(false);
  const [isSdbPopoverOpen, setIsSdbPopoverOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [pendingIncoming, setPendingIncoming] = useState<{
    dataUrl: string;
    width: number;
    height: number;
    title?: string;
  } | null>(null);

  const state = useAnnotatorState(baseImgRef, overlayCacheRef);
  const { doc } = state;

  // Signal curtain reveal once recent history metadata finishes hydrating
  const readyNotifiedRef = useRef(false);
  useEffect(() => {
    if (readyNotifiedRef.current || !onAppReady || !state.isHistoryLoaded) return;
    readyNotifiedRef.current = true;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => onAppReady());
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [state.isHistoryLoaded, onAppReady]);

  // Decode base image whenever doc.baseDataUrl changes
  useEffect(() => {
    if (!doc?.baseDataUrl) {
      baseImgRef.current = null;
      clearAnnotatorRenderCaches();
      setBaseImgVersion((v) => v + 1);
      return;
    }
    let cancelled = false;
    loadImageElement(doc.baseDataUrl)
      .then((img) => {
        if (!cancelled) {
          baseImgRef.current = img;
          setBaseImgVersion((v) => v + 1);
        }
      })
      .catch((err) => {
        console.error('[SnapStudio] Failed to decode base image:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [doc?.baseDataUrl]);

  // Decode any overlay sticker images lazily into overlayCacheRef
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const overlays = doc.annotations.filter(
      (a): a is OverlayImageAnnotation => a.type === 'overlayImage'
    );
    for (const ov of overlays) {
      if (!overlayCacheRef.current.has(ov.dataUrl)) {
        loadImageElement(ov.dataUrl)
          .then((img) => {
            if (!cancelled) {
              overlayCacheRef.current.set(ov.dataUrl, img);
              setBaseImgVersion((v) => v + 1);
            }
          })
          .catch(() => {});
      }
    }
    return () => {
      cancelled = true;
    };
  }, [doc]);

  // Cleanup GPU scratch/frame caches on unmount
  useEffect(() => {
    return () => {
      clearAnnotatorRenderCaches();
      overlayCacheRef.current.clear();
    };
  }, []);

  const interaction = useAnnotatorCanvasInteraction({
    isActive,
    doc,
    baseImgRef,
    overlayCacheRef,
    baseImgVersion,
    tool: state.tool,
    style: state.style,
    selectedId: state.selectedId,
    setSelectedId: state.setSelectedId,
    setTool: state.setTool,
    onAddAnnotation: state.addAnnotation,
    onUpdateAnnotation: state.updateAnnotation,
    onAddCutout: state.addCutout,
    onSetCropRect: state.setCropRect,
  });

  const handleIncomingImage = useCallback(
    async (dataUrl: string, title?: string) => {
      try {
        const img = await loadImageElement(dataUrl);
        if (!doc) {
          await state.loadNewDocument(dataUrl, img.naturalWidth, img.naturalHeight, title);
          addToast(`Loaded ${img.naturalWidth}×${img.naturalHeight} capture`, 'success');
        } else {
          setPendingIncoming({
            dataUrl,
            width: img.naturalWidth,
            height: img.naturalHeight,
            title,
          });
        }
      } catch {
        addToast('Failed to load image', 'error');
      }
    },
    [doc, state, addToast]
  );

  const handleSdbCaptured = useCallback(
    async (dataUrl: string, title: string, forceReplace: boolean) => {
      if (!doc || forceReplace) {
        try {
          const img = await loadImageElement(dataUrl);
          await state.loadNewDocument(dataUrl, img.naturalWidth, img.naturalHeight, title);
          addToast(`Captured ${img.naturalWidth}×${img.naturalHeight} (${title})`, 'success');
        } catch {
          addToast('Failed to decode captured SDB screenshot', 'error');
        }
        return;
      }
      await handleIncomingImage(dataUrl, title);
    },
    [doc, state, addToast, handleIncomingImage]
  );

  const handleSdbError = useCallback(() => {
    setIsSdbPopoverOpen(true);
  }, []);

  const sdbCapture = useAnnotatorSdbCapture({
    onCaptured: handleSdbCaptured,
    addToast,
    onCaptureError: handleSdbError,
  });

  const isSdbAvailable =
    isTauriEnvironment() || typeof window.electronAPI?.captureSdbScreen === 'function';

  const sdbTargetLabel = useMemo(() => {
    if (sdbCapture.settings.deviceId.trim()) return sdbCapture.settings.deviceId.trim();
    if (sdbCapture.settings.autoConnectIp.trim()) return sdbCapture.settings.autoConnectIp.trim();
    return 'Auto-detect';
  }, [sdbCapture.settings.deviceId, sdbCapture.settings.autoConnectIp]);

  const handleStitchChoice = useCallback(
    async (mode: StitchMode) => {
      const incoming = pendingIncoming;
      setPendingIncoming(null);
      if (!incoming) return;

      if (mode === 'replace' || !doc || !baseImgRef.current) {
        await state.loadNewDocument(incoming.dataUrl, incoming.width, incoming.height, incoming.title);
        addToast('Replaced canvas (previous work saved to History)', 'info');
        return;
      }

      if (mode === 'overlay') {
        const maxW = Math.min(incoming.width, Math.round(doc.width * 0.55));
        const scale = maxW / Math.max(1, incoming.width);
        const w = Math.max(40, Math.round(incoming.width * scale));
        const h = Math.max(40, Math.round(incoming.height * scale));
        const overlay: OverlayImageAnnotation = {
          id: generateUUID(),
          type: 'overlayImage',
          x: Math.round((doc.width - w) / 2),
          y: Math.round((doc.height - h) / 2),
          w,
          h,
          dataUrl: incoming.dataUrl,
          color: '#ffffff',
          strokeWidth: 1,
        };
        state.addAnnotation(overlay);
        state.setTool('select');
        addToast('Added as movable overlay sticker', 'success');
        return;
      }

      try {
        const incImg = await loadImageElement(incoming.dataUrl);
        const stitched = stitchImages(baseImgRef.current, incImg, mode);
        state.replaceBaseImage(stitched.dataUrl, stitched.width, stitched.height);
        addToast(
          mode === 'right'
            ? `Stitched side-by-side (${stitched.width}×${stitched.height})`
            : `Stitched vertically (${stitched.width}×${stitched.height})`,
          'success'
        );
      } catch {
        addToast('Failed to stitch images', 'error');
      }
    },
    [pendingIncoming, doc, state, addToast]
  );

  const handlePasteFromClipboard = useCallback(async () => {
    // 1. Tauri Native arboard zero-copy RGBA read (fastest & permission-free)
    if (window.electronAPI?.readImageFromClipboard) {
      try {
        const nativeImg = await window.electronAPI.readImageFromClipboard();
        if (nativeImg) {
          const dataUrl = rgbaToDataUrl(nativeImg.width, nativeImg.height, nativeImg.rgba);
          await handleIncomingImage(dataUrl);
          return;
        }
      } catch (err) {
        console.warn('[SnapStudio] Native clipboard read failed, trying web fallback:', err);
      }
    }

    // 2. Web Clipboard API fallback
    if (navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            const dataUrl = await blobToDataUrl(blob);
            await handleIncomingImage(dataUrl);
            return;
          }
        }
      } catch {
        // permission denied or unsupported
      }
    }

    addToast('No image found in clipboard. Capture with Win+Shift+S first!', 'warning');
  }, [handleIncomingImage, addToast]);

  const handleCopyImage = useCallback(async () => {
    if (!doc || !baseImgRef.current) return;
    try {
      const exportCanvas = renderDocumentToExportCanvas(doc, baseImgRef.current, overlayCacheRef.current);

      // 1. Tauri Native zero-copy RGBA clipboard write
      if (window.electronAPI?.copyImageToClipboard) {
        const ctx = exportCanvas.getContext('2d');
        if (ctx) {
          const imgData = ctx.getImageData(0, 0, exportCanvas.width, exportCanvas.height);
          const res = await window.electronAPI.copyImageToClipboard(
            exportCanvas.width,
            exportCanvas.height,
            imgData.data
          );
          if (res?.status === 'success') {
            addToast(`Copied ${exportCanvas.width}×${exportCanvas.height} to clipboard!`, 'success');
            state.persistCurrentToHistory();
            return;
          }
        }
      }

      // 2. Browser ClipboardItem PNG fallback
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        const blob = await canvasToBlob(exportCanvas, 'image/png');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        addToast(`Copied ${exportCanvas.width}×${exportCanvas.height} to clipboard!`, 'success');
        state.persistCurrentToHistory();
        return;
      }

      addToast('Clipboard image write is not supported in this browser context', 'error');
    } catch (err) {
      console.error('[SnapStudio] Copy failed:', err);
      addToast('Failed to copy image to clipboard', 'error');
    }
  }, [doc, addToast, state]);

  const handleSaveImage = useCallback(async () => {
    if (!doc || !baseImgRef.current) return;
    try {
      const exportCanvas = renderDocumentToExportCanvas(doc, baseImgRef.current, overlayCacheRef.current);
      const blob = await canvasToBlob(exportCanvas, 'image/png');
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const defaultName = `snap_${stamp}.png`;

      if (window.electronAPI?.saveBinaryFile) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const res = await window.electronAPI.saveBinaryFile(bytes, {
          defaultName,
          filterName: 'PNG Image',
          extensions: ['png'],
        });
        if (res.status === 'success') {
          addToast('Saved PNG image', 'success');
        }
        return;
      }

      // Browser download fallback
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast(`Downloaded ${defaultName}`, 'success');
    } catch {
      addToast('Failed to save PNG image', 'error');
    }
  }, [doc, addToast]);

  const handleLoadSample = useCallback(async () => {
    const sample = createSampleScreenshotDataUrl();
    await state.loadNewDocument(sample.dataUrl, sample.width, sample.height, 'Edge Hub Diagnostics Sample');
    addToast('Sample screenshot loaded — try Arrow (3), Step (4), Mosaic (7), Spotlight (S)!', 'info');
  }, [state, addToast]);

  const handleFileSelected = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        addToast('Please drop or select an image file (PNG/JPG/WebP)', 'warning');
        return;
      }
      const dataUrl = await blobToDataUrl(file);
      await handleIncomingImage(dataUrl, file.name.replace(/\.[^.]+$/, ''));
    },
    [handleIncomingImage, addToast]
  );

  // Global paste listener (active only when Snap Studio is visible)
  useEffect(() => {
    if (!isActive) return;
    const onPaste = async (e: ClipboardEvent) => {
      if (interaction.editingText) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile();
            if (file) {
              e.preventDefault();
              const dataUrl = await blobToDataUrl(file);
              await handleIncomingImage(dataUrl);
              return;
            }
          }
        }
      }
      // Fallback to native arboard reader (handles Windows Snipping Tool DIB formats reliably)
      e.preventDefault();
      await handlePasteFromClipboard();
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [isActive, interaction.editingText, handleIncomingImage, handlePasteFromClipboard]);

  // Tauri native OS image drag-and-drop support (active only when Snap Studio is visible)
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const handleIncomingRef = useRef(handleIncomingImage);
  handleIncomingRef.current = handleIncomingImage;

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    const MIME_BY_EXT: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      bmp: 'image/bmp',
    };

    import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent(async (event) => {
          if (cancelled || !isActiveRef.current) return;
          const payload = event.payload;
          if (payload.type === 'enter' || payload.type === 'over') {
            setIsDraggingFile(true);
            return;
          }
          if (payload.type === 'leave') {
            setIsDraggingFile(false);
            return;
          }
          if (payload.type === 'drop') {
            setIsDraggingFile(false);
            const path = payload.paths?.[0];
            if (!path || !window.electronAPI?.getFileSize || !window.electronAPI?.readFileSegment) return;
            const ext = path.split('.').pop()?.toLowerCase() ?? '';
            const mime = MIME_BY_EXT[ext];
            if (!mime) {
              addToast('Unsupported file type. Drop PNG/JPG/WebP/BMP image.', 'warning');
              return;
            }
            try {
              const size = await window.electronAPI.getFileSize(path);
              if (size <= 0 || size > 32 * 1024 * 1024) {
                addToast('Image file is empty or exceeds 32MB limit', 'warning');
                return;
              }
              const bytes = await window.electronAPI.readFileSegment({ path, start: 0, end: size });
              const dataUrl = await blobToDataUrl(new Blob([bytes.buffer as ArrayBuffer], { type: mime }));
              const fileName = path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'Dropped Image';
              await handleIncomingRef.current(dataUrl, fileName);
            } catch {
              addToast('Failed to load dropped image file', 'error');
            }
          }
        })
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  }, [addToast]);

  // Global keyboard shortcuts (IME-safe via e.code, active only when isActive)
  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (pendingIncoming || interaction.editingText) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.altKey) {
        if (e.code === 'KeyZ') {
          e.preventDefault();
          if (e.shiftKey) state.redo();
          else state.undo();
          return;
        }
        if (e.code === 'KeyY') {
          e.preventDefault();
          state.redo();
          return;
        }
        if (e.code === 'KeyC' && doc) {
          e.preventDefault();
          handleCopyImage();
          return;
        }
        if (e.code === 'KeyS' && doc) {
          e.preventDefault();
          handleSaveImage();
          return;
        }
        if (e.code === 'KeyD' && e.shiftKey && isSdbAvailable) {
          e.preventDefault();
          sdbCapture.triggerCapture();
          return;
        }
        if (e.code === 'KeyD' && !e.shiftKey && doc && state.selectedId) {
          e.preventDefault();
          const target = doc.annotations.find((a) => a.id === state.selectedId);
          if (target) {
            const cloned = translateAnnotation(
              cloneAnnotation(target, generateUUID(), doc.nextStepNumber),
              18,
              18
            );
            state.addAnnotation(cloned);
            state.setSelectedId(cloned.id);
          }
          return;
        }
        if (e.code === 'Digit0' && doc) {
          e.preventDefault();
          interaction.fitToViewport();
          return;
        }
        return;
      }

      if (e.altKey) return;

      if (e.key === 'Escape') {
        if (isSdbPopoverOpen) setIsSdbPopoverOpen(false);
        else if (isFrameOpen) setIsFrameOpen(false);
        else if (state.selectedId) state.setSelectedId(null);
        else state.setTool('select');
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
        e.preventDefault();
        state.deleteAnnotation(state.selectedId);
        return;
      }

      if (!doc) return;
      const mappedTool = TOOL_KEY_MAP[e.code];
      if (mappedTool) {
        e.preventDefault();
        state.setTool(mappedTool);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isActive,
    pendingIncoming,
    interaction,
    state,
    doc,
    isFrameOpen,
    isSdbPopoverOpen,
    isSdbAvailable,
    sdbCapture,
    handleCopyImage,
    handleSaveImage,
  ]);

  const layoutDimensionsLabel = useMemo(() => {
    if (!doc) return '';
    const layout = computeDocumentLayout(doc);
    return `${layout.outputWidth} × ${layout.outputHeight}`;
  }, [doc]);

  const selectedAnnotation = useMemo(() => {
    if (!doc || !state.selectedId) return null;
    return doc.annotations.find((a) => a.id === state.selectedId) ?? null;
  }, [doc, state.selectedId]);

  const effectiveTool: AnnotatorTool = interaction.isCtrlSelectHeld ? 'select' : state.tool;

  return (
    <div
      className="flex flex-col h-full w-full bg-[#080d1a] text-slate-200 relative overflow-hidden"
      onDragOver={(e) => {
        if (!isActive) return;
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDraggingFile(false);
      }}
      onDrop={async (e) => {
        if (!isActive) return;
        e.preventDefault();
        setIsDraggingFile(false);
        const file = e.dataTransfer.files?.[0];
        if (file) await handleFileSelected(file);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileSelected(f);
          e.target.value = '';
        }}
      />

      <AnnotatorHeader
        hasDocument={!!doc}
        dimensionsLabel={layoutDimensionsLabel}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        frameEnabled={!!doc?.frameConfig.enabled}
        isFrameOpen={isFrameOpen}
        isHistoryOpen={isHistoryOpen}
        historyCount={state.historyMeta.length}
        showSdbCapture={isSdbAvailable}
        isSdbPopoverOpen={isSdbPopoverOpen}
        isSdbCapturing={sdbCapture.isCapturing}
        sdbCountdownSec={sdbCapture.countdownSec}
        sdbTargetLabel={sdbTargetLabel}
        onUndo={state.undo}
        onRedo={state.redo}
        onToggleFramePopover={() => {
          setIsSdbPopoverOpen(false);
          setIsFrameOpen((v) => !v);
        }}
        onToggleHistory={() => setIsHistoryOpen((v) => !v)}
        onTriggerSdbCapture={sdbCapture.triggerCapture}
        onToggleSdbPopover={() => {
          setIsFrameOpen(false);
          setIsSdbPopoverOpen((v) => !v);
        }}
        onPasteClipboard={handlePasteFromClipboard}
        onOpenFile={() => fileInputRef.current?.click()}
        onCopyImage={handleCopyImage}
        onSaveImage={handleSaveImage}
        onClearCanvas={() => {
          setIsFrameOpen(false);
          state.clearDocument();
        }}
        onOpenApps={onOpenApps}
      />

      {doc && (
        <AnnotatorStyleBar
          tool={state.selectedId ? effectiveTool : state.tool}
          style={state.style}
          hasSelection={!!state.selectedId}
          selectedType={selectedAnnotation?.type ?? null}
          nextStepNumber={doc.nextStepNumber}
          cutoutCount={doc.cutouts.length}
          hasCrop={!!doc.cropRect}
          spotlightDimOpacity={doc.spotlightConfig.dimOpacity}
          zoomDisplay={interaction.zoomDisplay}
          onChangeStyle={state.updateSelectedStyle}
          onResetStepNumber={() => state.resetStepNumber(1)}
          onClearCutouts={state.clearCutouts}
          onResetCrop={() => state.setCropRect(null)}
          onChangeSpotlightDim={(opacity) => state.updateSpotlightConfig({ dimOpacity: opacity })}
          onDeleteSelected={() => {
            if (state.selectedId) state.deleteAnnotation(state.selectedId);
          }}
          onZoomChange={interaction.setZoomPercent}
          onFitViewport={interaction.fitToViewport}
        />
      )}

      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {doc ? (
          <>
            <AnnotatorToolRail activeTool={effectiveTool} onSelectTool={state.setTool} />
            <AnnotatorCanvasStage
              containerRef={interaction.containerRef}
              canvasRef={interaction.canvasRef}
              tool={effectiveTool}
              isSpaceHeld={interaction.isSpaceHeld}
              isDuplicateCursor={interaction.isDuplicateCursor}
              editingText={interaction.editingText}
              textColor={state.style.color}
              textFontSize={state.style.fontSize}
              imagePointToClientOffset={interaction.imagePointToClientOffset}
              onCommitText={interaction.commitInlineText}
              onCancelText={() => interaction.setEditingText(null)}
              onPointerDown={interaction.handlePointerDown}
              onPointerMove={interaction.handlePointerMove}
              onPointerUp={interaction.handlePointerUp}
              onDoubleClick={interaction.handleDoubleClick}
            />
          </>
        ) : (
          <AnnotatorEmptyState
            recentHistory={state.historyMeta}
            isDragging={isDraggingFile}
            showSdbCapture={isSdbAvailable}
            isSdbCapturing={sdbCapture.isCapturing}
            sdbCountdownSec={sdbCapture.countdownSec}
            onCaptureSdb={sdbCapture.triggerCapture}
            onPasteClipboard={handlePasteFromClipboard}
            onOpenFile={() => fileInputRef.current?.click()}
            onLoadSample={handleLoadSample}
            onRestoreHistory={async (id) => {
              const ok = await state.restoreHistoryItem(id);
              if (ok) addToast('Restored capture with vector layers', 'success');
            }}
          />
        )}

        <AnnotatorHistoryDrawer
          isOpen={isHistoryOpen}
          items={state.historyMeta}
          activeId={state.docId}
          onRestore={async (id) => {
            const ok = await state.restoreHistoryItem(id);
            if (ok) addToast('Restored capture from history', 'success');
          }}
          onDelete={state.deleteHistoryItem}
          onClearAll={async () => {
            await state.clearHistory();
            addToast('History cleared', 'info');
          }}
          onClose={() => setIsHistoryOpen(false)}
        />
      </div>

      {doc && (
        <AnnotatorFramePopover
          isOpen={isFrameOpen}
          config={doc.frameConfig}
          onChange={state.updateFrameConfig}
          onClose={() => setIsFrameOpen(false)}
        />
      )}

      {isSdbAvailable && (
        <AnnotatorSdbPopover
          isOpen={isSdbPopoverOpen}
          settings={sdbCapture.settings}
          devices={sdbCapture.devices}
          isScanning={sdbCapture.isScanning}
          isCapturing={sdbCapture.isCapturing}
          countdownSec={sdbCapture.countdownSec}
          lastError={sdbCapture.lastError}
          onUpdateSettings={sdbCapture.updateSettings}
          onRefreshDevices={sdbCapture.refreshDevices}
          onCaptureNow={sdbCapture.triggerCapture}
          onClose={() => setIsSdbPopoverOpen(false)}
        />
      )}

      <AnnotatorStitchModal
        pendingImage={pendingIncoming}
        onChoose={handleStitchChoice}
        onCancel={() => setPendingIncoming(null)}
      />

      {isDraggingFile && (
        <div className="absolute inset-0 z-50 bg-[#050814]/80 border-2 border-dashed border-rose-400 flex items-center justify-center pointer-events-none">
          <div className="px-6 py-4 rounded-2xl bg-[#0f172a] border border-rose-400/50 text-sm font-bold text-rose-200">
            Drop image to {doc ? 'stitch or replace' : 'annotate'}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreenshotAnnotator;
