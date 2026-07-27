'use client';

// The full-width explorer a suggestion opens into, in place of the old in-cell
// "Ad sets today" table (which stretched its grid row and left the sibling columns
// blank). A bounded-height split pane: the suggestion's ad sets scroll and search
// on the left; selecting one reveals its ad creatives as a masonry mosaic on the
// right. Both panes scroll internally — the page does not. The objective lever and
// the Create action ride the header so an operator explores and commits without
// leaving the panel.

import type {
  AdSetSnapshot,
  OptimizationModeDto,
  OptimizationObjective,
  PortfolioSuggestion,
} from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { CheckCircle2Icon, PlusIcon, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { deriveEfficiency, formatCpa, formatCurrency, humanize } from '../format';
import { snapshotToRow } from '../kpiColumns';
import { AdsetCreativeMosaic } from './AdsetCreativeMosaic';
import { AdsetExplorerList } from './AdsetExplorerList';
import { CONVERSION_OBJECTIVES, DEFAULT_MODE_BY_OBJECTIVE, OBJECTIVES } from './suggestionModel';

type SuggestionExplorerProps = {
  suggestion: PortfolioSuggestion;
  /** Just this suggestion's ad-set snapshots (the group). */
  snapshots: AdSetSnapshot[];
  currency: string | null;
  brandId: string;
  accountId: string | null;
  created: boolean;
  busy: boolean;
  enrollFailed: boolean;
  onCreate: (override: { objective: OptimizationObjective; mode: OptimizationModeDto }) => void;
  onClose: () => void;
};

export function SuggestionExplorer({
  suggestion,
  snapshots,
  currency,
  brandId,
  accountId,
  created,
  busy,
  enrollFailed,
  onCreate,
  onClose,
}: SuggestionExplorerProps) {
  const [objective, setObjective] = useState<OptimizationObjective>(suggestion.objective);
  const [selectedAdsetId, setSelectedAdsetId] = useState<string | null>(null);

  const mode = DEFAULT_MODE_BY_OBJECTIVE[objective];
  const metric = getOptimizationMetricDefinition(objective);
  const cpa = deriveEfficiency(
    suggestion.summary.spend14,
    suggestion.summary.conv14,
    metric.denominatorMultiplier,
  );
  const noConversions = CONVERSION_OBJECTIVES.has(objective) && suggestion.summary.conv14 === 0;

  const rows = useMemo(
    () => snapshots.map((snapshot) => snapshotToRow(snapshot, { metric })),
    [snapshots, metric],
  );
  // Default the selection to the highest-spend ad set so the mosaic is populated the
  // instant the explorer opens, matching the list's own sort.
  const defaultAdsetId = useMemo(() => {
    const top = [...rows].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))[0];
    return top?.adsetId ?? null;
  }, [rows]);
  const effectiveAdsetId = selectedAdsetId ?? defaultAdsetId;

  return (
    <div className="flex max-h-[70vh] min-h-0 flex-col rounded-lg border border-border/70 bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            {suggestion.name}
            <Badge className="text-3xs" variant="teal">
              {humanize(mode)}
            </Badge>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {suggestion.summary.adsets} ad sets · {formatCurrency(suggestion.daily_total, currency)}
            /d
            {cpa != null ? ` · ${metric.costLabel} ${formatCpa(cpa, currency)}` : ''}
          </p>
          {noConversions ? (
            <p className="mt-1 text-2xs text-warning">
              No conversions tracked in the last 14 days — a conversion objective will score as Low
              confidence. Consider <b>Traffic</b> for a decisive first cycle.
            </p>
          ) : null}
          {enrollFailed ? (
            <p className="mt-1 text-2xs text-warning" role="status">
              Portfolio created, but its ad sets didn&rsquo;t enroll. Press Create again to retry —
              nothing has been changed on Meta.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Select
            value={objective}
            onValueChange={(value) => setObjective(value as OptimizationObjective)}
          >
            <SelectTrigger className="h-7 w-36 text-xs" aria-label="Optimization objective">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OBJECTIVES.map((value) => (
                <SelectItem key={value} value={value}>
                  {humanize(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {created ? (
            <Badge className="gap-1 text-3xs" variant="success">
              <CheckCircle2Icon className="size-3" /> created
            </Badge>
          ) : (
            <Button
              className="h-7 gap-1.5 px-3 text-xs"
              disabled={busy}
              onClick={() => onCreate({ objective, mode })}
              size="sm"
              type="button"
            >
              <PlusIcon className="size-3.5" />
              {busy ? 'Creating…' : 'Create'}
            </Button>
          )}
          <Button
            aria-label="Close explorer"
            className="size-7"
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <AdsetExplorerList
          currency={currency}
          metricLabel={metric.costLabel}
          onSelect={setSelectedAdsetId}
          rows={rows}
          selectedId={effectiveAdsetId}
        />
        <div className="flex min-h-0 flex-col">
          <AdsetCreativeMosaic
            accountId={accountId}
            adsetId={effectiveAdsetId}
            brandId={brandId}
            currency={currency}
          />
        </div>
      </div>
    </div>
  );
}
