"use client";
import { Tabs } from "@radix-ui/themes";

import { BrandTrendsGrid } from "./BrandTrendsGrid";
import type { BrandInsightsTrend } from "@/lib/schemas/brandInsights";
import { CompetitorSearchPanel } from "../competitors/CompetitorSearchPanel";

type Props = {
  trends: BrandInsightsTrend[];
  brandId?: string;
};

export function BrandTrendsTabs({ trends, brandId }: Props) {
  return (
    <Tabs.Root defaultValue="trends">
      <Tabs.List>
        <Tabs.Trigger value="trends">Trends</Tabs.Trigger>
        <Tabs.Trigger value="competitors">Competitors</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="trends">
        <BrandTrendsGrid trends={trends} />
      </Tabs.Content>
      <Tabs.Content value="competitors">
        <CompetitorSearchPanel key={brandId ?? "competitors"} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
