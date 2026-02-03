"use client";

import * as React from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";
import { RocketIcon, LightningBoltIcon, MagicWandIcon, ListBulletIcon, UpdateIcon, TrashIcon, ArchiveIcon, EyeOpenIcon } from "@radix-ui/react-icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendSelector } from "@/components/organic/TrendSelector";
import type { Trend } from "@/lib/organic/trends";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";
import type { OrganicTrendType, OrganicCalendarDraft } from "./types";
import type { GridStatus } from "@/lib/organic/store";
import { DraggableDraftCard } from "./DraggableDraftCard";
import { OrganicDraftPreview } from "./OrganicDraftPreview";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

export function WorkspacePanel({
  trends,
  selectedTrendIds,
  activePlatforms,
  maxTrendSelections,
  onToggleTrend,
  onGenerate,
  onAutoSort,
  onClearAll,
  onSelectDraft,
  onToggleSelection,
  selectedDraftId,
  selectedDraftIds = [],
  unscheduledDrafts = [],
  allDrafts = [],
  trendTypes = [],
  seedCount = 0,
  gridStatus = "idle",
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
  onClearAll: () => void;
  onSelectDraft: (id: string) => void;
  onToggleSelection: (id: string) => void;
  selectedDraftId: string | null;
  selectedDraftIds: string[];
  unscheduledDrafts?: OrganicCalendarDraft[];
  allDrafts?: OrganicCalendarDraft[];
  trendTypes?: OrganicTrendType[];
  seedCount?: number;
  gridStatus?: GridStatus;
}) {
  const isGenerating = gridStatus === "running";
  const [activeTab, setActiveTab] = React.useState("trends");

  const selectedDraft = React.useMemo(
    () => allDrafts.find((d) => d.id === selectedDraftId) || unscheduledDrafts.find((d) => d.id === selectedDraftId),
    [allDrafts, unscheduledDrafts, selectedDraftId]
  );

  React.useEffect(() => {
    if (selectedDraftId) {
      setActiveTab("preview");
    }
  }, [selectedDraftId]);

  const { setNodeRef, isOver } = useDroppable({
    id: "unscheduled-pool",
    data: { type: "unscheduled-pool" },
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-4 h-full transition-colors rounded-xl",
        isOver && "ring-2 ring-brand-primary ring-inset bg-brand-primary/5"
      )}
    >
      <GlassPanel className="p-4 flex flex-col gap-4 relative z-10">
        <div>
          <h3 className="text-sm font-semibold text-primary mb-3">
            Content Direction
          </h3>
          <div className="flex gap-2">
             <Button 
              className="flex-1 cursor-pointer" 
              variant="secondary"
              onClick={onAutoSort}
              type="button"
              disabled={isGenerating}
            >
              <LightningBoltIcon className="mr-2" />
              Auto-Sort
            </Button>
            <Button 
              className="flex-1 cursor-pointer" 
              variant="destructive"
              onClick={onClearAll}
              type="button"
              disabled={isGenerating}
            >
              <TrashIcon className="mr-2" />
              Clear All
            </Button>
          </div>
        </div>
      </GlassPanel>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 relative z-10">
        <div className="px-1">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="trends" className="gap-2">
              <MagicWandIcon className="w-4 h-4" />
              Trends
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-2">
              <EyeOpenIcon className="w-4 h-4" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="drafts" className="gap-2">
              <ArchiveIcon className="w-4 h-4" />
              Drafts
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

        <TabsContent value="preview" className="flex-1 min-h-0 mt-2">
          <div className="h-full rounded border border-subtle bg-surface/30">
            {selectedDraft ? (
              <OrganicDraftPreview draft={selectedDraft} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                <EyeOpenIcon className="w-8 h-8 mb-3" />
                <p className="text-sm font-medium">No post selected</p>
                <p className="text-[10px] mt-1">Select a draft to see the preview</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="drafts" className="flex-1 min-h-0 mt-2">
          <div className="h-full overflow-y-auto rounded border border-subtle bg-surface/30 p-4">
            {unscheduledDrafts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40 pointer-events-none">
                <ArchiveIcon className="w-8 h-8 mb-3" />
                <p className="text-sm">No unscheduled drafts.</p>
                <p className="text-[10px] mt-1">Drop items here to unschedule</p>
              </div>
            ) : (
              <div className="space-y-3">
                {unscheduledDrafts.map((draft) => (
                  <DraggableDraftCard
                    key={draft.id}
                    draft={draft}
                    isSelected={draft.id === selectedDraftId}
                    isMultiSelected={selectedDraftIds.includes(draft.id)}
                    onSelect={onSelectDraft}
                    onToggleSelection={onToggleSelection}
                  />
                ))}
              </div>
            )}
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
      
      <div className="p-4 bg-surface/80 backdrop-blur-xl border border-brand-primary/20 rounded-xl shadow-2xl relative z-30">
        <Button 
          className="w-full h-14 text-lg font-bold shadow-2xl shadow-brand-primary/30 cursor-pointer active:scale-95 transition-all bg-brand-primary hover:bg-brand-primary/90 text-white rounded-md flex items-center justify-center pointer-events-auto" 
          size="lg"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onGenerate();
          }}
          disabled={isGenerating}
          type="button"
        >
          {isGenerating ? (
            <UpdateIcon className="mr-2 w-6 h-6 animate-spin" />
          ) : (
            <RocketIcon className="mr-2 w-6 h-6" /> 
          )}
          {isGenerating ? "Processing batch..." : "Generate Drafts"}
        </Button>
        <p className="text-[10px] uppercase tracking-widest text-secondary mt-3 text-center font-bold opacity-60">
          {seedCount > 0 ? `${seedCount} trends ready` : "Full Week AI Generation"}
        </p>
      </div>
    </div>
  );
}
