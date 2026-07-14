'use client';

import { LineChart } from 'lucide-react';
import * as React from 'react';

import { BrandInsightsGenerateButton } from '@/components/brand-insights/BrandInsightsGenerateButton';
import { BrandTrendsPanel } from '@/components/brand-insights/BrandTrendsPanel';
import { BrandTrendsPeek } from '@/components/brand-insights/BrandTrendsPeek';
import { countQuestions } from '@/components/brand-insights/questions-utils';
import { PillIndicator } from '@/components/kibo-ui/pill';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fetchBrandInsightsWeek } from '@/lib/api/brandInsights.client';
import type { OrganicMetricsBrandInsights } from '@/lib/schemas/brandInsights';
import { cn } from '@/lib/utils';

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type BrandTrendsHeaderModuleProps = {
  brandId: string;
  brandInsights?: OrganicMetricsBrandInsights | null;
  className?: string;
};

function formatWeekLabel(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOlderThanAWeek(generatedAt?: string) {
  if (!generatedAt) return true;
  const parsed = new Date(generatedAt);
  if (Number.isNaN(parsed.getTime())) return true;
  return Date.now() - parsed.getTime() > STALE_AFTER_MS;
}

/**
 * Brand-insight signals, collapsed into the Organic metrics toolbar: hover for a
 * digest, click for the full panel. The chip stays quiet while the signals are
 * fresh and only raises an indicator when they are stale or missing — staleness is
 * the one fact you cannot see once the panel is collapsed.
 */
export function BrandTrendsHeaderModule({
  brandId,
  brandInsights = null,
  className,
}: BrandTrendsHeaderModuleProps) {
  const [visibleInsights, setVisibleInsights] = React.useState(brandInsights);
  const [isWeekLoading, setIsWeekLoading] = React.useState(false);
  const [weekError, setWeekError] = React.useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = React.useState(false);
  const [isPeekOpen, setIsPeekOpen] = React.useState(false);

  React.useEffect(() => {
    setVisibleInsights(brandInsights);
  }, [brandInsights]);

  const selectWeek = React.useCallback(
    async (weekStartDate: string) => {
      if (!weekStartDate || weekStartDate === visibleInsights?.weekStartDate) return;
      setIsWeekLoading(true);
      setWeekError(null);
      try {
        const result = await fetchBrandInsightsWeek({ brandId, weekStartDate });
        setVisibleInsights({
          trendsAndEvents: result.data.trendsAndEvents,
          questionsByNiche: result.data.questionsByNiche,
          generatedAt: result.data.trendsAndEvents.generatedAt ?? result.generatedAt,
          status: result.data.trendsAndEvents.status ?? result.status,
          weekStartDate: result.data.weekStartDate,
          weeks: result.data.weeks,
          generationKind: result.data.generationKind,
          generationCount: result.data.generationCount,
        });
      } catch (error) {
        setWeekError(error instanceof Error ? error.message : 'Unable to load that Trends week.');
      } finally {
        setIsWeekLoading(false);
      }
    },
    [brandId, visibleInsights?.weekStartDate],
  );

  const trends = visibleInsights?.trendsAndEvents.trends ?? [];
  const events = visibleInsights?.trendsAndEvents.events ?? [];
  const questionCount = countQuestions(visibleInsights?.questionsByNiche);
  const generatedAt = visibleInsights?.trendsAndEvents.generatedAt ?? visibleInsights?.generatedAt;
  const weekLabel = formatWeekLabel(visibleInsights?.weekStartDate);

  const signalCount = trends.length + events.length + questionCount;
  const needsAttention = signalCount === 0 || isOlderThanAWeek(generatedAt);

  return (
    <Popover open={isPanelOpen} onOpenChange={setIsPanelOpen}>
      <HoverCard
        open={isPeekOpen && !isPanelOpen}
        onOpenChange={setIsPeekOpen}
        openDelay={150}
        closeDelay={80}
      >
        <HoverCardTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              data-tour-id="organic-metrics-brand-trends"
              className={cn('h-8 gap-1.5 px-2 text-xs', className)}
            >
              <LineChart className="size-3.5" aria-hidden />
              Trends
              {signalCount > 0 ? (
                <Badge variant="secondary" className="h-4 px-1 text-[10px] tabular-nums">
                  {trends.length}
                </Badge>
              ) : null}
              {needsAttention ? <PillIndicator variant="warning" /> : null}
            </Button>
          </PopoverTrigger>
        </HoverCardTrigger>

        <HoverCardContent align="end" side="bottom" className="w-80 p-0">
          <BrandTrendsPeek
            trends={trends}
            eventCount={events.length}
            questionCount={questionCount}
            weekLabel={weekLabel}
            isStale={needsAttention && signalCount > 0}
          />
        </HoverCardContent>
      </HoverCard>

      <PopoverContent
        align="end"
        side="bottom"
        className="max-h-[75vh] w-[min(44rem,92vw)] overflow-y-auto p-0"
      >
        {weekError ? (
          <Alert variant="destructive" className="rounded-none border-0 border-b">
            <AlertDescription>{weekError}</AlertDescription>
          </Alert>
        ) : null}
        <BrandTrendsPanel
          className="border-0 shadow-none"
          trends={trends}
          events={events}
          questionsByNiche={visibleInsights?.questionsByNiche}
          brandId={brandId}
          country={visibleInsights?.trendsAndEvents.country}
          weekStartDate={visibleInsights?.weekStartDate}
          generatedAt={generatedAt}
          status={visibleInsights?.trendsAndEvents.status ?? visibleInsights?.status}
          weeks={visibleInsights?.weeks}
          generationKind={visibleInsights?.generationKind}
          generationCount={visibleInsights?.generationCount}
          onWeekChange={selectWeek}
          isWeekLoading={isWeekLoading}
          statusSlot={
            <BrandInsightsGenerateButton brandId={brandId} lastGeneratedAt={generatedAt} force />
          }
        />
      </PopoverContent>
    </Popover>
  );
}
