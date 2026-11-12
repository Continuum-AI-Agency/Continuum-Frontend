'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';

// Presentational "last sync / source status" stamp for data-dependent surfaces
// (IMP-016 / BUG-017), so a user can tell missing vs stale vs syncing vs failed
// apart at a glance. Deliberately chrome-free (no fill, no border): a sync
// timestamp is toolbar metadata, not a status chip competing with the controls
// beside it. The tone dot carries the state; the text carries the age.
// Data-agnostic: it renders a derived FreshnessMeta and never fetches. The
// status->tone/label projection is a pure exported helper so it can be
// unit-tested without a DOM. A tooltip carries the fuller detail (exact time,
// source, next sync, error) the stamp itself keeps compact.

import { useId } from 'react';
import { PillIndicator } from '@/components/kibo-ui/pill';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type FreshnessMeta,
  type FreshnessStatus,
  formatFreshnessAge,
} from '@/lib/freshness/freshnessMeta';
import { cn } from '@/lib/utils';

type FreshnessTone = 'success' | 'warning' | 'error' | 'info';

export type FreshnessPresentation = {
  label: string;
  // null when the status has no dot (never synced) so the pill renders neutral.
  tone: FreshnessTone | null;
  pulse: boolean;
};

const STATUS_LABEL: Record<FreshnessStatus, (age: string | null) => string> = {
  fresh: (age) => (age ? `Synced ${age}` : 'Synced'),
  stale: (age) => (age ? `Updated ${age}` : 'Stale'),
  syncing: () => 'Syncing…',
  never: () => 'Not synced yet',
  error: () => 'Sync failed',
};

const STATUS_TONE: Record<FreshnessStatus, FreshnessTone | null> = {
  fresh: 'success',
  stale: 'warning',
  syncing: 'info',
  never: null,
  error: 'error',
};

// Pure projection from a FreshnessMeta to the pill's visible label + dot tone.
// Exported for unit tests; the component is a thin render over it.
export function freshnessBadgePresentation(
  freshness: FreshnessMeta,
  t?: ReturnType<typeof useTranslations<'common'>>,
  locale: string = 'en',
): FreshnessPresentation {
  let age = formatFreshnessAge(freshness.cache_age_seconds);
  if (
    t &&
    freshness.cache_age_seconds !== null &&
    freshness.cache_age_seconds !== undefined &&
    locale !== 'en'
  ) {
    const seconds = freshness.cache_age_seconds;
    const unit: Intl.RelativeTimeFormatUnit =
      seconds < 3600 ? 'minute' : seconds < 86400 ? 'hour' : 'day';
    const divisor = unit === 'minute' ? 60 : unit === 'hour' ? 3600 : 86400;
    age = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }).format(
      -Math.round(seconds / divisor),
      unit,
    );
  }
  const labels = {
    fresh: age && t ? t('m_559a29a826', { age }) : t?.('m_b2ef6af67f'),
    stale: age && t ? t('m_6c25ad7b65', { age }) : t?.('m_189cc40c22'),
    syncing: t?.('m_221ca63005'),
    never: t?.('m_f8c916839c'),
    error: t?.('m_39040109b6'),
  };
  return {
    label: labels[freshness.status] ?? STATUS_LABEL[freshness.status](age),
    tone: STATUS_TONE[freshness.status],
    pulse: freshness.status === 'syncing',
  };
}

function formatExactTime(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  // UTC, not the ambient locale/timezone: toLocaleString() differs between the
  // SSR host and the browser and would trip React hydration. An ISO-derived
  // string renders identically on server and client.
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(ts);
}

type FreshnessBadgeProps = {
  freshness: FreshnessMeta;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
};

export function FreshnessBadge({ freshness, side = 'top', className }: FreshnessBadgeProps) {
  const t = useTranslations('common');
  const locale = useLocale();
  const errorMessage = useUiErrorMessage();
  const { label, tone, pulse } = freshnessBadgePresentation(freshness, t, locale);
  const descriptionId = useId();
  const exact = formatExactTime(freshness.last_synced_at, locale);
  const nextSync = formatExactTime(freshness.next_sync_at, locale);

  const detail = [
    exact ? t('m_eb986b69cb', { time: exact }) : null,
    freshness.source ? t('m_86728b17ad', { source: freshness.source }) : null,
    nextSync ? t('m_bbecc3a92f', { time: nextSync }) : null,
    freshness.error ? errorMessage(freshness.error) : null,
  ].filter((line): line is string => Boolean(line));

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-describedby={descriptionId}
              className={cn(
                'inline-flex cursor-default items-center gap-1.5 whitespace-nowrap text-2xs text-muted-foreground',
                className,
              )}
            >
              {tone ? <PillIndicator variant={tone} pulse={pulse} /> : null}
              {label}
            </span>
          }
        />
        {detail.length ? (
          <TooltipContent side={side} className="max-w-xs">
            {detail.map((line) => (
              <p key={line} className="text-xs">
                {line}
              </p>
            ))}
          </TooltipContent>
        ) : null}
      </Tooltip>
      <span id={descriptionId} className="sr-only">
        {detail.length ? `${label}. ${detail.join('. ')}` : label}
      </span>
    </TooltipProvider>
  );
}
