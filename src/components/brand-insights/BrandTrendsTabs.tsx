'use client';

import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  BrandInsightsEvent,
  BrandInsightsQuestionsByNiche,
  BrandInsightsTrend,
} from '@/lib/schemas/brandInsights';
import { BrandEventsList } from './BrandEventsList';
import { BrandQuestionsList } from './BrandQuestionsList';
import { BrandTrendsGrid } from './BrandTrendsGrid';
import { countQuestions } from './questions-utils';

type Props = {
  trends: BrandInsightsTrend[];
  events?: BrandInsightsEvent[];
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  brandId?: string;
  generatedAt?: string;
};

export function BrandTrendsTabs({ trends, events = [], questionsByNiche, generatedAt }: Props) {
  const questionsCount = useMemo(() => countQuestions(questionsByNiche), [questionsByNiche]);

  const inferredPlatforms = useMemo(() => {
    const trendAndEventPlatforms = [...trends, ...events].flatMap((item) =>
      (item.platforms ?? []).map((platform) => platform.trim().toLowerCase()).filter(Boolean),
    );

    const questionPlatforms = Object.values(questionsByNiche?.questionsByNiche ?? {}).flatMap(
      (niche) =>
        (niche.questions ?? []).flatMap((question) =>
          (question.socialPlatform ?? '')
            .split(/[,\s/|]+/)
            .map((platform) => platform.trim().toLowerCase())
            .filter(Boolean),
        ),
    );

    return Array.from(new Set([...trendAndEventPlatforms, ...questionPlatforms]));
  }, [events, questionsByNiche, trends]);

  return (
    <Tabs defaultValue="trends" className="flex flex-col gap-1">
      <TabsList className="grid h-7 w-full grid-cols-3 gap-0.5 p-0.5">
        {/* Each badge counts the items available in its own tab, never a selection
            or a cap. The aria-label says which quantity, since a bare number beside
            a tab name is ambiguous to a screen reader. */}
        <TabsTrigger value="trends" className="h-6 min-w-0 px-2 text-xs">
          <span className="truncate">Trends</span>{' '}
          <Badge variant="secondary" aria-label={`${trends.length} trends available`}>
            {trends.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="events" className="h-6 min-w-0 px-2 text-xs">
          <span className="truncate">Events</span>{' '}
          <Badge variant="secondary" aria-label={`${events.length} events available`}>
            {events.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="questions" className="h-6 min-w-0 px-2 text-xs">
          <span className="truncate">Questions</span>{' '}
          <Badge variant="secondary" aria-label={`${questionsCount} questions available`}>
            {questionsCount}
          </Badge>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="trends" className="mt-0 max-h-[clamp(160px,22dvh,400px)] overflow-y-auto">
        <BrandTrendsGrid trends={trends} platforms={inferredPlatforms} generatedAt={generatedAt} />
      </TabsContent>

      <TabsContent value="events" className="mt-0 max-h-[clamp(160px,22dvh,400px)] overflow-y-auto">
        <BrandEventsList events={events} platforms={inferredPlatforms} density="compact" />
      </TabsContent>

      <TabsContent
        value="questions"
        className="mt-0 max-h-[clamp(160px,22dvh,400px)] overflow-y-auto"
      >
        <BrandQuestionsList
          questionsByNiche={questionsByNiche?.questionsByNiche ?? {}}
          density="compact"
          scrollWithinSection
        />
      </TabsContent>
    </Tabs>
  );
}
