'use client';

// Step 1 — where to start. Each suggestion is a borderless row a person can read in one glance:
// what it groups, what it spends, what a result costs, and a strip of dots showing how
// that cost spreads across its ad sets (the spread is the reason to optimize them
// together). One button takes the suggestion into the wizard; "Explore" opens the full
// ad-set and creative view for anyone who wants to look first. Starting from scratch is
// a row of its own, not a footnote.
//
// A cross-platform suggestion ("Leads // All platforms") says which platforms it spans and how
// many members each one brings, chip by chip; a Meta-only card reads exactly as before.

import type {
  AdSetSnapshot,
  OptimizationModeDto,
  OptimizationObjective,
  PortfolioSuggestion,
} from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { ArrowRightIcon, ChevronDownIcon, PencilRulerIcon, SparklesIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { deriveEfficiency, formatCpa, formatCurrency, humanize } from '../../format';
import * as typeScale from '../../typeScale';
import { PlatformChip } from '../platforms/PlatformChip';
import { SuggestionExplorer } from '../SuggestionExplorer';
import { CONVERSION_OBJECTIVES } from '../suggestionModel';
import { questionHeading } from './OptionRow';
import { suggestionPlatformCounts } from './wizardModel';

export type SuggestionOverride = { objective: OptimizationObjective; mode: OptimizationModeDto };

type CostDot = { id: string; cost: number };

/** Each ad set's 14-day cost per result, for the spread strip. */
function costDots(
  suggestion: PortfolioSuggestion,
  snapshotById: Map<string, AdSetSnapshot>,
): CostDot[] {
  const metric = getOptimizationMetricDefinition(suggestion.objective);
  const dots: CostDot[] = [];
  for (const id of suggestion.adset_ids) {
    const snapshot = snapshotById.get(id);
    const window = snapshot?.windows?.d14 as Record<string, unknown> | undefined;
    if (!window) continue;
    const spend = typeof window.spend === 'number' ? window.spend : 0;
    const events =
      typeof window[metric.kpiField] === 'number' ? (window[metric.kpiField] as number) : 0;
    const cost = deriveEfficiency(spend, events, metric.denominatorMultiplier);
    if (cost != null) dots.push({ id, cost });
  }
  return dots.sort((a, b) => a.cost - b.cost);
}

function SpreadStrip({
  dots,
  blended,
  currency,
}: {
  dots: CostDot[];
  blended: number | null;
  currency: string | null;
}) {
  if (dots.length < 2) return null;
  const max = Math.max(...dots.map((dot) => dot.cost), blended ?? 0) * 1.1;
  const cheapest = dots[0];
  const priciest = dots[dots.length - 1];
  return (
    <div className="space-y-1">
      <div className="relative h-3">
        <div className="absolute inset-y-1/2 right-0 left-0 h-px -translate-y-1/2 bg-border" />
        {blended != null ? (
          <div
            aria-hidden
            className="absolute top-0 bottom-0 w-px border-l border-dashed border-foreground/50"
            style={{ left: `${(blended / max) * 100}%` }}
          />
        ) : null}
        {dots.map((dot) => (
          <span
            aria-hidden
            className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/70 ring-1 ring-background"
            key={dot.id}
            style={{ left: `${(dot.cost / max) * 100}%` }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        Cost per result spreads from {formatCpa(cheapest.cost, currency)} to{' '}
        {formatCpa(priciest.cost, currency)} across {dots.length} ad sets
        {priciest.cost > cheapest.cost * 1.5 ? ' — room to move money.' : '.'}
      </p>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  snapshotById,
  currency,
  canExplore,
  exploring,
  onToggleExplore,
  onPick,
}: {
  suggestion: PortfolioSuggestion;
  snapshotById: Map<string, AdSetSnapshot>;
  currency: string | null;
  canExplore: boolean;
  exploring: boolean;
  onToggleExplore: () => void;
  onPick: () => void;
}) {
  const metric = getOptimizationMetricDefinition(suggestion.objective);
  const blended = deriveEfficiency(
    suggestion.summary.spend14,
    suggestion.summary.conv14,
    metric.denominatorMultiplier,
  );
  const dots = useMemo(() => costDots(suggestion, snapshotById), [suggestion, snapshotById]);
  const noConversions =
    CONVERSION_OBJECTIVES.has(suggestion.objective) && suggestion.summary.conv14 === 0;
  const platformCounts = suggestionPlatformCounts(suggestion);

  return (
    <article className="flex flex-col gap-2.5 py-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <p className="min-w-0 truncate font-semibold text-sm tracking-tight">{suggestion.name}</p>
        <Badge className="text-xs" variant="secondary">
          {humanize(suggestion.objective)}
        </Badge>
        <Badge className="text-xs" variant="teal">
          {humanize(suggestion.mode)}
        </Badge>
      </div>

      {platformCounts ? (
        <ul className="flex flex-wrap items-center gap-1.5" data-testid="suggestion-platforms">
          {platformCounts.map((entry) => (
            <li
              className="inline-flex items-center gap-1 text-xs"
              data-platform={entry.platform}
              data-testid="suggestion-platform-count"
              key={entry.platform}
            >
              <PlatformChip platform={entry.platform} />
              <span className="text-muted-foreground tabular-nums">{entry.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <dt className={`${typeScale.label} text-muted-foreground`}>
            {platformCounts ? 'Members' : 'Ad sets'}
          </dt>
          <dd className="font-mono font-semibold text-base tabular-nums">
            {suggestion.summary.adsets}
          </dd>
        </div>
        <div>
          <dt className={`${typeScale.label} text-muted-foreground`}>Per day</dt>
          <dd className="font-mono font-semibold text-base tabular-nums">
            {formatCurrency(suggestion.daily_total, currency)}
          </dd>
        </div>
        <div>
          <dt className={`${typeScale.label} text-muted-foreground`}>{metric.costLabel}</dt>
          <dd className="font-mono font-semibold text-base tabular-nums">
            {blended != null ? formatCpa(blended, currency) : '—'}
          </dd>
        </div>
      </dl>

      <SpreadStrip blended={blended} currency={currency} dots={dots} />

      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Why this group:</span> {suggestion.reason}
      </p>
      {noConversions ? (
        <p className="text-xs text-warning">
          No tracked {metric.resultLabel.toLowerCase()} in 14 days — consider Traffic for a decisive
          first cycle.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        {canExplore ? (
          <Button
            aria-expanded={exploring}
            className="h-7 gap-1 px-2 text-xs"
            onClick={onToggleExplore}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ChevronDownIcon
              className={cn('size-3.5 transition-transform', exploring && 'rotate-180')}
            />
            Explore ad sets
          </Button>
        ) : (
          <span />
        )}
        <Button className="h-7 gap-1.5 px-3 text-xs" onClick={onPick} size="sm" type="button">
          Use this
          <ArrowRightIcon aria-hidden className="size-3.5" />
        </Button>
      </div>
    </article>
  );
}

type StepStartProps = {
  suggestions: PortfolioSuggestion[];
  isLoading: boolean;
  isError: boolean;
  emptyMessage: string;
  snapshots: AdSetSnapshot[];
  currency: string | null;
  brandId: string;
  accountId: string;
  onPick: (suggestion: PortfolioSuggestion, override?: SuggestionOverride) => void;
  onScratch: () => void;
  /** Account context that belongs with the suggestions (CBO campaigns, projections). */
  extras?: React.ReactNode;
};

export function StepStart({
  suggestions,
  isLoading,
  isError,
  emptyMessage,
  snapshots,
  currency,
  brandId,
  accountId,
  onPick,
  onScratch,
  extras,
}: StepStartProps) {
  const [exploring, setExploring] = useState<string | null>(null);
  const snapshotById = useMemo(
    () => new Map(snapshots.map((snapshot) => [snapshot.id, snapshot])),
    [snapshots],
  );
  const active = suggestions.find((suggestion) => suggestion.name === exploring) ?? null;
  const activeSnapshots = useMemo(() => {
    if (!active) return [];
    const ids = new Set(active.adset_ids);
    return snapshots.filter((snapshot) => ids.has(snapshot.id));
  }, [active, snapshots]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className={questionHeading}>Where should it start?</h3>
        <div className="flex items-center gap-2">
          <SparklesIcon aria-hidden className="size-4 text-primary" />
          <h4 className="font-semibold text-sm tracking-tight">Start from a suggestion</h4>
          {suggestions.length > 0 ? (
            <span className="text-muted-foreground text-xs">
              grouped from this account&rsquo;s active ad sets
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
        ) : isError ? (
          <p className="py-2 text-warning text-xs">
            Suggestions are unavailable — the optimizer service is offline. You can still build a
            portfolio from scratch.
          </p>
        ) : (
          <div className="divide-y divide-border/60 border-border/60 border-b">
            {suggestions.length === 0 ? (
              <p className="py-3 text-muted-foreground text-xs">{emptyMessage}</p>
            ) : null}
            {suggestions.map((suggestion) => (
              <SuggestionCard
                canExplore={suggestion.adset_ids.some((id) => snapshotById.has(id))}
                // A suggestion on another platform's account carries its own currency.
                currency={suggestion.currency ?? currency}
                exploring={exploring === suggestion.name}
                key={suggestion.name}
                onPick={() => onPick(suggestion)}
                onToggleExplore={() =>
                  setExploring((prev) => (prev === suggestion.name ? null : suggestion.name))
                }
                snapshotById={snapshotById}
                suggestion={suggestion}
              />
            ))}
            <button
              className="flex w-full flex-col items-start gap-1.5 py-4 text-left transition-colors hover:text-foreground"
              onClick={onScratch}
              type="button"
            >
              <span className="flex items-center gap-2">
                <PencilRulerIcon aria-hidden className="size-4 text-muted-foreground" />
                <span className="font-semibold text-sm tracking-tight">Start from scratch</span>
              </span>
              <span className="text-xs text-muted-foreground">
                Pick the ad sets or campaigns yourself, on any connected platform, then set the
                goal, the plan and who applies the moves.
              </span>
              <span className="inline-flex items-center gap-1 text-primary text-xs">
                Build it <ArrowRightIcon aria-hidden className="size-3.5" />
              </span>
            </button>
          </div>
        )}

        {active ? (
          <SuggestionExplorer
            accountId={accountId}
            brandId={brandId}
            busy={false}
            created={false}
            currency={currency}
            enrollFailed={false}
            onClose={() => setExploring(null)}
            onCreate={(override) => onPick(active, override)}
            snapshots={activeSnapshots}
            suggestion={active}
          />
        ) : null}
      </div>

      {extras}
    </div>
  );
}
