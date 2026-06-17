"use client";

import { useMemo } from "react";
import Link from "next/link";

import { useOptimizer } from "../OptimizerProvider";
import { KpiCard, ModeChip } from "../OptimizerBits";
import { OBJECTIVE_LABELS } from "@/lib/paid-media/optimizer/types";
import {
  fmt,
  moneyMoved,
  pendingRemaining,
  portfolioCpi,
  portfolioShortLabel,
  projectSpend,
  runPortfolioCycle,
  shortName,
} from "@/lib/paid-media/optimizer/engine-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const BASE = "/paid-media/optimizer";

export function OverviewClient() {
  const { portfolios, isActionApproved } = useOptimizer();

  const data = useMemo(() => {
    const rows = portfolios.map((pf) => {
      const hasAdSets = pf.snapshots.length > 0;
      const result = runPortfolioCycle(pf);
      const cpi = portfolioCpi(pf);
      const ratio = cpi > 0 ? pf.config.cpaTarget / cpi : 1;
      return {
        pf,
        hasAdSets,
        result,
        cpi,
        ratio,
        proj: projectSpend(pf),
        // Unapproved actions: 1 reallocation + N pauses, minus what's been approved
        // (0 for an empty portfolio).
        pendingActions: hasAdSets ? pendingRemaining(pf.id, result, isActionApproved) : 0,
        moved: hasAdSets ? moneyMoved(result.reallocation) : 0,
      };
    });

    // Efficiency/on-target metrics only make sense for portfolios with ad sets.
    const active = rows.filter((r) => r.hasAdSets);
    const totalDaily = rows.reduce((a, r) => a + r.pf.config.dailyBudget, 0);
    const totalPlan = rows.reduce((a, r) => a + r.pf.config.periodBudget, 0);
    const projSpend = rows.reduce((a, r) => a + r.pf.config.dailyBudget * 30, 0);
    const pending = rows.reduce((a, r) => a + r.pendingActions, 0);
    const moved = rows.reduce((a, r) => a + r.moved, 0);
    const onTarget = active.filter((r) => r.ratio >= 0.98).length;
    const effIndex = active.length
      ? active.reduce((a, r) => a + r.ratio, 0) / active.length
      : 0;
    const projPct = totalPlan > 0 ? ((projSpend - totalPlan) / totalPlan) * 100 : 0;

    let topMover: { name: string; pct: number; pf: string } | null = null;
    let mostEff: { name: string; ratio: number } | null = null;
    for (const r of active) {
      if (!mostEff || r.ratio > mostEff.ratio) {
        mostEff = { name: portfolioShortLabel(r.pf.name), ratio: r.ratio };
      }
      for (const item of r.result.reallocation.items) {
        if (!topMover || item.changePct > topMover.pct) {
          const snap = r.pf.snapshots.find((s) => s.id === item.id);
          topMover = {
            name: shortName(snap?.name ?? item.id),
            pct: item.changePct,
            pf: portfolioShortLabel(r.pf.name),
          };
        }
      }
    }

    const maxDaily = Math.max(1, ...rows.map((r) => r.pf.config.dailyBudget));

    return {
      rows,
      totalDaily,
      totalPlan,
      pending,
      moved,
      onTarget,
      activeCount: active.length,
      effIndex,
      projPct,
      topMover,
      mostEff,
      maxDaily,
    };
  }, [portfolios, isActionApproved]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Total daily budget"
          value={`$${fmt(data.totalDaily)}`}
          sub={`MXN / day · ${portfolios.length} portfolios`}
        />
        <KpiCard
          label="Projected month vs plan"
          value={`${data.projPct >= 0 ? "+" : ""}${data.projPct.toFixed(0)}%`}
          sub={`${data.projPct >= 0 ? "over" : "under"} $${fmt(data.totalPlan)} plan`}
          tone={data.projPct > 3 ? "warn" : "ok"}
        />
        <KpiCard
          label="Pending actions"
          value={`${data.pending}`}
          sub="awaiting approval"
          tone={data.pending > 0 ? "warn" : "ok"}
        />
        <KpiCard
          label="Reallocated this cycle"
          value={`$${fmt(data.moved)}`}
          sub="moved to better performers"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <p className="text-sm">
          <span className="text-[var(--cs-success,#53a88a)]">✓</span>{" "}
          <span className="font-medium">
            {data.onTarget} of {data.activeCount} portfolios on target
          </span>{" "}
          · efficiency index {data.effIndex.toFixed(2)}× · every reallocation preserves its
          total exactly.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href={`${BASE}/actions`}>Review actions</Link>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Portfolios at a glance</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Portfolio</TableHead>
                <TableHead>Objective</TableHead>
                <TableHead className="text-right">Daily</TableHead>
                <TableHead className="text-right">Cost / target</TableHead>
                <TableHead className="text-right">Pacing</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => {
                const over = r.cpi > r.pf.config.cpaTarget * 1.05;
                return (
                  <TableRow key={r.pf.id}>
                    <TableCell>
                      <Link
                        href={`${BASE}/${r.pf.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.pf.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        {OBJECTIVE_LABELS[r.pf.objective]}
                        <ModeChip mode={r.pf.config.mode} />
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${fmt(r.pf.config.dailyBudget)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.hasAdSets ? (
                        <>
                          <span
                            className={cn(
                              over
                                ? "text-destructive"
                                : "text-[var(--cs-success,#53a88a)]",
                            )}
                          >
                            ${r.cpi.toFixed(0)}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            /${r.pf.config.cpaTarget}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        r.proj.pctVsPlan > 3 ? "text-amber-700 dark:text-amber-500" : "",
                      )}
                    >
                      {r.proj.pctVsPlan >= 0 ? "+" : ""}
                      {r.proj.pctVsPlan.toFixed(0)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.pendingActions > 0 ? (
                        <span className="text-amber-700 dark:text-amber-500">
                          {r.pendingActions}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`${BASE}/${r.pf.id}`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Highlights</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              Top mover:{" "}
              <span className="font-medium text-[var(--cs-success,#53a88a)]">
                {data.topMover
                  ? `${data.topMover.name} ${data.topMover.pct >= 0 ? "+" : ""}${(
                      data.topMover.pct * 100
                    ).toFixed(0)}%`
                  : "—"}
              </span>{" "}
              {data.topMover ? `(${data.topMover.pf})` : ""}
            </p>
            <p>
              Most efficient:{" "}
              <span className="font-medium text-foreground">
                {data.mostEff ? data.mostEff.name : "—"}
              </span>{" "}
              {data.mostEff ? `at ${data.mostEff.ratio.toFixed(2)}× target` : ""}
            </p>
            <p>
              Budget conservation:{" "}
              <span className="font-medium text-[var(--cs-success,#53a88a)]">guaranteed</span>{" "}
              across all cycles.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily budget by portfolio</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.rows.map((r) => (
              <div key={r.pf.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{portfolioShortLabel(r.pf.name)}</span>
                  <span className="tabular-nums">${fmt(r.pf.config.dailyBudget)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-primary/70"
                    style={{
                      width: `${Math.round((r.pf.config.dailyBudget / data.maxDaily) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
