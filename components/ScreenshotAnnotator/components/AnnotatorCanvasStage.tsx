import React, { useEffect, useRef, useState } from 'react';
import { AnnotatorTool, Point } from '../../../types/screenshotAnnotator';
import { CURSOR_OPEN_CROSSHAIR } from '../../../utils/annotatorDraftFactory';
import { InlineTextEditState } from '../hooks/useAnnotatorCanvasInteraction';

interface AnnotatorCanvasStageProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  tool: AnnotatorTool;
  isSpaceHeld: boolean;
  isDuplicateCursor?: boolean;
  editingText: InlineTextEditState | null;
  textColor: string;
  textFontSize: number;
  imagePointToClientOffset: (pt: Point) => Point | null;
  onCommitText: (val: string) => void;
  onCancelText: () => void;
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

const TOOL_HINTS: Record<AnnotatorTool, string> = {
  select: 'Click to select · Drag handles to resize/bend · Double-click text to edit · Del to remove',
  rect: 'Drag to draw box · Hold Shift for perfect square',
  ellipse: 'Drag to draw ellipse · Hold Shift for perfect circle',
  arrow: 'Drag to draw arrow · Hold Shift for 45° snap · Switch to Select to bend curve handle',
  step: 'Click for numbered badge ① · Drag from badge to attach arrow',
  text: 'Click for text label · Drag from label to attach arrow · Enter to commit',
  highlighter: 'Drag to highlight text · Hold Shift for straight horizontal highlight',
  mosaic: 'Drag over sensitive data (tokens, IPs, emails) to pixelate or redact',
  freehand: 'Drag to sketch freely · Hold Shift for straight horizontal/vertical line',
  spotlight: 'Drag to keep area bright and dim the rest (supports multiple spotlights)',
  cutout: 'Drag vertically or horizontally across empty middle section to snip and stitch',
  crop: 'Drag to crop non-destructively · Use Style Bar to reset anytime',
};

const AnnotatorCanvasStage: React.FC<AnnotatorCanvasStageProps> = ({
  containerRef,
  canvasRef,
  tool,
  isSpaceHeld,
  isDuplicateCursor = false,
  editingText,
  textColor,
  textFontSize,
  imagePointToClientOffset,
  onCommitText,
  onCancelText,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
}) => {
  const [draftText, setDraftText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingText) {
      setDraftText(editingText.initialText);
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      });
    }
  }, [editingText]);

  const textOffset = editingText ? imagePointToClientOffset({ x: editingText.x, y: editingText.y }) : null;

  const usePrecisionCrosshair = !isSpaceHeld && !isDuplicateCursor && tool !== 'select';
  const cursorClass = isSpaceHeld
    ? 'cursor-grab active:cursor-grabbing'
    : isDuplicateCursor
    ? 'cursor-copy'
    : tool === 'select'
    ? 'cursor-default'
    : '';

  return (
    <div className="relative flex-1 min-w-0 min-h-0 flex flex-col bg-[#080d1a]">
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 overflow-hidden"
        style={{
          backgroundImage: 'radial-gradient(rgba(148, 163, 184, 0.14) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
          style={usePrecisionCrosshair ? { cursor: CURSOR_OPEN_CROSSHAIR } : undefined}
          className={`w-full h-full block touch-none ${cursorClass}`}
        />

        {/* Inline Text Editor Overlay (Zero-Blur) */}
        {editingText && textOffset && (
          <div
            className="absolute z-30"
            style={{
              left: Math.max(12, textOffset.x),
              top: Math.max(12, textOffset.y),
            }}
          >
            <textarea
              ref={textareaRef}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancelText();
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onCommitText(draftText);
                }
              }}
              onBlur={() => onCommitText(draftText)}
              rows={2}
              placeholder="Type note... (Enter to apply)"
              style={{
                fontSize: `${Math.max(13, Math.min(28, textFontSize))}px`,
                borderColor: textColor,
              }}
              className="min-w-[200px] max-w-[420px] px-2.5 py-1.5 rounded-lg bg-[#0f172a] border-2 text-white font-bold shadow-2xl outline-none resize"
            />
          </div>
        )}
      </div>

      {/* Compact Bottom Hint Strip */}
      <div className="h-7 shrink-0 px-3 bg-[#0b1120] border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 select-none">
        <span className="truncate">{TOOL_HINTS[tool]}</span>
        <span className="shrink-0 font-mono text-[10px] text-slate-500 hidden md:inline">
          Hold Ctrl: Select · Ctrl+Shift+Drag: Duplicate · Ctrl+Wheel Zoom · Ctrl+C Copy
        </span>
      </div>
    </div>
  );
};

export default React.memo(AnnotatorCanvasStage);
