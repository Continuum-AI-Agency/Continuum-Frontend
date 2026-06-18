"use client";

import { useEffect, useState } from "react";
import { fetchTopCampaignsByRoas, type RankedCampaign } from "@/lib/paid-media/top-campaigns.client";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightLeaderboard, type LeaderboardRow } from "./InsightLeaderboard";

// The dashboard paid leaderboard mirrors what the reporting widget shows: Meta,
// the first resolved ad account, a trailing 7-day window.
const RANGE = { preset: "last_7d" } as const;

function formatRoas(value: number) {
  return `${value.toFixed(2)}x`;
}

function formatSpend(value: number | null) {
  if (value === null) return undefined;
  const amount = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
  return `${amount} spend`;
}

type State =
  | { status: "idle" | "loading" }
  | { status: "error" }
  | { status: "success"; rows: RankedCampaign[] };

type PaidLeaderboardProps = {
  brandId: string;
  adAccountId: string | null;
};

export function PaidLeaderboard({ brandId, adAccountId }: PaidLeaderboardProps) {
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    if (!adAccountId) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    fetchTopCampaignsByRoas({ brandId, adAccountId, platform: "meta", range: RANGE, limit: 5 })
      .then((rows) => {
        if (!cancelled) setState({ status: "success", rows });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, adAccountId]);

  if (state.status === "idle" || state.status === "loading") {
    return <Skeleton className="h-[220px] w-full rounded-lg" />;
  }

  const campaigns = state.status === "success" ? state.rows : [];

  if (state.status === "error" || campaigns.length === 0) {
    return (
      <div className="flex h-full flex-col items-start gap-2 rounded-lg border border-border/70 bg-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Top campaigns by ROAS
        </p>
        <p className="text-sm text-muted-foreground">
          {state.status === "error"
            ? "Couldn't load campaign performance right now."
            : "No campaign performance yet for this account."}
        </p>
      </div>
    );
  }

  const rows: LeaderboardRow[] = campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    subLabel: formatSpend(campaign.spend),
    metricValue: formatRoas(campaign.roas),
  }));

  return <InsightLeaderboard title="Top campaigns by ROAS" metricLabel="ROAS" rows={rows} />;
}
