'use client';

// Image stage with Figma-style annotated comments: drag a region to open a
// composer anchored to it; existing annotated threads render as numbered pins
// whose boxes outline on hover/selection.

import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { AnnotationOverlay, type OverlayPin } from './AnnotationOverlay';
import type { NormalizedBox } from './annotationGeometry';
import { CommentComposer } from './CommentComposer';
import { useStageGeometry } from './useStageGeometry';

type Props = {
  src: string | null;
  alt: string;
  pins: OverlayPin[];
  onSelectPin: (id: string | null) => void;
  posting: boolean;
  onPostAnnotated: (body: string, box: NormalizedBox) => void;
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
  const [draftBox, setDraftBox] = useState<NormalizedBox | null>(null);
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
        draftBox={draftBox}
        onDraftBox={setDraftBox}
        composer={
          draftBox ? (
            <CommentComposer
              placeholder="Comment on this region..."
              busy={posting}
              autoFocus
              onSubmit={(body) => {
                onPostAnnotated(body, draftBox);
                setDraftBox(null);
              }}
              onCancel={() => setDraftBox(null)}
            />
          ) : undefined
        }
      />
    </div>
  );
}
