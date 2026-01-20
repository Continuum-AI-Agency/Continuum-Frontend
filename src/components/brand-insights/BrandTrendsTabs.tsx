"use client";
import { Box, Tabs } from "@radix-ui/themes";

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
    <Box className="flex flex-col h-full">
      <Tabs.Root defaultValue="trends" className="flex flex-col h-full">
        <Tabs.List className="flex-shrink-0">
          <Tabs.Trigger value="trends">Trends</Tabs.Trigger>
          <Tabs.Trigger value="events">Events</Tabs.Trigger>
          <Tabs.Trigger value="questions">Questions</Tabs.Trigger>
          <Tabs.Trigger value="competitors">Competitors</Tabs.Trigger>
        </Tabs.List>
        <Box className="flex-1 min-h-0 overflow-hidden">
          <Tabs.Content value="trends" className="h-full data-[state=active]:flex data-[state=active]:flex-col">
            <BrandTrendsGrid trends={trends} />
          </Tabs.Content>
          <Tabs.Content value="events" className="h-full data-[state=active]:flex data-[state=active]:flex-col">
            <BrandEventsList events={events ?? []} />
          </Tabs.Content>
          <Tabs.Content value="questions" className="h-full data-[state=active]:flex data-[state=active]:flex-col">
            <BrandQuestionsList questionsByNiche={questionsByNiche?.questionsByNiche ?? {}} />
          </Tabs.Content>
          <Tabs.Content value="competitors" className="h-full data-[state=active]:flex data-[state=active]:flex-col">
            <CompetitorSearchPanel key={brandId ?? "competitors"} brandId={brandId} />
          </Tabs.Content>
        </Box>
      </Tabs.Root>
    </Box>
  );
}
