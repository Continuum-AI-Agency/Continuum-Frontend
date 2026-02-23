"use client";

import { BrandTrendsTabs } from "@/components/brand-insights/BrandTrendsTabs";
import type {
  BrandInsightsEvent,
  BrandInsightsQuestionsByNiche,
  BrandInsightsTrend,
} from "@/lib/schemas/brandInsights";

type BrandInsightsSignalsTabsProps = {
  trends: BrandInsightsTrend[];
  events: BrandInsightsEvent[];
  questionsByNiche: BrandInsightsQuestionsByNiche;
  brandId?: string;
};

export function BrandInsightsSignalsTabs({ trends, events, questionsByNiche, brandId }: BrandInsightsSignalsTabsProps) {
  return <BrandTrendsTabs trends={trends} events={events} questionsByNiche={questionsByNiche} brandId={brandId} />;
}
