import type { ReactNode } from "react";

import type {
  BrandInsightsEvent,
  BrandInsightsQuestionsByNiche,
  BrandInsightsTrend,
} from "@/lib/schemas/brandInsights";
import { BrandTrendsPanel } from "@/components/brand-insights/BrandTrendsPanel";

type BrandInsightsSignalsPanelProps = {
  trends: BrandInsightsTrend[];
  events: BrandInsightsEvent[];
  questionsByNiche: BrandInsightsQuestionsByNiche;
  country?: string;
  weekStartDate?: string;
  generatedAt?: string;
  status?: string;
  brandId?: string;
  actionSlot?: ReactNode;
  isLoading?: boolean;
  className?: string;
};

export function BrandInsightsSignalsPanel({
  trends,
  events,
  questionsByNiche,
  country,
  weekStartDate,
  generatedAt,
  status,
  brandId,
  actionSlot,
  isLoading = false,
  className,
}: BrandInsightsSignalsPanelProps) {
  return (
    <BrandTrendsPanel
      trends={trends}
      events={events}
      questionsByNiche={questionsByNiche}
      country={country}
      weekStartDate={weekStartDate}
      generatedAt={generatedAt}
      status={status}
      brandId={brandId}
      actionSlot={actionSlot}
      isLoading={isLoading}
      className={className}
    />
  );
}
