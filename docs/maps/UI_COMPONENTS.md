# 🎨 UI Components, Hooks & Workers Map (`UI_COMPONENTS.md`)

## 1. Entry Points & Global Shell
| Component | Path | Description |
| :--- | :--- | :--- |
| `index` | `index.tsx` | Calls `initTauriBridge()` before mounting `App` or `CliApp` based on `?mode=cli`. |
| `App` | `App.tsx` | Multi-app shell mounting `WindowTitleBarControls`, `LogExtractor` (persistent), lazy sub-apps via `APPS_REGISTRY` (`JsonBeautify`), `AppsLauncherModal` (`Ctrl+Shift+P`), `LogArchive`, `CommandPalette` (`Ctrl+K`/`Ctrl+P`), and `SettingsModal`. |
| `AppsLauncherModal` | `components/Apps/AppsLauncherModal.tsx` | Extensible `Ctrl+Shift+P` Apps Launcher with Zero-Blur 60fps spring animation, keyboard quick-launch (`Enter`/`1-9`/`Esc`), and `AppLauncherCard.tsx`. Backed by `plugins/appsRegistry.ts`. |
| `JsonBeautify` | `components/JsonBeautify/index.tsx` | High-speed 500KB~10MB+ JSON Beautify & Visual Analyzer with 6 views (`JsonTreeView`, `JsonGraphView` + `JsonGraphTooltip` Canvas JSON Crack with Adaptive Compact/Wide cards, inline badges, hover preview, `+N more` expand & PNG Export, `JsonColumnView` Finder Columns, `JsonTableView` CSV/MD, `JsonCodeView`, `JsonInsightsPanel` TS Schema), resizable `JsonNodeInspector` (persisted width), `JsonInsightsBar`, `JsonBeautifyHeader`, `JsonEmptyState`, persisted Quick Snapshot History (`utils/jsonSnapshotStorage.ts`, IndexedDB on-demand up to 5 items / 5MB cap), `Ctrl+V` / Tauri native drop, Smart Repair (`utils/jsonSmartRepair.ts`), and Dedicated Worker (`workers/JsonBeautify.worker.ts` + `jsonArenaEngine.ts` + `jsonGraphBuilder.ts` + `jsonWorkerHelpers.ts`). |
| `WindowTitleBarControls` | `components/WindowTitleBarControls.tsx` | Top-right `138x32px` frameless window caption controls (`Minimize`, `Maximize/Restore`, `Close`) matching `#0f172a` background and `#94a3b8` icons; auto-hides in `isFocusMode`. |
| `CliApp` | `CliApp.tsx` | Headless CLI renderer entry for `log-extractor` and `analyze-diff` commands. |
| `SettingsModal` | `components/SettingsModal.tsx` | Global settings modal (General, Shortcuts, Headless CLI, User Guide, About). |
| `CommandPalette` | `components/CommandPalette/CommandPalette.tsx` | Global `Ctrl+K` / `Ctrl+P` command palette. |

## 2. Log Extractor Core
| Component / Folder | Path | Description |
| :--- | :--- | :--- |
| `LogExtractor` | `components/LogExtractor.tsx` | Multi-tab session manager, drag-and-drop tab sorting (`@dnd-kit`), and split-view orchestrator. |
| `LogSession` | `components/LogSession.tsx` | Individual log tab session controller binding workers, toolbar, configuration panel, and canvas viewer. |
| `TopBar` | `components/LogViewer/TopBar.tsx` | Toolbar hosting Apps Launcher (`LayoutGrid`, `Ctrl+Shift+P`) button on the top-left, Mission/Rules, Tizen Connection, Analysis panels, and Single/Split layout switcher. (Settings accessible via `Ctrl+,` / `Ctrl+P`). |
| `LogViewer/*` | `components/LogViewer/**` | 52 specialized components/hooks including `HyperLogRenderer.tsx`, `LogViewerPane.tsx`, `ConfigurationPanel.tsx`, `ConfigSections/*` (`HappyComboSection.tsx` draft-only combo root creation without premature search), `PerfDashboard/*`, `SplitAnalyzerPanel.tsx`, `SpamAnalyzerPanel.tsx`, `TransactionDrawer.tsx`, `LatencySpotlightDrawer.tsx`, `EventHistogramModal.tsx`. |
| `LogArchive/*` | `components/LogArchive/**` | 20 components/hooks/workers for IndexedDB (`Dexie`) log snippet archiving, tagging, search, and statistics. |
| `TizenConnectionModal` | `components/TizenConnectionModal.tsx` | Live stream connection modal for SDB, SSH, Serial port, and Test Scroll simulator via `createLogStreamSocket`. |

## 3. Core Hooks (`hooks/`)
- `useLogExtractorLogic.tsx`: Central state and action orchestrator for a log session.
- `useLogWorkerEvents.ts`: Handles incoming messages from `LogProcessor.worker.ts` (including Zero-Copy RPC `readFileSegment`).
- `useLogFileOperations.ts`: Local file drag-and-drop and `INIT_LOCAL_FILE_STREAM` initialization.
- `useTizenConnection.ts`: Live streaming (`sdb`, `ssh`, `serial`, `test`) and auto-recovery.
- `useLogAnalysisActions.ts`, `useLogExportActions.ts`, `useSplitAnalysis.ts`, `useFindInAll.ts`, `useCliHandlers.ts`, `useLogShortcuts.ts`.

## 4. Web Workers (`workers/`) & WASM (`public/wasm/`)
- `LogProcessor.worker.ts`: Primary log indexing, filtering, and RPC coordinator (supports instant post-index rendering via identity-initialized `filteredIndices` check and on-demand `REQUEST_HISTOGRAM`).
- `workerFilterExecutor.ts`: Sub-worker pool lifecycle (`SubWorkerPool`), `CHUNK_ACK` watchdog recovery, and Main Worker byte-scan fallback executor (`isStreamMode`, `isLocalFileMode`, and `currentFile` Blob slicing).
- `LogFilterSub.worker.ts`: Zero-cold-start parallel sub-worker using `blob.arrayBuffer()` + `utils/byteLogFiltering.ts` (`SUBWORKER_READY`/`CHUNK_ACK` handshakes, no per-line WASM overhead).
- `byteLogFiltering.ts` (`utils/`): Pre-compiled rule & Boyer-Moore-Horspool raw UTF-8 `Uint8Array` scanner with per-line ANSI / per-chunk non-ASCII JS fallback.
- `LogIndexer.worker.ts`, `LogStream.worker.ts`, `PerfTool.worker.ts`, `Search.worker.ts`, `SplitAnalysis.worker.ts`.
- Worker Handlers: `workerDataReader.ts`, `workerAnalysisHandlers.ts` (yields event loop during heatmap sampling), `workerHistogramHandler.ts` (lazy on-demand `timestampCache` with 128-byte prefix cap & chunk yielding), `latencyAnalysisHandler.ts`, `SpamAnalyzer.logic.ts`, `SplitAnalysisUtils.ts`, `TransactionAnalyzer.logic.ts`, `workerBookmarkHandlers.ts`.
