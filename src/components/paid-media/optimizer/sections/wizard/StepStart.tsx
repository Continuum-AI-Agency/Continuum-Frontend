'use client';

import { useLocale, useTranslations } from 'next-intl';
import { localizeOptimizationMetricDefinition } from '@/lib/paid-media/optimizationMetricPresentation';
import { createOptimizerDisplayTranslate } from '@/lib/paid-media/optimizerTranslator';

// Step 1 — where to start. Each suggestion is a borderless row a person can read in one glance:
// what it groups, what it spends, what a result costs, and a strip of dots showing how
// that cost spreads across its ad sets (the spread is the reason to optimize them
// together). One button takes the suggestion into the wizard; "Explore" opens the full
// ad-set and creative view for anyone who wants to look first. Starting from scratch is
// a row of its own, not a footnote.
//
// A cross-platform suggestion ("Leads // All platforms") says which platforms it spans and how
// many members each one brings, chip by chip, with each Google campaign type it holds ("Search
// 2", "Performance Max 1"); a Meta-only card reads exactly as before.

import type {
  AdSetSnapshot,
  OptimizationModeDto,
  OptimizationObjective,
  PortfolioSuggestion,
} from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { ArrowRightIcon, ChevronDownIcon, PencilRulerIcon, SparklesIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SkeletonText } from '@/components/ui/skeleton';
import { READ_TIMEOUT_MS } from '@/lib/api/timeout';
import { cn } from '@/lib/utils';
import { deriveEfficiency, formatCpa, formatCurrency, humanize } from '../../format';
import * as typeScale from '../../typeScale';
import { PlatformChip } from '../platforms/PlatformChip';
import { SuggestionExplorer } from '../SuggestionExplorer';
import { CONVERSION_OBJECTIVES } from '../suggestionModel';
import { questionHeading } from './OptionRow';
import { channelTypeCounts, suggestionPlatformCounts } from './wizardModel';

export type SuggestionOverride = { objective: OptimizationObjective; mode: OptimizationModeDto };

/** Why the suggestions are missing: the read ran out its bound (a slow cold Meta read — the
 *  service is alive) or the service did not answer at all. Only the second is "offline". */
export type SuggestionsFailure = 'timeout' | 'unreachable' | null;

/** True once a load has run past the read bound, so a long cold read is named, not a skeleton. */
function useRunningPastReadBound(isLoading: boolean): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    setPast(false);
    if (!isLoading) return;
    const timer = setTimeout(() => setPast(true), READ_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);
  return past;
}

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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
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
        {uiText.rich('sentence_b5e3b12405ac', {
          low: formatCpa(cheapest.cost, currency, uiLocale),
          high: formatCpa(priciest.cost, currency, uiLocale),
          count: dots.length,
          room: priciest.cost > cheapest.cost * 1.5 ? 'yes' : 'no',
        })}
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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  const metric = localizeOptimizationMetricDefinition(
    getOptimizationMetricDefinition(suggestion.objective),
    optimizerText,
  );
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
          {humanize(suggestion.objective, uiText)}
        </Badge>
        <Badge className="text-xs" variant="teal">
          {humanize(suggestion.mode, uiText)}
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
              {channelTypeCounts(
                (suggestion.members ?? []).filter((member) => member.platform === entry.platform),
              ).map(({ label, count }) => (
                <Badge data-testid="suggestion-channel-type" key={label} variant="muted">
                  {label} {count}
                </Badge>
              ))}
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <dt className={`${typeScale.label} text-muted-foreground`}>
            {platformCounts ? uiText('members_1044a4c') : uiText('ad_sets_f59ed42')}
          </dt>
          <dd className="font-mono font-semibold text-base tabular-nums">
            {suggestion.summary.adsets}
          </dd>
        </div>
        <div>
          <dt className={`${typeScale.label} text-muted-foreground`}>
            {uiText('per_day_5b9e193')}
          </dt>
          <dd className="font-mono font-semibold text-base tabular-nums">
            {formatCurrency(suggestion.daily_total, currency, uiLocale)}
          </dd>
        </div>
        <div>
          <dt className={`${typeScale.label} text-muted-foreground`}>{metric.costLabel}</dt>
          <dd className="font-mono font-semibold text-base tabular-nums">
            {blended != null ? formatCpa(blended, currency, uiLocale) : '—'}
          </dd>
        </div>
      </dl>

      <SpreadStrip blended={blended} currency={currency} dots={dots} />

      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{uiText('why_this_group_8b72295')}</span>{' '}
        {suggestion.reason}
      </p>
      {noConversions ? (
        <p className="text-xs text-warning">
          {uiText.rich('sentence_bcf9d3eeadf7', { v0: metric.resultLabel.toLowerCase() })}
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
            {uiText('explore_ad_sets_1b9a75f')}
          </Button>
        ) : (
          <span />
        )}
        <Button className="h-7 gap-1.5 px-3 text-xs" onClick={onPick} size="sm" type="button">
          {uiText('use_this_b291996')}
          <ArrowRightIcon aria-hidden className="size-3.5" />
        </Button>
      </div>
    </article>
  );
}

/** One suggestion row while the suggestions load: the SuggestionCard's lines, as borderless
 *  bars sized by representative words, so the list is already the height it is about to be.
 *  The two rows used to be 7rem bordered boxes; the list that replaced them was 2.6x taller and
 *  moved everything under it (the Overview's empty-state layout shift). */
function SuggestionCardSkeleton() {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const exampleAmount = useMemo(
    () =>
      new Intl.NumberFormat(uiLocale, {
        minimumIntegerDigits: 3,
        useGrouping: false,
        maximumFractionDigits: 0,
      }).format(0),
    [uiLocale],
  );
  return (
    <article
      aria-hidden="true"
      className="flex flex-col gap-2.5 py-4"
      data-testid="suggestion-skeleton"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <SkeletonText className="font-semibold text-sm tracking-tight">
          {uiText('purchases_a0718ef')}
        </SkeletonText>
        <SkeletonText className="rounded-full border border-transparent px-2 py-0.5 font-medium text-xs">
          {uiText('purchase_5b5e9c6')}
        </SkeletonText>
        <SkeletonText className="rounded-full border border-transparent px-2 py-0.5 font-medium text-xs">
          {uiText('balanced_5386ea5')}
        </SkeletonText>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {[uiText('ad_sets_f59ed42'), uiText('per_day_489b7ab'), 'CPA'].map((label) => (
          <div className="flex flex-col" key={label}>
            <SkeletonText className={typeScale.label}>{label}</SkeletonText>
            <SkeletonText className="font-mono font-semibold text-base">
              ${exampleAmount} MXN
            </SkeletonText>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <div className="h-3" />
        <p className="text-xs">
          <SkeletonText wrap>
            {uiText('cost_per_result_spreads_from_000_mxn_to_000_m_c3a0ac8')}
          </SkeletonText>
        </p>
      </div>
      <p className="text-xs">
        <SkeletonText wrap>
          {uiText('why_this_group_0_ad_sets_grouped_by_the_same__7848f98')}
        </SkeletonText>
      </p>
      <div className="flex items-center justify-between gap-2">
        <SkeletonText className="h-7 px-2 text-xs leading-7">
          {uiText('explore_ad_sets_1b9a75f')}
        </SkeletonText>
        <SkeletonText className="h-7 px-3 text-xs leading-7">
          {uiText('use_this_b291996')}
        </SkeletonText>
      </div>
    </article>
  );
}

type StepStartProps = {
  suggestions: PortfolioSuggestion[];
  isLoading: boolean;
  failure: SuggestionsFailure;
  onRetry: () => void;
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
  failure,
  onRetry,
  emptyMessage,
  snapshots,
  currency,
  brandId,
  accountId,
  onPick,
  onScratch,
  extras,
}: StepStartProps) {
  const uiText = useTranslations('scale');
  const [exploring, setExploring] = useState<string | null>(null);
  const slow = useRunningPastReadBound(isLoading);
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
        <h3 className={questionHeading}>{uiText('where_should_it_start_673fc8d')}</h3>
        <div className="flex items-center gap-2">
          <SparklesIcon aria-hidden className="size-4 text-primary-ink" />
          <h4 className="font-semibold text-sm tracking-tight">
            {uiText('start_from_a_suggestion_0ed4aca')}
          </h4>
          {suggestions.length > 0 ? (
            <span className="text-muted-foreground text-xs" data-testid="suggestions-subtitle">
              {uiText('grouped_from_this_account_s_active_ad_sets_fe54451')}
            </span>
          ) : isLoading && slow ? (
            // The subtitle's own slot, so naming the wait shifts nothing below it.
            <span
              className="text-muted-foreground text-xs"
              data-testid="suggestions-slow"
              role="status"
            >
              {uiText('still_reading_this_account_s_ad_sets_498e3e9')}
            </span>
          ) : isLoading ? (
            <SkeletonText className="text-xs" data-testid="suggestions-subtitle" wrap>
              {uiText('grouped_from_this_account_s_active_ad_sets_fe54451')}
            </SkeletonText>
          ) : null}
        </div>

        {/* One list for every state, so the rows that land replace their placeholders in place
            and the scratch row below them stays the same node — and stays offered when the
            suggestions fail, as their notice promises. */}
        <div
          className="divide-y divide-border/60 border-border/60 border-b"
          data-testid="suggestion-list"
        >
          {isLoading ? (
            <>
              <SuggestionCardSkeleton />
              <SuggestionCardSkeleton />
            </>
          ) : failure === 'timeout' ? (
            <div
              className="flex items-start gap-3 py-3"
              data-testid="suggestions-failure"
              role="status"
            >
              <p className="min-w-0 flex-1 text-warning text-xs">
                {uiText('suggestions_are_taking_longer_than_usual_try__7d0a66e')}
              </p>
              <Button
                className="h-7 shrink-0 px-2 text-xs"
                onClick={onRetry}
                size="sm"
                variant="outline"
              >
                {uiText('retry_942087c')}
              </Button>
            </div>
          ) : failure === 'unreachable' ? (
            <p
              className="py-3 text-warning text-xs"
              data-testid="suggestions-failure"
              role="status"
            >
              {uiText('suggestions_are_unavailable_the_optimizer_ser_332cd7b')}
            </p>
          ) : suggestions.length === 0 ? (
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
              <span className="font-semibold text-sm tracking-tight">
                {uiText('start_from_scratch_a4822ff')}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {uiText('pick_the_ad_sets_or_campaigns_yourself_on_any_0a7f4fd')}
            </span>
            <span className="inline-flex items-center gap-1 text-primary-ink text-xs">
              {uiText('build_it_5e38320')}
              <ArrowRightIcon aria-hidden className="size-3.5" />
            </span>
          </button>
        </div>

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
