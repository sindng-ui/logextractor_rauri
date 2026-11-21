import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { LayoutGrid } from 'lucide-react';
import { AppLauncherEntry } from '../../plugins/appsRegistry';
import AppsLauncherPanel from './AppsLauncherPanel';

interface AppsHomeViewProps {
  apps: AppLauncherEntry[];
  onSelectApp: (id: string) => void;
  onOpenSettings: () => void;
}

/**
 * Startup Apps Home Screen displayed immediately on app launch before any heavy app mounts.
 * Zero-Blur, minimal chrome, full keyboard navigation (1–9, ↑/↓, Enter).
 */
const AppsHomeView: React.FC<AppsHomeViewProps> = ({
  apps,
  onSelectApp,
  onOpenSettings,
}) => {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [sweepTick, setSweepTick] = useState(1);
  const focusedIndexRef = useRef(0);

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
      <header className="h-12 shrink-0 title-drag pl-4 pr-[144px] flex items-center justify-between">
        <div className="flex items-center gap-2 no-drag">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-400/25 flex items-center justify-center text-indigo-300">
            <LayoutGrid size={13} />
          </div>
          <span className="text-xs font-bold tracking-tight text-slate-300">HappyTool</span>
        </div>
      </header>

      {/* Centered Dock-Rail Hybrid Launcher */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.68 }}
          style={{ willChange: 'transform, opacity' }}
          className="w-full max-w-[520px] bg-[#0b1120] border border-slate-700/80 rounded-2xl shadow-[0_28px_72px_rgba(2,6,23,0.92)]"
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

        <div className="mt-4 flex items-center gap-2 text-[11px] font-mono text-slate-500">
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
