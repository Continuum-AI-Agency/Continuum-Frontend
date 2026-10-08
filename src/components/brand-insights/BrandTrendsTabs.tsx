'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  BrandInsightsEvent,
  BrandInsightsQuestionsByNiche,
  BrandInsightsTrend,
} from '@/lib/schemas/brandInsights';
import { cn } from '@/lib/utils';
import { BrandEventsList } from './BrandEventsList';
import { BrandQuestionsList } from './BrandQuestionsList';
import { BrandTrendsGrid } from './BrandTrendsGrid';
import { ListeningFeed } from './ListeningFeed';
import { countQuestions } from './questions-utils';
import { TiktokTrendsList } from './TiktokTrendsList';

type Props = {
  trends: BrandInsightsTrend[];
  events?: BrandInsightsEvent[];
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  brandId?: string;
  generatedAt?: string;
  fill?: boolean;
};

export function BrandTrendsTabs({
  trends,
  events = [],
  questionsByNiche,
  brandId,
  generatedAt,
  fill = false,
}: Props) {
  const questionsCount = useMemo(() => countQuestions(questionsByNiche), [questionsByNiche]);
  // TikTok trends and Listening load only once their tab is opened.
  const [tab, setTab] = useState('trends');
  const contentClassName = cn(
    'mt-0 min-h-0 flex-1 overflow-y-auto',
    !fill && 'max-h-[clamp(160px,22dvh,400px)]',
  );

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
    <Tabs
      value={tab}
      onValueChange={(next) => setTab(String(next))}
      className="flex min-h-0 flex-1 flex-col gap-1"
    >
      <TabsList className="grid h-7 w-full grid-cols-5 gap-0.5 p-0.5">
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
        <TabsTrigger value="tiktok" className="h-6 min-w-0 px-2 text-xs">
          <span className="truncate">TikTok</span>
        </TabsTrigger>
        <TabsTrigger value="listening" className="h-6 min-w-0 px-2 text-xs">
          <span className="truncate">Listening</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="trends" className={contentClassName}>
        <BrandTrendsGrid trends={trends} platforms={inferredPlatforms} generatedAt={generatedAt} />
      </TabsContent>

      <TabsContent value="events" className={contentClassName}>
        <BrandEventsList events={events} platforms={inferredPlatforms} density="compact" />
      </TabsContent>

      <TabsContent value="questions" className={contentClassName}>
        <BrandQuestionsList
          questionsByNiche={questionsByNiche?.questionsByNiche ?? {}}
          density="compact"
          scrollWithinSection
        />
      </TabsContent>

      <TabsContent value="tiktok" className={contentClassName}>
        <TiktokTrendsList brandId={brandId} enabled={tab === 'tiktok'} />
      </TabsContent>

      <TabsContent value="listening" className={contentClassName}>
        <ListeningFeed brandId={brandId} enabled={tab === 'listening'} />
      </TabsContent>
    </Tabs>
  );
}
