"use client";

import { useEffect, useState } from "react";
import type { OrganicCreativeMetric } from "@continuum/contracts";
import type { InstagramAccountOption } from "@/components/dashboard/InstagramOrganicReportingWidget";
import type { OrganicPost } from "@/lib/schemas/organicMetrics";
import { fetchOrganicAnalytics } from "@/lib/api/organicAnalytics.client";
import { useOrganicInsights } from "@/hooks/useOrganicInsights";
import {
  buildOrganicCreativeRows,
  extractAwarenessHookRates,
} from "@/lib/organic/organic-creative-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightLeaderboard, type LeaderboardRow } from "./InsightLeaderboard";
import { InsightRowActions } from "./InsightRowActions";

const RANGE_PRESET = "last_7d" as const;

type Platform = "instagram" | "youtube";

type PostsState =
  | { status: "idle" | "loading" }
  | { status: "error" }
  | { status: "success"; posts: OrganicPost[] };

type OrganicCreativesLeaderboardProps = {
  brandId: string;
  accounts: InstagramAccountOption[];
  youtubeAccounts?: InstagramAccountOption[];
};

function resolveDefaultAccount(
  accounts: InstagramAccountOption[],
  youtubeAccounts: InstagramAccountOption[],
): { account: InstagramAccountOption; platform: Platform } | null {
  if (accounts.length > 0) return { account: accounts[0], platform: "instagram" };
  if (youtubeAccounts.length > 0) return { account: youtubeAccounts[0], platform: "youtube" };
  return null;
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

// Top organic creatives ranked by reach (views for YouTube), each row carrying
// an example insight (Engine B hook rate, else a client-derived hook-rate-vs-
// average line). Rankings load instantly; the insight enrichment is best-effort.
export function OrganicCreativesLeaderboard({
  brandId,
  accounts,
  youtubeAccounts = [],
}: OrganicCreativesLeaderboardProps) {
  const resolved = resolveDefaultAccount(accounts, youtubeAccounts);
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

  if (postsState.status === "idle" || postsState.status === "loading") {
    return <Skeleton className="h-[220px] w-full rounded-lg" />;
  }

  if (postsState.status === "success" && postsState.posts.length > 0) {
    const awarenessHookRateById = extractAwarenessHookRates(awareness);
    const creativeRows = buildOrganicCreativeRows({
      posts: postsState.posts,
      metric,
      awarenessHookRateById,
    });
    const rows: LeaderboardRow[] = creativeRows.map((row) => ({
      id: row.id,
      name: row.name,
      subLabel: row.mediaType,
      insightLine: row.insightLine,
      metricValue: formatCompact(row.metricValue),
      thumbnailUrl: row.thumbnailUrl,
      actions: <InsightRowActions />,
    }));
    return <InsightLeaderboard title="Top creatives" metricLabel={metricLabel} rows={rows} />;
  }

  return (
    <div className="flex h-full flex-col items-start gap-2 rounded-lg border border-border/70 bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Top creatives</p>
      <p className="text-sm text-muted-foreground">
        {postsState.status === "error"
          ? "Couldn't load your creatives right now."
          : "No posts yet for this account."}
      </p>
    </div>
  );
}
