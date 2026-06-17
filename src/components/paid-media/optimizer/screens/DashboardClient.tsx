"use client";

import Link from "next/link";
import { ArrowRightLeft } from "lucide-react";

import { useOptimizer } from "../OptimizerProvider";
import {
  AudienceChip,
  EmptyPortfolioState,
  KpiCard,
  ShareBar,
  StatusChip,
  TrajectoryChip,
} from "../OptimizerBits";
import {
  costFromScore,
  costLabel,
  fmt,
  portfolioCpi,
  projectSpend,
  runPortfolioCycle,
  shortName,
  spend14d,
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

const BASE = "/paid-media/optimizer";

export function DashboardClient({ portfolioId }: { portfolioId: string }) {
  const { getPortfolio, getPriorComposites } = useOptimizer();
  const pf = getPortfolio(portfolioId);
  if (!pf) return null;
  if (pf.snapshots.length === 0) {
    return <EmptyPortfolioState settingsHref={`${BASE}/${pf.id}/settings`} />;
  }

  const reallocation = runPortfolioCycle(pf, {
    priorComposites: getPriorComposites(pf.id),
  }).reallocation;
  const proj = projectSpend(pf);
  const cpi = portfolioCpi(pf);
  const spent = spend14d(pf);

  const items = [...reallocation.items].sort((a, b) => b.finalBudget - a.finalBudget);
  const maxBar = Math.max(1, ...items.map((i) => Math.max(i.finalBudget, i.currentBudget)));
  const byId = new Map(pf.snapshots.map((s) => [s.id, s]));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Daily budget"
          value={`$${fmt(pf.config.dailyBudget)}`}
          sub={`${pf.currency} / day`}
        />
        <KpiCard
          label="Spent (14d)"
          value={`$${fmt(spent)}`}
          sub={`of $${fmt(pf.config.periodBudget)} plan`}
        />
        <KpiCard
          label={`Portfolio ${costLabel(pf.objective)}`}
          value={`$${cpi.toFixed(1)}`}
          sub={`target $${pf.config.cpaTarget}`}
          tone={cpi > pf.config.cpaTarget * 1.05 ? "bad" : "ok"}
        />
        <KpiCard
          label="30d vs plan"
          value={`${proj.pctVsPlan >= 0 ? "+" : ""}${proj.pctVsPlan.toFixed(0)}%`}
          sub={`${proj.pctVsPlan >= 0 ? "over" : "under"} plan`}
          tone={proj.pctVsPlan > 3 ? "warn" : "ok"}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <p className="inline-flex items-center gap-2 text-sm">
          <ArrowRightLeft className="size-4 text-[var(--cs-violet,#5a39ff)]" />
          <span className="font-medium">Budget reallocation ready</span> · Jun 14 · total
          preserved
        </p>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`${BASE}/${pf.id}/reallocation`}>Review</Link>
          </Button>
          <Button asChild size="sm" variant="success">
            <Link href={`${BASE}/${pf.id}/reallocation`}>Approve</Link>
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Ad sets</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad set</TableHead>
                <TableHead className="text-right">Daily</TableHead>
                <TableHead className="w-[34%]">Share</TableHead>
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
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">
                          {shortName(snap?.name ?? item.id)}
                        </span>
                        <AudienceChip type={snap?.audienceType} />
                        <StatusChip status={item.status} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(item.finalBudget)}
                    </TableCell>
                    <TableCell>
                      <ShareBar proposedPct={(item.finalBudget / maxBar) * 100} />
                    </TableCell>
                    <TableCell>
                      <TrajectoryChip state={item.trajectoryState} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">${cpiItem.toFixed(0)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
