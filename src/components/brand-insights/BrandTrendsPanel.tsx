import { Badge, Box, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { CalendarIcon, ClockIcon, GlobeIcon, ReaderIcon } from "@radix-ui/react-icons";

import { GlassPanel } from "@/components/ui/GlassPanel";
import type { BrandInsightsTrend, BrandInsightsEvent, BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import { BrandTrendsTabs } from "./BrandTrendsTabs";
import { BrandTrendsPanelSkeleton } from "./BrandTrendsSkeleton";

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

import { cn } from "@/lib/utils";

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
    <Box 
      className={cn("p-4 md:p-6 space-y-4 bg-background border flex flex-col h-full min-h-0", className)}
      style={{
        color: "var(--foreground)",
      }}
    >
      <Flex justify="between" align="start" wrap="wrap" gap="3" className="shrink-0">
        <Box className="space-y-1">
          <Flex align="center" gap="2">
            <ReaderIcon className="h-3.5 w-3.5 md:h-4 md:w-4 text-[var(--accent-11)]" />
            <Text size="1" color="gray" className="uppercase tracking-widest font-medium opacity-70">
              Brand Insights · Trends
            </Text>
          </Flex>
          <Heading size={{ initial: "4", md: "5" }} className="text-white tracking-tight">
            Current trend signals
          </Heading>
          <Text size={{ initial: "1", md: "2" }} color="gray" className="max-w-md">
            High-signal topics synthesized from the latest generation window.
          </Text>
        </Box>

        <Flex align="center" wrap="wrap" gap="2" justify="end">
          {actionSlot}
          {country && (
            <Badge color="gray" variant="surface" size={{ initial: "1", md: "2" }}>
              <GlobeIcon className="mr-1 h-3.5 w-3.5" />
              {country}
            </Badge>
          )}
          {weekLabel && (
            <Badge color="indigo" variant="surface" size={{ initial: "1", md: "2" }}>
              <CalendarIcon className="mr-1 h-3.5 w-3.5" />
              {weekLabel}
            </Badge>
          )}
          {generatedLabel && (
            <Badge color="green" variant="surface" size={{ initial: "1", md: "2" }}>
              <ClockIcon className="mr-1 h-3.5 w-3.5" />
              {generatedLabel}
            </Badge>
          )}
          {status && (
            <Badge color="amber" variant="surface" size={{ initial: "1", md: "2" }}>
              {status}
            </Badge>
          )}
        </Flex>
      </Flex>

      <Separator size="4" className="shrink-0" />

        <Box className="flex-1 min-h-0">
          <BrandTrendsTabs
            trends={trends}
            events={events}
            questionsByNiche={questionsByNiche}
            brandId={brandId}
          />
        </Box>

    </Box>
  );
}
