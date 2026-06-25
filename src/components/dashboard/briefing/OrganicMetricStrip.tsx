"use client";

import { useEffect, useMemo, useState } from "react";
import type { InstagramAccountOption } from "@/components/dashboard/InstagramOrganicReportingWidget";
import { fetchOrganicAnalytics } from "@/lib/api/organicAnalytics.client";
import { resolveOrganicAccount } from "@/lib/organic/resolve-organic-account";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricStrip, type MetricStripItem } from "@/components/shared/MetricStrip";

const RANGE_PRESET = "last_7d" as const;

type Platform = "instagram" | "youtube";

type AnalyticsState =
  | { status: "idle" | "loading" }
  | { status: "error" }
  | { status: "success"; data: Awaited<ReturnType<typeof fetchOrganicAnalytics>> };

type OrganicMetricStripProps = {
  brandId: string;
  accounts: InstagramAccountOption[];
  youtubeAccounts?: InstagramAccountOption[];
};

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

// The headline KPIs for the organic dashboard — reach, accounts engaged, and hook
// rate over the last 7 days, each with its period-over-period delta — rendered as
// a quiet inline strip under the Overview header. One account-scope analytics call.
export function OrganicMetricStrip({ brandId, accounts, youtubeAccounts = [] }: OrganicMetricStripProps) {
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

  const items = useMemo<MetricStripItem[]>(() => {
    if (state.status !== "success") return [];
    const { metrics, comparison } = state.data;
    const cmp = comparison ?? {};
    return [
      { label: "Reach", value: formatCompact(metrics.reach ?? 0), deltaPct: cmp.reach?.percentageChange },
      {
        label: "Accounts engaged",
        value: formatCompact(metrics.accountsEngaged ?? 0),
        deltaPct: cmp.accountsEngaged?.percentageChange,
      },
      {
        label: "Hook rate",
        value: typeof metrics.hookRate === "number" ? `${Math.round(metrics.hookRate)}%` : "—",
        deltaPct: cmp.hookRate?.percentageChange,
      },
    ];
  }, [state]);

  if (state.status === "idle" || state.status === "error") return null;
  if (state.status === "loading") return <Skeleton className="h-4 w-72" />;

  return <MetricStrip items={items} live />;
}
