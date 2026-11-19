import React from 'react';
import { Braces } from 'lucide-react';
import { ToolId } from '../types';

export interface AppLauncherEntry {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  gradient: string;
  accentBg: string;
  accentText: string;
  radialGlow: string;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
}

const LazyJsonBeautify = React.lazy(() => import('../components/JsonBeautify'));

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
    icon: Braces,
    gradient: 'from-indigo-500 to-cyan-500',
    accentBg: 'bg-indigo-600/85',
    accentText: 'text-indigo-200',
    radialGlow: 'rgba(99, 102, 241, 0.28)',
    component: LazyJsonBeautify,
  },
];
