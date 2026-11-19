import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, X, ArrowLeft, Plus } from 'lucide-react';
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

const SILK_EASE = [0.16, 1, 0.3, 1] as const;

const AppsLauncherModal: React.FC<AppsLauncherModalProps> = ({
  isOpen,
  onClose,
  apps,
  activePluginId,
  onSelectApp,
}) => {
  const [focusedIndex, setFocusedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(0);
    }
  }, [isOpen]);

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

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % apps.length);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + apps.length) % apps.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = apps[focusedIndex];
        if (target) {
          onSelectApp(target.id);
          onClose();
        }
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < apps.length) {
          e.preventDefault();
          onSelectApp(apps[idx].id);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, apps, focusedIndex, onSelectApp, onClose]);

  const handleSelect = (id: string) => {
    onSelectApp(id);
    onClose();
  };

  const isInSubApp = activePluginId !== ToolId.LOG_EXTRACTOR;
  const focusedApp = apps[focusedIndex] ?? apps[0];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[950000] flex items-start justify-start p-3 overflow-hidden">
          {/* Quiet Navy Backdrop (Matches #0B0F19 app tone, Zero blur) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onClick={onClose}
            className="absolute inset-0 bg-[#050814]/65"
          />

          {/* Main Apps Popover — Anchored to top-left Apps button with refined spring */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{
              type: 'spring',
              stiffness: 430,
              damping: 31,
              mass: 0.68,
            }}
            style={{ willChange: 'transform, opacity', transformOrigin: 'top left' }}
            className="relative w-full max-w-[508px] mt-[56px] ml-0.5 bg-[#0b1120] border border-indigo-500/25 rounded-2xl shadow-[0_24px_64px_rgba(2,6,23,0.85)] flex flex-col"
          >
            {/* Subtle Anchor Caret pointing to top-left Apps button */}
            <div className="absolute -top-[5px] left-[15px] w-2.5 h-2.5 rotate-45 bg-[#0f172a] border-l border-t border-indigo-500/30 z-20 pointer-events-none" />

            {/* Inner clipped frame */}
            <div className="relative rounded-2xl overflow-hidden flex flex-col">
              {/* Single-pass indigo-slate specular sweep on open (GPU translateX, zero loop) */}
              <motion.div
                initial={{ x: '-100%', opacity: 0.9 }}
                animate={{ x: '230%', opacity: 0 }}
                transition={{ duration: 0.56, ease: SILK_EASE }}
                className="absolute top-0 left-0 w-1/2 h-px bg-gradient-to-r from-transparent via-indigo-400/75 to-transparent pointer-events-none z-30"
              />

              {/* Subtle Top Specular Hairline */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-500/10 via-indigo-400/35 to-indigo-500/10 pointer-events-none z-20" />

              {/* Header — Matches TopBar #0f172a + indigo-500/20 */}
              <div className="relative z-10 px-4 py-3 border-b border-indigo-500/20 bg-[#0f172a] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-400/25 flex items-center justify-center text-indigo-300">
                    <LayoutGrid size={14} strokeWidth={2} />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13.5px] font-bold text-slate-100 tracking-tight">
                      Apps
                    </span>
                    <span className="text-[10px] font-mono text-indigo-300/80 px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                      {apps.length}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {isInSubApp && (
                    <button
                      type="button"
                      onClick={() => handleSelect(ToolId.LOG_EXTRACTOR)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-indigo-600/80 border border-indigo-500/25 text-[11px] font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors"
                    >
                      <ArrowLeft size={12} /> Log Extractor
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 flex items-center justify-center transition-colors"
                    title="Close (Esc)"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* 4-Column Grid with Subtle Micro-Dot Matrix & Ambient Corner Depth (Zero blur) */}
              <div
                className="relative z-10 p-4 min-h-[148px] max-h-[65vh] overflow-y-auto custom-scrollbar"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 0% 0%, rgba(99, 102, 241, 0.10) 0%, transparent 55%), radial-gradient(rgba(148, 163, 184, 0.09) 1px, transparent 1px)',
                  backgroundSize: '100% 100%, 18px 18px',
                }}
              >
                <div className="grid grid-cols-4 gap-3">
                  {apps.map((app, idx) => (
                    <AppLauncherCard
                      key={app.id}
                      app={app}
                      index={idx}
                      isActive={activePluginId === app.id}
                      isFocused={focusedIndex === idx}
                      onSelect={handleSelect}
                      onHover={setFocusedIndex}
                    />
                  ))}

                  {/* Single understated ghost slot hinting extensibility */}
                  {apps.length < 4 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.25, delay: 0.12 }}
                      aria-hidden="true"
                      className="h-[112px] rounded-2xl border border-dashed border-indigo-500/15 bg-slate-900/25 flex flex-col items-center justify-center gap-1.5 text-slate-600 select-none"
                    >
                      <Plus size={16} strokeWidth={1.6} className="opacity-60" />
                      <span className="text-[10px] font-medium tracking-wide opacity-70">
                        More soon
                      </span>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Live Preview Footer — Matches #080d1a deep slate */}
              <div className="relative z-10 px-4 py-2.5 border-t border-indigo-500/15 bg-[#080d1a] flex items-center justify-between gap-3 text-[11px]">
                <div className="min-w-0 flex-1 truncate text-slate-400">
                  {focusedApp ? (
                    <>
                      <span className="text-indigo-300 font-semibold">{focusedApp.name}</span>
                      <span className="mx-1.5 text-slate-600">·</span>
                      <span>{focusedApp.description}</span>
                    </>
                  ) : (
                    <span>Select an app</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px] text-slate-500">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-indigo-500/20 text-slate-400">
                    Enter
                  </kbd>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-indigo-500/20 text-slate-400">
                    Esc
                  </kbd>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AppsLauncherModal;
