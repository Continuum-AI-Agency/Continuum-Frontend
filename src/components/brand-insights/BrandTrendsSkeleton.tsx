"use client";

import { Box, Flex, Separator } from "@radix-ui/themes";
import * as Accordion from "@radix-ui/react-accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassPanel } from "@/components/ui/GlassPanel";

/**
 * TrendRowSkeleton
 * Matches the refactored TrendsDataTable row structure with expandable area.
 */
function TrendRowSkeleton() {
  return (
    <div className="flex items-center px-2 min-h-[2.5rem] border-b border-subtle/30">
      <div className="w-8 px-2 shrink-0">
        <Skeleton className="h-4 w-4 rounded" />
      </div>
      <div className="flex-1 px-2">
        <Skeleton className="h-4 w-[140px] rounded" />
      </div>
      <div className="flex-1 px-2 hidden md:block">
        <Skeleton className="h-3 w-[60px] rounded-full" />
      </div>
      <div className="flex-1 px-2">
        <Skeleton className="h-3 w-[80px] rounded" />
      </div>
      <div className="w-8 px-2 shrink-0">
        <Skeleton className="h-4 w-4 rounded-full" />
      </div>
    </div>
  );
}

/**
 * BrandTrendsAccordionSkeleton
 * Matches the top-level vertical accordion navigation.
 */
function BrandTrendsAccordionSkeleton() {
  return (
    <Box className="flex flex-col h-full min-h-0 space-y-3">
      {/* Active Section (Trends) */}
      <div className="flex flex-col border rounded-lg bg-surface/20 border-subtle overflow-hidden flex-1">
        <div className="flex w-full items-center justify-between px-4 py-3 bg-surface/40 border-b border-subtle/30">
          <Flex align="center" gap="2">
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-4 w-6 rounded-full" />
          </Flex>
          <Skeleton className="h-4 w-4 rounded" />
        </div>
        <div className="flex-1 overflow-hidden p-2 md:p-3">
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <TrendRowSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>

      {/* Collapsed Sections */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="border rounded-lg bg-surface/20 border-subtle overflow-hidden">
          <div className="flex w-full items-center justify-between px-4 py-3">
            <Flex align="center" gap="2">
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-4 w-6 rounded-full" />
            </Flex>
            <Skeleton className="h-4 w-4 rounded" />
          </div>
        </div>
      ))}
    </Box>
  );
}

/**
 * BrandTrendsPanelSkeleton
 * Complete loading skeleton for the entire BrandTrendsPanel.
 */
export function BrandTrendsPanelSkeleton() {
  return (
    <Box className="p-4 md:p-6 space-y-4 bg-background border flex flex-col h-full min-h-0">
      <Flex justify="between" align="start" wrap="wrap" gap="3" className="shrink-0">
        <Box className="space-y-1">
          <Flex align="center" gap="2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-3 w-[120px] rounded" />
          </Flex>
          <Skeleton className="h-6 w-[180px] rounded" />
          <Skeleton className="h-4 w-[280px] rounded" />
        </Box>

        <Flex align="center" wrap="wrap" gap="2" justify="end">
          <Skeleton className="h-8 w-24 rounded" />
          <Skeleton className="h-6 w-[100px] rounded-full" />
          <Skeleton className="h-6 w-[120px] rounded-full" />
        </Flex>
      </Flex>

      <Separator size="4" className="shrink-0" />

      <Box className="flex-1 min-h-0">
        <BrandTrendsAccordionSkeleton />
      </Box>
    </Box>
  );
}

/**
 * BrandTrendsGridSkeleton
 * Displays multiple trend row skeletons.
 */
function BrandTrendsGridSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <TrendRowSkeleton key={i} />
      ))}
    </div>
  );
}

export { BrandTrendsAccordionSkeleton as BrandTrendsTabsSkeleton, BrandTrendsGridSkeleton };
