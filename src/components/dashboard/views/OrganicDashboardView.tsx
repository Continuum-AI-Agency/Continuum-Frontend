"use client";

import React from "react";
import { InstagramOrganicReportingWidget } from "@/components/dashboard/InstagramOrganicReportingWidget";
import { BrandTrendsPanel } from "@/components/brand-insights/BrandTrendsPanel";
import { BrandInsightsGenerateButton } from "@/components/brand-insights/BrandInsightsGenerateButton";
import type { InstagramAccountOption } from "@/components/dashboard/InstagramOrganicReportingWidget";
import type { BrandInsightsTrendsAndEvents, BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

type OrganicDashboardViewProps = {
  brandId: string;
  instagramAccounts: InstagramAccountOption[];
  trendsAndEvents: BrandInsightsTrendsAndEvents;
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  insightsGeneratedAt?: string;
  insightsStatus?: string;
};

export function OrganicDashboardView({
  brandId,
  instagramAccounts,
  trendsAndEvents,
  questionsByNiche,
  insightsGeneratedAt,
  insightsStatus,
}: OrganicDashboardViewProps) {
  return (
    <ResizablePanelGroup orientation="vertical" className="h-full min-h-0">
      <ResizablePanel defaultSize={35} minSize={20} className="min-h-0">
        <div className="h-full min-h-0 border-b bg-background p-4 overflow-hidden">
          <InstagramOrganicReportingWidget brandId={brandId} accounts={instagramAccounts} />
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle className="h-px w-full" />

      <ResizablePanel defaultSize={65} minSize={20} className="min-h-0">
        <div className="h-full min-h-0 p-4 overflow-hidden">
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
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
