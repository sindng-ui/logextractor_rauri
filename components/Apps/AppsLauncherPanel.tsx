import React, { useCallback, useEffect, useRef } from 'react';
import { Settings, X } from 'lucide-react';
import { AppLauncherEntry } from '../../plugins/appsRegistry';
import AppLauncherCard from './AppLauncherCard';

interface AppsLauncherPanelProps {
  apps: AppLauncherEntry[];
  activePluginId: string | null;
  focusedIndex: number;
  sweepTick: number;
  mode: 'home' | 'popover';
  onFocusChange: (index: number) => void;
  onSelectApp: (id: string) => void;
  onClose?: () => void;
  onOpenSettings?: () => void;
}

const SWEEP_DURATION_MS = 850;
const SWEEP_EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

const GLINT_KEYFRAMES: Keyframe[] = [
  { transform: 'translate3d(-100%, 0, 0)', opacity: 0, offset: 0 },
  { transform: 'translate3d(14%, 0, 0)', opacity: 1, offset: 0.3 },
  { transform: 'translate3d(280%, 0, 0)', opacity: 0, offset: 1 },
];

const SWEEP_KEYFRAMES: Keyframe[] = [
  { transform: 'translate3d(-140%, 0, 0) skewX(-22deg)', opacity: 0, offset: 0 },
  { transform: 'translate3d(-71%, 0, 0) skewX(-22deg)', opacity: 1, offset: 0.15 },
  { transform: 'translate3d(251%, 0, 0) skewX(-22deg)', opacity: 0.95, offset: 0.85 },
  { transform: 'translate3d(320%, 0, 0) skewX(-22deg)', opacity: 0, offset: 1 },
];

/**
 * Shared Dock-Rail Hybrid + Glass Clear (0.85s) Specular Sweep Launcher Panel.
 * Used identically by both the startup Apps Home view and the Ctrl+Shift+P Popover.
 */
const AppsLauncherPanel: React.FC<AppsLauncherPanelProps> = ({
  apps,
  activePluginId,
  focusedIndex,
  sweepTick,
  mode,
  onFocusChange,
  onSelectApp,
  onClose,
  onOpenSettings,
}) => {
  const preloadedIdsRef = useRef<Set<string>>(new Set());
  const glintRef = useRef<HTMLDivElement>(null);
  const sweepRef = useRef<HTMLDivElement>(null);
  const glintAnimRef = useRef<Animation | null>(null);
  const sweepAnimRef = useRef<Animation | null>(null);

  const triggerZeroRamPreload = useCallback((app?: AppLauncherEntry) => {
    if (!app || preloadedIdsRef.current.has(app.id)) return;
    preloadedIdsRef.current.add(app.id);
    // Fetches JS chunk only (no React mount, no worker spawn, no file I/O)
    app.preload?.().catch(() => {
      preloadedIdsRef.current.delete(app.id);
    });
  }, []);

  const focusedApp = apps[focusedIndex] ?? apps[0];
  const GhostIcon = focusedApp?.icon;

  // Preload focused app JS chunk passively when focus moves
  useEffect(() => {
    triggerZeroRamPreload(focusedApp);
  }, [focusedApp, triggerZeroRamPreload]);

  // Re-trigger GPU compositor sweep on persistent DOM layers (zero unmount/remount DOM churn)
  useEffect(() => {
    if (sweepTick <= 0) return;

    const glintEl = glintRef.current;
    const sweepEl = sweepRef.current;
    const timing: KeyframeAnimationOptions = {
      duration: SWEEP_DURATION_MS,
      easing: SWEEP_EASING,
      fill: 'none',
    };

    if (glintEl && typeof glintEl.animate === 'function') {
      glintAnimRef.current?.cancel();
      glintAnimRef.current = glintEl.animate(GLINT_KEYFRAMES, timing);
    }

    if (sweepEl && typeof sweepEl.animate === 'function') {
      sweepAnimRef.current?.cancel();
      sweepAnimRef.current = sweepEl.animate(SWEEP_KEYFRAMES, timing);
    }
  }, [sweepTick]);

  // Cancel any active compositor animations on unmount
  useEffect(() => {
    return () => {
      glintAnimRef.current?.cancel();
      sweepAnimRef.current?.cancel();
      glintAnimRef.current = null;
      sweepAnimRef.current = null;
    };
  }, []);

  const handleHover = useCallback(
    (idx: number) => {
      onFocusChange(idx);
      triggerZeroRamPreload(apps[idx]);
    },
    [onFocusChange, triggerZeroRamPreload, apps]
  );

  return (
    <div className="relative rounded-2xl overflow-hidden flex h-[280px]">
      {/* Left Column: Text-Free Vertical Icon Dock Rail */}
      <div className="w-[76px] shrink-0 bg-[#080d19] border-r border-slate-800/90 py-3.5 flex flex-col items-center">
        <div className="flex-1 w-full overflow-y-auto no-scrollbar flex flex-col items-center gap-3 py-1.5">
          {apps.map((app, idx) => (
            <AppLauncherCard
              key={app.id}
              app={app}
              index={idx}
              isActive={activePluginId === app.id}
              isFocused={focusedIndex === idx}
              onSelect={onSelectApp}
              onHover={handleHover}
            />
          ))}
        </div>

        {/* Bottom Utility Icon: Close (Popover) or Settings (Home) */}
        <div className="pt-2.5 mt-2 border-t border-slate-800/80 w-10 flex justify-center shrink-0">
          {mode === 'popover' && onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-500 hover:text-slate-200 flex items-center justify-center transition-colors active:scale-95"
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          ) : onOpenSettings ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-500 hover:text-slate-200 flex items-center justify-center transition-colors active:scale-95"
              title="Settings (Ctrl+,)"
            >
              <Settings size={15} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Right Column: Static Aura + Focus-Triggered Glass Clear Sweep (0.85s, Zero-Blur) */}
      {focusedApp && (
        <div
          onClick={() => onSelectApp(focusedApp.id)}
          style={{
            backgroundImage: `radial-gradient(circle at 86% 14%, ${focusedApp.radialGlow}, transparent 60%), radial-gradient(rgba(148, 163, 184, 0.07) 1px, transparent 1px)`,
            backgroundSize: '100% 100%, 16px 16px',
          }}
          className="group flex-1 relative p-5 bg-[#0c1324] flex flex-col justify-between overflow-hidden cursor-pointer"
        >
          {/* Top Unique Color Accent Hairline */}
          <div
            className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${focusedApp.gradient}`}
          />

          {/* Top Edge Glass Glint (persistent GPU layer, zero unmount/remount) */}
          <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden pointer-events-none">
            <div
              ref={glintRef}
              style={{
                willChange: 'transform, opacity',
                opacity: 0,
                transform: 'translate3d(-100%, 0, 0)',
              }}
              className="w-1/3 h-full bg-gradient-to-r from-transparent via-white/60 to-transparent"
            />
          </div>

          {/* Ultra-Thin Static Glass Specular Rim */}
          <div className="absolute inset-x-0 top-[2px] h-px bg-gradient-to-r from-white/[0.04] via-white/[0.14] to-white/[0.03] pointer-events-none" />

          {/* Double-Streak Glass Clear Specular Sweep on Focus Change (persistent GPU layer) */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-20">
            <div
              ref={sweepRef}
              style={{
                willChange: 'transform, opacity',
                opacity: 0,
                transform: 'translate3d(-140%, 0, 0) skewX(-22deg)',
                background: focusedApp.sweepGradient,
              }}
              className="absolute -inset-y-8 left-0 w-[38%]"
            />
          </div>

          {/* Bottom-Right Subtle Ghost Watermark */}
          {GhostIcon && (
            <div
              style={{ opacity: 0.08 }}
              className={`absolute -right-5 -bottom-5 pointer-events-none transition-transform duration-300 group-hover:scale-105 ${focusedApp.ghostClass}`}
            >
              <GhostIcon size={124} strokeWidth={1.15} />
            </div>
          )}

          {/* Top-Pinned Badge + Title + Chips (Never shifts vertically) */}
          <div className="relative z-10 flex flex-col items-start">
            <div className="w-full h-[24px] flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-mono uppercase tracking-wider leading-none ${focusedApp.chipClass}`}
                >
                  {focusedApp.subtitle}
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-900/90 border border-slate-800 text-[10px] font-mono text-slate-400 leading-none">
                  #{focusedIndex + 1}
                </span>
              </div>

              {activePluginId === focusedApp.id && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  ACTIVE
                </span>
              )}
            </div>

            <h3 className="text-[19px] font-bold text-slate-100 tracking-tight leading-none h-[24px] flex items-center">
              {focusedApp.name}
            </h3>

            <div className="flex items-center gap-1.5 flex-wrap mt-3.5">
              {focusedApp.chips.map((chip) => (
                <span
                  key={chip}
                  className={`px-2 py-0.5 rounded-md border text-[10.5px] font-medium ${focusedApp.chipClass}`}
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>

          {/* Bottom Action Strip */}
          <div className="relative z-10 flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
            <span className="font-mono text-[11px] text-slate-400 group-hover:text-slate-200 transition-colors">
              {focusedApp.quickHint}
            </span>
            <kbd className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700/80 text-slate-200 font-mono text-[10px]">
              Enter ↵
            </kbd>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(AppsLauncherPanel);
