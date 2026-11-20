import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Braces, History, Loader2, X } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { isTauriEnvironment } from '../../utils/tauriBridge';
import {
  clearAllSnapshotsStorage,
  deleteSnapshotRaw,
  loadSnapshotMeta,
  loadSnapshotRaw,
  MAX_JSON_SNAPSHOTS,
  MAX_PERSIST_SNAPSHOT_BYTES,
  saveSnapshotMeta,
  saveSnapshotRaw,
} from '../../utils/jsonSnapshotStorage';
import { formatByteSize } from '../../utils/jsonValueDecoders';
import {
  ColumnItem,
  JsonBeautifyViewMode,
  JsonSnapshotItem,
} from '../../types/jsonBeautify';
import { useJsonBeautifyWorker } from './hooks/useJsonBeautifyWorker';
import JsonBeautifyHeader from './components/JsonBeautifyHeader';
import JsonEmptyState from './components/JsonEmptyState';
import JsonInsightsBar from './components/JsonInsightsBar';
import JsonTreeView from './components/JsonTreeView';
import JsonGraphView from './components/JsonGraphView';
import JsonColumnView from './components/JsonColumnView';
import JsonTableView from './components/JsonTableView';
import JsonCodeView from './components/JsonCodeView';
import JsonInsightsPanel from './components/JsonInsightsPanel';
import JsonNodeInspector from './components/JsonNodeInspector';

interface JsonBeautifyProps {
  isActive?: boolean;
  onOpenApps?: () => void;
  onAppReady?: () => void;
}

const SAMPLE_JSON = JSON.stringify(
  {
    service: 'SmartThings Edge Hub',
    timestamp: 1763556300000,
    themeColor: '#6366f1',
    statusUrl: 'https://status.smartthings.example/edge',
    rawEnvelope: JSON.stringify({
      protocol: 'HAPPY-MCP',
      command: 'SYNC_CAPABILITIES',
      latencyMs: 14,
      nodes: ['living-room-tv', 'kitchen-fridge', 'air-purifier'],
    }),
    metrics: {
      uptimeSec: 849210,
      cpuLoad: 0.24,
      memoryMb: 189.4,
      healthy: true,
    },
    devices: [
      { id: 'dev-tv-01', name: 'OLED 65 TV', room: 'Living Room', status: 'online', powerW: 112.5, firmware: '2402.1', lastSeen: 1763556280 },
      { id: 'dev-ac-02', name: 'WindFree AC', room: 'Bedroom', status: 'standby', powerW: 3.1, firmware: '2311.8', lastSeen: 1763556250 },
      { id: 'dev-rf-03', name: 'Bespoke Fridge', room: 'Kitchen', status: 'online', powerW: 48.2, firmware: '2401.4', lastSeen: 1763556295 },
      { id: 'dev-ap-04', name: 'Air Purifier', room: 'Study', status: 'online', powerW: 19.7, firmware: '2310.2', lastSeen: 1763556210 },
    ],
  },
  null,
  2
);

const INSPECTOR_WIDTH_STORAGE_KEY = 'happytool_json_inspector_width';
const DEFAULT_INSPECTOR_WIDTH = 360;

const loadSavedInspectorWidth = (): number => {
  try {
    const raw = localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_INSPECTOR_WIDTH;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 260 && parsed <= 960) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_INSPECTOR_WIDTH;
};

const JsonBeautify: React.FC<JsonBeautifyProps> = ({
  isActive = true,
  onOpenApps,
  onAppReady,
}) => {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const worker = useJsonBeautifyWorker();
  const [viewMode, setViewMode] = useState<JsonBeautifyViewMode>('tree');
  const [showInspector, setShowInspector] = useState(true);
  const [inspectorWidth, setInspectorWidth] = useState<number>(loadSavedInspectorWidth);

  const handleCommitInspectorWidth = useCallback((finalWidth: number) => {
    setInspectorWidth(finalWidth);
    try {
      localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(finalWidth));
    } catch {
      // ignore storage quota errors
    }
  }, []);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingJumpNodeId, setPendingJumpNodeId] = useState<number | null>(null);
  const [selectedTableArrayId, setSelectedTableArrayId] = useState<number | null>(null);
  const [codeOptions, setCodeOptions] = useState({ indent: 2, sortKeys: false, minified: false });

  // Quick Snapshot History (last 5 JSON payloads, metadata in state + raw text on-demand in IndexedDB)
  const [snapshots, setSnapshots] = useState<JsonSnapshotItem[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const snapshotsRef = useRef<JsonSnapshotItem[]>([]);
  snapshotsRef.current = snapshots;
  const didHydrateRef = useRef(false);
  const readyNotifiedRef = useRef(false);
  const [hydrationDone, setHydrationDone] = useState(false);
  const [awaitingInitialParse, setAwaitingInitialParse] = useState(false);

  // Hydrate persisted snapshots lazily on first mount (only active 1 payload is read into RAM)
  useEffect(() => {
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const meta = await loadSnapshotMeta();
        if (cancelled) return;

        if (meta.items.length > 0) {
          setSnapshots(meta.items);
          if (meta.activeId) {
            const raw = await loadSnapshotRaw(meta.activeId);
            if (!cancelled && raw) {
              setActiveSnapshotId(meta.activeId);
              setAwaitingInitialParse(true);
              worker.parseJson(raw, 2);
            }
          }
        }
      } catch (err) {
        console.warn('[JsonBeautify] Failed to hydrate persisted snapshots:', err);
      } finally {
        if (!cancelled) {
          setHydrationDone(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [worker.parseJson]);

  // Signal curtain reveal once initial hydration + persisted JSON parse has painted
  useEffect(() => {
    if (readyNotifiedRef.current || !onAppReady || !hydrationDone) return;
    if (awaitingInitialParse && !worker.stats && !worker.error) return;

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
  }, [hydrationDone, awaitingInitialParse, worker.stats, worker.error, onAppReady]);

  const loadJsonPayload = useCallback(
    (
      rawText: string,
      label: string,
      source: JsonSnapshotItem['source'],
      addToHistory = true
    ) => {
      if (!rawText.trim()) {
        addToast('Empty JSON input.', 'warning');
        return;
      }

      if (addToHistory) {
        const snapId = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const byteSize = new TextEncoder().encode(rawText).byteLength;
        const willPersist = byteSize <= MAX_PERSIST_SNAPSHOT_BYTES;
        const nextSnap: JsonSnapshotItem = {
          id: snapId,
          label,
          source,
          byteSize,
          createdAt: Date.now(),
          persisted: willPersist,
        };

        const prevList = snapshotsRef.current;
        const combined = [nextSnap, ...prevList];
        const kept = combined.slice(0, MAX_JSON_SNAPSHOTS);
        const evicted = combined.slice(MAX_JSON_SNAPSHOTS);

        setSnapshots(kept);
        setActiveSnapshotId(snapId);

        // Async IndexedDB persistence (Zero UI blocking)
        void (async () => {
          await saveSnapshotRaw(snapId, rawText, byteSize);
          for (const old of evicted) {
            await deleteSnapshotRaw(old.id);
          }
          await saveSnapshotMeta(kept, snapId);
        })();

        if (!willPersist) {
          addToast(
            `Loaded (${formatByteSize(byteSize)}). Over 5MB — kept for this session only.`,
            'info'
          );
        }
      }

      setSelectedTableArrayId(null);
      worker.parseJson(rawText, 2);
    },
    [addToast, worker]
  );

  const handleSelectSnapshot = useCallback(
    async (snap: JsonSnapshotItem) => {
      const raw = await loadSnapshotRaw(snap.id);
      if (!raw) {
        addToast('Snapshot data not found. Removing stale entry.', 'warning');
        const nextList = snapshotsRef.current.filter((s) => s.id !== snap.id);
        setSnapshots(nextList);
        void saveSnapshotMeta(nextList, null);
        return;
      }
      setActiveSnapshotId(snap.id);
      void saveSnapshotMeta(snapshotsRef.current, snap.id);
      loadJsonPayload(raw, snap.label, snap.source, false);
    },
    [addToast, loadJsonPayload]
  );

  const handleRemoveSnapshot = useCallback(
    async (snapId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const nextList = snapshotsRef.current.filter((s) => s.id !== snapId);
      setSnapshots(nextList);
      await deleteSnapshotRaw(snapId);

      if (activeSnapshotId === snapId) {
        if (nextList.length > 0) {
          const fallback = nextList[0];
          const raw = await loadSnapshotRaw(fallback.id);
          if (raw) {
            setActiveSnapshotId(fallback.id);
            await saveSnapshotMeta(nextList, fallback.id);
            loadJsonPayload(raw, fallback.label, fallback.source, false);
            return;
          }
        }
        setActiveSnapshotId(null);
        worker.clearAll();
        await saveSnapshotMeta(nextList, null);
      } else {
        await saveSnapshotMeta(nextList, activeSnapshotId);
      }
    },
    [activeSnapshotId, loadJsonPayload, worker]
  );

  const handleClearAllSnapshots = useCallback(async () => {
    const ids = snapshotsRef.current.map((s) => s.id);
    setSnapshots([]);
    setActiveSnapshotId(null);
    worker.clearAll();
    await clearAllSnapshotsStorage(ids);
    addToast('Cleared all saved JSON snapshots.', 'info');
  }, [worker, addToast]);

  // Clipboard Paste Helper
  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        addToast('Clipboard is empty.', 'warning');
        return;
      }
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      loadJsonPayload(text, `Clipboard ${timeStr}`, 'clipboard');
    } catch {
      addToast('Clipboard access blocked. Try pressing Ctrl+V directly!', 'warning');
    }
  }, [addToast, loadJsonPayload]);

  // Global Ctrl+V instant paste when JsonBeautify is active
  useEffect(() => {
    if (!isActive) return;

    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (text && text.trim()) {
        e.preventDefault();
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        loadJsonPayload(text, `Clipboard ${timeStr}`, 'clipboard');
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isActive, loadJsonPayload]);

  // Tauri Native File Drop Listener (only active when JsonBeautify is active)
  useEffect(() => {
    if (!isActive || !isTauriEnvironment()) return;

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent(async (event) => {
          if (cancelled) return;
          const payload = event.payload;
          if (payload.type === 'enter' || payload.type === 'over') {
            setIsDragging(true);
            return;
          }
          if (payload.type === 'leave') {
            setIsDragging(false);
            return;
          }
          if (payload.type === 'drop' && payload.paths && payload.paths.length > 0) {
            setIsDragging(false);
            const filePath = payload.paths[0];
            const fileName = filePath.split(/[\\/]/).pop() || filePath;
            try {
              if (window.electronAPI?.readFile) {
                const content = await window.electronAPI.readFile(filePath);
                loadJsonPayload(content, fileName, 'file');
              }
            } catch (err) {
              addToast(`Failed to read dropped file: ${err instanceof Error ? err.message : String(err)}`, 'error');
            }
          }
        })
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // fallback to HTML5 drop
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [isActive, loadJsonPayload, addToast]);

  // HTML5 File Drop fallback (browser mode / dev)
  const handleHtmlDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      loadJsonPayload(content, file.name, 'file');
    } catch {
      addToast('Failed to read file.', 'error');
    }
  };

  const handleOpenFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      loadJsonPayload(content, file.name, 'file');
    } catch {
      addToast('Failed to read file.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  // Lazy load view-specific data when switching tabs
  useEffect(() => {
    if (!worker.stats) return;
    if (viewMode === 'columns' && worker.columnLevels.length === 0) {
      worker.requestColumns([0]);
    } else if (viewMode === 'graph' && !worker.graphScene) {
      let savedWide = false;
      try {
        savedWide = localStorage.getItem('happytool_json_graph_wide_cards') === 'true';
      } catch {
        // ignore
      }
      worker.requestGraph({ autoInit: true, wideCards: savedWide });
    } else if (viewMode === 'table') {
      const firstId = selectedTableArrayId ?? worker.stats.arrayTables[0]?.id ?? null;
      if (firstId !== null && (!worker.tableData || worker.tableData.arrayNodeId !== firstId)) {
        setSelectedTableArrayId(firstId);
        worker.requestTable(firstId);
      }
    } else if (viewMode === 'code' && !worker.codeData) {
      worker.requestCode(codeOptions.indent, codeOptions.sortKeys, codeOptions.minified);
    } else if (viewMode === 'insights' && !worker.tsSchema) {
      worker.requestTsSchema('RootPayload');
    }
  }, [viewMode, worker, selectedTableArrayId, codeOptions]);

  const copyPlainText = useCallback(
    async (text: string, label = 'Copied to clipboard') => {
      try {
        if (window.electronAPI?.copyToClipboard) {
          await window.electronAPI.copyToClipboard(text);
        } else {
          await navigator.clipboard.writeText(text);
        }
        addToast(label, 'success');
      } catch {
        addToast('Failed to copy to clipboard.', 'error');
      }
    },
    [addToast]
  );

  const handleCopyNodeSubtree = useCallback(
    async (nodeId: number, mode: 'pretty' | 'minified' | 'value' = 'pretty') => {
      const res = await worker.requestCopyText(nodeId, mode, codeOptions);
      await copyPlainText(res.text, res.label);
    },
    [worker, codeOptions, copyPlainText]
  );

  const handleSaveFormattedFile = useCallback(async () => {
    const res = await worker.requestCopyText(0, codeOptions.minified ? 'minified' : 'pretty', codeOptions);
    const defaultName = `beautified_${Date.now()}.json`;

    if (window.electronAPI?.saveBinaryFile) {
      try {
        const bytes = new TextEncoder().encode(res.text);
        const saved = await window.electronAPI.saveBinaryFile(bytes, {
          defaultName,
          filterName: 'JSON File',
          extensions: ['json'],
        });
        if (saved?.status === 'canceled') return;
        if (saved?.status === 'success' && saved.filePath) {
          addToast(`JSON saved: ${saved.filePath}`, 'success');
          return;
        }
      } catch {
        // fallback below
      }
    } else if (window.electronAPI?.saveFile) {
      try {
        const saved = await window.electronAPI.saveFile(res.text);
        if (saved?.status === 'canceled') return;
        if (saved?.status === 'success') {
          addToast(saved.filePath ? `JSON saved: ${saved.filePath}` : 'JSON file saved!', 'success');
          return;
        }
      } catch {
        // fallback to browser download
      }
    }

    const blob = new Blob([res.text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast(`JSON downloaded: ${defaultName} (Browser Downloads folder)`, 'success');
  }, [worker, codeOptions, addToast]);

  const handleJumpToTreeNode = useCallback(
    (nodeId: number) => {
      setViewMode('tree');
      worker.selectNode(nodeId);
      setPendingJumpNodeId(nodeId);
      worker.expandToNode(nodeId);
    },
    [worker]
  );

  const handleSelectColumnItem = useCallback(
    (levelIndex: number, item: ColumnItem) => {
      const nextPath = worker.columnPathIds.slice(0, levelIndex + 1);
      worker.selectNode(item.id);
      if (item.type === 'object' || item.type === 'array') {
        nextPath.push(item.id);
      }
      worker.requestColumns(nextPath);
    },
    [worker]
  );

  const handleOpenEmbeddedByNodeId = useCallback(
    async (nodeId: number) => {
      const res = await worker.requestCopyText(nodeId, 'value');
      if (res.text) {
        loadJsonPayload(res.text, `Embedded #${nodeId}`, 'embedded');
      }
    },
    [worker, loadJsonPayload]
  );

  const handleChangeCodeOptions = useCallback(
    (opts: { indent: number; sortKeys: boolean; minified: boolean }) => {
      setCodeOptions(opts);
      worker.requestCode(opts.indent, opts.sortKeys, opts.minified);
    },
    [worker]
  );

  return (
    <div
      className="flex flex-col h-full w-full bg-[#090d16] text-slate-200 relative overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDragging) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDragging(false);
      }}
      onDrop={handleHtmlDrop}
    >
      <JsonBeautifyHeader
        stats={worker.stats}
        viewMode={viewMode}
        showInspector={showInspector}
        onChangeViewMode={setViewMode}
        onToggleInspector={() => setShowInspector((v) => !v)}
        onPasteClipboard={handlePasteFromClipboard}
        onOpenFile={() => fileInputRef.current?.click()}
        onClear={() => {
          worker.clearAll();
          setActiveSnapshotId(null);
          void saveSnapshotMeta(snapshotsRef.current, null);
        }}
        onOpenApps={onOpenApps}
      />

      {/* Quick Snapshot History Bar (persisted in IndexedDB, on-demand load) */}
      {snapshots.length > 0 && (
        <div className="shrink-0 px-4 py-1.5 bg-[#0c1222] border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
            <History size={11} /> Snapshots ({snapshots.length}/{MAX_JSON_SNAPSHOTS})
          </span>
          {snapshots.map((snap) => {
            const active = snap.id === activeSnapshotId;
            return (
              <div
                key={snap.id}
                onClick={() => void handleSelectSnapshot(snap)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void handleSelectSnapshot(snap);
                  }
                }}
                title={`${snap.label} (${formatByteSize(snap.byteSize)})${snap.persisted === false ? ' • Session only' : ' • Saved locally'}`}
                className={`group/snap inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-0.5 rounded-md text-[11px] font-mono shrink-0 border cursor-pointer transition-colors ${
                  active
                    ? 'bg-indigo-600/25 border-indigo-500/60 text-indigo-200 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <span className="max-w-[180px] truncate">{snap.label}</span>
                <span className="text-[9.5px] text-slate-500">{formatByteSize(snap.byteSize)}</span>
                <button
                  type="button"
                  onClick={(e) => void handleRemoveSnapshot(snap.id, e)}
                  className="p-0.5 rounded hover:bg-rose-500/30 text-slate-500 hover:text-rose-200 transition-colors"
                  title="Remove snapshot"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => void handleClearAllSnapshots()}
            className="ml-auto text-[10px] font-medium text-slate-500 hover:text-rose-300 shrink-0 px-1.5 py-0.5 rounded transition-colors"
            title="Delete all saved snapshots from local storage"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Executive Summary Bar */}
      {worker.stats && (
        <JsonInsightsBar
          stats={worker.stats}
          repairInfo={worker.repairInfo}
          onJumpToNode={handleJumpToTreeNode}
        />
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {!worker.stats ? (
          <JsonEmptyState
            onPasteClipboard={handlePasteFromClipboard}
            onOpenFile={() => fileInputRef.current?.click()}
            onLoadSample={() => loadJsonPayload(SAMPLE_JSON, 'Sample SmartThings.json', 'sample')}
            onSubmitManualText={(txt) => loadJsonPayload(txt, 'Manual Input', 'manual')}
            error={worker.error}
            isDragging={isDragging}
          />
        ) : (
          <>
            {viewMode === 'tree' && (
              <JsonTreeView
                rows={worker.rows}
                selectedNodeId={worker.selectedNodeId}
                searchResult={worker.searchResult}
                pendingJumpNodeId={pendingJumpNodeId}
                onClearPendingJump={() => setPendingJumpNodeId(null)}
                onToggleNode={worker.toggleNode}
                onSelectNode={worker.selectNode}
                onExpandDepth={worker.expandDepth}
                onExpandToNode={worker.expandToNode}
                onSearch={worker.search}
                onCopySubtree={(id) => handleCopyNodeSubtree(id, 'pretty')}
                onOpenEmbeddedByNodeId={handleOpenEmbeddedByNodeId}
              />
            )}

            {viewMode === 'graph' && (
              <JsonGraphView
                scene={worker.graphScene}
                expandedIds={worker.graphExpandedIds}
                extraArrayLimits={worker.graphArrayLimits}
                expandedPropCardIds={worker.graphExpandedPropCardIds}
                selectedNodeId={worker.selectedNodeId}
                onSelectNode={worker.selectNode}
                onRequestGraph={worker.requestGraph}
                onExportMessage={(msg) => addToast(msg, 'success')}
              />
            )}

            {viewMode === 'columns' && (
              <JsonColumnView
                levels={worker.columnLevels}
                selectedPathIds={worker.columnPathIds}
                selectedNodeId={worker.selectedNodeId}
                nodeDetail={worker.nodeDetail}
                onSelectColumnItem={handleSelectColumnItem}
                onCopyText={copyPlainText}
                onOpenEmbeddedJson={(raw, label) => loadJsonPayload(raw, label, 'embedded')}
              />
            )}

            {viewMode === 'table' && (
              <JsonTableView
                catalog={worker.stats.arrayTables}
                selectedArrayId={selectedTableArrayId ?? worker.stats.arrayTables[0]?.id ?? null}
                tableData={worker.tableData}
                onSelectArray={(id) => {
                  setSelectedTableArrayId(id);
                  worker.requestTable(id);
                }}
                onJumpToTree={handleJumpToTreeNode}
                onCopyText={copyPlainText}
              />
            )}

            {viewMode === 'code' && (
              <JsonCodeView
                codeData={worker.codeData}
                indent={codeOptions.indent}
                sortKeys={codeOptions.sortKeys}
                minified={codeOptions.minified}
                onChangeOptions={handleChangeCodeOptions}
                onCopyAll={() => handleCopyNodeSubtree(0, codeOptions.minified ? 'minified' : 'pretty')}
                onSaveFile={handleSaveFormattedFile}
              />
            )}

            {viewMode === 'insights' && (
              <JsonInsightsPanel
                stats={worker.stats}
                tsSchema={worker.tsSchema}
                onJumpToNode={handleJumpToTreeNode}
                onCopyText={copyPlainText}
              />
            )}

            {/* Shared Right Inspector Drawer for Tree & Graph */}
            {showInspector && (viewMode === 'tree' || viewMode === 'graph') && (
              <JsonNodeInspector
                detail={worker.nodeDetail}
                width={inspectorWidth}
                onWidthChange={setInspectorWidth}
                onWidthCommit={handleCommitInspectorWidth}
                onClose={() => setShowInspector(false)}
                onCopyText={copyPlainText}
                onCopyNodeSubtree={handleCopyNodeSubtree}
                onOpenEmbeddedJson={(raw, label) => loadJsonPayload(raw, label, 'embedded')}
                onNavigateBreadcrumb={handleJumpToTreeNode}
              />
            )}
          </>
        )}

        {/* Loading Overlay (Zero-Blur) */}
        {worker.isProcessing && (
          <div className="absolute inset-0 bg-slate-950/75 flex items-center justify-center z-40">
            <div className="px-5 py-3.5 rounded-2xl bg-slate-900 border border-indigo-500/40 shadow-2xl flex items-center gap-3">
              <Loader2 size={20} className="animate-spin text-indigo-400" />
              <span className="text-sm font-bold text-slate-100">Parsing & Indexing JSON in Worker...</span>
            </div>
          </div>
        )}

        {/* Drag-Over Overlay (Zero-Blur) */}
        {isDragging && worker.stats && (
          <div className="absolute inset-3 rounded-3xl border-2 border-dashed border-indigo-400 bg-slate-950/85 flex flex-col items-center justify-center z-50 pointer-events-none">
            <Braces size={40} className="text-indigo-400 mb-3" />
            <p className="text-lg font-black text-white">Drop JSON / Text File to Analyze</p>
            <p className="text-xs text-slate-400 mt-1">Previous JSON is kept in Snapshot History</p>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.txt,.log,*/*"
        className="hidden"
        onChange={handleOpenFileChange}
      />
    </div>
  );
};

export default React.memo(JsonBeautify);
