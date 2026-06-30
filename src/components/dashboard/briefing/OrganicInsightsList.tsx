"use client";

import { useMemo } from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import type { InstagramAccountOption } from "@/components/dashboard/InstagramOrganicReportingWidget";
import { useOrganicInsights } from "@/hooks/useOrganicInsights";
import { resolveOrganicAccount } from "@/lib/organic/resolve-organic-account";
import { InsightsList, type InsightListItem } from "@/components/dashboard/datatable/InsightsList";
import { ModuleShortcutLink } from "@/components/shared/ModuleShortcutLink";
import { cn } from "@/lib/utils";

const RANGE_PRESET = "last_7d" as const;

// The organic account's computed performance insights (growth/content/engagement
// /audience), each with its recommendation. Trends live in the Brand Trends data
// table below — this surfaces the "what's working" analysis instead.
export function OrganicInsightsList({
  brandId,
  accounts,
  youtubeAccounts = [],
}: {
  brandId: string;
  accounts: InstagramAccountOption[];
  youtubeAccounts?: InstagramAccountOption[];
}) {
  const resolved = resolveOrganicAccount(brandId, accounts, youtubeAccounts);
  const integrationAccountId = resolved?.account.integrationAccountId ?? null;
  const platform = resolved?.platform ?? "instagram";

  const { insights, isLoading, refresh } = useOrganicInsights({
    brandId,
    integrationAccountId,
    platform,
    rangePreset: RANGE_PRESET,
    enabled: Boolean(integrationAccountId),
  });

  const items = useMemo<InsightListItem[]>(
    () =>
      insights.slice(0, 8).map((insight, index) => ({
        id: insight.post_id ?? `${insight.category}-${index}`,
        text: insight.text,
        severity: insight.severity,
        label: insight.category,
        detail: insight.recommendation,
      })),
    [insights],
  );

  return (
    <InsightsList
      title="Insights"
      items={items}
      headerAction={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            aria-label="Regenerate insights"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ReloadIcon className={cn("size-3", isLoading && "animate-spin")} />
          </button>
          <ModuleShortcutLink href="/organic?tab=metrics" label="Metrics" />
        </div>
      }
      isLoading={isLoading && items.length === 0}
      emptyState={
        integrationAccountId
          ? "Insights appear once we've analyzed your account."
          : "Connect an account to see insights."
      }
    />
  );
}
