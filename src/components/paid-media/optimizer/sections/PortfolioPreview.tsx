'use client';

// Read-only account baseline shown before portfolio creation. Allocation and
// recommendations are computed only by the backend optimizer after creation.

import type { AdSetSnapshot, OptimizationObjective } from '@continuum/contracts';
import * as React from 'react';

import { deriveCpa, formatCpa, formatCurrency } from '../format';
import { campaignRows } from '../preview/whatIf';

type PortfolioPreviewProps = {
  snapshots: AdSetSnapshot[];
  objective: OptimizationObjective;
  currency?: string | null;
};

export function PortfolioPreview({ snapshots, objective, currency }: PortfolioPreviewProps) {
  const rows = React.useMemo(() => campaignRows(snapshots, objective), [snapshots, objective]);

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No ad-set metrics to preview yet for this group.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
      <section>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <p className="text-2xs font-semibold text-muted-foreground">Ad sets today</p>
          <span className="text-3xs text-muted-foreground">
            Recommendations are calculated by the backend after creation
          </span>
        </div>
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
    </div>
  );
}
