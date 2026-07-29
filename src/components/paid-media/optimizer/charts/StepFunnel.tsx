'use client';

// A conversion funnel scaled by RATE, not by volume.
//
// The volume-scaled funnel this replaces was unreadable on any real ad account, because a
// real funnel is not gently tapered — it collapses by orders of magnitude. On a live
// portfolio (244,341 impressions → 1,277 clicks → 316 leads) stages two and three were 0.5%
// and 0.1% of the first bar: a solid block followed by a hairline. Every number a reader
// wants — how well does impressions→clicks convert, where is the worst hand-off — was
// rendered as visually identical slivers.
//
// So the bar length here is the STEP conversion rate (this stage ÷ the previous one), which
// is bounded 0–100% and therefore actually comparable between stages. The top stage is the
// baseline at 100%. Absolute counts stay on every row, right-aligned and tabular, because
// the rate alone cannot tell you whether 25% is 25 leads or 2. The drop-off is spelled out
// rather than left as a subtraction for the reader to do.
//
// Height is intrinsic (one row per stage) instead of a guessed h-40 — a 3-stage lead funnel
// and a 4-stage purchase funnel both fit exactly.

import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { intFmt } from '@/components/charts/chart-formatters';
import { cn } from '@/lib/utils';
import { ChartEmpty } from './ChartStates';
import { buildConversionFunnel, type FunnelStageOut, type FunnelWindow } from './vizData';

type StepFunnelProps = {
  window: FunnelWindow | null | undefined;
  objective: string | null | undefined;
};

const PCT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

/** Sub-1% rates round to "0%" and read as "nothing converted", which is wrong and alarming.
 *  Below 1% we show a decimal; above it, whole percents keep the column scannable. */
function formatRate(rate: number): string {
  if (rate > 0 && rate < 0.01) return PCT.format(rate);
  return `${Math.round(rate * 100)}%`;
}

function StageRow({ stage, isFirst }: { stage: FunnelStageOut; isFirst: boolean }) {
  // The baseline stage has no prior to rate against, so it anchors the scale at 100%.
  const rate = isFirst ? 1 : (stage.stepPct ?? 0);
  const widthPct = Math.max(rate * 100, rate > 0 ? 1.5 : 0);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-xs text-foreground">{stage.label}</span>
        <span className="shrink-0 font-data text-xs text-foreground tabular-nums">
          {stage.displayValue}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-[width]')}
            style={{
              width: `${widthPct}%`,
              background: isFirst ? 'var(--chart-1)' : (stage.color ?? 'var(--chart-1)'),
            }}
          />
        </div>
        <span className="w-12 shrink-0 text-right text-2xs text-muted-foreground tabular-nums">
          {isFirst ? '—' : formatRate(rate)}
        </span>
      </div>
      {!isFirst && stage.dropOff != null && stage.dropOff > 0 ? (
        <p className="text-3xs text-muted-foreground tabular-nums">
          {intFmt(stage.dropOff)} lost at this step
        </p>
      ) : null}
    </div>
  );
}

export function StepFunnel({ window, objective }: StepFunnelProps) {
  const stages = window ? buildConversionFunnel(window, objective) : [];

  if (stages.length === 0 || stages.every((stage) => stage.value === 0)) {
    return <ChartEmpty message="The conversion funnel appears once this portfolio has delivery." />;
  }

  const metric = getOptimizationMetricDefinition(objective);
  const terminal = stages.at(-1);

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {stages.map((stage, index) => (
          <StageRow isFirst={index === 0} key={stage.label} stage={stage} />
        ))}
      </div>

      <p className="border-border/60 border-t pt-2 text-2xs text-muted-foreground tabular-nums">
        {terminal ? (
          <>
            <span className="text-foreground">{formatRate(terminal.overallPct)}</span> of{' '}
            {stages[0].label.toLowerCase()} become {metric.resultLabel.toLowerCase()}
          </>
        ) : null}
        <span className="ml-1">· bars show step conversion, not volume</span>
      </p>
    </div>
  );
}
