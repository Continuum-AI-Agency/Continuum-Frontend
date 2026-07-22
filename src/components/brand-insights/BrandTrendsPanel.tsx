import { Calendar, Clock3, Globe2, LineChart } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  BrandInsightsEvent,
  BrandInsightsQuestionsByNiche,
  BrandInsightsTrend,
  BrandInsightsWeekSummary,
} from '@/lib/schemas/brandInsights';
import { cn } from '@/lib/utils';
import { BrandTrendsTabs } from './BrandTrendsTabs';

type BrandTrendsPanelProps = {
  trends: BrandInsightsTrend[];
  events?: BrandInsightsEvent[];
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  country?: string;
  weekStartDate?: string;
  generatedAt?: string;
  status?: string;
  weeks?: BrandInsightsWeekSummary[];
  generationKind?: 'initial' | 'regeneration';
  generationCount?: number;
  onWeekChange?: (weekStartDate: string) => void;
  isWeekLoading?: boolean;
  /** Small stable actions rendered in the header badge row (e.g. icon buttons). */
  actionSlot?: React.ReactNode;
  /** Expanded content rendered at the top of CardContent — use for generate controls that may expand with alerts/progress. */
  statusSlot?: React.ReactNode;
  brandId?: string;
  isLoading?: boolean;
  className?: string;
};

function formatDate(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatWeekOption(week: BrandInsightsWeekSummary) {
  const label = formatDate(week.weekStartDate) ?? week.weekStartDate;
  return week.regenerationCount > 0 ? `${label} · ${week.generationCount} attempts` : label;
}

function BrandTrendsPanelSkeleton() {
  return (
    <Card className="flex flex-col gap-0 border py-0 shadow-none">
      <CardHeader className="gap-[var(--app-shell-gap)] border-b px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-44" />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-1.5 p-1.5">
        <Skeleton className="h-8 w-full rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
        <div className="rounded-lg border overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={`trends-row-${i}`}
              className="flex items-start gap-3 px-4 py-3 border-b last:border-0"
            >
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
              <div className="space-y-1.5 shrink-0">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function BrandTrendsPanel({
  trends,
  events = [],
  questionsByNiche,
  country,
  weekStartDate,
  generatedAt,
  status,
  weeks = [],
  generationKind,
  generationCount,
  onWeekChange,
  isWeekLoading = false,
  actionSlot,
  statusSlot,
  brandId,
  isLoading = false,
  className,
}: BrandTrendsPanelProps) {
  const weekLabel = formatDate(weekStartDate);
  const generatedLabel = formatDate(generatedAt);

  if (isLoading) {
    return <BrandTrendsPanelSkeleton />;
  }

  return (
    <Card
      data-tour-id="brand-trends"
      className={cn('flex flex-col gap-0 border py-0 shadow-none', className)}
    >
      <CardHeader className="gap-0 border-b px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <p className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs font-semibold tracking-wide uppercase">
              <LineChart className="h-3 w-3" />
              Brand Insights
            </p>
            <CardTitle className="truncate text-sm tracking-tight">Current trend signals</CardTitle>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {actionSlot}
            {country ? (
              <Badge variant="outline" className="h-6 text-xs">
                <Globe2 className="mr-1 h-3 w-3" />
                {country}
              </Badge>
            ) : null}
            {weekLabel ? (
              weeks.length > 1 && onWeekChange ? (
                <Select value={weekStartDate} onValueChange={onWeekChange} disabled={isWeekLoading}>
                  <SelectTrigger className="h-6 w-[168px] text-xs">
                    <Calendar className="mr-1 size-3" />
                    <SelectValue aria-label="Browse Trends week" />
                  </SelectTrigger>
                  <SelectContent>
                    {weeks.map((week) => (
                      <SelectItem key={week.weekStartDate} value={week.weekStartDate}>
                        {formatWeekOption(week)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline" className="h-6 text-xs">
                  <Calendar className="mr-1 h-3 w-3" />
                  {weekLabel}
                </Badge>
              )
            ) : null}
            {generationKind === 'regeneration' ? (
              <Badge variant="secondary" className="h-6 text-xs">
                Regeneration
                {generationCount && generationCount > 1 ? ` · ${generationCount} attempts` : ''}
              </Badge>
            ) : null}
            {generatedLabel ? (
              <Badge variant="outline" className="h-6 text-xs">
                <Clock3 className="mr-1 h-3 w-3" />
                {generatedLabel}
              </Badge>
            ) : null}
            {status && status !== 'success' ? (
              <Badge variant="destructive" className="h-6 text-xs">
                {status}
              </Badge>
            ) : null}
            {statusSlot}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5 p-1.5">
        <div>
          <BrandTrendsTabs
            trends={trends}
            events={events}
            questionsByNiche={questionsByNiche}
            brandId={brandId}
            generatedAt={generatedAt}
          />
        </div>
      </CardContent>
    </Card>
  );
}
