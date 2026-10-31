# 🗺️ HappyTool Tauri Master Map (`APP_MAP.md`)

Welcome to the architectural map of **HappyTool Tauri** (Tauri 2.0 Standalone High-Performance Log Analyzer, 100% ported from `happytool_light`).

---

## 🏗️ 1. High-Level Architecture
- **Frontend**: React 19 + TypeScript + Tailwind CSS + Vite (`index.tsx` -> `utils/tauriBridge.ts` -> `App.tsx` -> `LogExtractor.tsx` / `CliApp.tsx`)
- **Workers & Engine**: Rust WebAssembly (`happy_filter_bg.wasm`) + 7 Dedicated Web Workers (`workers/`) + `SharedArrayBuffer` (COOP/COEP + WebView2 `additionalBrowserArgs`)
- **Desktop Native Core (Tauri 2.0 Rust)**:
  - `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`
  - `src-tauri/src/commands/file_io.rs` (Zero-Copy `tauri::ipc::Response` 50MB Segment Reader with 15s File Handle Pooling)
  - `src-tauri/src/commands/window_os.rs` (Window State Persistence, Native WebView2 Zoom, Clipboard, Opener, Frameless Controls)
  - `src-tauri/src/commands/settings_cli.rs` (Settings Sync, SDB Command Runner, Headless CLI Mode)
  - `src-tauri/src/commands/stream_engine.rs` (Background Socket.IO Server Spawner & Native Serial/SDB/Scroll Stream Fallback)
- **Platform Bridge & Streaming**:
  - `utils/tauriBridge.ts`: 1:1 `window.electronAPI` emulation, synchronous `getZoomFactor()`, `.title-drag` window dragging delegation, and local file path registry.
  - `utils/tauriSocket.ts`: `HybridTauriSocket` bridging port `3003` Socket.IO server (`server/index.cjs`) and Tauri Native IPC/Events.
  - `components/WindowTitleBarControls.tsx`: Top-right `138x32px` frameless window caption controls matching `#0f172a` / `#94a3b8`.
- **CI/CD Automation**:
  - `.github/workflows/release.yml`: GitHub Actions workflow that detects `package.json` version bumps on push, builds Windows `.exe` / `.msi` standalone binaries via `tauri-apps/tauri-action`, and publishes a GitHub Release.

---

## 📂 2. Detailed Sub-Maps

| Map File | Scope & Contents |
| :--- | :--- |
| [**UI_COMPONENTS.md**](./docs/maps/UI_COMPONENTS.md) | `LogExtractor`, `LogSession`, `WindowTitleBarControls`, `LogViewer` (52 files), `LogArchive` (20 files), Modals, Hooks, and Workers. |
| [**BACKEND_SERVICES.md**](./docs/maps/BACKEND_SERVICES.md) | Tauri 2.0 Rust Commands (`src-tauri/src/commands/*`), Frontend Bridge (`utils/tauriBridge.ts`, `utils/tauriSocket.ts`), and Socket.IO Server (`server/index.cjs`). |
| [**STANDARD_GUIDES.md**](./docs/maps/STANDARD_GUIDES.md) | Coding standards, performance rules, and references to `important/` specifications. |
