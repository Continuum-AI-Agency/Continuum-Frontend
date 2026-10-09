'use client';

// One executable row per ad set: what angle its next creative should run, and why. Rendered
// in a portfolio's detail and, across the whole ad account, in Creative Insights.
//
// Replaces the Audience × angle heat map. That panel pivoted on `audience_type`, which no
// production code path writes, so it always collapsed to a single "unknown" row crossed with
// a spend-weighted mode of each ad set's angles. It looked like an analysis and could not be
// one. The audience is not a free variable anyway — it is fixed by the ad set's targeting.
//
// The rows are sorted so the work comes first (double down / rebuild / introduce) and the
// un-analyzable ad sets sit at the bottom, visible rather than dropped: "we have not measured
// this yet" and "nothing here works" are different states, and hiding the first would make
// the panel read as a shorter list of healthy ad sets.
//
// Each row reads left to right: the ad set, the angle it runs now, an arrow, the angle to run
// next (coloured by the call), and the one-sentence action. Hairlines between rows, no boxes.

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatCpa } from '../format';
import { type AdsetAngleRow, type AngleVerdict, angleName, sortAngleRows } from './angleStanding';
import { ChartEmpty } from './ChartStates';

type AdsetAngleStandingProps = {
  rows: AdsetAngleRow[];
  currency?: string | null;
  /** Shown when there are no rows; defaults to the portfolio wording. */
  emptyMessage?: string;
};

const VERDICT_META: Record<AngleVerdict, { label: string; tone: string }> = {
  double_down: { label: 'Double down', tone: 'text-emerald-600 dark:text-emerald-400' },
  rebuild_craft: { label: 'Rebuild the craft', tone: 'text-amber-600 dark:text-amber-400' },
  introduce: { label: 'Introduce', tone: 'text-primary' },
  insufficient: { label: 'Needs a variant', tone: 'text-muted-foreground' },
};

const DEFAULT_EMPTY =
  'Angle standing appears once this portfolio has enrolled ad sets with analyzed creatives.';

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function AngleRow({ row, currency }: { row: AdsetAngleRow; currency?: string | null }) {
  const meta = VERDICT_META[row.verdict];
  const recommended = row.recommendedAngle;
  const current = row.currentAngle;

  return (
    <div
      className="grid grid-cols-1 gap-x-3 gap-y-1 border-border/60 border-t py-2.5 @2xl/angles:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_1rem_minmax(0,1fr)_minmax(0,1.6fr)] @2xl/angles:items-baseline"
      data-testid="adset-angle-row"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="min-w-0 truncate font-semibold text-foreground text-xs">
              {row.adsetName}
            </span>
          }
        />
        <TooltipContent className="max-w-xs">
          <span className="font-mono text-xs">{row.adsetId}</span>
        </TooltipContent>
      </Tooltip>
      <span className="min-w-0 truncate text-muted-foreground text-xs">
        now: {current ? angleName(current.value) : 'no labelled ads'}
      </span>
      <span
        aria-hidden="true"
        className="hidden text-center text-muted-foreground/60 @2xl/angles:block"
      >
        →
      </span>
      <span className={cn('min-w-0 truncate font-semibold text-xs', meta.tone)}>
        {recommended ? (
          <>
            <span className="sr-only">{meta.label}: </span>
            {angleName(recommended.value)}
          </>
        ) : (
          meta.label
        )}
        {row.confidence === 'thin' ? (
          <span className="ml-1.5 font-normal text-xs text-muted-foreground">thin</span>
        ) : null}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-foreground/80 text-xs">{row.action}</p>
        {recommended ? (
          <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
            <span>
              wins {pct(recommended.winRate)} of {recommended.eligibleAds} ads
            </span>
            {recommended.spendShare != null ? (
              <span>{pct(recommended.spendShare)} of spend</span>
            ) : null}
            {row.adsetMedianCpa != null ? (
              <span>
                beat {formatCpa(row.adsetMedianCpa, currency)} {row.kpi}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function AdsetAngleStanding({ rows, currency, emptyMessage }: AdsetAngleStandingProps) {
  if (rows.length === 0) {
    return <ChartEmpty message={emptyMessage ?? DEFAULT_EMPTY} />;
  }

  const sorted = sortAngleRows(rows);
  const actionable = sorted.filter((row) => row.verdict !== 'insufficient');
  // Ad sets without enough compared ads all say the same sentence; listing each one buried the
  // few rows with a call under dozens of identical ones, so they fold into one line.
  const thin = sorted.filter((row) => row.verdict === 'insufficient');

  return (
    <div className="@container/angles space-y-2">
      <p className="text-muted-foreground text-xs">
        {actionable.length > 0
          ? `${actionable.length} of ${sorted.length} ad ${sorted.length === 1 ? 'set has' : 'sets have'} a clear next angle`
          : 'No ad set has enough compared ads yet — ship a second variant somewhere to start measuring.'}
      </p>
      {actionable.length > 0 ? (
        <div className="flex flex-col">
          {actionable.map((row) => (
            <AngleRow currency={currency} key={row.adsetId} row={row} />
          ))}
        </div>
      ) : null}
      {thin.length > 0 ? (
        <details className="group text-xs" data-testid="angle-standing-thin">
          <summary className="cursor-pointer list-none text-muted-foreground hover:text-foreground">
            {thin.length} ad {thin.length === 1 ? 'set needs' : 'sets need'} a second variant before
            an angle can be called
            <span className="group-open:hidden"> · show</span>
            <span className="hidden group-open:inline"> · hide</span>
          </summary>
          <div className="mt-1 flex flex-col">
            {thin.map((row) => (
              <AngleRow currency={currency} key={row.adsetId} row={row} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
