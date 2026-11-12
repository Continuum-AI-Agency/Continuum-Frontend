'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// One server-log row on the timeline, read into its own shape (readLifecycleRow) rather than the
// first keys of its `fields` bag printed as `key: value`. The Server log lists every lifecycle
// row this way; the Activity list borrows the ones the platform caused (a roster that drifted),
// lit when its dot on the chart is pointed at.

import type { OptimizerLogRow } from '@continuum/contracts';
import { cn } from '@/lib/utils';
import * as typeScale from '../../../typeScale';
import { TimelineEntry, type TimelineTone } from '../../feedTimeline';
import { type LifecycleFact, readLifecycleRow } from '../../logFilters';

// An error is red on the dot; a warning keeps a muted dot but names itself, so a skip or a
// drift is not mistaken for a quiet cycle. Info carries nothing extra.
const LEVEL_TONE: Record<OptimizerLogRow['level'], TimelineTone> = {
  info: 'neutral',
  warn: 'neutral',
  error: 'stopped',
};

function FactList({ facts }: { facts: LifecycleFact[] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
      {facts.map((fact) => (
        <div key={fact.label} className="flex items-baseline gap-1">
          <dt className="text-xs text-muted-foreground">{fact.label}</dt>
          <dd className="font-mono text-xs font-semibold tabular-nums">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The long tail of a row — the drifted ad sets, the per-item failures. Collapsed by default
 *  so a 40-ad-set drift does not bury the rest of the feed, but present rather than truncated
 *  to four keys with the rest silently dropped. */
function DetailList({ lines }: { lines: string[] }) {
  const betaUiText = useBetaTranslations('scale');

  if (lines.length === 0) return null;
  return (
    <details className="mt-1">
      <summary className="hit-area cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline">
        {lines.length} {betaUiText('beta_56547a7cc8bb')}
      </summary>
      <ul className="mt-1 space-y-0.5">
        {lines.map((line) => (
          <li key={line} className="truncate font-mono text-xs text-muted-foreground">
            {line}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function LifecycleLogRow({
  row,
  eventId,
  highlighted = false,
}: {
  row: OptimizerLogRow;
  /** The row's id on the Activity chart, when it has a dot there. */
  eventId?: string;
  highlighted?: boolean;
}) {
  const betaUiText = useBetaTranslations('scale');

  const read = readLifecycleRow(row);
  return (
    <TimelineEntry
      className={cn('-mx-2 rounded-md px-2 transition-colors', highlighted && 'bg-muted/70')}
      data-event-id={eventId}
      data-highlighted={highlighted ? 'true' : undefined}
      data-level={row.level}
      tone={LEVEL_TONE[row.level]}
      ts={row.ts}
    >
      <p className="text-sm leading-snug">
        <span className="font-semibold text-foreground">{read.title}</span>
        {row.level === 'warn' ? (
          <span className={`${typeScale.label} ml-2 font-semibold text-warning`}>
            {betaUiText('beta_aa63925edf22')}
          </span>
        ) : null}
        {row.portfolio_name ? (
          <span className="text-muted-foreground text-xs"> · {row.portfolio_name}</span>
        ) : null}
      </p>
      {read.summary ? (
        <p
          className={cn(
            'mt-0.5 text-xs leading-relaxed',
            row.level === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {read.summary}
        </p>
      ) : null}
      <FactList facts={read.facts} />
      <DetailList lines={read.detail} />
    </TimelineEntry>
  );
}
