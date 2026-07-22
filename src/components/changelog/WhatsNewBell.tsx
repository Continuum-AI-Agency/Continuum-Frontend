'use client';

// Header "What's New" bell: a Sparkles trigger with an unread badge over the
// static product changelog. Kept deliberately separate from the notifications
// bell — global product news and per-user realtime notifications have different
// mark-read semantics. Opening the popover clears the header badge (markAllSeen)
// but snapshots the prior last-seen id first, so per-row "new" dots persist for
// the duration of the open session.

import { SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useChangelog } from './useChangelog';
import { WhatsNewPanel } from './WhatsNewPanel';

export function WhatsNewBell() {
  const [open, setOpen] = useState(false);
  const [snapshotLastSeenId, setSnapshotLastSeenId] = useState<string | null>(null);
  const { entries, unreadCount, lastSeenId, markAllSeen } = useChangelog();

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setSnapshotLastSeenId(lastSeenId);
      markAllSeen();
    }
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9 active:scale-[0.96] transition-[transform]"
          aria-label={unreadCount > 0 ? `${unreadCount} new updates` : "What's New"}
        >
          <SparklesIcon className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-3xs font-bold tabular-nums text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <WhatsNewPanel entries={entries} snapshotLastSeenId={snapshotLastSeenId} />
      </PopoverContent>
    </Popover>
  );
}
