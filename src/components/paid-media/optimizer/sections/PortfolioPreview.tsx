'use client';

// "Campaigns today + what-if" preview for a suggested portfolio, shown in
// onboarding BEFORE the operator commits. Left: the group's ad sets as they are
// now (current budget, 14d spend, CPA). Right: what the optimizer WOULD do if
// applied — computed client-side by running the pure engine in the browser
// (runWhatIf), rendered through the same ReallocationFlow viz the live surface
// uses. Nothing is persisted; this is a dry-run.

import type {
  AdSetSnapshot,
  OptimizationModeDto,
  OptimizationObjective,
} from '@continuum/contracts';
import * as React from 'react';

import { ReallocationFlow } from '../charts/ReallocationFlow';
import { deriveCpa, formatCpa, formatCurrency, humanize } from '../format';
import { recommendationInsightKey } from '../insightKey';
import { campaignRows, runWhatIf } from '../preview/whatIf';
import { RecommendationInsight } from './RecommendationInsight';

type PortfolioPreviewProps = {
  brandId: string;
  snapshots: AdSetSnapshot[];
  objective: OptimizationObjective;
  mode: OptimizationModeDto;
  dailyTotal: number;
  currency?: string | null;
};

export function PortfolioPreview({
  brandId,
  snapshots,
  objective,
  mode,
  dailyTotal,
  currency,
}: PortfolioPreviewProps) {
  const rows = React.useMemo(() => campaignRows(snapshots, objective), [snapshots, objective]);
  const whatIf = React.useMemo(
    () => runWhatIf(snapshots, { objective, mode, total: dailyTotal }),
    [snapshots, objective, mode, dailyTotal],
  );

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No ad-set metrics to preview yet for this group.
      </p>
    );
  }

  return (
    <div className="grid gap-4 rounded-lg border border-border/60 bg-muted/10 p-3 lg:grid-cols-2">
      <section>
        <p className="mb-1.5 text-2xs font-semibold text-muted-foreground">Ad sets today</p>
        <div className="overflow-x-auto rounded-md border border-border/60 bg-card">
          <table className="w-full text-2xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-2 py-1 text-left font-medium">Ad set</th>
                <th className="px-2 py-1 text-right font-medium">Budget</th>
                <th className="px-2 py-1 text-right font-medium">Spend 14d</th>
                <th className="px-2 py-1 text-right font-medium">CPA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const cpa = deriveCpa(row.spend14, row.conv14);
                return (
                  <tr key={row.adsetId} className="border-b border-border/40 last:border-0">
                    <td className="max-w-[9rem] truncate px-2 py-1">
                      <code className="text-3xs text-muted-foreground">{row.name}</code>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {formatCurrency(row.currentBudget, currency)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {formatCurrency(row.spend14, currency)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {cpa != null ? formatCpa(cpa, currency) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-2xs font-semibold text-muted-foreground">
            If applied · {humanize(mode)} mode
          </p>
          <span className="text-3xs text-muted-foreground">preview only — nothing applied</span>
        </div>
        {whatIf ? (
          <div className="space-y-2">
            <ReallocationFlow currency={currency} items={whatIf.items} />
            {whatIf.recommendations.length > 0 ? (
              <div className="space-y-1.5">
                {whatIf.recommendations.map((rec) => (
                  <div
                    className="rounded-md border border-border/60 bg-card px-2.5 py-1.5"
                    key={recommendationInsightKey(rec)}
                  >
                    <RecommendationInsight
                      adsetId={rec.adsetId}
                      brandId={brandId}
                      kind={rec.kind}
                      reason={rec.reason}
                      severity={rec.severity}
                      trigger={rec.trigger}
                    />
                    <p className="mt-0.5 text-3xs text-muted-foreground">{rec.reason}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Not enough signal to simulate a cycle.</p>
        )}
      </section>
    </div>
  );
}
