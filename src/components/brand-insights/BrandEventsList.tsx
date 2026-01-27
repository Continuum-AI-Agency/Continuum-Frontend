"use client";

import React, { useMemo } from "react";
import { Box, Callout } from "@radix-ui/themes";
import { LightningBoltIcon } from "@radix-ui/react-icons";
import type { BrandInsightsEvent } from "@/lib/schemas/brandInsights";
import { TrendsDataTable } from "../organic/TrendsDataTable";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";

type BrandEventsListProps = {
  events: BrandInsightsEvent[];
};

export function BrandEventsList({ events }: BrandEventsListProps) {
  const mappedData = useMemo(() => events.map(e => ({
    id: e.id,
    title: e.title,
    summary: e.description ?? e.opportunity ?? "",
    momentum: "rising" as const,
    tags: ["event", e.date ?? ""],
    platforms: ["instagram", "linkedin"] as OrganicPlatformKey[],
  })), [events]);

  return (
    <Box className="flex flex-col h-full">
      {events.length === 0 ? (
        <Box className="flex-1 flex items-center justify-center">
          <Callout.Root color="gray" variant="surface">
            <Callout.Icon>
              <LightningBoltIcon />
            </Callout.Icon>
            <Callout.Text>
              We do not have any dated events for this generation yet. Regenerate insights or adjust your window.
            </Callout.Text>
          </Callout.Root>
        </Box>
      ) : (
        <Box className="p-4 bg-surface/30 rounded border border-subtle">
          <TrendsDataTable
            data={mappedData}
            selectedTrendIds={[]}
            onToggleTrend={() => {}}
            activePlatforms={["instagram", "linkedin"]}
            showMomentumFilter={false}
          />
        </Box>
      )}
    </Box>
  );
}
