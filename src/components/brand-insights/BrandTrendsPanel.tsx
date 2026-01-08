import { Badge, Box, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { CalendarIcon, ClockIcon, GlobeIcon, ReaderIcon } from "@radix-ui/react-icons";

import { GlassPanel } from "@/components/ui/GlassPanel";
import type { BrandInsightsTrend } from "@/lib/schemas/brandInsights";
import { BrandTrendsTabs } from "./BrandTrendsTabs";
import { BrandTrendsPanelSkeleton } from "./BrandTrendsSkeleton";

type BrandTrendsPanelProps = {
  trends: BrandInsightsTrend[];
  country?: string;
  weekStartDate?: string;
  generatedAt?: string;
  status?: string;
  actionSlot?: React.ReactNode;
  brandId?: string;
  isLoading?: boolean;
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

export function BrandTrendsPanel({
  trends,
  country,
  weekStartDate,
  generatedAt,
  status,
  actionSlot,
  brandId,
  isLoading = false,
}: BrandTrendsPanelProps) {
  const weekLabel = formatDate(weekStartDate);
  const generatedLabel = formatDate(generatedAt);

  // Show skeleton when loading
  if (isLoading) {
    return <BrandTrendsPanelSkeleton />;
  }

  return (
    <GlassPanel className="p-6 space-y-4">
      <Flex justify="between" align="start" wrap="wrap" gap="3">
        <Box className="space-y-1">
          <Flex align="center" gap="2">
            <ReaderIcon className="h-4 w-4 text-[var(--accent-11)]" />
            <Text size="1" color="gray">
              Brand Insights · Trends
            </Text>
          </Flex>
          <Heading size="5" className="text-white">
            Current trend signals
          </Heading>
          <Text size="2" color="gray">
            High-signal topics synthesized from the latest generation window.
          </Text>
        </Box>

        <Flex align="center" wrap="wrap" gap="2" justify="end">
          {actionSlot}
          {country && (
            <Badge color="gray" variant="surface">
              <GlobeIcon className="mr-1 h-3.5 w-3.5" />
              {country}
            </Badge>
          )}
          {weekLabel && (
            <Badge color="indigo" variant="surface">
              <CalendarIcon className="mr-1 h-3.5 w-3.5" />
              Week of {weekLabel}
            </Badge>
          )}
          {generatedLabel && (
            <Badge color="green" variant="surface">
              <ClockIcon className="mr-1 h-3.5 w-3.5" />
              Updated {generatedLabel}
            </Badge>
          )}
          {status && (
            <Badge color="amber" variant="surface">
              {status}
            </Badge>
          )}
        </Flex>
      </Flex>

      <Separator size="4" />

      <BrandTrendsTabs trends={trends} brandId={brandId} />
    </GlassPanel>
  );
}
