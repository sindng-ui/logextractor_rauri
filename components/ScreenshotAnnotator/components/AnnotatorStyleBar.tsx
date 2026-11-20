import React from 'react';
import {
  Maximize2,
  RotateCcw,
  Spline,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ANNOTATOR_COLORS,
  AnnotatorStyleState,
  AnnotatorTool,
  CutoutStyle,
  HIGHLIGHTER_COLORS,
  TextVariant,
} from '../../../types/screenshotAnnotator';

interface AnnotatorStyleBarProps {
  tool: AnnotatorTool;
  style: AnnotatorStyleState;
  hasSelection: boolean;
  selectedType: string | null;
  nextStepNumber: number;
  cutoutCount: number;
  hasCrop: boolean;
  spotlightDimOpacity: number;
  zoomDisplay: number;
  onChangeStyle: (patch: Partial<AnnotatorStyleState>) => void;
  onResetStepNumber: () => void;
  onClearCutouts: () => void;
  onResetCrop: () => void;
  onChangeSpotlightDim: (opacity: number) => void;
  onDeleteSelected: () => void;
  onZoomChange: (percent: number) => void;
  onFitViewport: () => void;
}

const STROKE_WIDTHS = [2, 4, 6, 9];

const AnnotatorStyleBar: React.FC<AnnotatorStyleBarProps> = ({
  tool,
  style,
  hasSelection,
  selectedType,
  nextStepNumber,
  cutoutCount,
  hasCrop,
  spotlightDimOpacity,
  zoomDisplay,
  onChangeStyle,
  onResetStepNumber,
  onClearCutouts,
  onResetCrop,
  onChangeSpotlightDim,
  onDeleteSelected,
  onZoomChange,
  onFitViewport,
}) => {
  const effectiveTool = tool === 'select' && selectedType ? selectedType : tool;
  const palette = effectiveTool === 'highlighter' ? HIGHLIGHTER_COLORS : ANNOTATOR_COLORS;
  const showColors = !['mosaic', 'spotlight', 'cutout', 'crop', 'overlayImage'].includes(effectiveTool);
  const showStroke = ['rect', 'ellipse', 'arrow', 'step', 'highlighter', 'freehand'].includes(effectiveTool);

  return (
    <div className="h-11 shrink-0 bg-[#0b1120] border-b border-slate-800/90 px-3 flex items-center justify-between gap-3 overflow-x-auto custom-scrollbar select-none z-20">
      <div className="flex items-center gap-3 min-w-0">
        {/* Color Swatches */}
        {showColors && (
          <div className="flex items-center gap-1.5">
            {palette.map((c) => {
              const active = style.color.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChangeStyle({ color: c })}
                  className={`w-5 h-5 rounded-full border transition-transform ${
                    active
                      ? 'scale-110 ring-2 ring-indigo-400 border-white'
                      : 'border-white/25 hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              );
            })}
          </div>
        )}

        {/* Stroke Width */}
        {showStroke && (
          <div className="flex items-center gap-1 bg-slate-900 px-1.5 py-1 rounded-lg border border-slate-800">
            {STROKE_WIDTHS.map((w) => {
              const active = style.strokeWidth === w;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => onChangeStyle({ strokeWidth: w })}
                  className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                    active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                  }`}
                  title={`Stroke ${w}px`}
                >
                  <span
                    className="rounded-full bg-current"
                    style={{ width: Math.min(12, w + 2), height: Math.min(12, w + 2) }}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Shape Fill Opacity */}
        {(effectiveTool === 'rect' || effectiveTool === 'ellipse') && (
          <button
            type="button"
            onClick={() => onChangeStyle({ fillOpacity: style.fillOpacity > 0 ? 0 : 0.18 })}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
              style.fillOpacity > 0
                ? 'bg-indigo-600/30 border-indigo-400/50 text-indigo-200'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {style.fillOpacity > 0 ? 'Fill: Soft' : 'Fill: Off'}
          </button>
        )}

        {/* Curved Arrow Toggle */}
        {effectiveTool === 'arrow' && (
          <button
            type="button"
            onClick={() => onChangeStyle({ arrowCurved: !style.arrowCurved })}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 transition-colors ${
              style.arrowCurved
                ? 'bg-indigo-600/30 border-indigo-400/50 text-indigo-200'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle curved Bezier arrow (drag diamond handle in Select mode to bend)"
          >
            <Spline size={12} />
            <span>{style.arrowCurved ? 'Curved' : 'Straight'}</span>
          </button>
        )}

        {/* Step Counter Info */}
        {effectiveTool === 'step' && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono">
              Next: #{nextStepNumber}
            </span>
            <button
              type="button"
              onClick={onResetStepNumber}
              className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white flex items-center gap-1"
              title="Reset next step badge to #1"
            >
              <RotateCcw size={11} />
              <span>Reset #1</span>
            </button>
          </div>
        )}

        {/* Text Variant & Font Size */}
        {effectiveTool === 'text' && (
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              {(['border', 'pill', 'outline'] as TextVariant[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChangeStyle({ textVariant: v })}
                  className={`px-2 py-0.5 rounded capitalize font-semibold transition-colors ${
                    style.textVariant === v
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded-lg border border-slate-800 text-[11px]">
              {[14, 16, 20, 26].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => onChangeStyle({ fontSize: sz })}
                  className={`px-1.5 py-0.5 rounded font-mono ${
                    style.fontSize === sz
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mosaic Mode & Block Size */}
        {effectiveTool === 'mosaic' && (
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              {(['pixelate', 'solid'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChangeStyle({ mosaicMode: m })}
                  className={`px-2 py-0.5 rounded capitalize font-semibold ${
                    style.mosaicMode === m
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m === 'pixelate' ? 'Pixelate' : 'Solid Redact'}
                </button>
              ))}
            </div>
            {style.mosaicMode === 'pixelate' && (
              <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span>Block</span>
                <input
                  type="range"
                  min={6}
                  max={28}
                  step={2}
                  value={style.mosaicBlockSize}
                  onChange={(e) => onChangeStyle({ mosaicBlockSize: Number(e.target.value) })}
                  className="w-20 accent-indigo-500"
                />
                <span className="font-mono text-slate-300 w-6">{style.mosaicBlockSize}</span>
              </label>
            )}
          </div>
        )}

        {/* Spotlight Options */}
        {effectiveTool === 'spotlight' && (
          <div className="flex items-center gap-2.5">
            <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              {(['rect', 'ellipse'] as const).map((sh) => (
                <button
                  key={sh}
                  type="button"
                  onClick={() => onChangeStyle({ spotlightShape: sh })}
                  className={`px-2 py-0.5 rounded capitalize font-semibold ${
                    style.spotlightShape === sh
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sh}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span>Dim</span>
              <input
                type="range"
                min={20}
                max={85}
                value={Math.round(spotlightDimOpacity * 100)}
                onChange={(e) => onChangeSpotlightDim(Number(e.target.value) / 100)}
                className="w-20 accent-indigo-500"
              />
              <span className="font-mono text-slate-300 w-8">{Math.round(spotlightDimOpacity * 100)}%</span>
            </label>
          </div>
        )}

        {/* Cut-out Style & Reset */}
        {effectiveTool === 'cutout' && (
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              {(['zigzag', 'wave', 'gap'] as CutoutStyle[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => onChangeStyle({ cutoutStyle: st })}
                  className={`px-2 py-0.5 rounded capitalize font-semibold ${
                    style.cutoutStyle === st
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-500 hidden lg:inline">
              Drag vertically or horizontally across empty section to collapse
            </span>
            {cutoutCount > 0 && (
              <button
                type="button"
                onClick={onClearCutouts}
                className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-rose-950 border border-slate-800 text-[11px] text-rose-300 flex items-center gap-1"
              >
                <RotateCcw size={11} />
                <span>Restore ({cutoutCount})</span>
              </button>
            )}
          </div>
        )}

        {/* Crop Reset */}
        {effectiveTool === 'crop' && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-400">Drag a region to crop (non-destructive)</span>
            {hasCrop && (
              <button
                type="button"
                onClick={onResetCrop}
                className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-indigo-300 flex items-center gap-1"
              >
                <RotateCcw size={11} />
                <span>Reset Crop</span>
              </button>
            )}
          </div>
        )}

        {/* Delete Selected Button */}
        {hasSelection && (
          <button
            type="button"
            onClick={onDeleteSelected}
            className="px-2 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/35 text-rose-200 text-[11px] font-semibold flex items-center gap-1"
            title="Delete selected item (Del)"
          >
            <Trash2 size={12} />
            <span>Delete</span>
          </button>
        )}
      </div>

      {/* Right Zoom Controls */}
      <div className="flex items-center gap-1 shrink-0 bg-slate-900 px-1.5 py-0.5 rounded-lg border border-slate-800 text-[11px]">
        <button
          type="button"
          onClick={() => onZoomChange(zoomDisplay - 20)}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          title="Zoom Out"
        >
          <ZoomOut size={13} />
        </button>
        <button
          type="button"
          onClick={() => onZoomChange(100)}
          className="px-1.5 font-mono text-slate-300 hover:text-white min-w-[44px] text-center"
          title="Reset 100%"
        >
          {zoomDisplay}%
        </button>
        <button
          type="button"
          onClick={() => onZoomChange(zoomDisplay + 20)}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          title="Zoom In"
        >
          <ZoomIn size={13} />
        </button>
        <div className="w-px h-3.5 bg-slate-700 mx-0.5" />
        <button
          type="button"
          onClick={onFitViewport}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          title="Fit to Screen (Ctrl+0)"
        >
          <Maximize2 size={12} />
        </button>
      </div>
    </div>
  );
};

export default React.memo(AnnotatorStyleBar);
