"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandTrendsGrid } from "./BrandTrendsGrid";
import { BrandEventsList } from "./BrandEventsList";
import { BrandQuestionsList } from "./BrandQuestionsList";
import { CompetitorSearchPanel } from "../competitors/CompetitorSearchPanel";
import type { BrandInsightsTrend, BrandInsightsEvent, BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";

type Props = {
  trends: BrandInsightsTrend[];
  events?: BrandInsightsEvent[];
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  brandId?: string;
  generatedAt?: string;
};

export function BrandTrendsTabs({ trends, events = [], questionsByNiche, brandId, generatedAt }: Props) {
  const questionsCount = useMemo(() => {
    if (!questionsByNiche?.questionsByNiche) return 0;
    return Object.values(questionsByNiche.questionsByNiche).reduce((total, niche) => {
      return total + (niche.questions?.length ?? 0);
    }, 0);
  }, [questionsByNiche]);

  const inferredPlatforms = useMemo(() => {
    const trendAndEventPlatforms = [...trends, ...events].flatMap((item) =>
      (item.platforms ?? [])
        .map((platform) => platform.trim().toLowerCase())
        .filter(Boolean)
    );

    const questionPlatforms = Object.values(questionsByNiche?.questionsByNiche ?? {}).flatMap((niche) =>
      (niche.questions ?? []).flatMap((question) =>
        (question.socialPlatform ?? "")
          .split(/[,\s/|]+/)
          .map((platform) => platform.trim().toLowerCase())
          .filter(Boolean)
      )
    );

    return Array.from(new Set([...trendAndEventPlatforms, ...questionPlatforms]));
  }, [events, questionsByNiche, trends]);

  return (
    <Tabs defaultValue="trends" className="flex h-full min-h-0 flex-col gap-0.5">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:w-fit sm:grid-cols-4">
        <TabsTrigger value="trends" className="h-9 px-3 text-xs sm:text-sm">
          Trends <Badge variant="secondary">{trends.length}</Badge>
        </TabsTrigger>
        <TabsTrigger value="events" className="h-9 px-3 text-xs sm:text-sm">
          Events <Badge variant="secondary">{events.length}</Badge>
        </TabsTrigger>
        <TabsTrigger value="questions" className="h-9 px-3 text-xs sm:text-sm">
          Questions <Badge variant="secondary">{questionsCount}</Badge>
        </TabsTrigger>
        <TabsTrigger value="competitors" className="h-9 px-3 text-xs sm:text-sm">
          Competitors
        </TabsTrigger>
      </TabsList>

      <TabsContent value="trends" className="mt-0.5 min-h-0 flex-1">
        <BrandTrendsGrid trends={trends} platforms={inferredPlatforms} generatedAt={generatedAt} />
      </TabsContent>

      <TabsContent value="events" className="mt-0.5 min-h-0 flex-1">
        <BrandEventsList events={events} platforms={inferredPlatforms} />
      </TabsContent>

      <TabsContent value="questions" className="mt-0.5 min-h-0 flex-1">
        <BrandQuestionsList questionsByNiche={questionsByNiche?.questionsByNiche ?? {}} />
      </TabsContent>

      <TabsContent value="competitors" className="mt-0.5 min-h-0 flex-1 overflow-y-auto pr-1">
        <CompetitorSearchPanel brandId={brandId} />
      </TabsContent>
    </Tabs>
  );
}
