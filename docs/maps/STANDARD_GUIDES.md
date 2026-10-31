# 📏 Standard Guides (`STANDARD_GUIDES.md`)

## 1. Core Specifications (`important/`)
- [log_extractor_specification.md](../../important/log_extractor_specification.md): Functional and behavioral specification of Log Extractor.
- [LOG_EXTRACTOR_PERFORMANCE_BLUEPRINT.md](../../important/LOG_EXTRACTOR_PERFORMANCE_BLUEPRINT.md): Zero-copy, `SharedArrayBuffer`, and multi-worker architecture blueprint.
- [performance_standards.md](../../important/performance_standards.md): Latency and throughput benchmarks.
- [cli_user_guide.md](../../important/cli_user_guide.md): Headless CLI usage guide.

## 2. Performance & Engineering Principles
- **Zero-Copy File I/O**: Never load full large log files into V8 strings; use `readFileSegment` with 15s file handle pooling.
- **Worker Offloading**: All indexing, filtering, spam analysis, transaction analysis, and split diffing run in Web Workers + WASM.
- **No CSS Blur**: Avoid `backdrop-blur` and CSS `filter: blur()` on high-frequency UI surfaces to preserve 60fps Canvas rendering.
- **Lock-Free Packaging**: Electron packaging (`npm run electron:build`) utilizes an external temp stage (`%TEMP%/electron-build-out`) via `scripts/build-electron.js` to avoid Windows IDE file-watcher locks (`EBUSY default_app.asar`), automatically outputting to `dist_bin/`.
