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

import { OPTIMIZER_FEED_WINDOW_DAYS, type OptimizerFeedWindowDays } from '@continuum/contracts';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { OptimizerActionFeed } from './OptimizerActionFeed';
import { OptimizerLogs } from './OptimizerLogs';

type ActivityFeed = 'actions' | 'server';

const FEEDS: { value: ActivityFeed; label: string }[] = [
  { value: 'actions', label: 'Actions' },
  { value: 'server', label: 'Server log' },
];

const WINDOWS = OPTIMIZER_FEED_WINDOW_DAYS.map((days) => ({ value: days, label: `${days}d` }));

/** A segmented switch: one track, the chosen option lifted onto the page colour. */
function Segmented<TValue extends string | number>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { value: TValue; label: string }[];
  value: TValue;
  onChange: (value: TValue) => void;
}) {
  return (
    <fieldset className="inline-flex shrink-0 gap-0.5 rounded-lg border-0 bg-muted/60 p-0.5">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={cn(
            'rounded-md px-2.5 py-1 font-medium text-xs tabular-nums transition-colors',
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

export function OptimizerActivity({
  brandId,
  currency,
}: {
  brandId: string;
  currency: string | null;
}) {
  const [feed, setFeed] = useState<ActivityFeed>('actions');
  const [windowDays, setWindowDays] = useState<OptimizerFeedWindowDays>(7);

  // The feed switch and the window ride on the same line as the feed's own portfolio filter;
  // the feed draws that line because only it knows which portfolios it has loaded.
  const controls = (
    <>
      <Segmented legend="Choose a feed" onChange={setFeed} options={FEEDS} value={feed} />
      <Segmented
        legend="Show events from the last"
        onChange={setWindowDays}
        options={WINDOWS}
        value={windowDays}
      />
    </>
  );

  return feed === 'actions' ? (
    <OptimizerActionFeed
      brandId={brandId}
      controls={controls}
      currency={currency}
      windowDays={windowDays}
    />
  ) : (
    <OptimizerLogs brandId={brandId} controls={controls} windowDays={windowDays} />
  );
}
