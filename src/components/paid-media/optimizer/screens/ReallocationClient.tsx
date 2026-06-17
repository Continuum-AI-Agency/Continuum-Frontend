"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";

import { useOptimizer } from "../OptimizerProvider";
import {
  AdSetNameCell,
  DeltaPct,
  EmptyPortfolioState,
  KpiCard,
  NumberField,
  PacingBar,
  ShareBar,
  TrajectoryChip,
} from "../OptimizerBits";
import { getObjectiveProfile } from "@continuum/optimization-engine";
import {
  capitalize,
  compositesFrom,
  costFromScore,
  costLabel,
  fmt,
  maxBudgetBar,
  pauseKey,
  projectSpend,
  rankedItems,
  reallocationKey,
  runPortfolioCycle,
  shortName,
  snapshotsById,
} from "@/lib/paid-media/optimizer/engine-helpers";
import { OPTIMIZER_BASE_PATH as BASE } from "@/lib/paid-media/optimizer/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ReallocationClient({ portfolioId }: { portfolioId: string }) {
  const { getPortfolio, updateConfig, isActionApproved, approveAction, getPriorComposites, commitComposites } =
    useOptimizer();
  const router = useRouter();
  const pf = getPortfolio(portfolioId);

  // Default asymmetric caps: portfolio override -> objective profile calibration.
  const profileCaps = pf ? getObjectiveProfile(pf.objective) : undefined;
  const defaultUp = pf?.config.velocityUpPct ?? Math.round((profileCaps?.velocityUpPct ?? 0.4) * 100);
  const defaultDown = pf?.config.velocityDownPct ?? Math.round((profileCaps?.velocityDownPct ?? 0.45) * 100);

  // Overrides apply to THIS reallocation's preview until "Apply to portfolio" persists them.
  const [daily, setDaily] = useState<number>(pf?.config.dailyBudget ?? 0);
  const [up, setUp] = useState<number>(defaultUp);
  const [down, setDown] = useState<number>(defaultDown);

  const result = useMemo(
    () =>
      pf && pf.snapshots.length > 0
        ? runPortfolioCycle(pf, {
            dailyBudget: daily,
            velocityUpPct: up,
            velocityDownPct: down,
            priorComposites: getPriorComposites(pf.id),
          })
        : null,
    [pf, daily, up, down, getPriorComposites],
  );

  if (!pf) return null;
  if (pf.snapshots.length === 0) {
    return <EmptyPortfolioState settingsHref={`${BASE}/${pf.id}/settings`} />;
  }

  const reallocation = result!.reallocation;
  const recommendations = result!.recommendations;
  const proj = projectSpend(pf, daily);

  const items = rankedItems(reallocation);
  const maxBar = maxBudgetBar(items);
  const byId = snapshotsById(pf);

  const reallocApproved = isActionApproved(reallocationKey(pf.id));

  const discard = () => {
    setDaily(pf.config.dailyBudget);
    setUp(defaultUp);
    setDown(defaultDown);
    router.push(`${BASE}/${pf.id}`);
  };
  const applyToPortfolio = () =>
    updateConfig(pf.id, { dailyBudget: daily, velocityUpPct: up, velocityDownPct: down });
  const approveReallocation = () => {
    // Commit this cycle's composites as the next cycle's EWMA prior.
    commitComposites(pf.id, compositesFrom(reallocation.items));
    approveAction(reallocationKey(pf.id));
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-2 text-base font-semibold">
              <ArrowRightLeft className="size-4 text-[var(--cs-violet,#5a39ff)]" />
              Budget reallocation
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Jun 14, 2026 · {pf.snapshots.length} ad sets · {capitalize(pf.config.mode)} mode
            </p>
          </div>
          {reallocApproved ? (
            <Badge variant="success">✓ Approved</Badge>
          ) : (
            <Badge variant="outline" className="text-amber-700 dark:text-amber-500">
              Pending review
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiCard label="Daily total" value={`$${fmt(daily)}`} sub={`${pf.currency} / day`} />
          <KpiCard
            label="30-day projection"
            value={`$${fmt(proj.month30)}`}
            sub={`${proj.pctVsPlan >= 0 ? "+" : ""}${proj.pctVsPlan.toFixed(0)}% vs plan`}
            tone={proj.pctVsPlan > 3 ? "warn" : "ok"}
          />
          <KpiCard
            label={`To month end (${proj.remainingDays}d)`}
            value={`$${fmt(proj.toMonthEnd)}`}
            sub={`plan $${fmt(pf.config.periodBudget)}/mo`}
          />
          <Card>
            <CardContent className="flex flex-col gap-1 pt-6">
              <span className="text-xs text-muted-foreground">Conservation</span>
              {!reallocation.conserved ? (
                <Badge variant="destructive">⚠ check</Badge>
              ) : reallocation.residual < 0.5 ? (
                <Badge variant="success">✓ exact</Badge>
              ) : (
                <Badge variant="success">✓ within ceiling</Badge>
              )}
              <span className="text-[11px] text-muted-foreground">
                {!reallocation.conserved
                  ? "needs reconcile"
                  : reallocation.residual < 0.5
                    ? "total preserved"
                    : `$${fmt(reallocation.residual)} unspent (ceiling)`}
              </span>
            </CardContent>
          </Card>
        </div>

        <div>
          <div className="mb-1.5 text-xs text-muted-foreground">Pacing vs plan</div>
          <PacingBar pctVsPlan={proj.pctVsPlan} />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Proposed changes</h3>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad set</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="w-[30%]">Current → Proposed</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead>Trajectory</TableHead>
                  <TableHead className="text-right">{costLabel(pf.objective)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const snap = byId.get(item.id);
                  const cpiItem = costFromScore(item.score14d, pf.objective);
                  return (
                    <TableRow key={item.id}>
                      <AdSetNameCell item={item} snap={snap} />
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmt(item.currentBudget)}
                      </TableCell>
                      <TableCell>
                        <ShareBar
                          proposedPct={(item.finalBudget / maxBar) * 100}
                          currentPct={(item.currentBudget / maxBar) * 100}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <DeltaPct pct={item.changePct * 100} />
                      </TableCell>
                      <TableCell>
                        <TrajectoryChip state={item.trajectoryState} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ${cpiItem.toFixed(0)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        {recommendations.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Pause recommendations</h3>
            {recommendations.map((rec) => {
              const snap = byId.get(rec.adSetId);
              const isApproved = isActionApproved(pauseKey(pf.id, rec.adSetId));
              return (
                <div
                  key={rec.adSetId}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-500">
                      {shortName(snap?.name ?? rec.adSetId)}
                    </span>
                    {isApproved ? (
                      <Badge variant="success">✓ Approved</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => approveAction(pauseKey(pf.id, rec.adSetId))}
                      >
                        Approve pause
                      </Button>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{rec.reason}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No pause recommendations — this portfolio is healthy.
          </p>
        )}

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold">
            Review &amp; edit{" "}
            <span className="font-normal text-muted-foreground">
              — previews this proposal; &ldquo;Apply to portfolio&rdquo; saves it to Settings
            </span>
          </h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="realloc-daily" className="text-xs text-muted-foreground">
                Daily budget ({pf.currency})
              </label>
              <NumberField id="realloc-daily" value={daily} onCommit={setDaily} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">
                Raise cap: <span className="font-medium text-foreground">+{up}%</span>
              </label>
              <Slider
                value={[up]}
                min={10}
                max={80}
                step={1}
                onValueChange={(v) => setUp(v[0] ?? up)}
                aria-label="Raise cap"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">
                Cut cap: <span className="font-medium text-foreground">−{down}%</span>
              </label>
              <Slider
                value={[down]}
                min={10}
                max={80}
                step={1}
                onValueChange={(v) => setDown(v[0] ?? down)}
                aria-label="Cut cap"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Caps default to the {costLabel(pf.objective)} objective&rsquo;s calibration. Mode (
            {capitalize(pf.config.mode)}) and target come from the portfolio settings.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={discard}>
            Discard
          </Button>
          <Button variant="outline" onClick={applyToPortfolio}>
            Apply to portfolio
          </Button>
          <Button
            variant="success"
            onClick={approveReallocation}
            disabled={reallocApproved}
          >
            ✓ Approve reallocation
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
