'use client';

// A shared still a guest may comment on: the Library's own still viewer (zoom,
// loupe, mini map) with every saved mark drawn and numbered, and the same pin and
// draw tools a member has. The draft is published to the guest form
// (ExternalCommentComposer), which posts it through the public share path.

import type { PublicShareComment } from '@continuum/contracts';
import { useState } from 'react';
import type { OverlayPin } from '@/components/library/detail/AnnotationOverlay';
import { ImageReviewStage } from '@/components/library/detail/annotation/ImageReviewStage';
import { publishShareDraft, useShareDraft } from './sharePlayhead';

const TITLE_MAX = 80;

export function ShareImageReview({
  assetId,
  src,
  alt,
  comments,
  initialSelectedId = null,
}: {
  assetId: string;
  src: string;
  alt: string;
  comments: PublicShareComment[];
  initialSelectedId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const draft = useShareDraft(assetId);
  // Numbered in thread order, as the Library stage numbers them.
  const pins: OverlayPin[] = comments
    .flatMap((comment) =>
      comment.annotation && comment.annotation.kind !== 'time'
        ? [{ comment, annotation: comment.annotation }]
        : [],
    )
    .map(({ comment, annotation }, index) => {
      const body = comment.body.trim();
      return {
        id: comment.id,
        annotation,
        label: String(index + 1),
        title: `${comment.authorName ?? 'Reviewer'}: ${body.length > TITLE_MAX ? `${body.slice(0, TITLE_MAX)}…` : body}`,
        selected: comment.id === selectedId,
      };
    });

  return (
    <div
      data-testid="share-image-review"
      className="relative h-[60vh] min-h-80 overflow-hidden rounded-lg border border-border bg-muted/30"
    >
      <ImageReviewStage
        src={src}
        alt={alt}
        pins={pins}
        onSelectPin={setSelectedId}
        defaultShowAll
        onDraftChange={(annotation) => publishShareDraft(assetId, annotation)}
        resetSignal={draft?.reset ?? 0}
      />
    </div>
  );
}
