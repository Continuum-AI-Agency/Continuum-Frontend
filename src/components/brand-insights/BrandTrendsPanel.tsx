import { Calendar, Clock3, Globe2, LineChart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
  actionSlot?: React.ReactNode;
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
    <Card className="h-full min-h-0 border shadow-none">
      <CardHeader className="gap-2 border-b pb-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-40" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 py-4">
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
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
  brandId,
  isLoading = false,
  className,
}: BrandTrendsPanelProps) {
  const weekLabel = formatDate(weekStartDate);
  const generatedLabel = formatDate(generatedAt);

  // Show skeleton when loading
  if (isLoading) {
    return <BrandTrendsPanelSkeleton />;
  }

  return (
    <Card className={cn("h-full min-h-0 border shadow-none", className)}>
      <CardHeader className="gap-2 border-b pb-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
              <LineChart className="h-3.5 w-3.5" />
              Brand Insights
            </p>
            <CardTitle className="text-xl tracking-tight">Current trend signals</CardTitle>
            <p className="text-muted-foreground max-w-xl text-sm">
              High-signal trends, events, and audience questions from the latest generation window.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {actionSlot}
            {country ? (
              <Badge variant="outline">
                <Globe2 className="mr-1 h-3.5 w-3.5" />
                {country}
              </Badge>
            ) : null}
            {weekLabel ? (
              <Badge variant="outline">
                <Calendar className="mr-1 h-3.5 w-3.5" />
                {weekLabel}
              </Badge>
            ) : null}
            {generatedLabel ? (
              <Badge variant="outline">
                <Clock3 className="mr-1 h-3.5 w-3.5" />
                {generatedLabel}
              </Badge>
            ) : null}
            {status ? <Badge variant="secondary">{status}</Badge> : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 pt-1 pb-1">
        <div className="h-full min-h-0">
          <BrandTrendsTabs
            trends={trends}
            events={events}
            questionsByNiche={questionsByNiche}
            brandId={brandId}
            generatedAt={generatedAt}
          />
        </div>
      </CardContent>
      <Separator />
    </Card>
  );
}
