'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatDecimal } from '@/lib/format/decimal';

// "Best time to post" and "Posting frequency", learned from the account's own cached posts
// by public.organic_best_times (median interactions per weekday x hour, brand timezone,
// last 90 days). The same slots the bulk planner schedules onto once there are enough posts.

import { ORGANIC_BEST_TIMES_MIN_POSTS, type OrganicBestTimes } from '@continuum/contracts';
import type { UiLocale } from '@/i18n/config';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

type Slot = OrganicBestTimes['slots'][number];

export function formatSlotHour(hour: number, locale: UiLocale = 'en'): string {
  if (locale !== 'en')
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 0, 4, hour)),
    );
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

function headlineLabel(slot: Slot, locale: UiLocale, anyDay: string): string {
  // A pooled hour is the same for every weekday; naming one day would invent a finding.
  const day =
    slot.basis === 'all_days'
      ? anyDay
      : new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
          new Date(Date.UTC(2026, 0, 4 + slot.weekday)),
        );
  return `${day}, ${formatSlotHour(slot.hour, locale)}`;
}

const TILE = 'flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface/95 p-3';

export function BestTimeTiles({ bestTimes }: { bestTimes: OrganicBestTimes }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('organic');
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
      <section aria-label={uiText('best_time_to_post_6358fac')} className={TILE}>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xs text-muted-foreground">{uiText('best_time_to_post_6358fac')}</h3>
          <span className="text-2xs text-muted-foreground">{bestTimes.timeZone}</span>
        </div>
        {top ? (
          <>
            <p className="text-xl font-semibold leading-tight tracking-tight">
              {headlineLabel(top, uiLocale, uiText('bestTimeAnyDay'))}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {uiText.rich('sentence_04450c246971', {
                interactions: () => Math.round(top.medianInteractions).toLocaleString(uiLocale),
                count: top.postCount,
              })}
            </p>
            <ol
              className="grid grid-cols-7 gap-1"
              aria-label={uiText('best_times_by_weekday_8bd4510')}
            >
              {byWeekday.map((slots, weekday) => (
                <li
                  key={new Intl.DateTimeFormat(uiLocale, {
                    weekday: 'short',
                    timeZone: 'UTC',
                  }).format(new Date(Date.UTC(2026, 0, 4 + weekday)))}
                  data-weekday={weekday}
                  className="flex min-w-0 flex-col items-center gap-0.5 rounded-md bg-muted/40 px-1 py-1.5"
                >
                  <span className="text-2xs font-medium text-muted-foreground">
                    {new Intl.DateTimeFormat(uiLocale, {
                      weekday: 'short',
                      timeZone: 'UTC',
                    }).format(new Date(Date.UTC(2026, 0, 4 + weekday)))}
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
                        {formatSlotHour(slot.hour, uiLocale)}
                      </span>
                    ))
                  )}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {uiText.rich('sentence_87335dad7f61', { days: bestTimes.windowDays })}
          </p>
        )}
        <p className="text-2xs text-muted-foreground">
          {learning
            ? uiText('bestTimesLearning', {
                posts: bestTimes.postsAnalyzed,
                minimum: ORGANIC_BEST_TIMES_MIN_POSTS,
              })
            : uiText('bestTimesReady', {
                posts: bestTimes.postsAnalyzed,
                days: bestTimes.windowDays,
              })}
        </p>
      </section>

      <section aria-label={uiText('posting_frequency_fb9f5ad')} className={TILE}>
        <h3 className="text-xs text-muted-foreground">{uiText('posting_frequency_fb9f5ad')}</h3>
        <p
          className="text-xl font-semibold leading-tight tracking-tight tabular-nums"
          data-posts-per-week={bestTimes.postsPerWeek}
        >
          {formatDecimal(bestTimes.postsPerWeek, 1, uiLocale)}{' '}
          <span className="text-sm font-normal text-muted-foreground">
            {uiText('posts_week_04668ac')}
          </span>
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {uiText.rich('sentence_f65ebee872f6', {
            count: bestTimes.postsAnalyzed,
            days: bestTimes.windowDays,
          })}
        </p>
      </section>
    </div>
  );
}
