import {
  AnnotatorStyleState,
  AnnotatorTool,
  DEFAULT_FRAME_CONFIG,
  DEFAULT_SPOTLIGHT_CONFIG,
  DEFAULT_STYLE_STATE,
  FrameConfig,
  SpotlightConfig,
} from '../types/screenshotAnnotator';

export const ANNOTATOR_PREFS_STORAGE_KEY = 'happytool_snap_studio_prefs_v1';

export interface AnnotatorPreferences {
  tool: AnnotatorTool;
  style: AnnotatorStyleState;
  frameConfig: FrameConfig;
  spotlightConfig: SpotlightConfig;
}

const VALID_TOOLS: ReadonlySet<AnnotatorTool> = new Set([
  'select',
  'rect',
  'ellipse',
  'arrow',
  'step',
  'text',
  'highlighter',
  'mosaic',
  'freehand',
  'spotlight',
  'cutout',
  'crop',
]);

export function getDefaultAnnotatorPreferences(): AnnotatorPreferences {
  return {
    tool: 'arrow',
    style: { ...DEFAULT_STYLE_STATE },
    frameConfig: { ...DEFAULT_FRAME_CONFIG },
    spotlightConfig: { ...DEFAULT_SPOTLIGHT_CONFIG },
  };
}

export function loadAnnotatorPreferences(): AnnotatorPreferences {
  const defaults = getDefaultAnnotatorPreferences();
  try {
    if (typeof window === 'undefined' || !window.localStorage) return defaults;
    const raw = window.localStorage.getItem(ANNOTATOR_PREFS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AnnotatorPreferences>;

    const tool: AnnotatorTool =
      parsed.tool && VALID_TOOLS.has(parsed.tool) ? parsed.tool : defaults.tool;

    const rawStyle = parsed.style ?? ({} as Partial<AnnotatorStyleState>);
    const textVariant =
      rawStyle.textVariant === 'border' ||
      rawStyle.textVariant === 'pill' ||
      rawStyle.textVariant === 'outline'
        ? rawStyle.textVariant
        : defaults.style.textVariant;

    const style: AnnotatorStyleState = {
      ...defaults.style,
      ...rawStyle,
      textVariant,
      strokeWidth:
        typeof rawStyle.strokeWidth === 'number' && Number.isFinite(rawStyle.strokeWidth)
          ? rawStyle.strokeWidth
          : defaults.style.strokeWidth,
      fontSize:
        typeof rawStyle.fontSize === 'number' && Number.isFinite(rawStyle.fontSize)
          ? rawStyle.fontSize
          : defaults.style.fontSize,
      fillOpacity:
        typeof rawStyle.fillOpacity === 'number' && Number.isFinite(rawStyle.fillOpacity)
          ? rawStyle.fillOpacity
          : defaults.style.fillOpacity,
      mosaicBlockSize:
        typeof rawStyle.mosaicBlockSize === 'number' && Number.isFinite(rawStyle.mosaicBlockSize)
          ? rawStyle.mosaicBlockSize
          : defaults.style.mosaicBlockSize,
    };

    const frameConfig: FrameConfig = {
      ...defaults.frameConfig,
      ...(parsed.frameConfig ?? {}),
    };

    const rawDim = parsed.spotlightConfig?.dimOpacity;
    const spotlightConfig: SpotlightConfig = {
      dimOpacity:
        typeof rawDim === 'number' && Number.isFinite(rawDim)
          ? Math.max(0.1, Math.min(0.9, rawDim))
          : defaults.spotlightConfig.dimOpacity,
    };

    return { tool, style, frameConfig, spotlightConfig };
  } catch {
    return defaults;
  }
}

export function saveAnnotatorPreferences(prefs: AnnotatorPreferences): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(ANNOTATOR_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore quota / privacy mode errors
  }
}
