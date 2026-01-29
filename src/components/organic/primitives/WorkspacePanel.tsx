"use client";

import * as React from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";
import { RocketIcon, LightningBoltIcon } from "@radix-ui/react-icons";
import { TrendSelector } from "@/components/organic/TrendSelector";
import type { Trend } from "@/lib/organic/trends";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";
import type { OrganicTrendType } from "./types";

export function WorkspacePanel({
  trends,
  selectedTrendIds,
  activePlatforms,
  maxTrendSelections,
  onToggleTrend,
  onGenerate,
  viewMode,
  onViewModeChange,
  onAutoSort,
  trendTypes = [],
  seedCount = 0,
}: {
  trends: Trend[];
  selectedTrendIds: string[];
  activePlatforms: OrganicPlatformKey[];
  maxTrendSelections?: number;
  onToggleTrend: (trendId: string) => void;
  onGenerate: () => void;
  viewMode: "day" | "week" | "month";
  onViewModeChange: (mode: "day" | "week" | "month") => void;
  onAutoSort: () => void;
  trendTypes?: OrganicTrendType[];
  seedCount?: number;
}) {
  return (
    <div className="flex flex-col gap-4 h-full">
      <GlassPanel className="p-4 flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-primary mb-3">
            Content Direction
          </h3>
          <div className="flex gap-2">
             <Button 
              className="flex-1" 
              variant="secondary"
              onClick={onAutoSort}
            >
              <LightningBoltIcon className="mr-2" />
              Auto-Sort Week
            </Button>
          </div>
        </div>
      </GlassPanel>
      
      <div className="flex-1 min-h-0 overflow-y-auto rounded border border-subtle bg-surface/30">
        <div className="p-4">
          <TrendSelector
            trendTypes={trendTypes}
            trends={trends}
            selectedTrendIds={selectedTrendIds}
            activePlatforms={activePlatforms}
            maxSelections={maxTrendSelections}
            onToggleTrend={onToggleTrend}
            withContainer={false}
            showHeader={true}
            allowDrag={true}
            allowSelect={true}
            allowActions={true}
            className="space-y-3"
          />
        </div>
      </div>
      
      <GlassPanel className="p-4">
        <Button 
          className="w-full h-14 text-base font-semibold shadow-lg shadow-brand-primary/20" 
          size="lg"
          onClick={onGenerate}
          disabled={seedCount === 0}
        >
          <RocketIcon className="mr-2 w-5 h-5" /> 
          Generate Drafts
        </Button>
        <p className="text-xs text-secondary mt-2 text-center">
          {seedCount} seeded slots ready
        </p>
      </GlassPanel>
    </div>
  );
}
