'use client';

// Image stage with Frame.io-style annotated comments: drop a pin (its composer
// opens beside it), or draw marks (arrow, line, box, freehand) in a colour with
// undo/redo and comment in the strip below the image. Existing annotated threads
// render as numbered pins whose marks re-render in place on hover/selection, or
// all at once with "View all annotations". The still zooms (see zoom/ZoomStage).

import type { OverlayPin, SpatialAnnotation } from './AnnotationOverlay';
import { ImageReviewStage } from './annotation/ImageReviewStage';
import { CommentComposer, type ComposerExtras } from './CommentComposer';

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
  return (
    <ImageReviewStage
      src={src}
      alt={alt}
      pins={pins}
      onSelectPin={onSelectPin}
      renderComposer={({ annotation, docked, clear }) =>
        docked || annotation ? (
          <CommentComposer
            placeholder={docked ? 'Comment on these marks...' : 'Comment on this spot...'}
            busy={posting}
            autoFocus={!docked}
            brandId={brandId}
            reviewOptions={Boolean(brandId)}
            submitDisabled={!annotation}
            onSubmit={(body, extras) => {
              if (!annotation) return;
              onPostAnnotated(body, annotation, extras);
              clear();
            }}
            onCancel={annotation ? clear : undefined}
          />
        ) : null
      }
    />
  );
}
