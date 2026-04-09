"use client";

import * as React from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import { TrendingUpIcon, LayoutGridIcon, HeartIcon, UsersIcon } from "lucide-react";
import { Badge, Box, Button, Card, Flex, Heading, Text } from "@radix-ui/themes";

import { useOrganicInsights } from "@/hooks/useOrganicInsights";
import type { OrganicComputedInsight } from "@/lib/organic/organic-insights.types";
import type { OrganicDateRangePreset } from "@/lib/schemas/organicMetrics";
import { cn } from "@/lib/utils";

type OrganicInsightsPanelProps = {
  brandId: string;
  integrationAccountId: string;
  platform: "instagram" | "facebook";
  rangePreset: OrganicDateRangePreset;
};

const CATEGORY_CONFIG: ReadonlyArray<{
  key: "growth" | "content" | "engagement" | "audience";
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}> = [
  { key: "growth", title: "Growth", icon: TrendingUpIcon, accent: "bg-emerald-500/90" },
  { key: "content", title: "Content", icon: LayoutGridIcon, accent: "bg-violet-500/90" },
  { key: "engagement", title: "Engagement", icon: HeartIcon, accent: "bg-rose-500/90" },
  { key: "audience", title: "Audience", icon: UsersIcon, accent: "bg-amber-500/90" },
];

const METRIC_LABELS: Record<string, string> = {
  reach_conversion: "REACH/FOLLOW",
  non_follower_ratio: "DISCOVERY",
  content_efficiency: "CONTENT MIX",
  posting_frequency: "FREQUENCY",
  engagement_rate: "ENG. RATE",
  save_share_ratio: "SAVES/SHARES",
  geo_concentration: "GEOGRAPHY",
  demographic_skew: "DEMOGRAPHICS",
};

export function OrganicInsightsPanel({
  brandId,
  integrationAccountId,
  platform,
  rangePreset,
}: OrganicInsightsPanelProps) {
  const { insights, expiresAt, isLoading, error, refresh } = useOrganicInsights({
    brandId,
    integrationAccountId,
    platform,
    rangePreset,
  });

  const stalenessLabel = React.useMemo(() => {
    if (!expiresAt) return null;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return "Stale";
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `Fresh for ${days}d ${hours % 24}h`;
    if (hours > 0) return `Fresh for ${hours}h`;
    const mins = Math.ceil(remaining / (1000 * 60));
    return `Fresh for ${mins}m`;
  }, [expiresAt]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, OrganicComputedInsight[]>();
    for (const cat of CATEGORY_CONFIG) {
      map.set(cat.key, insights.filter((i) => i.category === cat.key));
    }
    return map;
  }, [insights]);

  if (isLoading) {
    return (
      <Card variant="surface" className="border border-subtle bg-surface">
        <Box p="3">
          <Flex align="center" justify="between" mb="3">
            <Heading size="3">Organic Insights</Heading>
          </Flex>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {CATEGORY_CONFIG.map((cat) => (
              <div key={cat.key} className="h-[120px] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        </Box>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="surface" className="border border-subtle bg-surface">
        <Box p="3">
          <Text size="2" color="red">{error}</Text>
        </Box>
      </Card>
    );
  }

  if (insights.length === 0) return null;

  return (
    <Card variant="surface" className="border border-subtle bg-surface">
      <Box p="3">
        <Flex align="center" justify="between" mb="3">
          <Flex align="center" gap="2">
            <Heading size="3">Organic Insights</Heading>
            {stalenessLabel ? (
              <Badge color={stalenessLabel === "Stale" ? "red" : "green"} variant="soft" size="1">
                {stalenessLabel}
              </Badge>
            ) : null}
          </Flex>
          <Button variant="ghost" size="1" onClick={refresh}>
            <ReloadIcon />
          </Button>
        </Flex>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {CATEGORY_CONFIG.map((cat) => {
            const catInsights = grouped.get(cat.key) ?? [];
            return (
              <InsightCategoryCard
                key={cat.key}
                title={cat.title}
                icon={cat.icon}
                accent={cat.accent}
                insights={catInsights}
              />
            );
          })}
        </div>
      </Box>
    </Card>
  );
}

function InsightCategoryCard({
  title,
  icon: Icon,
  accent,
  insights,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  insights: OrganicComputedInsight[];
}) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-subtle p-3">
      <Flex align="center" gap="2" mb="2">
        <div className={cn("flex h-6 w-6 items-center justify-center rounded-md", accent)}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        <Text size="2" weight="medium">{title}</Text>
        <Badge variant="soft" color="gray" size="1">{insights.length}</Badge>
      </Flex>

      {insights.length === 0 ? (
        <Text size="1" color="gray">No insights available</Text>
      ) : (
        <Flex direction="column" gap="2">
          {insights.slice(0, 3).map((insight, i) => (
            <div key={i}>
              <Flex align="start" gap="2">
                <div
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    insight.severity === "positive"
                      ? "bg-emerald-500"
                      : insight.severity === "negative"
                        ? "bg-red-500"
                        : "bg-blue-500"
                  )}
                />
                <div className="min-w-0">
                  <Flex align="center" gap="1" mb="1">
                    {insight.metric && METRIC_LABELS[insight.metric] ? (
                      <Badge variant="soft" color="gray" size="1" className="shrink-0">
                        {METRIC_LABELS[insight.metric]}
                      </Badge>
                    ) : null}
                    <Badge variant="soft" color={insight.source === "llm" ? "violet" : "gray"} size="1">
                      {insight.source === "llm" ? "AI" : "Computed"}
                    </Badge>
                  </Flex>
                  <Text size="1" className="leading-snug">{insight.text}</Text>
                  {insight.recommendation ? (
                    <Text size="1" color="gray" className="mt-0.5 leading-snug">
                      {insight.recommendation}
                      {insight.estimated_impact ? ` (${insight.estimated_impact})` : ""}
                    </Text>
                  ) : null}
                </div>
              </Flex>
            </div>
          ))}
        </Flex>
      )}
    </div>
  );
}
