import React from 'react';
import {
  ArrowUpRight,
  Circle,
  Crop,
  Focus,
  Grid2x2,
  Highlighter,
  ListOrdered,
  MousePointer2,
  Pencil,
  Scissors,
  Square,
  Type,
} from 'lucide-react';
import { AnnotatorTool } from '../../../types/screenshotAnnotator';

interface ToolEntry {
  id: AnnotatorTool;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  group: 'nav' | 'draw' | 'pro';
}

const TOOL_ITEMS: ToolEntry[] = [
  { id: 'select', label: 'Select / Move', shortcut: 'V', icon: MousePointer2, group: 'nav' },
  { id: 'rect', label: 'Rectangle', shortcut: '1', icon: Square, group: 'draw' },
  { id: 'ellipse', label: 'Ellipse', shortcut: '2', icon: Circle, group: 'draw' },
  { id: 'arrow', label: 'Arrow (Straight / Curved)', shortcut: '3', icon: ArrowUpRight, group: 'draw' },
  { id: 'step', label: 'Step Badge (Click=Badge, Drag=+Arrow)', shortcut: '4', icon: ListOrdered, group: 'draw' },
  { id: 'text', label: 'Text / Callout', shortcut: '5', icon: Type, group: 'draw' },
  { id: 'highlighter', label: 'Highlighter', shortcut: '6', icon: Highlighter, group: 'draw' },
  { id: 'mosaic', label: 'Mosaic / Redact', shortcut: '7', icon: Grid2x2, group: 'draw' },
  { id: 'freehand', label: 'Freehand Pen', shortcut: '8', icon: Pencil, group: 'draw' },
  { id: 'spotlight', label: 'Spotlight (Dim Background)', shortcut: 'S', icon: Focus, group: 'pro' },
  { id: 'cutout', label: 'Cut-out (Remove Middle Strip)', shortcut: 'X', icon: Scissors, group: 'pro' },
  { id: 'crop', label: 'Crop Region', shortcut: 'C', icon: Crop, group: 'pro' },
];

interface AnnotatorToolRailProps {
  activeTool: AnnotatorTool;
  onSelectTool: (tool: AnnotatorTool) => void;
}

const AnnotatorToolRail: React.FC<AnnotatorToolRailProps> = ({ activeTool, onSelectTool }) => {
  const renderGroup = (group: ToolEntry['group']) =>
    TOOL_ITEMS.filter((t) => t.group === group).map((item) => {
      const Icon = item.icon;
      const active = activeTool === item.id;
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelectTool(item.id)}
          title={`${item.label} (${item.shortcut})`}
          className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            active
              ? 'bg-indigo-600 text-white border border-indigo-400/60 shadow'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/90 border border-transparent'
          }`}
        >
          <Icon size={17} strokeWidth={active ? 2.2 : 1.9} />
          <span
            className={`absolute bottom-0.5 right-1 text-[8.5px] font-mono font-bold leading-none ${
              active ? 'text-indigo-100' : 'text-slate-500'
            }`}
          >
            {item.shortcut}
          </span>
        </button>
      );
    });

  return (
    <aside className="w-14 shrink-0 bg-[#0d1424] border-r border-indigo-500/20 flex flex-col items-center py-2.5 gap-1.5 overflow-y-auto custom-scrollbar select-none z-20">
      {renderGroup('nav')}
      <div className="w-7 h-px bg-slate-800 my-0.5" />
      {renderGroup('draw')}
      <div className="w-7 h-px bg-slate-800 my-0.5" />
      {renderGroup('pro')}
    </aside>
  );
};

export default React.memo(AnnotatorToolRail);
