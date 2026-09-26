'use client';

import { DraftCardMedia, resolveDraftMedia } from './DraftCardMedia';
import { draftStatusPresentation } from './draft-card-styles';
import type { OrganicCalendarDraft } from './types';

export function DraftHoverCardContent({ draft }: { draft: OrganicCalendarDraft }) {
  const hasCaption = (draft.captionPreview ?? '').trim().length > 0;
  const title = draft.creativeIdea || draft.title;
  const hasMedia =
    resolveDraftMedia(draft) !== null ||
    (draft.publishingAssets ?? []).some((asset) => Boolean(asset.storagePath));

  return (
    // The planner is a working surface. Hover supplies a visual identifier and a short
    // reminder of the copy; selecting the draft remains the route to editing or publishing.
    <div
      data-testid="planner-draft-hover-preview"
      className="w-[208px] overflow-hidden rounded-lg border border-border/80 bg-card shadow-lg shadow-black/15"
    >
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-2xs font-medium">
        <span className="text-foreground">{draftStatusPresentation(draft.status).label}</span>
        <span className="truncate capitalize text-muted-foreground">
          {draft.platforms.join(', ') || 'Unassigned'}
        </span>
      </div>
      {hasMedia && (
        <div className="h-28 overflow-hidden">
          <DraftCardMedia
            draft={draft}
            aspectClass="h-full"
            className="w-full rounded-none"
            sizes="208px"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5 px-2.5 py-2">
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">{title}</p>
        <p className="line-clamp-3 text-2xs leading-snug text-muted-foreground">
          {hasCaption ? draft.captionPreview : 'No caption yet'}
        </p>
        <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground/70">
          {draft.format} · {draft.dateLabel} · {draft.timeLabel}
        </p>
        <p className="border-t border-border/60 pt-1 text-3xs text-muted-foreground">
          Click to review
        </p>
      </div>
    </div>
  );
}
