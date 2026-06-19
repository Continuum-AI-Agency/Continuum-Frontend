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
import { resolveOrganicAccount } from "@/lib/organic/resolve-organic-account";
import { InsightDataTable, type InsightColumn } from "@/components/dashboard/datatable/InsightDataTable";
import { DeltaBadge } from "@/components/dashboard/datatable/DeltaBadge";
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
// data table: each row carries its Engine B hook-rate insight, a right-click
// action menu, and a click-to-expand insight surface. Replaces the ranked-list
// leaderboard while reusing the same data pipeline.
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

  const columns = useMemo<InsightColumn<DisplayRow>[]>(
    () => [
      {
        id: "rank",
        header: "#",
        cellClassName: "w-8 text-muted-foreground",
        cell: (row) => <span className="font-mono text-xs tabular-nums">{row.rank}</span>,
      },
      {
        id: "creative",
        header: "Creative",
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-3">
            {row.thumbnailUrl ? (
              <LeaderboardThumbnail src={row.thumbnailUrl} alt={row.name} fallbackSeed={row.name} />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{row.name}</p>
              {row.mediaType ? (
                <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                  {row.mediaType}
                </p>
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
        id: "hook",
        header: "Hook",
        align: "right",
        sortValue: (row) => row.hookRate ?? -1,
        cell: (row) =>
          typeof row.hookRate === "number" ? `${Math.round(row.hookRate)}%` : "—",
      },
      {
        id: "delta",
        header: "vs avg",
        align: "right",
        sortValue: (row) => row.vsAveragePct ?? 0,
        cell: (row) =>
          typeof row.vsAveragePct === "number" ? <DeltaBadge value={row.vsAveragePct} /> : "—",
      },
    ],
    [metricLabel],
  );

  return (
    <InsightDataTable
      title="Top creatives"
      metricLabel={metricLabel}
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
      expandedContent={(row) => (
        <div className="flex flex-col gap-2 text-[11px] leading-relaxed">
          {row.insightLine ? <p className="text-foreground">{row.insightLine}</p> : null}
          {row.permalink ? (
            <a
              href={row.permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              Open original
            </a>
          ) : null}
        </div>
      )}
    />
  );
}
