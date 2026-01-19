"use client";
import { Tabs } from "@radix-ui/themes";

import { BrandTrendsGrid } from "./BrandTrendsGrid";
import { BrandEventsList } from "./BrandEventsList";
import { BrandQuestionsList } from "./BrandQuestionsList";
import type { BrandInsightsTrend, BrandInsightsEvent, BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import { CompetitorSearchPanel } from "../competitors/CompetitorSearchPanel";

type Props = {
  trends: BrandInsightsTrend[];
  events?: BrandInsightsEvent[];
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  brandId?: string;
};

export function BrandTrendsTabs({ trends, events = [], questionsByNiche, brandId }: Props) {
  return (
    <Tabs.Root defaultValue="trends">
      <Tabs.List>
        <Tabs.Trigger value="trends">Trends</Tabs.Trigger>
        <Tabs.Trigger value="events">Events</Tabs.Trigger>
        <Tabs.Trigger value="questions">Questions</Tabs.Trigger>
        <Tabs.Trigger value="competitors">Competitors</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="trends">
        <BrandTrendsGrid trends={trends} />
      </Tabs.Content>
      <Tabs.Content value="events">
        <BrandEventsList events={events ?? []} />
      </Tabs.Content>
      <Tabs.Content value="questions">
        <BrandQuestionsList questionsByNiche={questionsByNiche?.questionsByNiche ?? {}} />
      </Tabs.Content>
      <Tabs.Content value="competitors">
        <CompetitorSearchPanel key={brandId ?? "competitors"} brandId={brandId} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
