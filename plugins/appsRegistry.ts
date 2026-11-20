import React from 'react';
import { Braces, Camera } from 'lucide-react';
import { ToolId } from '../types';

export interface AppLauncherEntry {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  quickHint: string;
  chips: string[];
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  gradient: string;
  accentBg: string;
  accentText: string;
  radialGlow: string;
  dockShadow: string;
  sweepGradient: string;
  edgeBarClass: string;
  activeRowClass: string;
  chipClass: string;
  ghostClass: string;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
}

const LazyJsonBeautify = React.lazy(() => import('../components/JsonBeautify'));
const LazyScreenshotAnnotator = React.lazy(() => import('../components/ScreenshotAnnotator'));

/**
 * Extensible Apps Registry for the Ctrl+Shift+P Apps Launcher.
 * Add new entries here to automatically register them in the launcher & app router.
 */
export const APPS_REGISTRY: AppLauncherEntry[] = [
  {
    id: ToolId.JSON_TOOLS,
    name: 'JSON Beautify',
    subtitle: 'Visual Analyzer',
    description: 'Tree, Canvas Graph, Finder Columns, Smart Table & TS Schema for 500KB+ JSON',
    quickHint: 'Ctrl+V → Visualize',
    chips: ['Tree', 'Graph', 'Columns', 'Table', 'TS Schema'],
    icon: Braces,
    gradient: 'from-indigo-500 to-cyan-500',
    accentBg: 'bg-indigo-600/85',
    accentText: 'text-indigo-200',
    radialGlow: 'rgba(99, 102, 241, 0.22)',
    dockShadow: '0 8px 20px rgba(99, 102, 241, 0.38)',
    sweepGradient:
      'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 20%, rgba(255,255,255,0.125) 35%, rgba(255,255,255,0.03) 48%, rgba(255,255,255,0.075) 62%, rgba(165,180,252,0.035) 74%, transparent 100%)',
    edgeBarClass: 'bg-indigo-400',
    activeRowClass: 'bg-indigo-500/15 border-indigo-400/40',
    chipClass: 'bg-indigo-500/15 border-indigo-400/30 text-indigo-200',
    ghostClass: 'text-indigo-400/[0.08]',
    component: LazyJsonBeautify,
  },
  {
    id: ToolId.SCREENSHOT_ANNOTATOR,
    name: 'Snap Studio',
    subtitle: 'Quick Annotator',
    description: '3s Paste → Arrows, Steps, Mosaic, Spotlight, Cut-out, Stitch & Frame → Copy',
    quickHint: 'Paste → Mark → Copy',
    chips: ['Arrows', 'Mosaic', 'Spotlight', 'Cut-out', 'Stitch'],
    icon: Camera,
    gradient: 'from-rose-500 to-amber-500',
    accentBg: 'bg-rose-600/85',
    accentText: 'text-rose-200',
    radialGlow: 'rgba(244, 63, 94, 0.22)',
    dockShadow: '0 8px 20px rgba(244, 63, 94, 0.36)',
    sweepGradient:
      'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 20%, rgba(255,255,255,0.125) 35%, rgba(255,255,255,0.03) 48%, rgba(255,255,255,0.075) 62%, rgba(253,164,175,0.035) 74%, transparent 100%)',
    edgeBarClass: 'bg-rose-400',
    activeRowClass: 'bg-rose-500/15 border-rose-400/40',
    chipClass: 'bg-rose-500/15 border-rose-400/30 text-rose-200',
    ghostClass: 'text-rose-400/[0.08]',
    component: LazyScreenshotAnnotator,
  },
];
