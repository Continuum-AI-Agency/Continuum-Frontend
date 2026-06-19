"use client";

import { useEffect, useMemo, useState } from "react";
import type { InstagramAccountOption } from "@/components/dashboard/InstagramOrganicReportingWidget";
import { fetchOrganicAnalytics } from "@/lib/api/organicAnalytics.client";
import { resolveOrganicAccount } from "@/lib/organic/resolve-organic-account";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/datatable/StatCard";

const RANGE_PRESET = "last_7d" as const;

type Platform = "instagram" | "youtube";

type AnalyticsState =
  | { status: "idle" | "loading" }
  | { status: "error" }
  | { status: "success"; data: Awaited<ReturnType<typeof fetchOrganicAnalytics>> };

type OrganicStatCardsProps = {
  brandId: string;
  accounts: InstagramAccountOption[];
  youtubeAccounts?: InstagramAccountOption[];
};

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

// The KPI header for the organic dashboard: reach, accounts engaged, and hook
// rate over the last 7 days, each with its period-over-period delta and a real
// daily bar series. One lightweight account-scope analytics call.
export function OrganicStatCards({ brandId, accounts, youtubeAccounts = [] }: OrganicStatCardsProps) {
  const resolved = resolveOrganicAccount(brandId, accounts, youtubeAccounts);
  const integrationAccountId = resolved?.account.integrationAccountId ?? null;
  const platform: Platform = resolved?.platform ?? "instagram";

  const [state, setState] = useState<AnalyticsState>({ status: "idle" });

  useEffect(() => {
    if (!integrationAccountId) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    fetchOrganicAnalytics({
      brandId,
      integrationAccountId,
      platform,
      range: { preset: RANGE_PRESET },
      scope: "account",
    })
      .then((data) => {
        if (!cancelled) setState({ status: "success", data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, integrationAccountId, platform]);

  const cards = useMemo(() => {
    if (state.status !== "success") return null;
    const { metrics, comparison, trends } = state.data;
    const cmp = comparison ?? {};
    const series = trends ?? [];
    return [
      {
        label: "Reach",
        value: formatCompact(metrics.reach ?? 0),
        deltaPct: cmp.reach?.percentageChange,
        series: series.map((point) => point.reach ?? 0),
      },
      {
        label: "Accounts engaged",
        value: formatCompact(metrics.accountsEngaged ?? 0),
        deltaPct: cmp.accountsEngaged?.percentageChange,
        series: series.map((point) => point.accountsEngaged ?? 0),
      },
      {
        label: "Hook rate",
        value: typeof metrics.hookRate === "number" ? `${Math.round(metrics.hookRate)}%` : "—",
        deltaPct: cmp.hookRate?.percentageChange,
        series: undefined,
      },
    ];
  }, [state]);

  if (state.status === "idle" || state.status === "error") return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards
        ? cards.map((card) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              deltaPct={card.deltaPct}
              series={card.series}
              live
            />
          ))
        : Array.from({ length: 3 }).map((_, index) => <StatCardSkeleton key={index} />)}
    </div>
  );
}
