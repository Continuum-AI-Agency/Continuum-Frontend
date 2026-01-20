"use client";

import React, { useState } from "react";
import { Box, Flex, Tabs, Text } from "@radix-ui/themes";
import { InstagramOrganicReportingWidget } from "@/components/dashboard/InstagramOrganicReportingWidget";
import { PaidMediaReportingWidget } from "@/components/paid-media/PaidMediaReportingWidget";
import { DCOActionsWidget } from "@/components/dashboard/DCOActionsWidget";
import { BrandTrendsPanel } from "@/components/brand-insights/BrandTrendsPanel";
import { BrandInsightsGenerateButton } from "@/components/brand-insights/BrandInsightsGenerateButton";
import type { BrandInsightsTrendsAndEvents, BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import type { InstagramAccountOption } from "@/components/dashboard/InstagramOrganicReportingWidget";

type Props = {
  brandId: string;
  instagramAccounts: InstagramAccountOption[];
  trendsAndEvents: BrandInsightsTrendsAndEvents;
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  insightsGeneratedAt?: string;
  insightsStatus?: string;
};

export function HomeBaseDashboard({
  brandId,
  instagramAccounts,
  trendsAndEvents,
  questionsByNiche,
  insightsGeneratedAt,
  insightsStatus,
}: Props) {
  const [activeView, setActiveView] = useState<"paid" | "organic">("paid");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b flex items-center justify-between bg-background">
        <Tabs.Root value={activeView} onValueChange={(v) => setActiveView(v as "paid" | "organic")}>
          <Tabs.List>
            <Tabs.Trigger value="paid">Paid Media</Tabs.Trigger>
            <Tabs.Trigger value="organic">Organic Media</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
        
        <Text size="2" color="gray">
          {activeView === "paid" ? "Campaign performance & DCO logs" : "Social metrics & Trend signals"}
        </Text>
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-muted/20">
        <div className="grid h-full min-h-0 grid-rows-[35%_65%]">
          <div className="min-h-0 border-b bg-background">
            <div className="h-full min-h-0 p-4 overflow-hidden">
              {activeView === "paid" ? (
                <PaidMediaReportingWidget brandId={brandId} />
              ) : (
                <InstagramOrganicReportingWidget brandId={brandId} accounts={instagramAccounts} />
              )}
            </div>
          </div>

          <div className="min-h-0 p-4 overflow-hidden">
            {activeView === "paid" ? (
              <DCOActionsWidget
                brandId={brandId}
                className="h-full min-h-0 flex flex-col overflow-hidden"
              />
            ) : (
              <BrandTrendsPanel
                trends={trendsAndEvents.trends}
                events={trendsAndEvents.events}
                questionsByNiche={questionsByNiche}
                className="h-full min-h-0 overflow-y-auto"
                brandId={brandId}
                country={trendsAndEvents.country}
                generatedAt={trendsAndEvents.generatedAt ?? insightsGeneratedAt}
                status={trendsAndEvents.status ?? insightsStatus}
                actionSlot={<BrandInsightsGenerateButton brandId={brandId} />}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
