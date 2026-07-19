'use client';

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
  if (projections.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        Projections, not conversions &mdash; nothing changes on Meta until you convert.
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
          <Badge variant="outline" className="shrink-0 text-3xs">
            projected
          </Badge>
        </p>
        <p className="text-muted-foreground text-xs">
          If converted: {formatCurrency(totals.campaignBudgetToday, currency)}/d held at the
          campaign &rarr; {adsetLabel} budgeted at about{' '}
          <span className="font-medium text-foreground tabular-nums">
            {formatCurrency(totals.newDailyTotal, currency)}/d
          </span>{' '}
          in total, scored on {humanize(objective)}.
        </p>
        {floorAdsetCount > 0 ? (
          <p className="text-2xs text-muted-foreground">
            {floorAdsetCount} ad set{floorAdsetCount === 1 ? ' has' : 's have'} too little recent
            spend to project from, so {floorAdsetCount === 1 ? 'it sits' : 'they sit'} on an assumed
            account minimum. The real minimum comes back when you convert.
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
          <ChevronDownIcon
            className={`size-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
          <SparklesIcon className="size-3.5 text-primary" aria-hidden="true" />
          Project the first cycle
          <span className="font-normal text-muted-foreground">
            &mdash; what the optimizer would do
          </span>
        </button>
        {open ? (
          <div className="border-border/60 border-t p-3">
            <ProjectedCycleBody
              outcome={cyclePreview.data}
              isPending={cyclePreview.isPending}
              currency={currency}
            />
            <p className="mt-2 text-2xs text-muted-foreground">
              Estimated from each ad set&rsquo;s recent spend. Convert below to confirm the real
              per-ad-set budgets &mdash; nothing here changes anything on Meta.
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
  if (isPending || outcome == null) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-sm" role="status">
        <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
        Running the optimizer over the projected ad sets&hellip;
      </p>
    );
  }
  // The preview service (or its edge) isn't reachable — degrade quietly, never an error wall.
  if (outcome.status === 'unavailable') {
    return (
      <p className="text-muted-foreground text-xs">
        Projection isn&rsquo;t available yet &mdash; the optimizer preview service isn&rsquo;t live
        for this account.
      </p>
    );
  }
  if (outcome.status === 'error') {
    return (
      <p className="text-muted-foreground text-xs">
        Couldn&rsquo;t run the projection just now. Try reopening in a moment.
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
      <p className="text-2xs text-muted-foreground">
        {recCount === 0
          ? 'No action recommendations raised on the projected ad sets.'
          : `${recCount} action recommendation${recCount === 1 ? '' : 's'} raised on the projected ad sets.`}
      </p>
    </div>
  );
}
