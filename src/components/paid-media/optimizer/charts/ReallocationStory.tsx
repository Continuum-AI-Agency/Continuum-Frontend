'use client';

// The cycle's budget moves as one picture: every ad set on a shared cost-per-result axis
// (dot, interval, the target as a line) beside its budget going from what it has to what
// it gets. Money leaving the rows above the target line and landing on the rows below it
// is the explanation; the sentence on top says the same thing in words, and each row
// carries the engine's own reason for its move. Rows are sorted best value first.
//
// Built from plain elements on purpose: it renders in tests without a ResizeObserver and
// stays legible at phone width (the three columns stack).

import type {
  AdSetSnapshot,
  CycleItemRow,
  OptimizationMetricDefinition,
} from '@continuum/contracts';
import { ArrowRightIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StatusChip, type StatusTone } from '../components/StatusChip';
import { DeliveryPill } from '../DeliveryPill';
import { formatCpa, formatCurrency } from '../format';
import { HeldPill } from '../HeldPill';
import { LookbackToggle } from './LookbackToggle';
import {
  buildReallocationStory,
  type StoryLookback,
  type StoryRow,
} from './reallocationStoryModel';

const STANDING_TONE: Record<StoryRow['standing'], StatusTone> = {
  below: 'success',
  above: 'danger',
  unknown: 'muted',
};

const STANDING_DOT: Record<StoryRow['standing'], string> = {
  below: 'bg-success',
  above: 'bg-destructive',
  unknown: 'bg-muted-foreground',
};

const FIGURE_TOKEN = /^([(]*)(.*?\d.*?)([.,;:)]*)$/;

/** The summary sentence with its figures in bold, so "how much, from how many, to how many"
 *  reads at a glance. Splits on whitespace only — the words and their order are the model's. */
function SummaryWithFigures({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\s+)/).map((token, index) => {
        const match = FIGURE_TOKEN.exec(token);
        if (!match) return token;
        const [, lead, figure, trail] = match;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: tokens of one fixed sentence, never reordered
          <span key={index}>
            {lead}
            <span className="font-semibold">{figure}</span>
            {trail}
          </span>
        );
      })}
    </>
  );
}

function pct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function CostCell({
  row,
  costMax,
  target,
  currency,
  metric,
}: {
  row: StoryRow;
  costMax: number;
  target: number | null;
  currency?: string | null;
  metric: OptimizationMetricDefinition;
}) {
  if (row.held) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <HeldPill reason={row.freezeReason} />
      </div>
    );
  }
  if (row.cost == null) {
    return (
      <div className="text-muted-foreground text-sm">
        No {metric.resultLabel.toLowerCase()} in this window
      </div>
    );
  }
  const x = pct(row.cost, costMax);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-4 min-w-0 flex-1">
        <div className="absolute inset-y-1/2 right-0 left-0 h-px -translate-y-1/2 bg-border" />
        {target != null ? (
          <div
            aria-hidden
            className="absolute top-0 bottom-0 w-px border-l border-dashed border-foreground/50"
            style={{ left: `${pct(target, costMax)}%` }}
          />
        ) : null}
        {row.ci ? (
          <div
            aria-hidden
            className="absolute inset-y-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground/15"
            style={{
              left: `${pct(row.ci.lo, costMax)}%`,
              width: `${Math.max(0, pct(row.ci.hi, costMax) - pct(row.ci.lo, costMax))}%`,
            }}
          />
        ) : null}
        <div
          aria-hidden
          className={cn(
            'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background',
            STANDING_DOT[row.standing],
          )}
          style={{ left: `${x}%` }}
        />
      </div>
      <span
        className={cn(
          'w-20 shrink-0 text-right font-semibold text-base tabular-nums',
          row.standing === 'above' && 'text-destructive',
          row.standing === 'below' && 'text-success',
        )}
      >
        {formatCpa(row.cost, currency)}
      </span>
    </div>
  );
}

function BudgetCell({
  row,
  budgetMax,
  currency,
}: {
  row: StoryRow;
  budgetMax: number;
  currency?: string | null;
}) {
  const up = row.changeAbs > 0.5;
  const down = row.changeAbs < -0.5;
  const from = pct(row.current, budgetMax);
  const to = pct(row.proposed, budgetMax);
  const left = Math.min(from, to);
  const width = Math.abs(to - from);
  const pctLabel =
    row.changePct != null && (up || down)
      ? ` (${up ? '+' : '−'}${Math.round(Math.abs(row.changePct) * 100)}%)`
      : '';
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-4 min-w-0 flex-1">
        <div className="absolute inset-y-1/2 right-0 left-0 h-1 -translate-y-1/2 rounded-full bg-muted" />
        {up || down ? (
          <div
            aria-hidden
            className={cn(
              'absolute inset-y-1/2 h-1 -translate-y-1/2 rounded-full',
              up ? 'bg-success' : 'bg-destructive',
            )}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        ) : null}
        <div
          aria-hidden
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/60"
          style={{ left: `${from}%` }}
        />
        <div
          aria-hidden
          className={cn(
            'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background',
            up ? 'bg-success' : down ? 'bg-destructive' : 'bg-muted-foreground',
          )}
          style={{ left: `${to}%` }}
        />
      </div>
      <span className="shrink-0 whitespace-nowrap font-semibold text-base tabular-nums">
        <span className="text-muted-foreground">{formatCurrency(row.current, currency)}</span>
        <ArrowRightIcon aria-hidden className="mx-1 inline size-3 text-muted-foreground" />
        <span
          className={cn(
            up && 'text-success',
            down && 'text-destructive',
            !up && !down && 'text-muted-foreground',
          )}
        >
          {formatCurrency(row.proposed, currency)}
        </span>
        <span className="font-normal text-muted-foreground text-sm">{pctLabel}</span>
      </span>
    </div>
  );
}

type ReallocationStoryProps = {
  items: CycleItemRow[];
  metric: OptimizationMetricDefinition;
  snapshotById?: Map<string, AdSetSnapshot> | null;
  nameById?: Map<string, string> | null;
  /** Target in DISPLAY units. */
  target: number | null | undefined;
  currency?: string | null;
  defaultLookback?: StoryLookback;
  /** Rows shown before "show all"; held rows always count last. */
  collapsedRows?: number;
  className?: string;
};

export function ReallocationStory({
  items,
  metric,
  snapshotById,
  nameById,
  target,
  currency,
  defaultLookback = 7,
  collapsedRows = 8,
  className,
}: ReallocationStoryProps) {
  const [lookback, setLookback] = useState<StoryLookback>(defaultLookback);
  const [showAll, setShowAll] = useState(false);
  const story = buildReallocationStory({
    items,
    metric,
    snapshotById,
    nameById,
    lookback,
    target,
    currency,
  });
  const rows = showAll ? story.rows : story.rows.slice(0, collapsedRows);
  const hidden = story.rows.length - rows.length;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-base text-foreground leading-relaxed">
          <SummaryWithFigures text={story.summary} />
        </p>
        <LookbackToggle onChange={setLookback} size="lg" value={lookback} />
      </div>

      <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.4fr)] gap-x-4 px-1 text-muted-foreground text-xs uppercase tracking-wide sm:grid">
        <span>Ad set</span>
        <span>
          {metric.costLabel} · {lookback}d
          {story.target != null ? ` · target ${formatCpa(story.target, currency)}` : ''}
        </span>
        <span>Daily budget · now → proposed</span>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border border-border/60 bg-card px-4 py-3.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.4fr)] sm:items-center"
            key={row.adsetId}
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-semibold text-base" title={row.name}>
                  {row.name}
                </span>
                {row.standing !== 'unknown' && !row.held ? (
                  <StatusChip tone={STANDING_TONE[row.standing]}>
                    {row.standing === 'below' ? 'Below target' : 'Above target'}
                  </StatusChip>
                ) : null}
                <DeliveryPill state={row.deliveryState} />
              </div>
              {row.reason ? (
                <p
                  className="mt-1 line-clamp-2 text-muted-foreground text-sm"
                  title={row.reason}
                >
                  {row.reason}
                </p>
              ) : null}
            </div>
            <CostCell
              costMax={story.costMax}
              currency={currency}
              metric={metric}
              row={row}
              target={story.target}
            />
            <BudgetCell budgetMax={story.budgetMax} currency={currency} row={row} />
          </li>
        ))}
      </ul>

      {hidden > 0 || showAll ? (
        <Button
          className="h-8 px-3 text-sm"
          onClick={() => setShowAll((value) => !value)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {showAll ? 'Show fewer' : `Show ${hidden} more`}
        </Button>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Dot = cost per result over the last {lookback} days
        {lookback === 14 ? ' (bar = likely range)' : ''}; dashed line = target. Budget bar runs from
        today&rsquo;s daily budget to the proposed one.
      </p>
    </div>
  );
}
