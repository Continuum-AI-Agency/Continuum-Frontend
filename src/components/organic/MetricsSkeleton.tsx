"use client";

import { Box, Card, Flex, Grid, Heading, Text } from "@radix-ui/themes";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * MetricCardSkeleton
 * Matches the exact layout of metric cards from MetricsPanel component.
 * Each card displays: label (gray text), value (heading), and optional delta badge.
 */
function MetricCardSkeleton() {
  return (
    <Card
      variant="surface"
      className="border border-subtle bg-surface transition-all"
    >
      <Box p="3">
        {/* Label skeleton */}
        <Skeleton className="h-3 w-[80px] rounded" />
        {/* Value heading skeleton */}
        <Skeleton className="h-7 w-[100px] rounded mt-3" />
        {/* Click hint text skeleton */}
        <Skeleton className="h-3 w-[120px] rounded mt-2" />
      </Box>
    </Card>
  );
}

/**
 * MetricsGridSkeleton
 * Displays a grid of metric card skeletons matching the responsive layout:
 * - 1 column on mobile (initial)
 * - 2 columns on small screens (sm)
 * - 3 columns on large screens (lg)
 */
function MetricsGridSkeleton() {
  return (
    <Flex direction="column" gap="4">
      <Grid columns={{ initial: "1", sm: "2", lg: "3" }} gap="3">
        {/* Base metrics count - 6 cards */}
        {Array.from({ length: 6 }).map((_, index) => (
          <MetricCardSkeleton key={index} />
        ))}
      </Grid>

      {/* Interaction breakdown section header */}
      <Box pt="4">
        <Skeleton className="h-5 w-[280px] rounded mb-3" />
        <Grid columns={{ initial: "1", sm: "2", lg: "4" }} gap="3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card
              key={index}
              variant="surface"
              className="border border-subtle bg-surface"
            >
              <Box p="3">
                <Skeleton className="h-3 w-[100px] rounded mb-2" />
                <Skeleton className="h-[120px] w-full rounded" />
              </Box>
            </Card>
          ))}
        </Grid>
      </Box>
    </Flex>
  );
}

/**
 * TrendsPanelSkeleton
 * Displays skeleton placeholders for the Trends view with line charts.
 * Includes:
 * - Header with title and date range
 * - Two chart cards (Reach & Views, Engagement)
 */
function TrendsPanelSkeleton() {
  return (
    <Box pt="4">
      {/* Header section */}
      <Flex align="center" justify="between" mb="3">
        <Box>
          <Skeleton className="h-5 w-[120px] rounded mb-1" />
          <Skeleton className="h-4 w-[200px] rounded" />
        </Box>
        <Skeleton className="h-6 w-[100px] rounded-full" />
      </Flex>

      {/* Helper text */}
      <Skeleton className="h-4 w-[280px] rounded mb-4" />

      {/* Charts grid */}
      <Grid columns={{ initial: "1", lg: "2" }} gap="4">
        {/* Reach & Views chart */}
        <Card variant="surface" className="border border-subtle bg-surface">
          <Box p="3">
            <Skeleton className="h-4 w-[120px] rounded mb-2" />
            <Skeleton className="h-[200px] w-full rounded" />
          </Box>
        </Card>

        {/* Engagement chart */}
        <Card variant="surface" className="border border-subtle bg-surface">
          <Box p="3">
            <Skeleton className="h-4 w-[120px] rounded mb-2" />
            <Skeleton className="h-[200px] w-full rounded" />
          </Box>
        </Card>
      </Grid>

      {/* Callout box */}
      <Box pt="4">
        <Skeleton className="h-[60px] w-full rounded" />
      </Box>
    </Box>
  );
}

/**
 * OrganicMetricsWidgetSkeleton
 * Complete loading skeleton for the entire InstagramOrganicReportingWidget.
 * Includes header (Instagram badge, title, selectors) and content area.
 */
export function OrganicMetricsWidgetSkeleton() {
  return (
    <Card variant="surface" className="border border-subtle bg-surface">
      <Box p="4">
        {/* Header section */}
        <Flex align="center" justify="between" gap="3" wrap="wrap">
          <Flex align="center" gap="2">
            {/* Instagram badge skeleton - circular */}
            <Skeleton className="h-8 w-8 rounded-full" />
            <Box>
              <Skeleton className="h-5 w-[200px] rounded mb-1" />
              <Skeleton className="h-4 w-[150px] rounded" />
            </Box>
          </Flex>

          {/* Selectors skeleton */}
          <Flex align="center" gap="2">
            {/* View mode selector */}
            <Skeleton className="h-9 w-[120px] rounded" />
            {/* Account selector */}
            <Skeleton className="h-9 w-[200px] rounded" />
          </Flex>
        </Flex>

        {/* Content section */}
        <Box pt="4">
          <Flex align="center" justify="center" gap="2">
            <Skeleton className="h-4 w-[150px] rounded" />
          </Flex>
        </Box>
      </Box>
    </Card>
  );
}

export { MetricCardSkeleton, MetricsGridSkeleton, TrendsPanelSkeleton };
