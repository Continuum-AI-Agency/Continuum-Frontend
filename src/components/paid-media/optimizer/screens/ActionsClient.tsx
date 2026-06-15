"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, CirclePause } from "lucide-react";

import { useOptimizer } from "../OptimizerProvider";
import {
  TRIGGER_LABELS,
  fmt,
  portfolioShortLabel,
  projectSpend,
  runPortfolioCycle,
  shortName,
} from "@/lib/paid-media/optimizer/engine-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const BASE = "/paid-media/optimizer";

type FeedAction = {
  key: string;
  kind: "reallocation" | "pause";
  title: string;
  subtitle: string;
  status: "pending" | "applied";
  portfolioId: string | null;
};

type Filter = "all" | "pending" | "applied";

export function ActionsClient() {
  const { portfolios } = useOptimizer();
  const [filter, setFilter] = useState<Filter>("all");
  const [approved, setApproved] = useState<Set<string>>(new Set());

  const actions = useMemo<FeedAction[]>(() => {
    const list: FeedAction[] = [];
    for (const pf of portfolios) {
      // Nothing to reallocate for a portfolio with no ad sets.
      if (pf.snapshots.length === 0) continue;
      const result = runPortfolioCycle(pf);
      const proj = projectSpend(pf);
      list.push({
        key: `realloc-${pf.id}`,
        kind: "reallocation",
        title: `Budget reallocation · ${pf.snapshots.length} ad sets`,
        subtitle: `${portfolioShortLabel(pf.name)} · Jun 14 · total $${fmt(
          result.reallocation.allocatedTotal,
        )} · ${proj.pctVsPlan >= 0 ? "+" : ""}${proj.pctVsPlan.toFixed(0)}% vs plan`,
        status: "pending",
        portfolioId: pf.id,
      });
      for (const rec of result.recommendations) {
        const snap = pf.snapshots.find((s) => s.id === rec.adSetId);
        list.push({
          key: `pause-${pf.id}-${rec.adSetId}`,
          kind: "pause",
          title: `Pause · ${shortName(snap?.name ?? rec.adSetId)}`,
          subtitle: `${portfolioShortLabel(pf.name)} · ${
            TRIGGER_LABELS[rec.trigger] ?? rec.trigger
          } · held at floor`,
          status: "pending",
          portfolioId: pf.id,
        });
      }
    }
    // Static history (illustrative — no persistence in this PR).
    list.push({
      key: "hist-realloc",
      kind: "reallocation",
      title: "Budget reallocation · 9 ad sets",
      subtitle: "Mobile Installs · Jun 13 · applied automatically",
      status: "applied",
      portfolioId: null,
    });
    list.push({
      key: "hist-pause",
      kind: "pause",
      title: "Pause · rmkt:broad-CDP-old",
      subtitle: "Retargeting · Jun 12 · approved",
      status: "applied",
      portfolioId: null,
    });
    return list;
  }, [portfolios]);

  const visible = actions.filter((a) => filter === "all" || a.status === filter);
  const pendingTotal = actions.filter((a) => a.status === "pending").length;

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "applied", label: "Applied" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          All actions
          {pendingTotal > 0 ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {pendingTotal} pending
            </span>
          ) : null}
        </h2>
        <div className="flex items-center gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors",
                filter === f.key
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col divide-y p-0">
          {visible.map((action) => {
            const isApproved = approved.has(action.key);
            const Icon = action.kind === "reallocation" ? ArrowRightLeft : CirclePause;
            const iconTone =
              action.status === "applied"
                ? "bg-muted text-muted-foreground"
                : action.kind === "reallocation"
                  ? "bg-[var(--cs-violet,#5a39ff)]/10 text-[var(--cs-violet,#5a39ff)]"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-500";
            return (
              <div key={action.key} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md",
                    iconTone,
                  )}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{action.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{action.subtitle}</div>
                </div>
                {action.status === "applied" ? (
                  <Badge variant="secondary">✓ Applied</Badge>
                ) : isApproved ? (
                  <Badge variant="success">✓ Approved</Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-600 dark:text-amber-500">
                    Pending
                  </Badge>
                )}
                {action.status === "pending" && action.portfolioId ? (
                  <div className="flex items-center gap-1.5">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`${BASE}/${action.portfolioId}/reallocation`}>Review</Link>
                    </Button>
                    {!isApproved ? (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() =>
                          setApproved((prev) => new Set(prev).add(action.key))
                        }
                      >
                        Approve
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
