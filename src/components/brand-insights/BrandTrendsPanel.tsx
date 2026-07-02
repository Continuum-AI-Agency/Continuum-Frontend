import { Calendar, Clock3, Globe2, LineChart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BrandInsightsTrend, BrandInsightsEvent, BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import { BrandTrendsTabs } from "./BrandTrendsTabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type BrandTrendsPanelProps = {
  trends: BrandInsightsTrend[];
  events?: BrandInsightsEvent[];
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  country?: string;
  weekStartDate?: string;
  generatedAt?: string;
  status?: string;
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
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
            <div key={`trends-row-${i}`} className="flex items-start gap-3 px-4 py-3 border-b last:border-0">
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
    <Card data-tour-id="brand-trends" className={cn("flex flex-col gap-0 border py-0 shadow-none", className)}>
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
              <Badge variant="outline" className="h-6 text-xs">
                <Calendar className="mr-1 h-3 w-3" />
                {weekLabel}
              </Badge>
            ) : null}
            {generatedLabel ? (
              <Badge variant="outline" className="h-6 text-xs">
                <Clock3 className="mr-1 h-3 w-3" />
                {generatedLabel}
              </Badge>
            ) : null}
            {status ? <Badge variant="secondary" className="h-6 text-xs">{status}</Badge> : null}
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
