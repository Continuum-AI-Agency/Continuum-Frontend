'use client';

// A still under review: the zoom viewer, the pins and marks already on it, and the
// draw tools for a new one — a pin (one click) or marks (arrow, line, box,
// freehand) in a colour with undo/redo. Everything is placed against the zoomed
// content rect, so marks stay on their pixels at any zoom.
//
// The composer is the host's: the Library renders its own comment composer, the
// public share page posts from its guest form and only needs to know the draft.

import type { DrawingShape } from '@continuum/contracts';
import { Eye, EyeOff, ImageOff } from 'lucide-react';
import { type ReactNode, useEffect, useReducer, useState } from 'react';
import {
  AnnotationOverlay,
  draftToSpatialAnnotation,
  type OverlayPin,
  type SpatialAnnotation,
} from '../AnnotationOverlay';
import type { NormalizedPoint } from '../annotationGeometry';
import { ZoomStage } from '../zoom/ZoomStage';
import { DrawingToolbar, handleUndoRedoKey, type StageTool } from './DrawingToolbar';
import { DEFAULT_DRAWING_COLOR, drawingHistoryReducer, EMPTY_DRAWING } from './drawing';

export type ImageDraft = {
  annotation: SpatialAnnotation | null;
  /** A draw tool is chosen: the composer docks below the image instead of beside the pin. */
  docked: boolean;
  clear: () => void;
};

type Props = {
  src: string | null;
  alt: string;
  pins: OverlayPin[];
  onSelectPin: (id: string | null) => void;
  renderComposer?: (draft: ImageDraft) => ReactNode;
  /** Every change to the draft, for a host whose composer lives elsewhere. */
  onDraftChange?: (annotation: SpatialAnnotation | null) => void;
  /** Bumping it clears the draft (the host posted it). */
  resetSignal?: number;
  /** Start with every comment's marks drawn (a guest reads them all at once). */
  defaultShowAll?: boolean;
};

export function ImageReviewStage({
  src,
  alt,
  pins,
  onSelectPin,
  renderComposer,
  onDraftChange,
  resetSignal = 0,
  defaultShowAll = false,
}: Props) {
  const [tool, setTool] = useState<StageTool>('point');
  const [color, setColor] = useState<string>(DEFAULT_DRAWING_COLOR);
  const [draftPoint, setDraftPoint] = useState<NormalizedPoint | null>(null);
  const [drawing, dispatchDrawing] = useReducer(drawingHistoryReducer, EMPTY_DRAWING);
  const [mediaError, setMediaError] = useState(false);
  const [showAll, setShowAll] = useState(defaultShowAll);

  const draftAnnotation = draftToSpatialAnnotation(draftPoint, drawing.shapes);
  const hasDraft = draftAnnotation !== null;

  const clearDraft = () => {
    setDraftPoint(null);
    dispatchDrawing({ type: 'clear' });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new signal clears
  useEffect(() => {
    if (resetSignal > 0) clearDraft();
  }, [resetSignal]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the draft's content is what changed
  useEffect(() => {
    onDraftChange?.(draftAnnotation);
  }, [draftPoint, drawing.shapes]);

  useEffect(() => {
    if (!hasDraft) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT') return;
      handleUndoRedoKey(event, {
        undo: () => dispatchDrawing({ type: 'undo' }),
        redo: () => dispatchDrawing({ type: 'redo' }),
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasDraft]);

  if (!src || mediaError) {
    return (
      <div className="flex size-full items-center justify-center text-muted-foreground">
        <ImageOff className="size-8 text-muted-foreground/40" />
      </div>
    );
  }

  // A pin's composer floats beside the pin. With a draw tool chosen the composer
  // docks in a strip below the image, as on the video stage — over the frame it
  // would sit where the next stroke starts and swallow it — and it is there from
  // the moment the tool is chosen, so the image never resizes under a stroke.
  const docked = tool !== 'point';
  const composer = renderComposer?.({ annotation: draftAnnotation, docked, clear: clearDraft });

  return (
    <div className="flex size-full flex-col">
      <div className="relative min-h-0 flex-1 select-none">
        <ZoomStage
          src={src}
          alt={alt}
          onError={() => setMediaError(true)}
          controlsExtra={
            <button
              type="button"
              title={showAll ? 'Show marks for the selected comment only' : 'View all annotations'}
              aria-label="View all annotations"
              aria-pressed={showAll}
              data-testid="zoom-show-all"
              onClick={() => setShowAll((value) => !value)}
              className="flex size-7 items-center justify-center rounded-full transition-colors hover:bg-muted aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              {showAll ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            </button>
          }
        >
          {({ contentRect, containerSize }) => (
            <AnnotationOverlay
              containerSize={containerSize}
              contentRect={contentRect}
              pins={pins}
              showAllMarks={showAll}
              onSelectPin={onSelectPin}
              drawEnabled
              tool={tool}
              color={color}
              draftShapes={drawing.shapes}
              onShapeDrawn={(shape: DrawingShape) => dispatchDrawing({ type: 'add', shape })}
              draftPoint={draftPoint}
              onDraftPoint={setDraftPoint}
              composer={docked ? undefined : (composer ?? undefined)}
            />
          )}
        </ZoomStage>
        <DrawingToolbar
          className="absolute left-3 top-3 z-20"
          tool={tool}
          onToolChange={(next) => {
            setTool(next);
            if (next === 'point' || draftPoint) clearDraft();
          }}
          color={color}
          onColorChange={setColor}
          canUndo={drawing.shapes.length > 0}
          canRedo={drawing.redo.length > 0}
          onUndo={() => dispatchDrawing({ type: 'undo' })}
          onRedo={() => dispatchDrawing({ type: 'redo' })}
        />
      </div>
      {docked && composer ? (
        <div className="shrink-0 border-t border-border bg-background px-3 py-2">{composer}</div>
      ) : null}
    </div>
  );
}
