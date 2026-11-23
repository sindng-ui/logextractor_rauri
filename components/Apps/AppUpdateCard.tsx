import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { AppUpdaterState } from '../../hooks/useAppUpdater';
import {
  formatBytes,
  formatReleaseDate,
  parseReleaseNotesLines,
} from '../../utils/appUpdater';

interface AppUpdateCardProps {
  state: AppUpdaterState;
  onUpdateClick: () => void;
  onCancelClick: () => void;
  onRetryClick: () => void;
  onDismissClick: () => void;
  onSkipVersionClick: (version: string) => void;
  onOpenReleasePage: () => void;
}

/**
 * Zero-Blur Update Spotlight Card rendered beneath AppsLauncherPanel on AppsHomeView.
 * Uses GPU-only transform/opacity transitions and matches the Dock-Rail Hybrid surface.
 */
const AppUpdateCard: React.FC<AppUpdateCardProps> = ({
  state,
  onUpdateClick,
  onCancelClick,
  onRetryClick,
  onDismissClick,
  onSkipVersionClick,
  onOpenReleasePage,
}) => {
  const [notesExpanded, setNotesExpanded] = useState(false);

  const releaseBullets = useMemo(
    () => parseReleaseNotesLines(state.releaseNotes, 6),
    [state.releaseNotes]
  );

  const releaseDateLabel = useMemo(
    () => formatReleaseDate(state.publishedAt),
    [state.publishedAt]
  );

  const isVisible =
    (state.status === 'available' && !state.isDismissed) ||
    state.status === 'downloading' ||
    state.status === 'installing' ||
    state.status === 'dev-downloaded' ||
    (state.status === 'error' && Boolean(state.latestVersion) && !state.isDismissed);

  const percent = Math.max(0, Math.min(100, state.progress?.percent ?? 0));
  const downloadedLabel = formatBytes(state.progress?.downloadedBytes);
  const totalLabel = formatBytes(state.progress?.totalBytes ?? state.assetSize);
  const speedLabel =
    state.progress && state.progress.speedBps > 0
      ? `${formatBytes(state.progress.speedBps)}/s`
      : '';

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="app-update-card"
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.68 }}
          style={{
            willChange: 'transform, opacity',
            backgroundImage:
              'radial-gradient(circle at 90% 18%, rgba(56, 189, 248, 0.14), transparent 58%), radial-gradient(rgba(148, 163, 184, 0.06) 1px, transparent 1px)',
            backgroundSize: '100% 100%, 16px 16px',
          }}
          className="relative w-full max-w-[560px] rounded-2xl bg-[#0b1120] border border-slate-700/80 shadow-[0_22px_56px_rgba(2,6,23,0.88)] overflow-hidden"
        >
          {/* Top Gradient Hairline + Static Glass Specular Rim (Zero-Blur) */}
          <div className="h-[2px] w-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400" />
          <div className="h-px w-full bg-gradient-to-r from-white/[0.04] via-white/[0.14] to-white/[0.03] pointer-events-none" />

          <div className="px-4 py-3.5">
            {state.status === 'downloading' || state.status === 'installing' ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 flex items-center justify-center shrink-0">
                      <Loader2 size={16} className="animate-spin" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-100 truncate">
                          {state.status === 'installing'
                            ? 'Installing & Restarting...'
                            : `Downloading HappyTool v${state.latestVersion}`}
                        </span>
                        <span className="text-[11px] font-mono text-cyan-300 shrink-0">
                          {percent.toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-slate-400 truncate">
                        {state.status === 'installing'
                          ? 'Applying installer silently and relaunching'
                          : `${downloadedLabel} / ${totalLabel}${speedLabel ? ` · ${speedLabel}` : ''}`}
                      </p>
                    </div>
                  </div>

                  {state.status === 'downloading' && (
                    <button
                      type="button"
                      onClick={onCancelClick}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-medium text-slate-300 transition-colors shrink-0 active:scale-95"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {/* Progress Track */}
                <div className="w-full h-1.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 transition-[width] duration-150 ease-out"
                    style={{ width: `${state.status === 'installing' ? 100 : percent}%` }}
                  />
                </div>
              </div>
            ) : state.status === 'dev-downloaded' ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-100">
                      Installer Downloaded (Dev Mode Guard)
                    </div>
                    <p
                      className="text-[11px] font-mono text-slate-400 truncate"
                      title={state.installerPath ?? ''}
                    >
                      {state.installerPath}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenReleasePage}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  <span>GitHub</span>
                  <ExternalLink size={12} />
                </button>
              </div>
            ) : state.status === 'error' ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-300 flex items-center justify-center shrink-0">
                    <AlertCircle size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-rose-200">
                      Update Failed
                    </div>
                    <p className="text-[11px] text-slate-400 truncate" title={state.error ?? ''}>
                      {state.error || 'Unable to complete update.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={onRetryClick}
                    className="px-2.5 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/35 text-xs font-medium text-indigo-200 flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw size={12} />
                    <span>Retry</span>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenReleasePage}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs text-slate-300 flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink size={12} />
                    <span>GitHub</span>
                  </button>
                  <button
                    type="button"
                    onClick={onDismissClick}
                    aria-label="Dismiss update error"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/70 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Available Update Header Row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/25 to-cyan-500/20 border border-cyan-400/30 text-cyan-300 flex items-center justify-center shrink-0">
                      <Sparkles size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-bold text-slate-100 tracking-tight">
                          Update Available
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-400/30 text-[10.5px] font-mono text-emerald-300 leading-none">
                          v{state.currentVersion} → v{state.latestVersion}
                        </span>
                        {state.assetSize ? (
                          <span className="text-[10.5px] font-mono text-slate-400">
                            {formatBytes(state.assetSize)}
                          </span>
                        ) : null}
                        {releaseDateLabel ? (
                          <span className="text-[10.5px] font-mono text-slate-500">
                            · {releaseDateLabel}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-slate-400 truncate">
                        {state.releaseName ||
                          `HappyTool v${state.latestVersion} is ready to install`}
                      </p>
                    </div>
                  </div>

                  {/* Primary One-Click Update CTA + Dismiss */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={onUpdateClick}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white text-xs font-semibold shadow-[0_6px_18px_rgba(56,189,248,0.28)] flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <ArrowDownToLine size={14} />
                      <span>{state.downloadUrl ? 'Update Now' : 'Download'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onDismissClick}
                      title="Remind me later"
                      aria-label="Dismiss update notification"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/70 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Secondary Strip: Release Notes Toggle + Skip / GitHub */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-3">
                    {releaseBullets.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setNotesExpanded((v) => !v)}
                        className="inline-flex items-center gap-1 font-medium text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        <span>What&apos;s new</span>
                        <ChevronDown
                          size={12}
                          className={`transition-transform duration-150 ${
                            notesExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    ) : (
                      <span className="font-mono text-slate-500">
                        GitHub Release · One-click install
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {state.latestVersion && (
                      <button
                        type="button"
                        onClick={() => onSkipVersionClick(state.latestVersion!)}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        Skip v{state.latestVersion}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onOpenReleasePage}
                      className="inline-flex items-center gap-1 text-slate-400 hover:text-cyan-300 transition-colors"
                    >
                      <span>Release Notes</span>
                      <ExternalLink size={11} />
                    </button>
                  </div>
                </div>

                {/* Collapsible Release Notes Preview */}
                <AnimatePresence initial={false}>
                  {notesExpanded && releaseBullets.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.16, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <ul className="mt-2 pt-2 border-t border-slate-800/60 space-y-1 text-[11.5px] text-slate-300/90 max-h-[112px] overflow-y-auto custom-scrollbar pr-1">
                        {releaseBullets.map((line, idx) => (
                          <li key={idx} className="flex items-start gap-1.5 leading-snug">
                            <span className="text-cyan-400 mt-0.5 shrink-0">•</span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default React.memo(AppUpdateCard);
