'use client';

// Why this creative: cost per result for every creative the engine compared in the ad set,
// cheapest first, with the ad set's median as the line a new ad has to beat. The subject
// of the recommendation is drawn in the accent; the rest in the muted tone.

import { formatCpa } from '../format';
import type { StandingChart } from './creativeCardModel';

type CreativeStandingBarsProps = {
  chart: StandingChart;
  /** The objective's result, lower-cased: "purchases", "conversations". */
  resultWord: string;
  currency: string | null;
};

export function CreativeStandingBars({ chart, resultWord, currency }: CreativeStandingBarsProps) {
  return (
    <figure className="space-y-1.5" data-testid="creative-standing-bars">
      <figcaption className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground uppercase tracking-wide">
        <span>Cost per {resultWord} · 7d</span>
        {chart.median != null ? (
          <span className="normal-case tracking-normal">
            median {formatCpa(chart.median, currency)}
          </span>
        ) : null}
      </figcaption>
      <ol className="space-y-1">
        {chart.bars.map((bar) => (
          <li
            className="grid grid-cols-[8.5rem_minmax(0,1fr)_5.5rem] items-center gap-2 text-sm tabular-nums"
            key={bar.adId}
          >
            <span
              className={
                bar.subject
                  ? 'truncate font-medium text-foreground'
                  : 'truncate text-muted-foreground'
              }
              title={bar.name}
            >
              {bar.name}
            </span>
            <span className="relative h-2.5 overflow-hidden rounded-sm bg-muted/50">
              {bar.share != null ? (
                <span
                  className={
                    bar.subject
                      ? 'absolute inset-y-0 left-0 rounded-sm bg-primary'
                      : bar.winner
                        ? 'absolute inset-y-0 left-0 rounded-sm bg-primary/60'
                        : 'absolute inset-y-0 left-0 rounded-sm bg-muted-foreground/40'
                  }
                  style={{ width: `${Math.max(2, bar.share * 100)}%` }}
                />
              ) : null}
              {chart.medianShare != null ? (
                <span
                  aria-hidden
                  className="absolute inset-y-0 w-px border-foreground/50 border-l border-dashed"
                  style={{ left: `${chart.medianShare * 100}%` }}
                />
              ) : null}
            </span>
            <span className="text-right text-foreground tabular-nums">
              {bar.costPerEvent != null ? formatCpa(bar.costPerEvent, currency) : '—'}
              <span className="text-muted-foreground"> · {bar.events}</span>
            </span>
          </li>
        ))}
      </ol>
      {chart.totalAds > chart.eligibleAds ? (
        <p className="text-xs text-muted-foreground">
          {chart.eligibleAds} of {chart.totalAds} ads had enough {resultWord} to compare.
        </p>
      ) : null}
    </figure>
  );
}
