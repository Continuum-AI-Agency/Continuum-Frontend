"use client";

import * as React from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";
import { RocketIcon } from "@radix-ui/react-icons";
import { TrendSelector } from "@/components/organic/TrendSelector";
import type { Trend } from "@/lib/organic/trends";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";

export function WorkspacePanel({
  trends,
  selectedTrendIds,
  activePlatforms,
  maxTrendSelections,
  onToggleTrend,
  onGenerate,
  viewMode,
  onViewModeChange,
}: {
  trends: Trend[];
  selectedTrendIds: string[];
  activePlatforms: OrganicPlatformKey[];
  maxTrendSelections?: number;
  onToggleTrend: (trendId: string) => void;
  onGenerate: () => void;
  viewMode: "day" | "week" | "month";
  onViewModeChange: (mode: "day" | "week" | "month") => void;
}) {
  return (
    <div className="flex flex-col gap-4 h-full">
      <GlassPanel className="p-4 flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-primary mb-3">
            Content Direction
          </h3>
          <div className="flex gap-2 bg-surface/50 p-1 rounded-lg border border-subtle">
            {(["day", "week", "month"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onViewModeChange(m)}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  viewMode === m
                    ? "bg-brand-primary text-white shadow-sm"
                    : "text-secondary hover:text-primary hover:bg-surface"
                }`}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </GlassPanel>
      
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-subtle bg-surface/30">
        <div className="p-4">
          <TrendSelector
            trends={trends}
            selectedTrendIds={selectedTrendIds}
            activePlatforms={activePlatforms}
            maxSelections={maxTrendSelections}
            onToggleTrend={onToggleTrend}
            withContainer={false}
            showHeader={true}
            className="space-y-3"
          />
        </div>
      </div>
      
      <GlassPanel className="p-4">
        <Button 
          className="w-full" 
          onClick={onGenerate}
          disabled={selectedTrendIds.length === 0}
        >
          <RocketIcon className="mr-2" /> 
          Generate Drafts
        </Button>
        <p className="text-xs text-secondary mt-2 text-center">
          {selectedTrendIds.length}/{maxTrendSelections || 5} trends selected
        </p>
      </GlassPanel>
    </div>
  );
}
