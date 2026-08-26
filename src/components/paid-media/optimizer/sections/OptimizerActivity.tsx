'use client';

// The Activity sub-view: two feeds that used to be one.
//
//   Actions    — what the optimizer did to the AD ACCOUNT. Every row has a before, an after,
//                an actor, a reason and (where the server says so) a one-click undo.
//   Server log — what the MACHINE did. Cycle lifecycle, skips, drift, failures.
//
// They are separate because they answer different questions, and merging them made both
// worse: a lifecycle row has no before/after to show, and an action row buried in cycle
// chatter has no revert. The split is the server's (optimizer_list_actions vs the narrowed
// optimizer_list_logs); this only chooses which of the two to render.

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { OptimizerActionFeed } from './OptimizerActionFeed';
import { OptimizerLogs } from './OptimizerLogs';

type ActivityFeed = 'actions' | 'server';

const FEEDS: { value: ActivityFeed; label: string }[] = [
  { value: 'actions', label: 'Actions' },
  { value: 'server', label: 'Server log' },
];

export function OptimizerActivity({
  brandId,
  currency,
}: {
  brandId: string;
  currency: string | null;
}) {
  const [feed, setFeed] = useState<ActivityFeed>('actions');

  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap items-center gap-1 border-0 p-0">
        <legend className="sr-only">Choose a feed</legend>
        {FEEDS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={feed === option.value}
            onClick={() => setFeed(option.value)}
            className={cn(
              'inline-flex items-center rounded-lg border px-2 py-1 text-xs font-medium transition-colors',
              feed === option.value
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/70 bg-card text-muted-foreground hover:bg-muted/50',
            )}
          >
            {option.label}
          </button>
        ))}
      </fieldset>

      {feed === 'actions' ? (
        <OptimizerActionFeed brandId={brandId} currency={currency} />
      ) : (
        <OptimizerLogs brandId={brandId} />
      )}
    </div>
  );
}
