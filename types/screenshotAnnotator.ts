export type AnnotatorTool =
  | 'select'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'step'
  | 'text'
  | 'highlighter'
  | 'mosaic'
  | 'freehand'
  | 'spotlight'
  | 'cutout'
  | 'crop';

export interface Point {
  x: number;
  y: number;
}

export interface RectBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type TextVariant = 'border' | 'pill' | 'outline';
export type ArrowHeadMode = 'end' | 'both';
export type MosaicMode = 'pixelate' | 'solid';
export type CutoutStyle = 'zigzag' | 'wave' | 'gap';
export type StitchMode = 'replace' | 'right' | 'below' | 'overlay';

interface BaseAnnotation {
  id: string;
  color: string;
  strokeWidth: number;
}

export interface RectAnnotation extends BaseAnnotation {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  fillOpacity: number;
  borderRadius: number;
}

export interface EllipseAnnotation extends BaseAnnotation {
  type: 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
  fillOpacity: number;
}

export interface ArrowAnnotation extends BaseAnnotation {
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Optional quadratic Bezier control point for curved arrows */
  cx?: number;
  cy?: number;
  curved: boolean;
  /** Arrow head placement: 'end' (default single) or 'both' (bidirectional) */
  arrowHead?: ArrowHeadMode;
}

export interface StepAnnotation extends BaseAnnotation {
  type: 'step';
  x: number;
  y: number;
  number: number;
  size: number;
  /** Optional pointer tip when user drags from badge to target */
  targetX?: number;
  targetY?: number;
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  variant: TextVariant;
  /** Optional arrow pointer tip when user drags from text label to target */
  targetX?: number;
  targetY?: number;
}

export interface HighlighterAnnotation extends BaseAnnotation {
  type: 'highlighter';
  points: Point[];
}

export interface MosaicAnnotation extends BaseAnnotation {
  type: 'mosaic';
  x: number;
  y: number;
  w: number;
  h: number;
  mode: MosaicMode;
  blockSize: number;
  fillColor: string;
}

export interface FreehandAnnotation extends BaseAnnotation {
  type: 'freehand';
  points: Point[];
}

export interface SpotlightAnnotation extends BaseAnnotation {
  type: 'spotlight';
  x: number;
  y: number;
  w: number;
  h: number;
  shape: 'rect' | 'ellipse';
  borderRadius: number;
}

export interface OverlayImageAnnotation extends BaseAnnotation {
  type: 'overlayImage';
  x: number;
  y: number;
  w: number;
  h: number;
  dataUrl: string;
}

export type AnnotationItem =
  | RectAnnotation
  | EllipseAnnotation
  | ArrowAnnotation
  | StepAnnotation
  | TextAnnotation
  | HighlighterAnnotation
  | MosaicAnnotation
  | FreehandAnnotation
  | SpotlightAnnotation
  | OverlayImageAnnotation;

export interface CutoutRegion {
  id: string;
  /** 'y' removes a horizontal strip (reduces height); 'x' removes a vertical strip (reduces width) */
  axis: 'x' | 'y';
  start: number;
  end: number;
  style: CutoutStyle;
}

export interface FramePreset {
  id: string;
  label: string;
  type: 'solid' | 'gradient' | 'transparent';
  colors: string[];
  angle?: number;
}

export interface FrameConfig {
  enabled: boolean;
  presetId: string;
  padding: number;
  borderRadius: number;
  shadow: boolean;
  insetBorder: boolean;
}

export interface SpotlightConfig {
  dimOpacity: number;
}

export interface AnnotatorDocument {
  baseDataUrl: string;
  width: number;
  height: number;
  annotations: AnnotationItem[];
  cutouts: CutoutRegion[];
  cropRect: RectBox | null;
  frameConfig: FrameConfig;
  spotlightConfig: SpotlightConfig;
  nextStepNumber: number;
}

export interface AnnotatorHistoryMeta {
  id: string;
  title: string;
  updatedAt: number;
  width: number;
  height: number;
  annotationCount: number;
  thumbnailDataUrl: string;
  byteSize: number;
}

export interface AnnotatorStyleState {
  color: string;
  strokeWidth: number;
  fillOpacity: number;
  arrowCurved: boolean;
  arrowHead: ArrowHeadMode;
  textVariant: TextVariant;
  fontSize: number;
  mosaicMode: MosaicMode;
  mosaicBlockSize: number;
  spotlightShape: 'rect' | 'ellipse';
  cutoutStyle: CutoutStyle;
}

export const ANNOTATOR_COLORS = [
  '#ef4444', // Rose / Red (Default alert)
  '#f97316', // Orange
  '#eab308', // Amber / Yellow
  '#22c55e', // Emerald / Green
  '#06b6d4', // Cyan
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#f8fafc', // White
  '#0f172a', // Dark Slate
] as const;

export const HIGHLIGHTER_COLORS = [
  '#facc15', // Yellow
  '#4ade80', // Green
  '#38bdf8', // Sky
  '#f472b6', // Pink
  '#fb923c', // Orange
] as const;

export const FRAME_PRESETS: FramePreset[] = [
  { id: 'indigo-dusk', label: 'Indigo Dusk', type: 'gradient', colors: ['#1e1b4b', '#312e81', '#0f172a'], angle: 135 },
  { id: 'ocean-slate', label: 'Ocean Slate', type: 'gradient', colors: ['#0f172a', '#1e3a5f', '#0d9488'], angle: 135 },
  { id: 'sunset-amber', label: 'Sunset', type: 'gradient', colors: ['#4c1d95', '#be185d', '#f97316'], angle: 135 },
  { id: 'aurora-mint', label: 'Aurora', type: 'gradient', colors: ['#064e3b', '#0284c7', '#4f46e5'], angle: 135 },
  { id: 'obsidian', label: 'Obsidian', type: 'solid', colors: ['#0f172a'] },
  { id: 'graphite', label: 'Graphite', type: 'solid', colors: ['#334155'] },
  { id: 'paper-light', label: 'Paper Light', type: 'solid', colors: ['#e2e8f0'] },
  { id: 'clean-white', label: 'Pure White', type: 'solid', colors: ['#ffffff'] },
];

export const DEFAULT_FRAME_CONFIG: FrameConfig = {
  enabled: false,
  presetId: 'indigo-dusk',
  padding: 40,
  borderRadius: 14,
  shadow: true,
  insetBorder: true,
};

export const DEFAULT_SPOTLIGHT_CONFIG: SpotlightConfig = {
  dimOpacity: 0.58,
};

export const DEFAULT_STYLE_STATE: AnnotatorStyleState = {
  color: '#ef4444',
  strokeWidth: 4,
  fillOpacity: 0,
  arrowCurved: false,
  arrowHead: 'end',
  textVariant: 'border',
  fontSize: 16,
  mosaicMode: 'pixelate',
  mosaicBlockSize: 14,
  spotlightShape: 'rect',
  cutoutStyle: 'zigzag',
};
