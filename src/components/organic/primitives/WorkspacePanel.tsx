'use client';

import { useDroppable } from '@dnd-kit/core';
import { ArchiveIcon, EyeOpenIcon, RocketIcon, TrashIcon, UpdateIcon } from '@radix-ui/react-icons';
import * as React from 'react';
import {
  RelativeTime,
  RelativeTimeZone,
  RelativeTimeZoneDisplay,
  RelativeTimeZoneLabel,
} from '@/components/kibo-ui/relative-time';
import { TrendSelector } from '@/components/organic/TrendSelector';
import { SectionHeader } from '@/components/shared/SectionHeader';
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
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import type { GridStatus } from '@/lib/organic/store';
import type { Trend } from '@/lib/organic/trends';
import { cn } from '@/lib/utils';
import { DraggableDraftCard } from './DraggableDraftCard';
import { OrganicDraftPreview } from './OrganicDraftPreview';
import type { OrganicCalendarDraft, OrganicTrendType } from './types';

type GenerationControlValues = {
  language: string;
  userPrompt: string;
  generationPrompt?: string;
};

type WorkspacePanelMode = 'full' | 'preview' | 'config' | 'generation';

type AssignmentDay = {
  id: string;
  label: string;
  dateLabel: string;
  draftCount: number;
};

export function WorkspacePanel({
  trends,
  selectedTrendIds,
  activePlatforms,
  maxTrendSelections,
  onToggleTrend,
  onGenerateGrid,
  onClearAll,
  onSelectDraft,
  onToggleSelection,
  selectedDraftId,
  selectedDraftIds = [],
  unscheduledDrafts = [],
  allDrafts = [],
  trendTypes = [],
  seedCount = 0,
  gridStatus = 'idle',
  mode = 'full',
  assignmentDays = [],
}: {
  trends: Trend[];
  selectedTrendIds: string[];
  activePlatforms: OrganicPlatformKey[];
  maxTrendSelections?: number;
  onToggleTrend: (trendId: string) => void;
  onGenerateGrid: (values: GenerationControlValues) => Promise<void> | void;
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
  mode?: WorkspacePanelMode;
  assignmentDays?: AssignmentDay[];
}) {
  const showGenerationControls = mode !== 'preview';
  const showPreview = mode === 'full' || mode === 'preview';
  const showUnscheduledPool = false;
  const isGenerationSidebar = mode === 'generation';
  const isGenerating = gridStatus === 'running';
  const [language, setLanguage] = React.useState('English');
  const [userPrompt, setUserPrompt] = React.useState('');
  const [generationPrompt, setGenerationPrompt] = React.useState('');
  const localTimeZone = React.useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );

  const selectedDraft = React.useMemo(
    () => allDrafts.find((draft) => draft.id === selectedDraftId),
    [allDrafts, selectedDraftId],
  );

  const { setNodeRef, isOver } = useDroppable({
    id: showUnscheduledPool ? 'unscheduled-pool' : 'unscheduled-pool-inactive',
    data: { type: 'unscheduled-pool' },
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
      ref={showUnscheduledPool ? setNodeRef : undefined}
      className={cn(
        'relative flex h-full min-h-0 flex-col gap-2 px-1',
        isGenerationSidebar ? 'overflow-hidden' : 'overflow-y-auto',
        showUnscheduledPool && isOver && 'ring-2 ring-brand-primary ring-inset bg-brand-primary/5',
      )}
    >
      {showGenerationControls ? (
        <Card
          className={cn(
            'relative z-10 gap-0 border border-border/50 bg-card/85 py-0 shadow-none',
            isGenerationSidebar && 'flex min-h-0 flex-1 flex-col',
          )}
        >
          <SectionHeader
            eyebrow="Generation Control"
            title="Weekly Content Initiation"
            meta={
              <div className="rounded border border-primary/25 bg-primary/10 px-2 py-1 font-mono text-2xs text-primary">
                {selectedTrendIds.length}/{maxTrendSelections ?? 5} trends
              </div>
            }
          />

          <CardContent
            className={cn(
              'space-y-2 px-3 py-3',
              isGenerationSidebar && 'flex min-h-0 flex-1 flex-col overflow-hidden',
            )}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="font-mono text-2xs uppercase tracking-widest text-muted-foreground">
                  Language
                </Label>
                <Input
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  placeholder="English"
                  className="h-8 border-input bg-background text-xs text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-2xs uppercase tracking-widest text-muted-foreground">
                  Platforms
                </Label>
                <div className="flex h-8 items-center rounded-md border border-input bg-background px-2 font-mono text-2xs text-foreground">
                  Instagram, LinkedIn
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="font-mono text-2xs uppercase tracking-widest text-muted-foreground">
                User Prompt
              </Label>
              <Textarea
                value={userPrompt}
                onChange={(event) => setUserPrompt(event.target.value)}
                className="min-h-[68px] border-input bg-background text-xs text-foreground placeholder:text-muted-foreground"
                placeholder="Optional focus for this week"
              />
            </div>

            <div className="space-y-1">
              <Label className="font-mono text-2xs uppercase tracking-widest text-muted-foreground">
                Additional Guidance
              </Label>
              <Textarea
                value={generationPrompt}
                onChange={(event) => setGenerationPrompt(event.target.value)}
                className="min-h-[56px] border-input bg-background text-xs text-foreground placeholder:text-muted-foreground"
                placeholder="Brand voice, campaign constraints, or CTA requirements"
              />
            </div>
            <ScrollArea
              className={cn(
                'rounded border border-border/60 bg-muted/30 p-2',
                isGenerationSidebar ? 'min-h-0 flex-1' : 'h-44 lg:h-48',
              )}
            >
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
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    className="h-8 px-2"
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
                    <AlertDialogAction onClick={onClearAll}>Clear Week</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                className="ml-auto h-8"
                variant="default"
                onClick={handleGenerate}
                disabled={isGenerating}
                type="button"
              >
                {isGenerating ? (
                  <UpdateIcon className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RocketIcon className="mr-1 h-3 w-3" />
                )}
                {isGenerating ? 'Generating' : 'Generate Weekly Grid'}
              </Button>
            </div>

            <p className="font-mono text-2xs uppercase tracking-widest text-muted-foreground">
              {seedCount > 0 ? `${seedCount} placeholders in queue` : 'No placeholders yet'}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {showPreview ? (
        <Card className="relative z-10 min-h-0 flex-1 gap-0 border border-border/60 bg-card/85 py-0 shadow-none">
          <SectionHeader
            eyebrow="Selected Post"
            meta={
              selectedDraft ? (
                <p className="font-mono text-2xs text-foreground">{selectedDraft.timeLabel}</p>
              ) : null
            }
          />
          <CardContent className="flex-1 min-h-0 px-2 py-2">
            <div className="h-full min-h-[240px] overflow-hidden rounded-lg border border-border/60 bg-muted/20">
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
      ) : null}

      {showGenerationControls && assignmentDays.length > 0 ? (
        <Card className="relative z-10 gap-0 border border-border/50 bg-card/85 py-0 shadow-none">
          <CardHeader className="border-b border-border/50 px-3 py-2">
            <CardDescription className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Day Assignments
            </CardDescription>
          </CardHeader>
          <CardContent className="px-2 py-2">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
              {assignmentDays.map((day) => (
                <div
                  key={day.id}
                  className="rounded-md border border-border/60 bg-muted/30 px-2 py-2"
                >
                  <p className="font-mono text-2xs uppercase tracking-wide text-muted-foreground">
                    {day.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{day.dateLabel}</p>
                  <p className="mt-1 text-xs font-semibold text-foreground">
                    {day.draftCount} posts
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showUnscheduledPool ? (
        <Card className="relative z-10 h-auto min-h-[180px] max-h-[240px] shrink-0 gap-0 border border-border/50 bg-card/85 py-0 shadow-none">
          <CardHeader className="border-b border-border/50 px-3 py-2">
            <div className="flex items-center justify-between">
              <CardDescription className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Unscheduled Pool
              </CardDescription>
              <div className="flex items-center gap-2">
                <p className="font-mono text-2xs text-muted-foreground">
                  {unscheduledDrafts.length} drafts
                </p>
                <RelativeTime
                  className="gap-0"
                  defaultTime={new Date()}
                  timeFormatOptions={{ hour: '2-digit', minute: '2-digit' }}
                >
                  <RelativeTimeZone className="justify-start gap-1" zone={localTimeZone}>
                    <RelativeTimeZoneLabel className="h-4 rounded-sm bg-muted px-1 text-3xs uppercase tracking-wide text-muted-foreground">
                      Local
                    </RelativeTimeZoneLabel>
                    <RelativeTimeZoneDisplay className="pl-0 text-2xs text-foreground" />
                  </RelativeTimeZone>
                </RelativeTime>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 px-2 py-2">
            <ScrollArea className="h-full min-h-[120px] pr-1">
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
      ) : null}
    </div>
  );
}
