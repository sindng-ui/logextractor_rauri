import React from 'react';
import * as Lucide from 'lucide-react';

interface TopRightActionsProps {
  onOpenSettings: () => void;
  isFocusMode?: boolean;
}

const TopRightActions: React.FC<TopRightActionsProps> = ({ onOpenSettings, isFocusMode }) => {
  if (isFocusMode) return null;

  return (
    <div className="absolute top-3 right-3 z-[110] flex items-center gap-2">
      <button
        onClick={onOpenSettings}
        className="w-10 h-10 flex items-center justify-center bg-slate-800/95 hover:bg-slate-700 border border-white/10 rounded-xl shadow-lg text-slate-400 hover:text-white transition-all duration-300 active:scale-90 group"
        style={{ WebkitAppRegion: 'no-drag' } as any}
        title="Settings"
      >
        <Lucide.Settings size={18} className="group-hover:rotate-90 transition-transform duration-500" />
      </button>
    </div>
  );
};

export default TopRightActions;
