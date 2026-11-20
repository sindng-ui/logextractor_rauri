import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLauncherEntry } from '../../plugins/appsRegistry';
import AppsLauncherPanel from './AppsLauncherPanel';

interface AppsLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  apps: AppLauncherEntry[];
  activePluginId: string | null;
  onSelectApp: (id: string) => void;
}

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

            <AppsLauncherPanel
              apps={apps}
              activePluginId={activePluginId}
              focusedIndex={focusedIndex}
              sweepTick={sweepTick}
              mode="popover"
              onFocusChange={handleFocusChange}
              onSelectApp={handleSelect}
              onClose={onClose}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AppsLauncherModal;
