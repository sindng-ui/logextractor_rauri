import React from 'react';
import { AppLauncherEntry } from '../../plugins/appsRegistry';

interface AppLauncherCardProps {
  app: AppLauncherEntry;
  index: number;
  isActive: boolean;
  isFocused: boolean;
  onSelect: (id: string) => void;
  onHover: (index: number) => void;
}

const AppLauncherCard: React.FC<AppLauncherCardProps> = ({
  app,
  index,
  isActive,
  isFocused,
  onSelect,
  onHover,
}) => {
  const Icon = app.icon;

  return (
    <div
      data-app-index={index}
      className="relative w-full shrink-0 flex items-center justify-center"
    >
      {/* Left edge rail active/focus indicator */}
      <span
        className={`absolute left-0 w-[3.5px] h-6 rounded-r transition-all duration-150 ${app.edgeBarClass} ${
          isFocused ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50'
        }`}
      />

      {/* Icon-only Squircle Dock Tile (GPU transform only, Zero-Blur) */}
      <button
        type="button"
        onClick={() => onSelect(app.id)}
        onMouseEnter={() => onHover(index)}
        title={`${app.name} (${index + 1})`}
        style={{
          boxShadow: isFocused ? app.dockShadow : undefined,
        }}
        className={`relative w-12 h-12 rounded-2xl bg-gradient-to-br ${app.gradient} text-white border flex items-center justify-center transition-[transform,opacity,border-color] duration-200 ease-out active:scale-95 ${
          isFocused
            ? 'opacity-100 scale-105 border-white/35'
            : 'opacity-65 hover:opacity-100 hover:scale-110 border-white/15'
        }`}
      >
        <Icon size={21} strokeWidth={2.2} />

        {/* Active running indicator dot */}
        {isActive && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#080d19]"
            title="Currently Active"
          />
        )}
      </button>
    </div>
  );
};

export default React.memo(AppLauncherCard);
