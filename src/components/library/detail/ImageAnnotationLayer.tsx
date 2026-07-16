'use client';

// Image stage with Figma-style annotated comments: drag a region to open a
// composer anchored to it; existing annotated threads render as numbered pins
// whose boxes outline on hover/selection.

import type { CommentAnnotation } from '@continuum/contracts';
import { BoxSelect, ImageOff, MousePointer2, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  type AnnotationTool,
  AnnotationOverlay,
  type OverlayPin,
  type SpatialAnnotation,
} from './AnnotationOverlay';
import { CommentComposer } from './CommentComposer';
import { useStageGeometry } from './useStageGeometry';

type Props = {
  src: string | null;
  alt: string;
  pins: OverlayPin[];
  onSelectPin: (id: string | null) => void;
  posting: boolean;
  onPostAnnotated: (body: string, annotation: SpatialAnnotation) => void;
};

export function ImageAnnotationLayer({
  src,
  alt,
  pins,
  onSelectPin,
  posting,
  onPostAnnotated,
}: Props) {
  const { containerRef, containerSize, contentRect, setNaturalSize } = useStageGeometry();
  const [tool, setTool] = useState<AnnotationTool>('point');
  const [draftAnnotation, setDraftAnnotation] = useState<SpatialAnnotation | null>(null);
  const [mediaError, setMediaError] = useState(false);

  if (!src || mediaError) {
    return (
      <div className="flex size-full items-center justify-center text-muted-foreground">
        <ImageOff className="size-8 text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative size-full select-none">
      <div
        className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-sm backdrop-blur"
        role="toolbar"
        aria-label="Image annotation tools"
      >
        {(
          [
            { value: 'point', label: 'Point', icon: MousePointer2 },
            { value: 'box', label: 'Rectangle', icon: BoxSelect },
            { value: 'freehand', label: 'Freehand', icon: Pencil },
          ] as const satisfies ReadonlyArray<{
            value: Exclude<CommentAnnotation['kind'], 'time'>;
            label: string;
            icon: typeof MousePointer2;
          }>
        ).map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            type="button"
            size="icon"
            variant={tool === value ? 'secondary' : 'ghost'}
            className="size-8"
            aria-label={`${label} annotation`}
            aria-pressed={tool === value}
            title={label}
            onClick={() => {
              setTool(value);
              setDraftAnnotation(null);
            }}
          >
            <Icon className="size-3.5" />
          </Button>
        ))}
      </div>
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
        draftAnnotation={draftAnnotation}
        onDraftAnnotation={setDraftAnnotation}
        composer={
          draftAnnotation ? (
            <CommentComposer
              placeholder="Comment on this annotation..."
              busy={posting}
              autoFocus
              onSubmit={(body) => {
                onPostAnnotated(body, draftAnnotation);
                setDraftAnnotation(null);
              }}
              onCancel={() => setDraftAnnotation(null)}
            />
          ) : undefined
        }
      />
    </div>
  );
}
