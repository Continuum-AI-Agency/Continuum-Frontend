"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";

import { useOptimizer } from "../OptimizerProvider";
import {
  AudienceChip,
  DeltaPct,
  EmptyPortfolioState,
  KpiCard,
  NumberField,
  PacingBar,
  ShareBar,
  StatusChip,
  TrajectoryChip,
} from "../OptimizerBits";
import {
  capitalize,
  fmt,
  projectSpend,
  runPortfolioCycle,
  shortName,
} from "@/lib/paid-media/optimizer/engine-helpers";
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

const BASE = "/paid-media/optimizer";

export function ReallocationClient({ portfolioId }: { portfolioId: string }) {
  const { getPortfolio, updateConfig } = useOptimizer();
  const router = useRouter();
  const pf = getPortfolio(portfolioId);

  // Overrides apply to THIS reallocation only until "Save edits" persists them.
  const [daily, setDaily] = useState<number>(pf?.config.dailyBudget ?? 0);
  const [cap, setCap] = useState<number>(pf?.config.velocityCap ?? 30);
  const [approved, setApproved] = useState(false);
  const [approvedPauses, setApprovedPauses] = useState<Set<string>>(new Set());

  if (!pf) return null;
  if (pf.snapshots.length === 0) {
    return <EmptyPortfolioState settingsHref={`${BASE}/${pf.id}/settings`} />;
  }

  const result = runPortfolioCycle(pf, { dailyBudget: daily, velocityCap: cap });
  const reallocation = result.reallocation;
  const proj = projectSpend(pf, daily);

  const items = [...reallocation.items].sort((a, b) => b.finalBudget - a.finalBudget);
  const maxBar = Math.max(1, ...items.map((i) => Math.max(i.finalBudget, i.currentBudget)));
  const byId = new Map(pf.snapshots.map((s) => [s.id, s]));

  const discard = () => {
    setDaily(pf.config.dailyBudget);
    setCap(pf.config.velocityCap);
    router.push(`${BASE}/${pf.id}`);
  };
  const saveEdits = () => updateConfig(pf.id, { dailyBudget: daily, velocityCap: cap });

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
          {approved ? (
            <Badge variant="success">✓ Approved</Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 dark:text-amber-500">
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
                  <TableHead className="text-right">CPI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const snap = byId.get(item.id);
                  const cpiItem = item.score14d > 0 ? 1 / item.score14d : 0;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">
                            {shortName(snap?.name ?? item.id)}
                          </span>
                          <AudienceChip type={snap?.audienceType} />
                          <StatusChip status={item.status} />
                        </div>
                      </TableCell>
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

        {result.recommendations.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Pause recommendations</h3>
            {result.recommendations.map((rec) => {
              const snap = byId.get(rec.adSetId);
              const isApproved = approvedPauses.has(rec.adSetId);
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
                        onClick={() =>
                          setApprovedPauses((prev) => new Set(prev).add(rec.adSetId))
                        }
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
              — overrides this reallocation only
            </span>
          </h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="realloc-daily" className="text-xs text-muted-foreground">
                Daily budget ({pf.currency})
              </label>
              <NumberField id="realloc-daily" value={daily} onCommit={setDaily} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">
                Velocity cap: <span className="font-medium text-foreground">{cap}%</span>
              </label>
              <Slider
                value={[cap]}
                min={10}
                max={60}
                step={1}
                onValueChange={(v) => setCap(v[0] ?? cap)}
                aria-label="Velocity cap"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Mode ({capitalize(pf.config.mode)}) and target come from the portfolio settings.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={discard}>
            Discard
          </Button>
          <Button variant="outline" onClick={saveEdits}>
            Save edits
          </Button>
          <Button
            variant="success"
            onClick={() => setApproved(true)}
            disabled={approved}
          >
            ✓ Approve reallocation
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
