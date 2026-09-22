'use client';

// "Best time to post" and "Posting frequency", learned from the account's own cached posts
// by public.organic_best_times (median interactions per weekday x hour, brand timezone,
// last 90 days). The same slots the bulk planner schedules onto once there are enough posts.

import { ORGANIC_BEST_TIMES_MIN_POSTS, type OrganicBestTimes } from '@continuum/contracts';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

type Slot = OrganicBestTimes['slots'][number];

export function formatSlotHour(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  return `${hour % 12 === 0 ? 12 : hour % 12} ${suffix}`;
}

/** The single strongest slot: highest median interactions among each day's best. */
export function headlineSlot(slots: Slot[]): Slot | null {
  return slots
    .filter((slot) => slot.rank === 1)
    .reduce<Slot | null>(
      (best, slot) => (!best || slot.medianInteractions > best.medianInteractions ? slot : best),
      null,
    );
}

function headlineLabel(slot: Slot): string {
  // A pooled hour is the same for every weekday; naming one day would invent a finding.
  const day = slot.basis === 'all_days' ? 'Any day' : WEEKDAYS[slot.weekday];
  return `${day}, ${formatSlotHour(slot.hour)}`;
}

const TILE = 'flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface/95 p-3';

export function BestTimeTiles({ bestTimes }: { bestTimes: OrganicBestTimes }) {
  const top = headlineSlot(bestTimes.slots);
  const learning = bestTimes.postsAnalyzed < ORGANIC_BEST_TIMES_MIN_POSTS;
  const byWeekday = WEEKDAYS.map((_, weekday) =>
    bestTimes.slots.filter((slot) => slot.weekday === weekday).sort((a, b) => a.rank - b.rank),
  );

  return (
    <div
      data-tour-id="organic-best-time-tiles"
      data-platform={bestTimes.platform}
      className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
    >
      <section aria-label="Best time to post" className={TILE}>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xs text-muted-foreground">Best time to post</h3>
          <span className="text-2xs text-muted-foreground">{bestTimes.timeZone}</span>
        </div>
        {top ? (
          <>
            <p className="text-xl font-semibold leading-tight tracking-tight">
              {headlineLabel(top)}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              Median {Math.round(top.medianInteractions).toLocaleString()} interactions across{' '}
              {top.postCount} posts
            </p>
            <ol className="grid grid-cols-7 gap-1" aria-label="Best times by weekday">
              {byWeekday.map((slots, weekday) => (
                <li
                  key={WEEKDAYS[weekday]}
                  data-weekday={weekday}
                  className="flex min-w-0 flex-col items-center gap-0.5 rounded-md bg-muted/40 px-1 py-1.5"
                >
                  <span className="text-2xs font-medium text-muted-foreground">
                    {WEEKDAYS[weekday]}
                  </span>
                  {slots.length === 0 ? (
                    <span className="text-2xs text-muted-foreground">—</span>
                  ) : (
                    slots.map((slot) => (
                      <span
                        key={slot.rank}
                        data-slot-rank={slot.rank}
                        data-slot-time={slot.time}
                        className={cn(
                          'whitespace-nowrap font-mono text-2xs tabular-nums',
                          slot.rank === 1
                            ? 'font-semibold text-foreground'
                            : 'text-muted-foreground',
                        )}
                      >
                        {formatSlotHour(slot.hour)}
                      </span>
                    ))
                  )}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hour has 3 posts yet in the last {bestTimes.windowDays} days, so there is no best
            time to show.
          </p>
        )}
        <p className="text-2xs text-muted-foreground">
          {learning
            ? `Early read from ${bestTimes.postsAnalyzed} posts. Bulk plans switch to these times at ${ORGANIC_BEST_TIMES_MIN_POSTS} posts.`
            : `From ${bestTimes.postsAnalyzed} posts in the last ${bestTimes.windowDays} days. Bulk plans schedule onto these times.`}
        </p>
      </section>

      <section aria-label="Posting frequency" className={TILE}>
        <h3 className="text-xs text-muted-foreground">Posting frequency</h3>
        <p
          className="text-xl font-semibold leading-tight tracking-tight tabular-nums"
          data-posts-per-week={bestTimes.postsPerWeek}
        >
          {bestTimes.postsPerWeek.toFixed(1)}{' '}
          <span className="text-sm font-normal text-muted-foreground">posts / week</span>
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {bestTimes.postsAnalyzed} posts in the last {bestTimes.windowDays} days
        </p>
      </section>
    </div>
  );
}
