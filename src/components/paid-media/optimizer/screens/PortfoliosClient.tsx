"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useOptimizer } from "../OptimizerProvider";
import { ModeChip } from "../OptimizerBits";
import {
  fmt,
  portfolioCpi,
  runPortfolioCycle,
} from "@/lib/paid-media/optimizer/engine-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const BASE = "/paid-media/optimizer";

export function PortfoliosClient() {
  const { portfolios, addPortfolio } = useOptimizer();
  const router = useRouter();

  const handleNew = () => {
    const id = addPortfolio();
    router.push(`${BASE}/${id}/settings`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">All portfolios</h2>
        <Button size="sm" onClick={handleNew}>
          + New portfolio
        </Button>
      </div>

      {portfolios.map((pf) => {
        const hasAdSets = pf.snapshots.length > 0;
        const cpi = portfolioCpi(pf);
        const over = cpi > pf.config.cpaTarget * 1.05;
        const pending = hasAdSets ? runPortfolioCycle(pf).recommendations.length : 0;
        return (
          <Card key={pf.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <div className="font-medium">{pf.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {pf.objective} · {pf.snapshots.length} ad sets
                  <ModeChip mode={pf.config.mode} />· plan ${fmt(pf.config.periodBudget)}/mo
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-semibold tabular-nums">${fmt(pf.config.dailyBudget)}</div>
                  <div className="text-xs text-muted-foreground">
                    CPI{" "}
                    {hasAdSets ? (
                      <>
                        <span
                          className={cn(
                            over ? "text-destructive" : "text-[var(--cs-success,#53a88a)]",
                          )}
                        >
                          ${cpi.toFixed(0)}
                        </span>
                        /${pf.config.cpaTarget}
                      </>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                </div>
                {!hasAdSets ? (
                  <Badge variant="secondary">No ad sets</Badge>
                ) : pending > 0 ? (
                  <Badge variant="outline" className="text-amber-600 dark:text-amber-500">
                    {pending} pending
                  </Badge>
                ) : (
                  <Badge variant="success">✓ clean</Badge>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link href={`${BASE}/${pf.id}/settings`}>Edit</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={`${BASE}/${pf.id}`}>Open</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
