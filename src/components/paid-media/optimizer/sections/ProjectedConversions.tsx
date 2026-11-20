'use client';
import { useLocale, useTranslations } from 'next-intl';

// The suggestion surface for an account whose campaigns all budget at the campaign level
// (CBO). The suggester has nothing to group there, so instead of dead-ending it PROJECTS
// each CBO campaign as if it had been converted to ad-set budgets, and scores that
// projected fleet with the real optimizer engine (read-only /cycle/preview).
//
// Analysis only. Nothing here writes: no Meta call, no convert, no run row. The projected
// budgets are an ESTIMATE of the convert edge's split policy (see preview/convertPreview),
// and the surface says so — the authoritative per-ad-set budgets come back from the convert
// dryRun, which is reached from the "Convert to ad-set budgets" action below.
//
// Lazy by construction: the engine preview for a campaign runs only when its projection is
// expanded, so an account with twenty CBO campaigns fires zero previews on mount.

import type { CycleItemRow } from '@continuum/contracts';
import { ChevronDownIcon, Loader2Icon, SparklesIcon } from 'lucide-react';
import { useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { ReallocationFlow } from '../charts/ReallocationFlow';
import { formatCurrency, humanize } from '../format';
import type { ProjectedConversion } from '../preview/projectedConversion';
import { projectedCyclePreviewInput } from '../preview/projectedConversion';
import { useCyclePreview } from '../useOptimizerData';

type ProjectedConversionsProps = {
  brandId: string;
  accountId: string;
  currency: string | null;
  projections: ProjectedConversion[];
};

export function ProjectedConversions({
  brandId,
  accountId,
  currency,
  projections,
}: ProjectedConversionsProps) {
  const uiText = useTranslations('scale');
  if (projections.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        {uiText('projections_not_conversions_nothing_changes_o_8b0173e')}
      </p>
      <div className="grid gap-3 2xl:grid-cols-2">
        {projections.map((projection) => (
          <ProjectedConversionCard
            key={projection.campaignId}
            brandId={brandId}
            accountId={accountId}
            currency={currency}
            projection={projection}
          />
        ))}
      </div>
    </div>
  );
}

function ProjectedConversionCard({
  brandId,
  accountId,
  currency,
  projection,
}: {
  brandId: string;
  accountId: string;
  currency: string | null;
  projection: ProjectedConversion;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const [open, setOpen] = useState(false);
  const cyclePreview = useCyclePreview();
  const ranRef = useRef(false);

  const { totals, objective, floorAdsetCount } = projection;
  const adsetLabel = `${totals.adsetCount} ad set${totals.adsetCount === 1 ? '' : 's'}`;

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || ranRef.current) return;
    ranRef.current = true;
    cyclePreview.mutate(projectedCyclePreviewInput(projection, { brandId, accountId }));
  };

  return (
    <div className="rounded-lg border border-border/70 bg-card">
      <div className="space-y-1 px-4 py-3">
        <p className="flex items-center gap-2 font-semibold text-sm tracking-tight">
          <span className="min-w-0 truncate">{projection.campaignName}</span>
          <Badge variant="outline" className="shrink-0 text-xs">
            {uiText('projected_3a4b077')}
          </Badge>
        </p>
        <p className="text-muted-foreground text-xs">
          {uiText.rich('sentence_dc0bae26967d', {
            v0: formatCurrency(totals.campaignBudgetToday, currency, uiLocale),
            v1: adsetLabel,
            v2: () => (
              <span className="font-medium text-foreground tabular-nums">
                {uiText.rich('sentence_24e8fe03aac9', {
                  v0: formatCurrency(totals.newDailyTotal, currency, uiLocale),
                })}
              </span>
            ),
            v3: humanize(objective, uiText),
          })}
        </p>
        {floorAdsetCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            {uiText.rich('sentence_16c743fc6e00', { count: floorAdsetCount })}
          </p>
        ) : null}
      </div>

      <div className="border-border/60 border-t">
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={open}
          className="flex w-full items-center gap-1.5 px-4 py-2 text-foreground text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {uiText.rich('sentence_d938f59aa386', {
            v0: () => (
              <ChevronDownIcon
                className={`size-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            ),
            v1: () => <SparklesIcon className="size-3.5 text-primary-ink" aria-hidden="true" />,
            v2: () => (
              <span className="font-normal text-muted-foreground">
                {uiText('what_the_optimizer_would_do_600f2e8')}
              </span>
            ),
          })}
        </button>
        {open ? (
          <div className="border-border/60 border-t p-3">
            <ProjectedCycleBody
              outcome={cyclePreview.data}
              isPending={cyclePreview.isPending}
              currency={currency}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {uiText('estimated_from_each_ad_set_s_recent_spend_con_3528095')}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProjectedCycleBody({
  outcome,
  isPending,
  currency,
}: {
  outcome: ReturnType<typeof useCyclePreview>['data'];
  isPending: boolean;
  currency: string | null;
}) {
  const uiText = useTranslations('scale');
  if (isPending || outcome == null) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-sm" role="status">
        <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
        {uiText('running_the_optimizer_over_the_projected_ad_s_d686cd9')}
      </p>
    );
  }
  // The preview service (or its edge) isn't reachable — degrade quietly, never an error wall.
  if (outcome.status === 'unavailable') {
    return (
      <p className="text-muted-foreground text-xs">
        {uiText('projection_isn_t_available_yet_the_optimizer__665def3')}
      </p>
    );
  }
  if (outcome.status === 'error') {
    return (
      <p className="text-muted-foreground text-xs">
        {uiText('couldn_t_run_the_projection_just_now_try_reop_8ab4e4a')}
      </p>
    );
  }

  const { preview } = outcome;
  const flowItems: CycleItemRow[] = preview.items.map((item) => ({
    adset_id: item.adset_id,
    current_budget: item.current_budget,
    final_budget: item.final_budget,
    change_abs: item.change_abs,
    change_pct: item.change_pct,
    diagnostics: item.diagnostics ?? null,
  }));
  const recCount = preview.recommendations.length;

  return (
    <div className="space-y-2">
      <ReallocationFlow items={flowItems} currency={currency} />
      <p className="text-xs text-muted-foreground">
        {recCount === 0
          ? uiText('no_action_recommendations_raised_on_the_proje_88da6e6')
          : uiText('template_5ebea87cff1e', { count: recCount })}
      </p>
    </div>
  );
}
