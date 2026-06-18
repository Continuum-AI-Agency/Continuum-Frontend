"use client";

import { useEffect, useState } from "react";
import type { PaidRankedEntity, PaidRankingScope } from "@continuum/contracts";
import { fetchPaidRanking } from "@/lib/paid-media/paid-ranking.client";
import {
  getLatestInsights,
  type PersistedCampaignInsight,
} from "@/lib/paid-media/insight-history-client";
import { buildPaidLeaderboardRows } from "@/lib/paid-media/paid-leaderboard-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightLeaderboard } from "./InsightLeaderboard";
import { InsightRowActions } from "./InsightRowActions";

const RANGE = { preset: "last_7d" } as const;

type State =
  | { status: "idle" | "loading" }
  | { status: "error" }
  | { status: "success"; entities: PaidRankedEntity[]; insights: PersistedCampaignInsight[] };

type PaidEntityLeaderboardProps = {
  brandId: string;
  adAccountId: string | null;
  scope: PaidRankingScope;
  title: string;
  emptyMessage: string;
  metricLabel?: string;
};

// One ranked paid leaderboard (campaigns or ad sets) by ROAS, with each row's
// example insight joined from the persisted paid-media insights. Ranking comes
// from the edge function; insights are best-effort (empty on failure) so a
// missing insight history never blanks the rankings.
export function PaidEntityLeaderboard({
  brandId,
  adAccountId,
  scope,
  title,
  emptyMessage,
  metricLabel = "ROAS",
}: PaidEntityLeaderboardProps) {
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    if (!adAccountId) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    Promise.all([
      fetchPaidRanking({
        brandId,
        adAccountId,
        platform: "meta",
        scope,
        kpi: "roas",
        direction: "top",
        limit: 5,
        range: RANGE,
      }),
      getLatestInsights({ brandId, adAccountId, limit: 20 }).catch(
        () => [] as PersistedCampaignInsight[],
      ),
    ])
      .then(([entities, insights]) => {
        if (!cancelled) setState({ status: "success", entities, insights });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, adAccountId, scope]);

  if (state.status === "idle" || state.status === "loading") {
    return <Skeleton className="h-[220px] w-full rounded-lg" />;
  }

  if (state.status === "success" && state.entities.length > 0) {
    const rows = buildPaidLeaderboardRows({
      entities: state.entities,
      insights: state.insights,
      scope,
    }).map((row) => ({ ...row, actions: <InsightRowActions /> }));
    return <InsightLeaderboard title={title} metricLabel={metricLabel} rows={rows} />;
  }

  return (
    <div className="flex h-full flex-col items-start gap-2 rounded-lg border border-border/70 bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">
        {state.status === "error" ? "Couldn't load performance right now." : emptyMessage}
      </p>
    </div>
  );
}
