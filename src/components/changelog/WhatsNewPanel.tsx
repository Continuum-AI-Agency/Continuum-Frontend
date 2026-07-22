'use client';

// Product-news list for the header Sparkles bell: newest-first entries with a
// tag pill, relative date, and safe markdown body. The per-row "new" dot is
// driven by a snapshot of last-seen taken when the popover opened, so rows stay
// marked new for the open session even though the header badge clears on open.

import { Pill } from '@/components/kibo-ui/pill';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import { computeUnreadCount } from '@/lib/changelog/changelog';
import type { ChangelogEntry } from '@/lib/changelog/schema';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';

const TAG_LABEL: Record<NonNullable<ChangelogEntry['tag']>, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
};

const TAG_VARIANT: Record<NonNullable<ChangelogEntry['tag']>, 'violet' | 'teal' | 'muted'> = {
  new: 'violet',
  improved: 'teal',
  fixed: 'muted',
};

export type WhatsNewPanelProps = {
  entries: ChangelogEntry[];
  snapshotLastSeenId: string | null;
};

export function WhatsNewPanel({ entries, snapshotLastSeenId }: WhatsNewPanelProps) {
  const unreadBoundary = computeUnreadCount(entries, snapshotLastSeenId);

  return (
    <div>
      <div className="mb-1.5 px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          What's New
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
          No updates yet. Product news lands here.
        </p>
      ) : (
        <div className="max-h-96 space-y-0.5 overflow-y-auto">
          {entries.map((entry, index) => (
            <ChangelogRowItem key={entry.id} entry={entry} unread={index < unreadBoundary} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChangelogRowItem({ entry, unread }: { entry: ChangelogEntry; unread: boolean }) {
  return (
    <div className="rounded-md px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {unread && (
            <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          )}
          <span className={cn('text-xs', unread ? 'font-semibold' : 'font-medium')}>
            {entry.title}
          </span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatRelativeTime(`${entry.date}T00:00:00Z`)}
        </span>
      </div>
      {entry.tag && (
        <Pill variant={TAG_VARIANT[entry.tag]} className="mt-1.5">
          {TAG_LABEL[entry.tag]}
        </Pill>
      )}
      <div className="mt-1.5 text-xs text-muted-foreground opacity-90">
        <SafeMarkdown content={entry.body} mode="static" />
      </div>
    </div>
  );
}
