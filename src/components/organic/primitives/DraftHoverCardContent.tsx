'use client';

import { DraftCardMedia } from './DraftCardMedia';
import type { OrganicCalendarDraft } from './types';

export function DraftHoverCardContent({ draft }: { draft: OrganicCalendarDraft }) {
  const hasCaption = (draft.captionPreview ?? '').trim().length > 0;
  const title = draft.creativeIdea || draft.title;

  return (
    // The planner is a working surface. Hover supplies a visual identifier and a short
    // reminder of the copy; selecting the draft remains the route to editing or publishing.
    <div
      data-testid="planner-draft-hover-preview"
      className="w-[208px] overflow-hidden rounded-lg border border-border/80 bg-card shadow-lg shadow-black/15"
    >
      <div className="h-28 overflow-hidden">
        <DraftCardMedia
          draft={draft}
          aspectClass="h-full"
          className="w-full rounded-none"
          sizes="208px"
        />
      </div>

      <div className="flex flex-col gap-1.5 px-2.5 py-2">
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">{title}</p>
        <p className="line-clamp-3 text-2xs leading-snug text-muted-foreground">
          {hasCaption ? draft.captionPreview : 'No caption yet'}
        </p>
        <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground/70">
          {draft.format} · {draft.timeLabel}
        </p>
      </div>
    </div>
  );
}
