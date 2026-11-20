import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLauncherEntry } from '../../plugins/appsRegistry';

interface AppLaunchCurtainProps {
  app: AppLauncherEntry | null;
}

const REVEAL_EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Ready-Gate Curtain overlay shown only during an app's very first mount/hydration.
 * Masks intermediate empty/loading frames so the user sees one smooth fade-in to the final UI.
 * Zero-Blur, 100% GPU transform/opacity.
 */
const AppLaunchCurtain: React.FC<AppLaunchCurtainProps> = ({ app }) => {
  const Icon = app?.icon;

  return (
    <AnimatePresence>
      {app && (
        <motion.div
          key={app.id}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.015 }}
          transition={{ duration: 0.28, ease: REVEAL_EASE }}
          style={{
            willChange: 'opacity, transform',
            backgroundColor: '#070b14',
          }}
          className="fixed inset-0 z-[940000] flex flex-col items-center justify-center pointer-events-auto select-none"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.2, ease: REVEAL_EASE }}
            className="flex flex-col items-center"
          >
            {Icon && (
              <div
                style={{ boxShadow: app.dockShadow }}
                className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${app.gradient} border border-white/25 text-white flex items-center justify-center mb-4`}
              >
                <Icon size={25} strokeWidth={2.1} />
              </div>
            )}

            <div className="text-sm font-bold text-slate-100 tracking-tight">{app.name}</div>

            {/* Slim single-pass progress hairline synced to 1s minimum hold (Zero-Blur, GPU scaleX) */}
            <div className="mt-3.5 w-28 h-[2px] rounded-full bg-slate-800/90 overflow-hidden">
              <motion.div
                initial={{ scaleX: 0.08 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.96, ease: REVEAL_EASE }}
                style={{ transformOrigin: 'left center', willChange: 'transform' }}
                className={`h-full w-full bg-gradient-to-r ${app.gradient}`}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default React.memo(AppLaunchCurtain);
