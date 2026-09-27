'use client';

// Image stage with Frame.io-style annotated comments: drop a pin (its composer
// opens beside it), or draw marks (arrow, line, box, freehand) in a colour with
// undo/redo and comment in the strip below the image. Existing annotated threads
// render as numbered pins whose marks re-render in place on hover/selection.

import type { DrawingShape } from '@continuum/contracts';
import { ImageOff } from 'lucide-react';
import { useEffect, useReducer, useState } from 'react';
import {
  AnnotationOverlay,
  draftToSpatialAnnotation,
  type OverlayPin,
  type SpatialAnnotation,
} from './AnnotationOverlay';
import { DrawingToolbar, handleUndoRedoKey, type StageTool } from './annotation/DrawingToolbar';
import { DEFAULT_DRAWING_COLOR, drawingHistoryReducer, EMPTY_DRAWING } from './annotation/drawing';
import type { NormalizedPoint } from './annotationGeometry';
import { CommentComposer, type ComposerExtras } from './CommentComposer';
import { useStageGeometry } from './useStageGeometry';

type Props = {
  src: string | null;
  alt: string;
  pins: OverlayPin[];
  onSelectPin: (id: string | null) => void;
  posting: boolean;
  /** Brand context enables @mention autocomplete in the annotation composer. */
  brandId?: string;
  onPostAnnotated: (body: string, annotation: SpatialAnnotation, extras: ComposerExtras) => void;
};

export function ImageAnnotationLayer({
  src,
  alt,
  pins,
  onSelectPin,
  posting,
  brandId,
  onPostAnnotated,
}: Props) {
  const { containerRef, containerSize, contentRect, setNaturalSize } = useStageGeometry();
  const [tool, setTool] = useState<StageTool>('point');
  const [color, setColor] = useState<string>(DEFAULT_DRAWING_COLOR);
  const [draftPoint, setDraftPoint] = useState<NormalizedPoint | null>(null);
  const [drawing, dispatchDrawing] = useReducer(drawingHistoryReducer, EMPTY_DRAWING);
  const [mediaError, setMediaError] = useState(false);

  const draftAnnotation = draftToSpatialAnnotation(draftPoint, drawing.shapes);
  const hasDraft = draftAnnotation !== null;

  const clearDraft = () => {
    setDraftPoint(null);
    dispatchDrawing({ type: 'clear' });
  };

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
  const composer =
    docked || draftAnnotation ? (
      <CommentComposer
        placeholder={docked ? 'Comment on these marks...' : 'Comment on this spot...'}
        busy={posting}
        autoFocus={!docked}
        brandId={brandId}
        reviewOptions={Boolean(brandId)}
        submitDisabled={!draftAnnotation}
        onSubmit={(body, extras) => {
          if (!draftAnnotation) return;
          onPostAnnotated(body, draftAnnotation, extras);
          clearDraft();
        }}
        onCancel={draftAnnotation ? clearDraft : undefined}
      />
    ) : null;

  return (
    <div className="flex size-full flex-col">
      <div ref={containerRef} className="relative min-h-0 flex-1 select-none">
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
        {/* Signed storage URL rendered at natural fit for pixel-accurate annotation geometry; next/image transforms would skew the measured intrinsic size. */}
        {/* biome-ignore lint/performance/noImgElement: annotation math needs the untransformed intrinsic frame */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 size-full object-contain"
          onLoad={(e) => {
            const el = e.currentTarget;
            setNaturalSize({ width: el.naturalWidth, height: el.naturalHeight });
          }}
          onError={() => setMediaError(true)}
        />
        <AnnotationOverlay
          containerSize={containerSize}
          contentRect={contentRect}
          pins={pins}
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
      </div>
      {docked ? (
        <div className="shrink-0 border-t border-border bg-background px-3 py-2">{composer}</div>
      ) : null}
    </div>
  );
}
