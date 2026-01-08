"use client";

import { Badge, Box, Flex, Heading, Separator, Text, Switch, TextField } from "@radix-ui/themes";
import { CalendarIcon, ClockIcon, GlobeIcon, ReaderIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import * as Accordion from "@radix-ui/react-accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassPanel } from "@/components/ui/GlassPanel";

/**
 * TrendCardSkeleton
 * Matches the exact layout of accordion items from BrandTrendsGrid.
 * Shows: title, badges (Selected, Used x times), chevron, and content area.
 */
function TrendCardSkeleton({ expanded = false }: { expanded?: boolean }) {
  return (
    <Accordion.Item
      value="skeleton"
      className="rounded-xl border border-subtle bg-surface shadow-lg overflow-hidden"
    >
      <Accordion.Header>
        <Accordion.Trigger className="flex w-full items-start justify-between gap-3 rounded-xl px-4 py-3 text-left">
          <div className="min-w-0 space-y-1">
            <Skeleton className="h-5 w-[280px] rounded" />
          </div>
          <Flex align="center" gap="2">
            {expanded && (
              <Badge color="violet" variant="solid">
                <Skeleton className="h-3 w-[60px] rounded" />
              </Badge>
            )}
            <Skeleton className="h-4 w-4 rounded-full" />
          </Flex>
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="overflow-hidden">
        <Box className="space-y-3 px-4 pb-4 pt-1">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-[90%] rounded" />
          <Skeleton className="h-4 w-[75%] rounded" />
          <Box className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
            <Skeleton className="h-3 w-[80px] rounded mb-2" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-[85%] rounded" />
          </Box>
          <Skeleton className="h-3 w-[200px] rounded" />
        </Box>
      </Accordion.Content>
    </Accordion.Item>
  );
}

/**
 * SearchBarSkeleton
 * Matches the search field and switch from BrandTrendsGrid header.
 */
function SearchBarSkeleton() {
  return (
    <Flex align="center" justify="between" wrap="wrap" gap="3">
      <Skeleton className="h-10 min-w-[260px] rounded-md" />
      <Flex align="center" gap="3" wrap="wrap" justify="end">
        <Flex align="center" gap="2">
          <Skeleton className="h-6 w-10 rounded-full" />
          <Skeleton className="h-4 w-[120px] rounded" />
        </Flex>
      </Flex>
    </Flex>
  );
}

/**
 * BrandTrendsGridSkeleton
 * Displays search bar skeleton and multiple trend card skeletons.
 * Shows 5 cards (1 expanded, 4 collapsed) for realistic loading state.
 */
function BrandTrendsGridSkeleton() {
  return (
    <Box className="space-y-4">
      <SearchBarSkeleton />
      <Accordion.Root type="single" collapsible className="space-y-3">
        <TrendCardSkeleton expanded={true} />
        {Array.from({ length: 4 }).map((_, index) => (
          <TrendCardSkeleton key={index} />
        ))}
      </Accordion.Root>
    </Box>
  );
}

/**
 * BrandTrendsTabsSkeleton
 * Matches the tabs structure from BrandTrendsTabs component.
 */
function BrandTrendsTabsSkeleton() {
  return (
    <div>
      <div className="flex border-b border-border">
        <div className="px-4 py-2 border-b-2 border-primary">
          <Skeleton className="h-5 w-[50px] rounded" />
        </div>
        <div className="px-4 py-2">
          <Skeleton className="h-5 w-[90px] rounded" />
        </div>
      </div>
      <Box className="pt-4">
        <BrandTrendsGridSkeleton />
      </Box>
    </div>
  );
}

/**
 * BrandTrendsPanelSkeleton
 * Complete loading skeleton for the entire BrandTrendsPanel.
 * Includes: header with badges, separator, and tabs skeleton.
 */
export function BrandTrendsPanelSkeleton() {
  return (
    <GlassPanel className="p-6 space-y-4">
      <Flex justify="between" align="start" wrap="wrap" gap="3">
        <Box className="space-y-1">
          <Flex align="center" gap="2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-3 w-[120px] rounded" />
          </Flex>
          <Skeleton className="h-6 w-[180px] rounded" />
          <Skeleton className="h-4 w-[280px] rounded" />
        </Box>

        <Flex align="center" wrap="wrap" gap="2" justify="end">
          <Skeleton className="h-6 w-[100px] rounded-full" />
          <Skeleton className="h-6 w-[120px] rounded-full" />
          <Skeleton className="h-6 w-[140px] rounded-full" />
          <Skeleton className="h-6 w-[80px] rounded-full" />
        </Flex>
      </Flex>

      <Separator size="4" />

      <BrandTrendsTabsSkeleton />
    </GlassPanel>
  );
}

export { TrendCardSkeleton, SearchBarSkeleton, BrandTrendsGridSkeleton, BrandTrendsTabsSkeleton };
