# 🎨 UI Components, Hooks & Workers Map (`UI_COMPONENTS.md`)

## 1. Entry Points & Global Shell
| Component | Path | Description |
| :--- | :--- | :--- |
| `index` | `index.tsx` | Calls `initTauriBridge()` before mounting `App` or `CliApp` based on `?mode=cli`. |
| `App` | `App.tsx` | Single-purpose application shell mounting `WindowTitleBarControls`, `LogExtractor`, `LogArchive`, `CommandPalette`, and `SettingsModal`. |
| `WindowTitleBarControls` | `components/WindowTitleBarControls.tsx` | Top-right `138x32px` frameless window caption controls (`Minimize`, `Maximize/Restore`, `Close`) matching `#0f172a` background and `#94a3b8` icons; auto-hides in `isFocusMode`. |
| `CliApp` | `CliApp.tsx` | Headless CLI renderer entry for `log-extractor` and `analyze-diff` commands. |
| `SettingsModal` | `components/SettingsModal.tsx` | Global settings modal (General, Shortcuts, Headless CLI, User Guide, About). |
| `CommandPalette` | `components/CommandPalette/CommandPalette.tsx` | Global `Ctrl+K` / `Ctrl+P` command palette. |

## 2. Log Extractor Core
| Component / Folder | Path | Description |
| :--- | :--- | :--- |
| `LogExtractor` | `components/LogExtractor.tsx` | Multi-tab session manager, drag-and-drop tab sorting (`@dnd-kit`), and split-view orchestrator. |
| `LogSession` | `components/LogSession.tsx` | Individual log tab session controller binding workers, toolbar, configuration panel, and canvas viewer. |
| `TopBar` | `components/LogViewer/TopBar.tsx` | Toolbar hosting Settings button on the left, Mission/Rules, Tizen Connection, Analysis panels, and Single/Split layout switcher. |
| `LogViewer/*` | `components/LogViewer/**` | 52 specialized components/hooks including `HyperLogRenderer.tsx`, `LogViewerPane.tsx`, `ConfigurationPanel.tsx`, `ConfigSections/*`, `PerfDashboard/*`, `SplitAnalyzerPanel.tsx`, `SpamAnalyzerPanel.tsx`, `TransactionDrawer.tsx`, `LatencySpotlightDrawer.tsx`, `EventHistogramModal.tsx`. |
| `LogArchive/*` | `components/LogArchive/**` | 20 components/hooks/workers for IndexedDB (`Dexie`) log snippet archiving, tagging, search, and statistics. |
| `TizenConnectionModal` | `components/TizenConnectionModal.tsx` | Live stream connection modal for SDB, SSH, Serial port, and Test Scroll simulator via `createLogStreamSocket`. |

## 3. Core Hooks (`hooks/`)
- `useLogExtractorLogic.tsx`: Central state and action orchestrator for a log session.
- `useLogWorkerEvents.ts`: Handles incoming messages from `LogProcessor.worker.ts` (including Zero-Copy RPC `readFileSegment`).
- `useLogFileOperations.ts`: Local file drag-and-drop and `INIT_LOCAL_FILE_STREAM` initialization.
- `useTizenConnection.ts`: Live streaming (`sdb`, `ssh`, `serial`, `test`) and auto-recovery.
- `useLogAnalysisActions.ts`, `useLogExportActions.ts`, `useSplitAnalysis.ts`, `useFindInAll.ts`, `useCliHandlers.ts`, `useLogShortcuts.ts`.

## 4. Web Workers (`workers/`) & WASM (`public/wasm/`)
- `LogProcessor.worker.ts`: Primary log indexing, filtering, and RPC coordinator.
- `LogFilterSub.worker.ts`: Parallel sub-worker pool executing Rust WASM SIMD/Aho-Corasick filtering on `SharedArrayBuffer`.
- `LogIndexer.worker.ts`, `LogStream.worker.ts`, `PerfTool.worker.ts`, `Search.worker.ts`, `SplitAnalysis.worker.ts`.
- Worker Handlers: `workerDataReader.ts`, `workerAnalysisHandlers.ts`, `workerHistogramHandler.ts`, `latencyAnalysisHandler.ts`, `SpamAnalyzer.logic.ts`, `SplitAnalysisUtils.ts`, `TransactionAnalyzer.logic.ts`, `workerBookmarkHandlers.ts`.
