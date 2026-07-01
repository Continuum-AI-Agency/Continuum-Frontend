"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { OrganicCreativeMetric, OrganicCreativeRow } from "@continuum/contracts";
import type { InstagramAccountOption } from "@/components/dashboard/InstagramOrganicReportingWidget";
import type { OrganicPost } from "@/lib/schemas/organicMetrics";
import { fetchOrganicAnalytics } from "@/lib/api/organicAnalytics.client";
import { useOrganicInsights } from "@/hooks/useOrganicInsights";
import {
  buildOrganicCreativeRows,
  extractAwarenessHookRates,
} from "@/lib/organic/organic-creative-rows";
import { hookRateTextColor } from "@/lib/organic/hook-rate-color";
import { resolveOrganicAccount } from "@/lib/organic/resolve-organic-account";
import { InsightDataTable, type InsightColumn } from "@/components/dashboard/datatable/InsightDataTable";
import { DeltaBadge } from "@/components/shared/DeltaBadge";
import { ModuleShortcutLink } from "@/components/shared/ModuleShortcutLink";
import { LeaderboardThumbnail } from "./LeaderboardThumbnail";
import { InsightActionsDropdown, InsightContextActions } from "./insightActions";

const RANGE_PRESET = "last_7d" as const;

type Platform = "instagram" | "youtube";

type PostsState =
  | { status: "idle" | "loading" }
  | { status: "error" }
  | { status: "success"; posts: OrganicPost[] };

type OrganicCreativesTableProps = {
  brandId: string;
  accounts: InstagramAccountOption[];
  youtubeAccounts?: InstagramAccountOption[];
};

type DisplayRow = OrganicCreativeRow & { rank: number };

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

// Top organic creatives ranked by reach (views for YouTube) as a dense, sortable
// data table: each row carries its Engine B hook-rate insight inline and a
// right-click action menu. Replaces the ranked-list leaderboard while reusing
// the same data pipeline.
export function OrganicCreativesTable({
  brandId,
  accounts,
  youtubeAccounts = [],
}: OrganicCreativesTableProps) {
  const resolved = resolveOrganicAccount(brandId, accounts, youtubeAccounts);
  const integrationAccountId = resolved?.account.integrationAccountId ?? null;
  const platform: Platform = resolved?.platform ?? "instagram";
  const metric: OrganicCreativeMetric = platform === "youtube" ? "views" : "reach";
  const metricLabel = metric === "views" ? "Views" : "Reach";

  const [postsState, setPostsState] = useState<PostsState>({ status: "idle" });

  const { awareness } = useOrganicInsights({
    brandId,
    integrationAccountId,
    platform,
    rangePreset: RANGE_PRESET,
    enabled: Boolean(integrationAccountId),
  });

  useEffect(() => {
    if (!integrationAccountId) {
      setPostsState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setPostsState({ status: "loading" });
    fetchOrganicAnalytics({
      brandId,
      integrationAccountId,
      platform,
      range: { preset: RANGE_PRESET },
      scope: "posts",
      postsLimit: 25,
    })
      .then((response) => {
        if (!cancelled) setPostsState({ status: "success", posts: response.posts ?? [] });
      })
      .catch(() => {
        if (!cancelled) setPostsState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, integrationAccountId, platform]);

  const rows = useMemo<DisplayRow[]>(() => {
    if (postsState.status !== "success") return [];
    const awarenessHookRateById = extractAwarenessHookRates(awareness);
    return buildOrganicCreativeRows({ posts: postsState.posts, metric, awarenessHookRateById }).map(
      (row, index) => ({ ...row, rank: index + 1 }),
    );
  }, [postsState, awareness, metric]);

  const columns = useMemo<InsightColumn<DisplayRow>[]>(() => {
    const cols: InsightColumn<DisplayRow>[] = [
      {
        id: "rank",
        header: "#",
        cellClassName: "w-8 text-muted-foreground",
        cell: (row) => <span className="font-mono text-xs tabular-nums">{row.rank}</span>,
      },
      {
        id: "creative",
        header: "Creative",
        cellClassName: "min-w-64",
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-3">
            {row.thumbnailUrl ? (
              <LeaderboardThumbnail src={row.thumbnailUrl} alt={row.name} fallbackSeed={row.name} />
            ) : null}
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex min-w-0 items-baseline gap-2">
                <p className="truncate text-sm text-foreground">{row.name}</p>
                {row.mediaType ? (
                  <span className="shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">
                    {row.mediaType}
                  </span>
                ) : null}
              </div>
              {row.insightLine || row.permalink ? (
                <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  {row.insightLine ? <span className="truncate">{row.insightLine}</span> : null}
                  {row.permalink ? (
                    <a
                      href={row.permalink}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex shrink-0 items-center gap-1 hover:text-foreground"
                    >
                      <ExternalLink className="size-3" />
                      Open original
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        id: "metric",
        header: metricLabel,
        align: "right",
        sortValue: (row) => row.metricValue,
        cell: (row) => formatCompact(row.metricValue),
      },
      {
        id: "impressions",
        header: "Impressions",
        align: "right",
        sortValue: (row) => row.impressions ?? -1,
        cell: (row) => (typeof row.impressions === "number" ? formatCompact(row.impressions) : "—"),
      },
    ];

    // The primary metric column already covers Views for YouTube (metric === "views");
    // only add a distinct Views column when it wouldn't duplicate that.
    if (metric !== "views") {
      cols.push({
        id: "views",
        header: "Views",
        align: "right",
        sortValue: (row) => row.views ?? -1,
        cell: (row) => (typeof row.views === "number" ? formatCompact(row.views) : "—"),
      });
    }

    cols.push(
      {
        id: "comments",
        header: "Comments",
        align: "right",
        sortValue: (row) => row.comments ?? -1,
        cell: (row) => (typeof row.comments === "number" ? formatCompact(row.comments) : "—"),
      },
      {
        id: "hook",
        header: "Hook",
        align: "right",
        sortValue: (row) => row.hookRate ?? -1,
        cell: (row) =>
          typeof row.hookRate === "number" ? (
            <span style={{ color: hookRateTextColor(row.hookRate) }}>{Math.round(row.hookRate)}%</span>
          ) : (
            "—"
          ),
      },
      {
        id: "delta",
        header: "vs avg",
        align: "right",
        sortValue: (row) => row.vsAveragePct ?? 0,
        cell: (row) =>
          typeof row.vsAveragePct === "number" ? <DeltaBadge value={row.vsAveragePct} /> : "—",
      },
    );

    return cols;
  }, [metric, metricLabel]);

  return (
    <InsightDataTable
      title="Top creatives"
      metricLabel={metricLabel}
      headerAction={<ModuleShortcutLink href="/ai-studio" label="Creative Studio" />}
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      defaultSort={{ columnId: "metric", direction: "desc" }}
      isLoading={postsState.status === "idle" || postsState.status === "loading"}
      emptyState={
        postsState.status === "error"
          ? "Couldn't load your creatives right now."
          : "No posts yet for this account."
      }
      contextMenu={(row) => <InsightContextActions permalink={row.permalink} />}
      rowActions={(row) => <InsightActionsDropdown permalink={row.permalink} />}
    />
  );
}
