'use client';

/**
 * Bits every OpenAI node needs and none of the Meta nodes want.
 *
 * Money on the wire is MICROS; every editor here works in major units and converts at this
 * boundary. Doing it per node is how a budget ends up 1,000,000x off in one place only.
 */

import { CheckCircle2, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const MICROS_PER_UNIT = 1_000_000;

export const microsToUnits = (micros: number | undefined): number =>
  typeof micros === 'number' ? micros / MICROS_PER_UNIT : 0;

export const unitsToMicros = (units: number): number => Math.round(units * MICROS_PER_UNIT);

export const formatMicros = (micros: number | undefined, currency = 'USD'): string => {
  if (typeof micros !== 'number') return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(micros / MICROS_PER_UNIT);
  } catch {
    return `${(micros / MICROS_PER_UNIT).toFixed(2)} ${currency}`;
  }
};

/**
 * The one thing that tells a draft from a record on screen.
 *
 * A node with an `openAiId` EXISTS on OpenAI — editing it updates a live object rather
 * than adding to a plan — so it says so, and shows the ad's review state when there is one
 * (an ad can be `paused` and still `rejected`, and only one of those is fixable by editing).
 */
export function OpenAiRecordBadge({
  openAiId,
  openAiStatus,
  reviewStatus,
}: {
  openAiId?: string;
  openAiStatus?: string;
  reviewStatus?: string;
}) {
  if (!openAiId) {
    return (
      <Badge variant="outline" className="text-3xs px-1 py-0 uppercase opacity-60">
        Draft
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant="outline" className="gap-1 text-3xs px-1 py-0 uppercase opacity-80">
        <Link2 className="h-2.5 w-2.5" />
        {openAiStatus ?? 'live'}
      </Badge>
      {reviewStatus ? (
        <Badge
          variant="outline"
          className={
            reviewStatus === 'approved'
              ? 'gap-1 text-3xs px-1 py-0 uppercase border-green-500/30 text-green-600'
              : reviewStatus === 'rejected'
                ? 'gap-1 text-3xs px-1 py-0 uppercase border-destructive/40 text-destructive'
                : 'gap-1 text-3xs px-1 py-0 uppercase opacity-70'
          }
        >
          {reviewStatus === 'approved' ? <CheckCircle2 className="h-2.5 w-2.5" /> : null}
          {reviewStatus.replace('_', ' ')}
        </Badge>
      ) : null}
      <span className="font-mono text-3xs text-muted-foreground opacity-60">{openAiId}</span>
    </div>
  );
}
