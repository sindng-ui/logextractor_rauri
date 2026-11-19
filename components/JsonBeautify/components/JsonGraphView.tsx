import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Download, PlusCircle, MoveHorizontal } from 'lucide-react';
import { GraphCardNode, GraphCardProperty, GraphScenePayload } from '../../../types/jsonBeautify';
import {
  GRAPH_FOOTER_HEIGHT,
  GRAPH_HEADER_HEIGHT,
  GRAPH_PROPS_TOP_PAD,
  GRAPH_ROW_HEIGHT,
  GraphViewport,
  renderGraphCanvas,
} from '../../../utils/jsonGraphLayout';
import JsonGraphTooltip from './JsonGraphTooltip';

interface JsonGraphViewProps {
  scene: GraphScenePayload | null;
  expandedIds: number[];
  extraArrayLimits: Record<number, number>;
  expandedPropCardIds: number[];
  selectedNodeId: number | null;
  onSelectNode: (nodeId: number) => void;
  onRequestGraph: (payload: {
    expandedIds?: number[];
    extraArrayLimits?: Record<number, number>;
    expandedPropCardIds?: number[];
    wideCards?: boolean;
    autoInit?: boolean;
    focusNodeId?: number | null;
  }) => void;
  onExportMessage?: (msg: string) => void;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 2.5;
const WIDE_CARDS_STORAGE_KEY = 'happytool_json_graph_wide_cards';

const JsonGraphView: React.FC<JsonGraphViewProps> = ({
  scene,
  expandedIds,
  extraArrayLimits,
  expandedPropCardIds,
  selectedNodeId,
  onSelectNode,
  onRequestGraph,
  onExportMessage,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);

  const [wideCards, setWideCards] = useState<boolean>(() => {
    try {
      return localStorage.getItem(WIDE_CARDS_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [viewport, setViewport] = useState<GraphViewport>({ offsetX: 40, offsetY: 40, scale: 0.9 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  const [hoveredPropInfo, setHoveredPropInfo] = useState<{
    nodeId: number;
    cardKey: string;
    propIndex: number;
    prop: GraphCardProperty;
    x: number;
    y: number;
  } | null>(null);
  const [hoveredFooterNodeId, setHoveredFooterNodeId] = useState<number | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const didAutoFitRef = useRef(false);
  const pendingAnchorRef = useRef<{ nodeId: number; screenX: number; screenY: number } | null>(null);

  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number; moved: boolean }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    moved: false,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCanvasSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitToScreen = useCallback(
    (targetScene?: GraphScenePayload | null) => {
      const s = targetScene ?? scene;
      if (!s || s.nodes.length === 0) return;
      const { width, height } = canvasSize;
      const scaleX = (width - 60) / Math.max(1, s.bounds.width);
      const scaleY = (height - 60) / Math.max(1, s.bounds.height);
      const nextScale = Math.max(0.25, Math.min(1.05, Math.min(scaleX, scaleY)));
      const centerX = s.bounds.minX + s.bounds.width / 2;
      const centerY = s.bounds.minY + s.bounds.height / 2;
      const nextVp: GraphViewport = {
        scale: nextScale,
        offsetX: width / 2 - centerX * nextScale,
        offsetY: height / 2 - centerY * nextScale,
      };
      viewportRef.current = nextVp;
      setViewport(nextVp);
    },
    [scene, canvasSize]
  );

  // Auto-fit once on initial scene, or preserve clicked anchor node screen position with zero-flicker
  useLayoutEffect(() => {
    if (!scene || scene.nodes.length === 0) {
      didAutoFitRef.current = false;
      pendingAnchorRef.current = null;
      return;
    }

    if (pendingAnchorRef.current) {
      const anchor = pendingAnchorRef.current;
      pendingAnchorRef.current = null;
      const updatedNode = scene.nodes.find((n) => n.id === anchor.nodeId);
      if (updatedNode) {
        const curScale = viewportRef.current.scale;
        const nextViewport: GraphViewport = {
          scale: curScale,
          offsetX: anchor.screenX - updatedNode.x * curScale,
          offsetY: anchor.screenY - updatedNode.y * curScale,
        };
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
        return;
      }
    }

    if (!didAutoFitRef.current) {
      didAutoFitRef.current = true;
      fitToScreen(scene);
    }
  }, [scene, fitToScreen]);

  const ancestorPathSet = useMemo(() => {
    const set = new Set<number>();
    if (!scene || selectedNodeId === null) return set;
    const map = new Map<number, GraphCardNode>();
    for (const n of scene.nodes) map.set(n.id, n);
    let cur = map.get(selectedNodeId);
    while (cur) {
      set.add(cur.id);
      cur = cur.parentId >= 0 ? map.get(cur.parentId) : undefined;
    }
    return set;
  }, [scene, selectedNodeId]);

  const activeHoveredPropIndex = hoveredPropInfo?.propIndex ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;

    const rafId = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(canvasSize.width * dpr);
      canvas.height = Math.floor(canvasSize.height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderGraphCanvas(
        ctx,
        canvasSize.width,
        canvasSize.height,
        scene,
        viewportRef.current,
        selectedNodeId,
        hoveredNodeId,
        ancestorPathSet,
        activeHoveredPropIndex,
        hoveredFooterNodeId
      );
    });

    return () => cancelAnimationFrame(rafId);
  }, [scene, viewport, canvasSize, selectedNodeId, hoveredNodeId, ancestorPathSet, activeHoveredPropIndex, hoveredFooterNodeId]);

  useEffect(() => {
    const mm = minimapRef.current;
    if (!mm || !scene || scene.nodes.length === 0) return;
    const ctx = mm.getContext('2d');
    if (!ctx) return;

    const mw = 176;
    const mh = 112;
    const dpr = window.devicePixelRatio || 1;
    mm.width = mw * dpr;
    mm.height = mh * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, mw, mh);

    const scaleX = (mw - 12) / Math.max(1, scene.bounds.width);
    const scaleY = (mh - 12) / Math.max(1, scene.bounds.height);
    const s = Math.min(scaleX, scaleY);
    const ox = (mw - scene.bounds.width * s) / 2 - scene.bounds.minX * s;
    const oy = (mh - scene.bounds.height * s) / 2 - scene.bounds.minY * s;

    for (const n of scene.nodes) {
      ctx.fillStyle = n.id === selectedNodeId ? '#818cf8' : n.isMoreStub ? '#38bdf8' : '#334155';
      ctx.fillRect(n.x * s + ox, n.y * s + oy, Math.max(2, n.width * s), Math.max(2, n.height * s));
    }

    const vx = (-viewport.offsetX / viewport.scale) * s + ox;
    const vy = (-viewport.offsetY / viewport.scale) * s + oy;
    const vw = (canvasSize.width / viewport.scale) * s;
    const vh = (canvasSize.height / viewport.scale) * s;
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, vw, vh);
  }, [scene, viewport, canvasSize, selectedNodeId]);

  const hitTest = useCallback(
    (
      clientX: number,
      clientY: number
    ): {
      node: GraphCardNode | null;
      onToggleBtn: boolean;
      onPropsFooter: boolean;
      propIndex: number | null;
      sx: number;
      sy: number;
    } => {
      if (!scene || !canvasRef.current) {
        return { node: null, onToggleBtn: false, onPropsFooter: false, propIndex: null, sx: 0, sy: 0 };
      }
      const rect = canvasRef.current.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const wx = (sx - viewportRef.current.offsetX) / viewportRef.current.scale;
      const wy = (sy - viewportRef.current.offsetY) / viewportRef.current.scale;

      for (let i = scene.nodes.length - 1; i >= 0; i--) {
        const n = scene.nodes[i];
        if (wx >= n.x && wx <= n.x + n.width && wy >= n.y && wy <= n.y + n.height) {
          const btnX = n.x + n.width - 15;
          const btnY = n.y + GRAPH_HEADER_HEIGHT / 2;
          const onToggleBtn = n.hasContainerChildren && Math.hypot(wx - btnX, wy - btnY) <= 13;

          const hasFooter = !n.isMoreStub && (n.extraPropertyCount > 0 || Boolean(n.isPropsExpanded));
          const onPropsFooter = hasFooter && wy >= n.y + n.height - GRAPH_FOOTER_HEIGHT;

          let propIndex: number | null = null;
          if (!n.isMoreStub && !onToggleBtn && !onPropsFooter && n.properties.length > 0) {
            const propsStart = n.y + GRAPH_HEADER_HEIGHT + GRAPH_PROPS_TOP_PAD;
            const relY = wy - propsStart;
            if (relY >= 0) {
              const idx = Math.floor(relY / GRAPH_ROW_HEIGHT);
              if (idx >= 0 && idx < n.properties.length) {
                propIndex = idx;
              }
            }
          }

          return { node: n, onToggleBtn, onPropsFooter, propIndex, sx, sy };
        }
      }
      return { node: null, onToggleBtn: false, onPropsFooter: false, propIndex: null, sx, sy };
    },
    [scene]
  );

  const captureAnchor = useCallback(
    (anchorNodeId: number) => {
      if (!scene) return;
      const target = scene.nodes.find((n) => n.id === anchorNodeId);
      if (!target) return;
      const vp = viewportRef.current;
      pendingAnchorRef.current = {
        nodeId: anchorNodeId,
        screenX: target.x * vp.scale + vp.offsetX,
        screenY: target.y * vp.scale + vp.offsetY,
      };
    },
    [scene]
  );

  const toggleGraphBranch = useCallback(
    (nodeId: number) => {
      captureAnchor(nodeId);
      const next = new Set(expandedIds);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      onRequestGraph({
        expandedIds: Array.from(next),
        extraArrayLimits,
        expandedPropCardIds,
        wideCards,
      });
    },
    [captureAnchor, expandedIds, extraArrayLimits, expandedPropCardIds, wideCards, onRequestGraph]
  );

  const toggleCardPropsExpand = useCallback(
    (nodeId: number) => {
      captureAnchor(nodeId);
      const next = new Set(expandedPropCardIds);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      onRequestGraph({
        expandedIds,
        extraArrayLimits,
        expandedPropCardIds: Array.from(next),
        wideCards,
      });
    },
    [captureAnchor, expandedIds, extraArrayLimits, expandedPropCardIds, wideCards, onRequestGraph]
  );

  const handleToggleWideCards = () => {
    const nextWide = !wideCards;
    setWideCards(nextWide);
    try {
      localStorage.setItem(WIDE_CARDS_STORAGE_KEY, String(nextWide));
    } catch {
      // ignore
    }
    if (selectedNodeId !== null) captureAnchor(selectedNodeId);
    else if (scene?.nodes[0]) captureAnchor(scene.nodes[0].id);

    onRequestGraph({
      expandedIds,
      extraArrayLimits,
      expandedPropCardIds,
      wideCards: nextWide,
    });
  };

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;

    setViewport((prev) => {
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));
      const ratio = nextScale / prev.scale;
      return {
        scale: nextScale,
        offsetX: mx - (mx - prev.offsetX) * ratio,
        offsetY: my - (my - prev.offsetY) * ratio,
      };
    });
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    setHoveredPropInfo(null);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: viewport.offsetX,
      origY: viewport.offsetY,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
      setViewport((prev) => ({
        ...prev,
        offsetX: dragRef.current.origX + dx,
        offsetY: dragRef.current.origY + dy,
      }));
      return;
    }

    const hit = hitTest(e.clientX, e.clientY);
    setHoveredNodeId(hit.node ? hit.node.id : null);
    setHoveredFooterNodeId(hit.node && hit.onPropsFooter ? hit.node.id : null);

    if (hit.node && hit.propIndex !== null && viewportRef.current.scale >= 0.35) {
      const prop = hit.node.properties[hit.propIndex];
      if (prop) {
        setHoveredPropInfo({
          nodeId: hit.node.id,
          cardKey: hit.node.key,
          propIndex: hit.propIndex,
          prop,
          x: hit.sx,
          y: hit.sy,
        });
        return;
      }
    }
    setHoveredPropInfo(null);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasDrag = dragRef.current.moved;
    dragRef.current.active = false;
    if (wasDrag) return;

    const hit = hitTest(e.clientX, e.clientY);
    if (!hit.node) return;

    if (hit.node.isMoreStub && hit.node.stubParentId !== undefined) {
      const pid = hit.node.stubParentId;
      captureAnchor(pid);
      const curLim = extraArrayLimits[pid] || 25;
      onRequestGraph({
        expandedIds,
        extraArrayLimits: { ...extraArrayLimits, [pid]: curLim + 25 },
        expandedPropCardIds,
        wideCards,
      });
      return;
    }

    if (hit.onPropsFooter) {
      toggleCardPropsExpand(hit.node.id);
      return;
    }

    onSelectNode(hit.node.id);
    if (hit.onToggleBtn) {
      toggleGraphBranch(hit.node.id);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit.node && !hit.node.isMoreStub && !hit.onPropsFooter && hit.node.hasContainerChildren) {
      toggleGraphBranch(hit.node.id);
    }
  };

  const handleMinimapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!scene || !minimapRef.current) return;
    const rect = minimapRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const mw = 176;
    const mh = 112;
    const s = Math.min((mw - 12) / Math.max(1, scene.bounds.width), (mh - 12) / Math.max(1, scene.bounds.height));
    const ox = (mw - scene.bounds.width * s) / 2 - scene.bounds.minX * s;
    const oy = (mh - scene.bounds.height * s) / 2 - scene.bounds.minY * s;
    const worldX = (mx - ox) / s;
    const worldY = (my - oy) / s;
    setViewport((prev) => ({
      ...prev,
      offsetX: canvasSize.width / 2 - worldX * prev.scale,
      offsetY: canvasSize.height / 2 - worldY * prev.scale,
    }));
  };

  const handleExpandOneLevel = () => {
    if (!scene) return;
    const next = new Set(expandedIds);
    for (const n of scene.nodes) {
      if (!n.isMoreStub && n.hasContainerChildren && !n.isExpanded) {
        next.add(n.id);
      }
    }
    onRequestGraph({ expandedIds: Array.from(next), extraArrayLimits, expandedPropCardIds, wideCards });
  };

  const handleExportPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const defaultName = `json_graph_${Date.now()}.png`;

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;

    // 1) Tauri native save dialog — returns exact saved OS file path
    if (window.electronAPI?.saveBinaryFile) {
      try {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const res = await window.electronAPI.saveBinaryFile(bytes, {
          defaultName,
          filterName: 'PNG Image',
          extensions: ['png'],
        });
        if (res?.status === 'canceled') return;
        if (res?.status === 'success' && res.filePath) {
          onExportMessage?.(`PNG saved: ${res.filePath}`);
          return;
        }
      } catch {
        // fallback below
      }
    }

    // 2) Browser File System Access API (Chrome/Edge)
    const anyWin = window as any;
    if (typeof anyWin.showSaveFilePicker === 'function') {
      try {
        const handle = await anyWin.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        onExportMessage?.(`PNG saved: ${handle.name || defaultName}`);
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    // 3) Standard browser download fallback with explicit destination hint
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onExportMessage?.(`PNG downloaded: ${defaultName} (Browser Downloads folder)`);
  };

  return (
    <div ref={containerRef} className="flex-1 relative min-h-0 min-w-0 bg-[#090d16] overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        style={{ width: canvasSize.width, height: canvasSize.height }}
        className={`block ${hoveredNodeId !== null ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          dragRef.current.active = false;
          setHoveredNodeId(null);
          setHoveredPropInfo(null);
          setHoveredFooterNodeId(null);
        }}
        onDoubleClick={handleDoubleClick}
      />

      {/* Hover Smart Tooltip for Truncated / Rich Values */}
      {hoveredPropInfo && !dragRef.current.active && (
        <JsonGraphTooltip
          prop={hoveredPropInfo.prop}
          cardKey={hoveredPropInfo.cardKey}
          x={hoveredPropInfo.x}
          y={hoveredPropInfo.y}
          containerWidth={canvasSize.width}
          containerHeight={canvasSize.height}
        />
      )}

      {/* Top-Left Floating Toolbar (Zero-Blur Solid Dark) */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-slate-900/95 border border-slate-700/80 rounded-xl p-1.5 shadow-xl">
        <button
          onClick={() => setViewport((p) => ({ ...p, scale: Math.min(MAX_SCALE, p.scale * 1.2) }))}
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
          title="Zoom In"
        >
          <ZoomIn size={14} />
        </button>
        <span className="text-[11px] font-mono text-slate-300 w-11 text-center">
          {Math.round(viewport.scale * 100)}%
        </span>
        <button
          onClick={() => setViewport((p) => ({ ...p, scale: Math.max(MIN_SCALE, p.scale * 0.82) }))}
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
          title="Zoom Out"
        >
          <ZoomOut size={14} />
        </button>
        <div className="w-px h-4 bg-slate-700 mx-0.5" />
        <button
          onClick={() => fitToScreen()}
          className="px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-1"
          title="Fit Graph to Screen"
        >
          <Maximize2 size={12} /> Fit
        </button>
        <button
          onClick={handleToggleWideCards}
          className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors ${
            wideCards
              ? 'bg-indigo-600/35 text-indigo-200 border border-indigo-400/40'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
          title="Toggle Compact / Wide Adaptive Cards"
        >
          <MoveHorizontal size={12} /> {wideCards ? 'Wide' : 'Compact'}
        </button>
        <button
          onClick={handleExpandOneLevel}
          className="px-2 py-1 rounded-lg text-[11px] font-semibold text-indigo-300 hover:text-white hover:bg-indigo-600/40 flex items-center gap-1"
          title="Expand Visible Leaf Containers (+1 Level)"
        >
          <PlusCircle size={12} /> +1 Level
        </button>
        <button
          onClick={() => {
            didAutoFitRef.current = false;
            onRequestGraph({ autoInit: true, wideCards });
          }}
          className="px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-1"
          title="Reset Auto Layout"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <div className="w-px h-4 bg-slate-700 mx-0.5" />
        <button
          onClick={handleExportPng}
          className="px-2 py-1 rounded-lg text-[11px] font-semibold text-emerald-300 hover:text-white hover:bg-emerald-600/40 flex items-center gap-1"
          title="Download Graph as PNG"
        >
          <Download size={12} /> PNG
        </button>
      </div>

      {/* Top-Right Graph Info Pill */}
      {scene && (
        <div className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-slate-900/95 border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center gap-2">
          <span>
            <strong className="text-slate-100">{scene.renderedNodeCount}</strong> cards rendered
          </span>
          {scene.truncatedByLimit && (
            <span className="text-amber-400 font-semibold">(600 card safety cap)</span>
          )}
        </div>
      )}

      {/* Bottom-Right Interactive Minimap */}
      {scene && scene.nodes.length > 0 && (
        <div className="absolute bottom-3 right-3 rounded-xl overflow-hidden border border-slate-700/90 bg-[#0b1120] shadow-2xl">
          <canvas
            ref={minimapRef}
            style={{ width: 176, height: 112 }}
            onClick={handleMinimapClick}
            className="block cursor-crosshair"
            title="Click minimap to jump camera"
          />
        </div>
      )}

      {/* Bottom-Left Hint */}
      <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[10.5px] text-slate-400">
        Hover property for full preview • Drag to Pan • Scroll to Zoom • Click +/− to Toggle
      </div>
    </div>
  );
};

export default React.memo(JsonGraphView);
