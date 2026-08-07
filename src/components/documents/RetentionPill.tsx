'use client';

import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import type { DocumentView } from './types';
import { formatRetentionCountdown, isArchived, isEphemeral } from './types';

// Renders ONLY for non-default lifecycle states. A permanent, live document — the
// overwhelming majority — gets no pill at all, so the list stays quiet and the badge
// actually means something when it appears.
export function RetentionPill({ doc, now }: { doc: DocumentView; now: number }) {
  if (isArchived(doc)) {
    return (
      <Pill variant="secondary" className="shrink-0 text-[11px]">
        Archived
      </Pill>
    );
  }

  if (!isEphemeral(doc)) return null;

  const countdown = formatRetentionCountdown(doc.expiresAt, now);
  return (
    <Pill variant="outline" className="shrink-0 gap-1 text-[11px]">
      <PillIndicator variant="warning" />
      {countdown ? `Temporary · ${countdown}` : 'Temporary'}
    </Pill>
  );
}
