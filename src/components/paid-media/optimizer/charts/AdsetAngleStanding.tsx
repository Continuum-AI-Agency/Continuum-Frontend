'use client';

// One executable row per enrolled ad set: what angle its next creative should run, and why.
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

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCpa } from '../format';
import { type AdsetAngleRow, type AngleVerdict, sortAngleRows } from './angleStanding';
import { ChartEmpty } from './ChartStates';

type AdsetAngleStandingProps = {
  rows: AdsetAngleRow[];
  currency?: string | null;
};

const VERDICT_META: Record<
  AngleVerdict,
  { label: string; variant: 'success' | 'warning' | 'teal' | 'outline' }
> = {
  double_down: { label: 'Double down', variant: 'success' },
  rebuild_craft: { label: 'Rebuild craft', variant: 'warning' },
  introduce: { label: 'Introduce', variant: 'teal' },
  insufficient: { label: 'Needs a variant', variant: 'outline' },
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function AngleRow({ row, currency }: { row: AdsetAngleRow; currency?: string | null }) {
  const meta = VERDICT_META[row.verdict];
  const recommended = row.recommendedAngle;

  return (
    <div className="space-y-1.5 border-border/40 border-b py-2.5 last:border-b-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="min-w-0 truncate text-xs text-foreground">{row.adsetName}</span>
            }
          />
          <TooltipContent className="max-w-xs">
            <span className="font-mono text-2xs">{row.adsetId}</span>
          </TooltipContent>
        </Tooltip>
        <span className="flex shrink-0 items-center gap-1.5">
          {row.confidence === 'thin' ? (
            <Badge className="text-3xs" variant="outline">
              thin
            </Badge>
          ) : null}
          <Badge className="text-3xs" variant={meta.variant}>
            {meta.label}
          </Badge>
        </span>
      </div>

      <p className="text-2xs text-muted-foreground">{row.action}</p>

      {recommended ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-3xs text-muted-foreground tabular-nums">
          <span>
            wins <span className="text-foreground">{pct(recommended.winRate)}</span> of{' '}
            {recommended.eligibleAds} ads
          </span>
          {recommended.spendShare != null ? (
            <span>{pct(recommended.spendShare)} of spend</span>
          ) : null}
          {row.adsetMedianCpa != null ? (
            <span>
              beat {formatCpa(row.adsetMedianCpa, currency)} {row.kpi}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AdsetAngleStanding({ rows, currency }: AdsetAngleStandingProps) {
  if (rows.length === 0) {
    return (
      <ChartEmpty message="Angle standing appears once this portfolio has enrolled ad sets with analyzed creatives." />
    );
  }

  const sorted = sortAngleRows(rows);
  const actionable = sorted.filter((row) => row.verdict !== 'insufficient').length;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {actionable > 0
          ? `${actionable} of ${sorted.length} ad ${sorted.length === 1 ? 'set has' : 'sets have'} a clear next angle`
          : 'No ad set has enough compared ads yet — ship a second variant somewhere to start measuring.'}
      </p>
      <div className="flex flex-col">
        {sorted.map((row) => (
          <AngleRow currency={currency} key={row.adsetId} row={row} />
        ))}
      </div>
    </div>
  );
}
