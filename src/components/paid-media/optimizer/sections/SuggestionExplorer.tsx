'use client';

import { useLocale, useTranslations } from 'next-intl';
import { localizeOptimizationMetricDefinition } from '@/lib/paid-media/optimizationMetricPresentation';
import { createOptimizerDisplayTranslate } from '@/lib/paid-media/optimizerTranslator';

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
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  const [objective, setObjective] = useState<OptimizationObjective>(suggestion.objective);
  const [selectedAdsetId, setSelectedAdsetId] = useState<string | null>(null);

  const mode = DEFAULT_MODE_BY_OBJECTIVE[objective];
  const metric = localizeOptimizationMetricDefinition(
    getOptimizationMetricDefinition(objective),
    optimizerText,
  );
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
            <Badge className="text-xs" variant="teal">
              {humanize(mode, uiText)}
            </Badge>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {uiText.rich('sentence_9f567a94b7fb', {
              count: suggestion.summary.adsets,
              budget: formatCurrency(suggestion.daily_total, currency, uiLocale),
              hasCpa: cpa != null ? 'yes' : 'no',
              metric: metric.costLabel,
              cpa: cpa != null ? formatCpa(cpa, currency, uiLocale) : '',
            })}
          </p>
          {noConversions ? (
            <p className="mt-1 text-xs text-warning">
              {uiText.rich('sentence_95ce7caf5c30', {
                v0: () => <b>{uiText('traffic_4876efb')}</b>,
              })}
            </p>
          ) : null}
          {enrollFailed ? (
            <p className="mt-1 text-xs text-warning" role="status">
              {uiText('portfolio_created_but_its_ad_sets_didn_t_enro_ed75d6a')}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Select
            value={objective}
            onValueChange={(value) => setObjective(value as OptimizationObjective)}
          >
            <SelectTrigger
              className="h-7 w-36 text-xs"
              aria-label={uiText('optimization_objective_d916490')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OBJECTIVES.map((value) => (
                <SelectItem key={value} value={value}>
                  {humanize(value, uiText)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {created ? (
            <Badge className="gap-1 text-xs" variant="success">
              <CheckCircle2Icon className="size-3" />
              {uiText('created_406effb')}
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
              {busy ? uiText('creating_c79ed94') : uiText('create_4759498')}
            </Button>
          )}
          <Button
            aria-label={uiText('close_explorer_a753a96')}
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
