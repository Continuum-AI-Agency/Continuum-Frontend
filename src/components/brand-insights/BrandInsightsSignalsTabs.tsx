"use client";

import { Tabs } from "@radix-ui/themes";

import type {
  BrandInsightsEvent,
  BrandInsightsQuestionsByNiche,
  BrandInsightsTrend,
} from "@/lib/schemas/brandInsights";
import { BrandEventsList } from "./BrandEventsList";
import { BrandQuestionsList } from "./BrandQuestionsList";
import { BrandTrendsGrid } from "./BrandTrendsGrid";
import { CompetitorSearchPanel } from "../competitors/CompetitorSearchPanel";

type BrandInsightsSignalsTabsProps = {
  trends: BrandInsightsTrend[];
  events: BrandInsightsEvent[];
  questionsByNiche: BrandInsightsQuestionsByNiche;
  brandId?: string;
};

export function BrandInsightsSignalsTabs({
  trends,
  events,
  questionsByNiche,
  brandId,
}: BrandInsightsSignalsTabsProps) {
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
        <BrandEventsList events={events} />
      </Tabs.Content>

      <Tabs.Content value="questions">
        <BrandQuestionsList questionsByNiche={questionsByNiche.questionsByNiche} />
      </Tabs.Content>

      <Tabs.Content value="competitors">
        <CompetitorSearchPanel key={brandId ?? "competitors"} brandId={brandId} />
      </Tabs.Content>
    </Tabs.Root>
  );
}

