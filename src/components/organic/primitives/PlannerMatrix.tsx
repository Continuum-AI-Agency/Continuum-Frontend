import { AnimatePresence, motion } from 'motion/react';
import * as React from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { AddPostContextMenu } from './AddPostContextMenu';
import { parseTimeLabelToMinutes } from './calendar-utils';
import { PlannerCell } from './PlannerCell';
import type { CreatePostOptions, PlannerPlatform } from './planner-platforms';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCalendarPostedContent,
  OrganicPlatformTag,
  OrganicSeedDragPayload,
} from './types';

type PlannerMatrixProps = {
  days: OrganicCalendarDay[];
  platforms: PlannerPlatform[];
  postedContent: OrganicCalendarPostedContent[];
  selectedDraftId: string | null;
  selectedDraftIds: string[];
  todayId: string;
  onSelectDraft: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onRegenerate: (draftId: string) => void;
  onClearFailure?: (draftId: string) => void;
  onEnrich?: (draftId: string) => void;
  onRealize?: (draftId: string) => void;
  onStitch?: (draftId: string) => void;
  onNativeDrop?: (
    dayId: string,
    time: string,
    data: OrganicSeedDragPayload,
    platformKey?: OrganicPlatformTag,
  ) => void;
  onCreatePost: (options: CreatePostOptions) => void;
};

const EMPTY_DRAFTS: OrganicCalendarDraft[] = [];
const EMPTY_POSTED_CONTENT: OrganicCalendarPostedContent[] = [];

// A platform earns a row as soon as it has a draft or a published post, even when the
// brand has no publishing connection for it. That row can only ever read, so it says so.
function readOnlyPlatformNotice(platformLabel: string): string {
  return `${platformLabel} is not connected for publishing, so nothing can be scheduled here. Posts already live on ${platformLabel} still appear in this row.`;
}

function DayHeader({
  dayId,
  label,
  dateLabel,
  isToday,
  onCreatePost,
}: {
  dayId: string;
  label: string;
  dateLabel: string;
  isToday: boolean;
  onCreatePost: (options: CreatePostOptions) => void;
}) {
  const dayNumber = dateLabel.split(' ').at(-1) ?? dateLabel;

  return (
    // Right-clicking the day column header offers the day's create actions with no
    // platform preset — the workspace picks the brand's default platform.
    <AddPostContextMenu dayId={dayId} onCreatePost={onCreatePost}>
      <div
        className={cn(
          // Day-of-week header row: a lighter muted band along the top so the
          // horizontal "which day" axis reads distinctly from the heavier
          // vertical platform rail on the left.
          'sticky top-0 z-20 snap-start border-r border-b-2 border-border/50 px-1.5 py-1.5 text-center backdrop-blur last:border-r-0',
          isToday ? 'bg-primary/[0.06]' : 'bg-muted/30',
        )}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {isToday ? (
          <span className="mt-1 inline-flex size-7 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-sm font-semibold text-primary">
            {dayNumber}
          </span>
        ) : (
          <p className="mt-1 text-base font-semibold text-foreground">{dayNumber}</p>
        )}
      </div>
    </AddPostContextMenu>
  );
}

export function PlannerMatrix({
  days,
  platforms,
  postedContent,
  selectedDraftId,
  selectedDraftIds,
  todayId,
  onSelectDraft,
  onToggleSelection,
  onRegenerate,
  onClearFailure,
  onEnrich,
  onRealize,
  onStitch,
  onNativeDrop,
  onCreatePost,
}: PlannerMatrixProps) {
  const gridStatus = useCalendarStore((state) => state.gridStatus);
  const gridProgress = useCalendarStore((state) => state.gridProgress);

  const selectedDraftIdSet = React.useMemo(() => new Set(selectedDraftIds), [selectedDraftIds]);
  const [showInactivePlatforms, setShowInactivePlatforms] = React.useState(false);
  const inactivePlatforms = React.useMemo(
    () => platforms.filter((platform) => platform.comingSoon),
    [platforms],
  );
  const visiblePlatforms = React.useMemo(
    () =>
      showInactivePlatforms ? platforms : platforms.filter((platform) => !platform.comingSoon),
    [platforms, showInactivePlatforms],
  );

  const draftsByCell = React.useMemo(() => {
    const map = new Map<string, OrganicCalendarDraft[]>();

    days.forEach((day) => {
      const byPlatform: Record<OrganicPlatformTag, OrganicCalendarDraft[]> = {
        youtube: [],
        instagram: [],
        facebook: [],
        tiktok: [],
        linkedin: [],
      };

      day.slots.forEach((draft) => {
        if (draft.platforms.length === 0) {
          byPlatform.instagram.push(draft);
          return;
        }

        new Set(draft.platforms).forEach((platform) => {
          byPlatform[platform].push(draft);
        });
      });

      (Object.keys(byPlatform) as OrganicPlatformTag[]).forEach((platform) => {
        const sorted = [...byPlatform[platform]].sort((a, b) => {
          const minutesA = parseTimeLabelToMinutes(a.timeLabel) ?? 0;
          const minutesB = parseTimeLabelToMinutes(b.timeLabel) ?? 0;
          return minutesA - minutesB;
        });
        map.set(`${day.id}::${platform}`, sorted);
      });
    });

    return map;
  }, [days]);

  const postedByCell = React.useMemo(() => {
    const map = new Map<string, OrganicCalendarPostedContent[]>();
    postedContent.forEach((post) => {
      const key = `${post.dayId}::${post.platform}`;
      const entries = map.get(key) ?? [];
      entries.push(post);
      map.set(key, entries);
    });
    return map;
  }, [postedContent]);

  return (
    <div className="relative min-h-0 flex-1 snap-x snap-proximity overflow-auto rounded-lg bg-background/90 ring-1 ring-border/45">
      <AnimatePresence>
        {gridStatus === 'running' ? (
          <motion.div
            key="grid-progress"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="sticky top-0 z-30 border-b border-primary/20 bg-background/95 px-4 py-2 backdrop-blur"
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-primary/80 uppercase tracking-wide">
                {gridProgress.stage ?? 'Generating content'}
              </p>
              <span className="text-xs text-muted-foreground">{gridProgress.percent}%</span>
            </div>
            <Progress value={gridProgress.percent} className="h-1" />
            {gridProgress.message ? (
              <p className="mt-1 text-2xs text-muted-foreground">{gridProgress.message}</p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {/* 6rem rail + 7 x 8.5rem day columns. The container above already scrolls
          horizontally, so widening the day column costs nothing and buys every card
          ~135px of content — enough for the status pill and "Enrich" to render whole. */}
      <div className="min-w-[65.5rem]">
        <div className="grid grid-cols-[6rem_repeat(7,minmax(8.5rem,1fr))]">
          <div className="sticky top-0 left-0 z-30 flex items-center justify-center border-r-2 border-b-2 border-border/50 bg-muted/50 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-foreground backdrop-blur">
            Platform
          </div>

          {days.map((day) => (
            <DayHeader
              key={day.id}
              dayId={day.id}
              label={day.label}
              dateLabel={day.dateLabel}
              isToday={day.id === todayId}
              onCreatePost={onCreatePost}
            />
          ))}

          {visiblePlatforms.map((platform, platformIndex) => (
            <React.Fragment key={platform.key}>
              <div
                className={cn(
                  // Platform rail: a heavier muted column with a bold right edge
                  // so the vertical "which platform" axis is unmistakable next
                  // to the day cells it labels.
                  'sticky left-0 z-10 flex flex-col items-center justify-center border-r-2 border-b border-border/50 bg-muted/50 px-1.5 backdrop-blur',
                  platform.comingSoon ? 'gap-0.5 py-1.5' : 'gap-1 py-3',
                )}
              >
                <Avatar
                  className={cn(
                    'border border-border bg-muted/40',
                    platform.comingSoon ? 'size-5' : 'size-7',
                  )}
                >
                  <AvatarFallback className="bg-muted text-foreground">
                    <platform.Icon className={cn(platform.comingSoon ? 'size-3' : 'size-4')} />
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    'font-semibold uppercase tracking-wide',
                    platform.comingSoon
                      ? 'text-xs text-muted-foreground'
                      : 'text-sm text-foreground',
                  )}
                >
                  {platform.label}
                </span>
                {platform.comingSoon ? (
                  <Badge
                    variant="outline"
                    className="h-4 border-muted-foreground/30 bg-muted px-1 text-xs text-muted-foreground"
                  >
                    soon
                  </Badge>
                ) : !platform.canCreate ? (
                  // A bare "view" was the row's only content on an empty read-only channel,
                  // which read as a stray word. The label says what the row IS and the
                  // tooltip says why it cannot be scheduled.
                  <TooltipProvider>
                    <Tooltip delayDuration={150}>
                      <TooltipTrigger asChild>
                        <Badge variant="muted" className="h-4 cursor-help px-1 text-xs">
                          Read-only
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[220px] text-xs">
                        {readOnlyPlatformNotice(platform.label)}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
              </div>

              {days.map((day, dayIndex) => {
                if (platform.comingSoon) {
                  return (
                    <PlannerCell
                      key={`${day.id}-${platform.key}`}
                      dayId={day.id}
                      platform={platform}
                      drafts={[]}
                      postedContent={[]}
                      selectedDraftId={selectedDraftId}
                      selectedDraftIdSet={selectedDraftIdSet}
                      showGhosts={false}
                      compact
                      isToday={day.id === todayId}
                      isLastColumn={dayIndex === days.length - 1}
                      isLastRow={platformIndex === visiblePlatforms.length - 1}
                      onSelectDraft={onSelectDraft}
                      onToggleSelection={onToggleSelection}
                      onRegenerate={onRegenerate}
                      onClearFailure={onClearFailure}
                      onEnrich={onEnrich}
                      onRealize={onRealize}
                      onStitch={onStitch}
                      onNativeDrop={onNativeDrop}
                      onCreatePost={onCreatePost}
                    />
                  );
                }

                const schedulablePlatformKey = platform.key as OrganicPlatformTag;
                const cellDrafts =
                  draftsByCell.get(`${day.id}::${schedulablePlatformKey}`) ?? EMPTY_DRAFTS;
                const cellPostedContent =
                  postedByCell.get(`${day.id}::${schedulablePlatformKey}`) ?? EMPTY_POSTED_CONTENT;

                return (
                  <PlannerCell
                    key={`${day.id}-${platform.key}`}
                    dayId={day.id}
                    platform={platform}
                    drafts={cellDrafts}
                    postedContent={cellPostedContent}
                    selectedDraftId={selectedDraftId}
                    selectedDraftIdSet={selectedDraftIdSet}
                    showGhosts={platformIndex === 0}
                    isToday={day.id === todayId}
                    isLastColumn={dayIndex === days.length - 1}
                    isLastRow={platformIndex === visiblePlatforms.length - 1}
                    readOnlyNotice={
                      !platform.canCreate && dayIndex === 0
                        ? readOnlyPlatformNotice(platform.label)
                        : undefined
                    }
                    onSelectDraft={onSelectDraft}
                    onToggleSelection={onToggleSelection}
                    onRegenerate={onRegenerate}
                    onClearFailure={onClearFailure}
                    onEnrich={onEnrich}
                    onRealize={onRealize}
                    onStitch={onStitch}
                    onNativeDrop={onNativeDrop}
                    onCreatePost={onCreatePost}
                  />
                );
              })}
            </React.Fragment>
          ))}
          {inactivePlatforms.length > 0 ? (
            <div className="sticky left-0 col-span-8 flex items-center justify-center border-t border-border/50 bg-muted/20 px-2 py-1.5">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => setShowInactivePlatforms((current) => !current)}
              >
                {showInactivePlatforms
                  ? 'Hide inactive platforms'
                  : `Show ${inactivePlatforms.length} inactive platform${inactivePlatforms.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
