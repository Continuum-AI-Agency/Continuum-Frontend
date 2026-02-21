"use client";

import * as React from "react";
import {
  ArchiveIcon,
  EyeOpenIcon,
  LightningBoltIcon,
  RocketIcon,
  TrashIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import { useDroppable } from "@dnd-kit/core";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TrendSelector } from "@/components/organic/TrendSelector";
import type { Trend } from "@/lib/organic/trends";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";

import type { OrganicTrendType, OrganicCalendarDraft } from "./types";
import type { GridStatus } from "@/lib/organic/store";
import { DraggableDraftCard } from "./DraggableDraftCard";
import { OrganicDraftPreview } from "./OrganicDraftPreview";

type GenerationControlValues = {
  language: string;
  userPrompt: string;
  generationPrompt?: string;
};

export function WorkspacePanel({
  trends,
  selectedTrendIds,
  activePlatforms,
  maxTrendSelections,
  onToggleTrend,
  onGenerateGrid,
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
  onGenerateGrid: (values: GenerationControlValues) => Promise<void> | void;
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
  const [language, setLanguage] = React.useState("English");
  const [userPrompt, setUserPrompt] = React.useState("");
  const [generationPrompt, setGenerationPrompt] = React.useState("");

  const selectedDraft = React.useMemo(
    () =>
      allDrafts.find((draft) => draft.id === selectedDraftId) ||
      unscheduledDrafts.find((draft) => draft.id === selectedDraftId),
    [allDrafts, selectedDraftId, unscheduledDrafts]
  );

  const { setNodeRef, isOver } = useDroppable({
    id: "unscheduled-pool",
    data: { type: "unscheduled-pool" },
  });

  const handleGenerate = () => {
    void onGenerateGrid({
      language,
      userPrompt,
      generationPrompt: generationPrompt.trim() || undefined,
    });
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border border-sky-500/20 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 p-2",
        isOver && "ring-2 ring-brand-primary ring-inset bg-brand-primary/5"
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.18)_1px,transparent_1px)] [background-size:28px_28px]"
      />

      <Card className="relative z-10 gap-0 border border-sky-500/30 bg-slate-900/85 py-0 shadow-[6px_6px_0_0_rgba(14,116,144,.3)]">
        <CardHeader className="px-3 py-3 border-b border-subtle">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardDescription className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-300">
                Generation Control
              </CardDescription>
              <CardTitle className="text-sm font-semibold text-slate-50">
                Weekly Content Initiation
              </CardTitle>
            </div>
            <div className="rounded border border-sky-500/40 bg-sky-950/60 px-2 py-1 font-mono text-[10px] text-sky-200">
              {selectedTrendIds.length}/{maxTrendSelections ?? 5} trends
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-2 px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-300">Language</Label>
              <Input
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="English"
                className="h-8 border-slate-700 bg-slate-950 text-xs text-slate-100"
              />
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-300">Platforms</Label>
              <div className="flex h-8 items-center rounded-md border border-slate-700 bg-slate-950 px-2 font-mono text-[10px] text-slate-300">
                Instagram, Facebook, LinkedIn
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-300">User Prompt</Label>
            <Textarea
              value={userPrompt}
              onChange={(event) => setUserPrompt(event.target.value)}
              className="min-h-[68px] border-slate-700 bg-slate-950 text-xs text-slate-100"
              placeholder="Optional focus for this week"
            />
          </div>

          <div className="space-y-1">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-300">Additional Guidance</Label>
            <Textarea
              value={generationPrompt}
              onChange={(event) => setGenerationPrompt(event.target.value)}
              className="min-h-[56px] border-slate-700 bg-slate-950 text-xs text-slate-100"
              placeholder="Brand voice, campaign constraints, or CTA requirements"
            />
          </div>
          <ScrollArea className="h-[220px] rounded border border-slate-700 bg-slate-950/80 p-2">
            <TrendSelector
              trendTypes={trendTypes}
              trends={trends}
              selectedTrendIds={selectedTrendIds}
              activePlatforms={activePlatforms}
              maxSelections={maxTrendSelections}
              onToggleTrend={onToggleTrend}
              withContainer={false}
              showHeader={false}
              allowDrag
              allowSelect
              allowActions
              className="space-y-2"
            />
          </ScrollArea>

          <div className="flex items-center gap-2">
            <Button
              className="h-8 px-2"
              variant="ghost"
              size="sm"
              type="button"
              onClick={onAutoSort}
              disabled={isGenerating}
              title="Auto-seed the week"
            >
              <LightningBoltIcon className="mr-1 h-3 w-3" />
              Auto-seed
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="h-8 px-2 text-muted-foreground hover:text-destructive"
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={isGenerating}
                  title="Clear all planned posts"
                >
                  <TrashIcon className="mr-1 h-3 w-3" />
                  Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all planned posts?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes all scheduled and unscheduled drafts from the current week.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onClearAll}>
                    Clear Week
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              className="ml-auto h-8 rounded-md border border-sky-400/50 bg-sky-700 text-xs text-white shadow-[0_0_20px_rgba(14,165,233,.2)] transition-colors hover:bg-sky-600"
              onClick={handleGenerate}
              disabled={isGenerating}
              type="button"
            >
              {isGenerating ? (
                <UpdateIcon className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RocketIcon className="mr-1 h-3 w-3" />
              )}
              {isGenerating ? "Generating" : "Generate Weekly Grid"}
            </Button>
          </div>

          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-300">
            {seedCount > 0 ? `${seedCount} seeded drafts in queue` : "Select trends and generate from backend"}
          </p>
        </CardContent>
      </Card>

      <Card className="relative z-10 min-h-0 flex-1 gap-0 border border-sky-500/25 bg-slate-900/80 py-0 shadow-[6px_6px_0_0_rgba(14,116,144,.2)]">
        <CardHeader className="px-3 py-2 border-b border-subtle">
          <div className="flex items-center justify-between">
            <CardDescription className="font-mono text-xs uppercase tracking-[0.14em] text-slate-300">
              Selected Post
            </CardDescription>
            {selectedDraft ? (
              <p className="font-mono text-[10px] text-slate-300">{selectedDraft.timeLabel}</p>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="px-2 py-2">
          <div className="h-[460px] overflow-hidden rounded-lg border border-slate-700 bg-slate-950/75">
            {selectedDraft ? (
              <OrganicDraftPreview draft={selectedDraft} />
            ) : (
              <Empty className="opacity-50">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <EyeOpenIcon />
                  </EmptyMedia>
                  <EmptyTitle>No post selected</EmptyTitle>
                  <EmptyDescription>
                    Select a draft card on the calendar to preview and edit config.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="relative z-10 h-[180px] gap-0 border border-sky-500/25 bg-slate-900/80 py-0 shadow-[6px_6px_0_0_rgba(14,116,144,.2)]">
        <CardHeader className="px-3 py-2 border-b border-subtle">
          <div className="flex items-center justify-between">
            <CardDescription className="font-mono text-xs uppercase tracking-[0.14em] text-slate-300">
              Unscheduled Pool
            </CardDescription>
            <p className="font-mono text-[10px] text-slate-300">{unscheduledDrafts.length} drafts</p>
          </div>
        </CardHeader>
        <CardContent className="px-2 py-2">
          <ScrollArea className="h-[132px] pr-1">
            {unscheduledDrafts.length === 0 ? (
              <Empty className="opacity-50 pointer-events-none">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ArchiveIcon />
                  </EmptyMedia>
                  <EmptyTitle>Unscheduled Empty</EmptyTitle>
                  <EmptyDescription>Drop cards here to unschedule</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-2">
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
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
