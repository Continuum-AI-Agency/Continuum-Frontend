"use client";

import React, { useMemo, useState } from "react";
import { Box, Callout } from "@radix-ui/themes";
import { LightningBoltIcon } from "@radix-ui/react-icons";
import type { BrandInsightsTrend } from "@/lib/schemas/brandInsights";
import { BrandTrendsGridSkeleton } from "./BrandTrendsSkeleton";
import { TrendsDataTable } from "../organic/TrendsDataTable";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";

type BrandTrendsGridProps = {
  trends: BrandInsightsTrend[];
  isLoading?: boolean;
};

export function BrandTrendsGrid({ trends, isLoading = false }: BrandTrendsGridProps) {
  const mappedData = useMemo(() => trends.map(t => ({
    id: t.id,
    title: t.title,
    summary: t.description ?? t.relevanceToBrand ?? "",
    momentum: "stable" as const,
    tags: t.source ? [t.source] : [],
    platforms: ["instagram", "linkedin"] as OrganicPlatformKey[],
  })), [trends]);

  if (isLoading) {
    return <BrandTrendsGridSkeleton />;
  }

  if (trends.length === 0) {
    return (
      <Callout.Root color="gray" variant="surface">
        <Callout.Icon>
          <LightningBoltIcon />
        </Callout.Icon>
        <Callout.Text>
          We have not generated any trends for this brand yet. Trigger a generation to populate this view.
        </Callout.Text>
      </Callout.Root>
    );
  }

  return (
    <Box className="p-4 bg-surface/30 rounded border border-subtle">
      <TrendsDataTable
        data={mappedData}
        selectedTrendIds={[]} 
        onToggleTrend={() => {}}
        activePlatforms={["instagram", "linkedin"]}
      />
    </Box>
  );
}
