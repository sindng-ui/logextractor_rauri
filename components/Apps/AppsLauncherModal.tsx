import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X } from 'lucide-react';
import { AppLauncherEntry } from '../../plugins/appsRegistry';
import { ToolId } from '../../types';
import AppLauncherCard from './AppLauncherCard';

interface AppsLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  apps: AppLauncherEntry[];
  activePluginId: string;
  onSelectApp: (id: string) => void;
}

const SWEEP_EASE = [0.25, 0.1, 0.25, 1] as const;
const SWEEP_DURATION = 0.85;

const AppsLauncherModal: React.FC<AppsLauncherModalProps> = ({
  isOpen,
  onClose,
  apps,
  activePluginId,
  onSelectApp,
}) => {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [sweepTick, setSweepTick] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const activeIdx = apps.findIndex((a) => a.id === activePluginId);
    setFocusedIndex(activeIdx >= 0 ? activeIdx : 0);
    setSweepTick((t) => t + 1);
  }, [isOpen, apps, activePluginId]);

  const handleFocusChange = useCallback((nextIndex: number) => {
    setFocusedIndex((prev) => {
      if (prev !== nextIndex) {
        setSweepTick((t) => t + 1);
      }
      return nextIndex;
    });
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      onSelectApp(id);
      onClose();
    },
    [onSelectApp, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (apps.length === 0) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = (prev + 1) % apps.length;
          if (next !== prev) setSweepTick((t) => t + 1);
          return next;
        });
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = (prev - 1 + apps.length) % apps.length;
          if (next !== prev) setSweepTick((t) => t + 1);
          return next;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = apps[focusedIndex];
        if (target) {
          handleSelect(target.id);
        }
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < apps.length) {
          e.preventDefault();
          handleSelect(apps[idx].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, apps, focusedIndex, handleSelect, onClose]);

  const isInSubApp = activePluginId !== ToolId.LOG_EXTRACTOR;
  const focusedApp = apps[focusedIndex] ?? apps[0];
  const GhostIcon = focusedApp?.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[950000] flex items-start justify-start p-3 overflow-hidden select-none">
          {/* Quiet Navy Backdrop (Zero blur) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            onClick={onClose}
            className="absolute inset-0 bg-[#050814]/65"
          />

          {/* Dock-Rail Hybrid Popover — Anchored to top-left Apps button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{
              type: 'spring',
              stiffness: 440,
              damping: 32,
              mass: 0.65,
            }}
            style={{ willChange: 'transform, opacity', transformOrigin: 'top left' }}
            className="relative w-full max-w-[492px] mt-[56px] ml-0.5 bg-[#0b1120] border border-slate-700/80 rounded-2xl shadow-[0_24px_64px_rgba(2,6,23,0.92)]"
          >
            {/* Anchor Caret */}
            <div className="absolute -top-[5px] left-[15px] w-2.5 h-2.5 rotate-45 bg-[#080d19] border-l border-t border-slate-700/80 z-20 pointer-events-none" />

            {/* Fixed-height Dock-Rail Hybrid Frame (zero vertical shift on app switch) */}
            <div className="relative rounded-2xl overflow-hidden flex h-[232px]">
              {/* Left Column: Text-Free Vertical Icon Dock Rail */}
              <div className="w-[76px] shrink-0 bg-[#080d19] border-r border-slate-800/90 py-3.5 flex flex-col items-center">
                <div className="flex-1 w-full overflow-y-auto custom-scrollbar flex flex-col items-center gap-3 py-0.5">
                  {apps.map((app, idx) => (
                    <AppLauncherCard
                      key={app.id}
                      app={app}
                      index={idx}
                      isActive={activePluginId === app.id}
                      isFocused={focusedIndex === idx}
                      onSelect={handleSelect}
                      onHover={handleFocusChange}
                    />
                  ))}
                </div>

                {/* Bottom Icon Button: Back to Logs or Close */}
                <div className="pt-2.5 mt-2 border-t border-slate-800/80 w-10 flex justify-center shrink-0">
                  {isInSubApp ? (
                    <button
                      type="button"
                      onClick={() => handleSelect(ToolId.LOG_EXTRACTOR)}
                      className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-indigo-600 border border-slate-700/80 hover:border-indigo-400/60 text-slate-400 hover:text-white flex items-center justify-center transition-colors active:scale-95"
                      title="Back to Log Extractor"
                    >
                      <ArrowLeft size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-500 hover:text-slate-200 flex items-center justify-center transition-colors active:scale-95"
                      title="Close (Esc)"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* Right Column: Static Aura + Focus-Triggered Glass Clear Sweep (0.85s, Zero-Blur) */}
              {focusedApp && (
                <div
                  onClick={() => handleSelect(focusedApp.id)}
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

                  {/* Top Edge Glass Glint (runs once per focus change, GPU transform only) */}
                  <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden pointer-events-none">
                    <motion.div
                      key={`glint-${sweepTick}`}
                      initial={{ x: '-100%', opacity: 0 }}
                      animate={{ x: ['-100%', '280%'], opacity: [0, 1, 0] }}
                      transition={{
                        duration: SWEEP_DURATION,
                        ease: SWEEP_EASE,
                        times: [0, 0.3, 1],
                      }}
                      style={{ willChange: 'transform, opacity' }}
                      className="w-1/3 h-full bg-gradient-to-r from-transparent via-white/60 to-transparent"
                    />
                  </div>

                  {/* Ultra-Thin Static Glass Specular Rim */}
                  <div className="absolute inset-x-0 top-[2px] h-px bg-gradient-to-r from-white/[0.04] via-white/[0.14] to-white/[0.03] pointer-events-none" />

                  {/* Double-Streak Glass Clear Specular Sweep on Focus Change (GPU only) */}
                  <div className="absolute inset-0 overflow-hidden pointer-events-none z-20">
                    <motion.div
                      key={`sweep-${sweepTick}`}
                      initial={{ x: '-140%', skewX: -22, opacity: 0 }}
                      animate={{
                        x: ['-140%', '320%'],
                        opacity: [0, 1, 0.95, 0],
                      }}
                      transition={{
                        duration: SWEEP_DURATION,
                        ease: SWEEP_EASE,
                        times: [0, 0.15, 0.85, 1],
                      }}
                      style={{
                        willChange: 'transform, opacity',
                        background: focusedApp.sweepGradient,
                      }}
                      className="absolute -inset-y-8 left-0 w-[38%]"
                    />
                  </div>

                  {/* Bottom-Right Subtle Ghost Watermark */}
                  {GhostIcon && (
                    <div
                      className={`absolute -right-5 -bottom-5 pointer-events-none transition-transform duration-300 group-hover:scale-105 ${focusedApp.ghostClass}`}
                    >
                      <GhostIcon size={120} strokeWidth={1.15} />
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AppsLauncherModal;
