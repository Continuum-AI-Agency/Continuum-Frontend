"use client";

import * as React from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";
import { RocketIcon, LightningBoltIcon, MagicWandIcon, ListBulletIcon } from "@radix-ui/react-icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      
      <Tabs defaultValue="trends" className="flex-1 flex flex-col min-h-0">
        <div className="px-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="trends" className="gap-2">
              <MagicWandIcon className="w-4 h-4" />
              Trends
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <ListBulletIcon className="w-4 h-4" />
              Templates
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="trends" className="flex-1 min-h-0 mt-2">
          <div className="h-full overflow-y-auto rounded border border-subtle bg-surface/30">
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
        </TabsContent>

        <TabsContent value="templates" className="flex-1 min-h-0 mt-2">
          <div className="h-full flex flex-col items-center justify-center rounded border border-dashed border-subtle bg-surface/30 text-center p-8">
            <ListBulletIcon className="w-8 h-8 text-secondary mb-3 opacity-20" />
            <p className="text-sm text-secondary">
              Daily templates integration in progress.
            </p>
          </div>
        </TabsContent>
      </Tabs>
      
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
