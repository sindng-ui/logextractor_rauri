import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { AppLauncherEntry } from '../../plugins/appsRegistry';

interface AppLauncherCardProps {
  app: AppLauncherEntry;
  index: number;
  isActive: boolean;
  isFocused: boolean;
  onSelect: (id: string) => void;
  onHover: (index: number) => void;
}

const SILK_EASE = [0.16, 1, 0.3, 1] as const;

const AppLauncherCard: React.FC<AppLauncherCardProps> = ({
  app,
  index,
  isActive,
  isFocused,
  onSelect,
  onHover,
}) => {
  const Icon = app.icon;

  const cardVariants = useMemo(
    () => ({
      hidden: {
        opacity: 0,
        y: 12,
        scale: 0.95,
      },
      visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
          type: 'spring' as const,
          stiffness: 380,
          damping: 28,
          mass: 0.7,
          delay: 0.04 + index * 0.04,
        },
      },
    }),
    [index]
  );

  const iconVariants = useMemo(
    () => ({
      hidden: {
        opacity: 0,
        y: 6,
        scale: 0.86,
      },
      visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
          type: 'spring' as const,
          stiffness: 400,
          damping: 24,
          delay: 0.085 + index * 0.04,
        },
      },
    }),
    [index]
  );

  return (
    <motion.button
      type="button"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{
        y: -3,
        transition: { duration: 0.18, ease: SILK_EASE },
      }}
      whileTap={{
        scale: 0.965,
        transition: { duration: 0.08, ease: 'easeOut' },
      }}
      onClick={() => onSelect(app.id)}
      onMouseEnter={() => onHover(index)}
      title={`${app.name} — ${app.description}`}
      style={{ willChange: 'transform, opacity' }}
      className={`group relative w-full h-[112px] rounded-2xl border px-2.5 py-3 overflow-hidden flex flex-col items-center justify-center gap-2 text-center transition-[border-color,background-color] duration-200 ${
        isActive
          ? 'bg-[#131d36] border-indigo-400/55'
          : isFocused
            ? 'bg-[#121b31] border-indigo-400/35'
            : 'bg-[#0f172a]/90 border-indigo-500/15 hover:bg-[#131d36] hover:border-indigo-400/40'
      }`}
    >
      {/* Subtle diagonal silk sheen sweep on hover (GPU transform only, zero blur) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl z-10">
        <div className="absolute -inset-y-4 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-indigo-200/[0.08] to-transparent translate-x-0 group-hover:translate-x-[360%] transition-transform duration-700 ease-out" />
      </div>

      {/* Top specular hairline */}
      <div
        className={`absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/45 to-transparent pointer-events-none transition-opacity duration-200 ${
          isActive || isFocused ? 'opacity-100' : 'opacity-30 group-hover:opacity-100'
        }`}
      />

      {/* Quiet indigo radial depth behind icon (Zero blur) */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-200 ${
          isActive || isFocused ? 'opacity-100' : 'opacity-45 group-hover:opacity-100'
        }`}
        style={{
          background:
            'radial-gradient(circle at 50% 30%, rgba(99, 102, 241, 0.16) 0%, transparent 72%)',
        }}
      />

      {/* Top-right quiet index badge */}
      <span
        className={`absolute top-2 right-2 text-[10px] font-mono leading-none px-1.5 py-0.5 rounded-md border transition-colors duration-150 z-20 ${
          isFocused || isActive
            ? 'bg-indigo-500/15 border-indigo-400/30 text-indigo-200'
            : 'bg-slate-950/60 border-slate-800/80 text-slate-500 group-hover:text-indigo-300 group-hover:border-indigo-500/30'
        }`}
      >
        {index + 1}
      </span>

      {/* Top-left active indicator */}
      {isActive && (
        <span
          className="absolute top-2.5 left-2.5 w-1.5 h-1.5 rounded-full bg-indigo-400 z-20"
          title="Currently Active"
        />
      )}

      {/* Layered Icon Capsule (2nd beat entrance + gentle hover lift) */}
      <motion.div
        variants={iconVariants}
        className={`relative z-20 w-11 h-11 rounded-xl border flex items-center justify-center transition-[transform,border-color,background-color,color] duration-200 group-hover:-translate-y-0.5 group-hover:scale-105 shrink-0 ${
          isActive
            ? 'bg-gradient-to-br from-indigo-500/35 to-indigo-700/25 border-indigo-400/50 text-indigo-200'
            : 'bg-gradient-to-br from-indigo-500/20 to-slate-900/90 border-indigo-400/25 text-indigo-300 group-hover:from-indigo-500/30 group-hover:to-indigo-700/20 group-hover:border-indigo-400/50 group-hover:text-white'
        }`}
      >
        <div className="absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-indigo-200/35 to-transparent pointer-events-none" />
        <Icon size={21} strokeWidth={2} />
      </motion.div>

      {/* Crisp App Label + Subtle Accent Bar */}
      <div className="relative z-20 w-full px-0.5 flex flex-col items-center gap-1">
        <div
          className={`text-[11.5px] font-semibold tracking-tight leading-tight truncate max-w-full transition-colors duration-150 ${
            isActive || isFocused
              ? 'text-slate-100'
              : 'text-slate-300 group-hover:text-white'
          }`}
        >
          {app.name}
        </div>
        <div
          className={`h-[2px] w-7 rounded-full bg-indigo-400/75 transition-transform duration-200 origin-center ${
            isActive
              ? 'scale-x-100 opacity-100'
              : 'scale-x-0 group-hover:scale-x-100 opacity-80'
          }`}
        />
      </div>
    </motion.button>
  );
};

export default React.memo(AppLauncherCard);
