"use client";

import { Fragment, useMemo } from "react";
import { ExternalLink } from "lucide-react";
import type { BrandInsightsTrend } from "@/lib/schemas/brandInsights";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { InsightDataTable, type InsightColumn } from "@/components/dashboard/datatable/InsightDataTable";
import { InsightActionsDropdown, InsightContextActions } from "./insightActions";

const PLATFORM_SHORT: Record<string, string> = {
  instagram: "IG",
  facebook: "FB",
  linkedin: "LI",
  tiktok: "TK",
  youtube: "YT",
  twitter: "X",
  x: "X",
};

function platformCode(platform: string): string {
  return PLATFORM_SHORT[platform.toLowerCase()] ?? platform.slice(0, 2).toUpperCase();
}

function confidencePct(trend: BrandInsightsTrend): string {
  return typeof trend.confidence === "number" ? `${Math.round(trend.confidence * 100)}%` : "—";
}

type TrendSignalsTableProps = {
  trends: BrandInsightsTrend[];
  limit?: number;
};

// Top trend signals as a dense, sortable data table: a title hover-card for the
// brand relevance, confidence, target platforms, and a why/distribution
// expander. Replaces the ranked-list "Top trend signals" leaderboard.
export function TrendSignalsTable({ trends, limit = 6 }: TrendSignalsTableProps) {
  const rows = useMemo(
    () =>
      [...trends].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, limit),
    [trends, limit],
  );

  const columns = useMemo<InsightColumn<BrandInsightsTrend>[]>(
    () => [
      {
        id: "signal",
        header: "Signal",
        cell: (trend) => {
          const meta = trend.relevanceToBrand || trend.description;
          const title = <span className="truncate text-sm text-foreground">{trend.title}</span>;
          return (
            <div className="min-w-0">
              {meta ? (
                <HoverCard openDelay={150} closeDelay={80}>
                  <HoverCardTrigger asChild>
                    <span className="block min-w-0 cursor-default">{title}</span>
                  </HoverCardTrigger>
                  <HoverCardContent side="right" align="start" sideOffset={12} className="w-80 text-[11px] leading-relaxed">
                    <p className="text-foreground">{meta}</p>
                  </HoverCardContent>
                </HoverCard>
              ) : (
                title
              )}
              {typeof trend.sourceSignalCount === "number" && trend.sourceSignalCount > 0 ? (
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  {trend.sourceSignalCount} source signals
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "confidence",
        header: "Confidence",
        align: "right",
        sortValue: (trend) => trend.confidence ?? 0,
        cell: (trend) => confidencePct(trend),
      },
      {
        id: "platforms",
        header: "Platforms",
        align: "right",
        cell: (trend) =>
          trend.platforms && trend.platforms.length > 0 ? (
            <span className="inline-flex flex-wrap justify-end gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {trend.platforms.map((platform) => (
                <span key={platform}>{platformCode(platform)}</span>
              ))}
            </span>
          ) : (
            "—"
          ),
      },
    ],
    [],
  );

  return (
    <InsightDataTable
      title="Top trend signals"
      metricLabel="Confidence"
      rows={rows}
      columns={columns}
      getRowId={(trend) => trend.id}
      defaultSort={{ columnId: "confidence", direction: "desc" }}
      contextMenu={(trend) => <InsightContextActions permalink={trend.sourceUrl} />}
      rowActions={(trend) => <InsightActionsDropdown permalink={trend.sourceUrl} />}
      expandedContent={(trend) => (
        <div className="flex flex-col gap-2 text-[11px] leading-relaxed">
          {trend.description ? <p className="text-foreground">{trend.description}</p> : null}
          {trend.relevanceToBrand && trend.relevanceToBrand !== trend.description ? (
            <p className="text-foreground">{trend.relevanceToBrand}</p>
          ) : null}
          {trend.platformRecommendations && trend.platformRecommendations.length > 0 ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {trend.platformRecommendations.slice(0, 3).map((rec) => (
                <Fragment key={`${trend.id}-${rec.platform}`}>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{rec.platform}</dt>
                  <dd className="text-foreground">{rec.reason}</dd>
                </Fragment>
              ))}
            </dl>
          ) : null}
          {trend.analysisTags && trend.analysisTags.length > 0 ? (
            <p className="text-[10px] text-muted-foreground">
              {trend.analysisTags.slice(0, 6).map((tag) => `#${tag}`).join("  ·  ")}
            </p>
          ) : null}
          {trend.sourceUrl ? (
            <a
              href={trend.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className={cn("inline-flex items-center gap-1 text-muted-foreground hover:text-foreground")}
            >
              <ExternalLink className="size-3" />
              {trend.source ?? "Source"}
            </a>
          ) : null}
        </div>
      )}
    />
  );
}
