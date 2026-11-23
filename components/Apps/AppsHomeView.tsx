import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, LayoutGrid, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { AppLauncherEntry } from '../../plugins/appsRegistry';
import { useAppUpdater } from '../../hooks/useAppUpdater';
import AppsLauncherPanel from './AppsLauncherPanel';
import AppUpdateCard from './AppUpdateCard';

interface AppsHomeViewProps {
  apps: AppLauncherEntry[];
  onSelectApp: (id: string) => void;
  onOpenSettings: () => void;
}

/**
 * Startup Apps Home Screen displayed immediately on app launch before any heavy app mounts.
 * Zero-Blur, minimal chrome, full keyboard navigation (1–9, ↑/↓, Enter).
 * Displays GitHub Release update status and one-click updater strictly in this home view.
 */
const AppsHomeView: React.FC<AppsHomeViewProps> = ({
  apps,
  onSelectApp,
  onOpenSettings,
}) => {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [sweepTick, setSweepTick] = useState(1);
  const focusedIndexRef = useRef(0);

  const {
    state: updaterState,
    checkForUpdates,
    startOneClickUpdate,
    cancelUpdate,
    dismissUpdate,
    skipVersion,
    revealDismissedUpdate,
    openReleasePage,
  } = useAppUpdater();

  const handleFocusChange = useCallback((nextIndex: number) => {
    if (focusedIndexRef.current === nextIndex) return;
    focusedIndexRef.current = nextIndex;
    setFocusedIndex(nextIndex);
    setSweepTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetEl = e.target as HTMLElement | null;
      if (targetEl && (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA')) {
        return;
      }
      if (apps.length === 0) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleFocusChange((focusedIndexRef.current + 1) % apps.length);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handleFocusChange((focusedIndexRef.current - 1 + apps.length) % apps.length);
      } else if (e.key === 'Enter') {
        if (targetEl && typeof targetEl.closest === 'function' && targetEl.closest('[data-updater-area="true"]')) {
          return;
        }
        e.preventDefault();
        const target = apps[focusedIndexRef.current];
        if (target) onSelectApp(target.id);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < apps.length) {
          e.preventDefault();
          onSelectApp(apps[idx].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [apps, handleFocusChange, onSelectApp]);

  const handleManualCheck = useCallback(() => {
    void checkForUpdates(true);
  }, [checkForUpdates]);

  return (
    <div
      className="h-full w-full flex flex-col bg-[#070b14] text-slate-200 select-none overflow-hidden"
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% 35%, rgba(99, 102, 241, 0.08) 0%, transparent 55%), radial-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px)',
        backgroundSize: '100% 100%, 20px 20px',
      }}
    >
      {/* Frameless Draggable Title Bar (leaves right 144px clear for OS caption controls) */}
      <header className="h-12 shrink-0 title-drag pl-4 pr-[144px] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 no-drag">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-400/25 flex items-center justify-center text-indigo-300">
            <LayoutGrid size={13} />
          </div>
          <span className="text-xs font-bold tracking-tight text-slate-200">HappyTool</span>
          <span
            data-testid="apps-home-version"
            className="px-2 py-0.5 rounded-md bg-slate-900/95 border border-slate-700/80 text-[11px] font-mono font-medium text-slate-300 leading-none"
          >
            v{updaterState.currentVersion}
          </span>
        </div>

        {/* Quiet Header Update Status Pill */}
        <div className="flex items-center gap-1.5 no-drag" data-updater-area="true">
          {updaterState.status === 'checking' ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-slate-400">
              <Loader2 size={11} className="animate-spin text-indigo-400" />
              <span>Checking updates</span>
            </div>
          ) : updaterState.status === 'available' && updaterState.isDismissed && updaterState.latestVersion ? (
            <button
              type="button"
              onClick={revealDismissedUpdate}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/30 text-[11px] font-mono text-cyan-300 transition-colors"
              title="Show available update"
            >
              <Sparkles size={11} />
              <span>Update v{updaterState.latestVersion}</span>
            </button>
          ) : updaterState.status === 'available' && updaterState.latestVersion ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/25 text-[11px] font-mono text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>v{updaterState.latestVersion} available</span>
            </div>
          ) : updaterState.status === 'up-to-date' ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-800/90 text-[11px] font-mono text-slate-400">
              <Check size={11} className="text-emerald-400" />
              <span>Up to date</span>
              <button
                type="button"
                onClick={handleManualCheck}
                title="Check for updates"
                aria-label="Check for updates"
                className="ml-0.5 p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-200 transition-colors"
              >
                <RefreshCw size={10} />
              </button>
            </div>
          ) : updaterState.status === 'error' && !updaterState.latestVersion ? (
            <button
              type="button"
              onClick={handleManualCheck}
              title={updaterState.error || 'Retry update check'}
              className="inline-flex items-center gap-1.5 max-w-[260px] px-2.5 py-1 rounded-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-400/30 text-[11px] font-mono text-rose-300 transition-colors"
            >
              <RefreshCw size={10} className="shrink-0" />
              <span className="truncate">{updaterState.error || 'Check updates'}</span>
            </button>
          ) : null}
        </div>
      </header>

      {/* Centered Dock-Rail Hybrid Launcher + Update Spotlight Below (Zero Layout Shift) */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.68 }}
          style={{ willChange: 'transform, opacity' }}
          className="w-full max-w-[560px] bg-[#0b1120] border border-slate-700/80 rounded-2xl shadow-[0_28px_72px_rgba(2,6,23,0.92)]"
        >
          <AppsLauncherPanel
            apps={apps}
            activePluginId={null}
            focusedIndex={focusedIndex}
            sweepTick={sweepTick}
            mode="home"
            onFocusChange={handleFocusChange}
            onSelectApp={onSelectApp}
            onOpenSettings={onOpenSettings}
          />
        </motion.div>

        <div className="mt-3.5 w-full max-w-[560px]" data-updater-area="true">
          <AppUpdateCard
            state={updaterState}
            onUpdateClick={() => void startOneClickUpdate()}
            onCancelClick={() => void cancelUpdate()}
            onRetryClick={() => void startOneClickUpdate()}
            onDismissClick={dismissUpdate}
            onSkipVersionClick={skipVersion}
            onOpenReleasePage={() => void openReleasePage()}
          />
        </div>

        <div className="mt-3.5 flex items-center gap-2 text-[11px] font-mono text-slate-500">
          <span>Switch anytime with</span>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
            Ctrl+Shift+P
          </kbd>
        </div>
      </div>
    </div>
  );
};

export default React.memo(AppsHomeView);
