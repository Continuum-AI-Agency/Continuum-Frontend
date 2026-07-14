'use client';

// One portfolio's pending-recommendation group in the Actions queue. Reads the
// portfolio's performance report (which carries its pending recommendations) and
// renders an approve/reject row per recommendation.

import type { PortfolioListItem } from '@continuum/contracts';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CREATIVE_RECOMMENDATION_KINDS,
  isExecutable,
  notImplementedMessage,
  parseReport,
  recommendationActionCopy,
  severityBadgeVariant,
  severityRank,
} from '../reportModel';
import { useOptimizerMutations, useOptimizerPerformance } from '../useOptimizerData';
import { RecommendationInsight } from './RecommendationInsight';

type OptimizerActionsPortfolioGroupProps = {
  brandId: string;
  adAccountId: string;
  portfolio: PortfolioListItem;
};

export function OptimizerActionsPortfolioGroup({
  brandId,
  adAccountId,
  portfolio,
}: OptimizerActionsPortfolioGroupProps) {
  const performanceQuery = useOptimizerPerformance(portfolio.id);
  const { setStatus } = useOptimizerMutations(brandId, adAccountId);

  const report = parseReport(performanceQuery.data);
  // Most-urgent-first so a high-severity pause never hides below low-severity noise.
  const pending = (report?.recommendations ?? [])
    .filter((rec) => rec.status === 'pending')
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  if (performanceQuery.isLoading) {
    return <Skeleton className="h-24 rounded-lg" />;
  }

  if (pending.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-tight">
        {portfolio.name}
        <Badge variant="secondary" className="text-3xs">
          {pending.length}
        </Badge>
      </h3>
      <div className="space-y-2">
        {pending.map((rec) => {
          const isBusy = setStatus.isPending && setStatus.variables?.recommendation_id === rec.id;
          // A pause is advisory: approving it never pauses the ad set on Meta, so the
          // primary button reads "Acknowledge", with copy that says the optimizer won't act.
          const { approveLabel, advisory } = recommendationActionCopy(rec.kind);
          // The creative-level kinds are FOUND but not yet EXECUTABLE (no drain, no autopilot
          // path). Approving one would set a status, do nothing, and leave a burning ad running
          // while the queue looked handled — so the action refuses out loud instead. The finding
          // itself is real and worth showing.
          const executable = isExecutable(rec.kind);
          // These name ONE ad inside the ad set. Showing the ad set id alone would give you five
          // suspects and no defendant.
          const isCreativeKind = CREATIVE_RECOMMENDATION_KINDS.has(rec.kind);
          return (
            <div
              key={rec.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-tight">
                  <RecommendationInsight
                    adsetId={rec.adset_id}
                    brandId={brandId}
                    id={rec.id}
                    kind={rec.kind}
                    reason={rec.reason ?? ''}
                    severity={rec.severity}
                    trigger={rec.trigger}
                  />{' '}
                  ·{' '}
                  {isCreativeKind && rec.ad_id ? (
                    <>
                      <span className="text-xs font-normal text-muted-foreground">ad</span>{' '}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">{rec.ad_id}</code>{' '}
                      <span className="text-xs font-normal text-muted-foreground">in</span>{' '}
                      <code className="rounded bg-muted/60 px-1 py-0.5 text-xs text-muted-foreground">
                        {rec.adset_id}
                      </code>
                    </>
                  ) : (
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{rec.adset_id}</code>
                  )}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {rec.severity ? (
                    <Badge
                      variant={severityBadgeVariant(rec.severity)}
                      className="text-3xs uppercase"
                    >
                      {rec.severity}
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="text-3xs">
                    {rec.trigger}
                  </Badge>
                  {rec.reason}
                </p>
                <RecommendationBrief seed={rec.seed} />
                {advisory ? (
                  <p className="mt-1 text-2xs text-muted-foreground/80 italic">{advisory}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 px-3 text-xs"
                  disabled={isBusy}
                  onClick={() => {
                    // Refuse loudly rather than record a decision we cannot honour. Marking it
                    // `approved` here would clear it from the queue while the ad kept spending.
                    if (!executable) {
                      toast.info(notImplementedMessage(rec.kind));
                      return;
                    }
                    setStatus.mutate({ recommendation_id: rec.id, status: 'approved' });
                  }}
                >
                  {approveLabel}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-3 text-xs"
                  disabled={isBusy}
                  onClick={() =>
                    setStatus.mutate({ recommendation_id: rec.id, status: 'rejected' })
                  }
                >
                  Reject
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The deterministic citations a variation brief is grounded on — the figures a human copies
 *  into Studio, and the only thing a model downstream is ever allowed to rephrase.
 *
 *  Rendered because the advisory tells the user to take the brief there themselves; an
 *  instruction to use a brief that is not on screen is not an instruction, it is a shrug. */
function RecommendationBrief({ seed }: { seed?: Record<string, unknown> | null }) {
  const groundedOn = Array.isArray(seed?.groundedOn) ? (seed.groundedOn as string[]) : [];
  if (groundedOn.length === 0) return null;

  const rebuildCraft = seed?.rebuildCraft === true;

  return (
    <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
      <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
        Grounded on
      </p>
      <ul className="mt-1 space-y-0.5">
        {groundedOn.map((line) => (
          <li key={line} className="text-2xs text-muted-foreground">
            {line}
          </li>
        ))}
      </ul>
      {rebuildCraft ? (
        // The distinction the whole feature turns on: this creative converts best AND Meta
        // rates its craft below its auction peers. Cloning it would industrialize the penalty.
        <p className="mt-1.5 text-2xs font-medium text-foreground">
          Keep the angle — rebuild the execution. Meta rates this creative below its auction peers,
          so copying it as-is would reproduce what the auction is already penalizing.
        </p>
      ) : null}
    </div>
  );
}
