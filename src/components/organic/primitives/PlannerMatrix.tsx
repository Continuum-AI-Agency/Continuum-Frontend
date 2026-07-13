import { AnimatePresence, motion } from 'motion/react';
import * as React from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { AddPostContextMenu } from './AddPostContextMenu';
import { parseTimeLabelToMinutes } from './calendar-utils';
import { PlannerCell } from './PlannerCell';
import type { CreatePostOptions, PlannerPlatform } from './planner-platforms';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicPlatformTag,
  OrganicSeedDragPayload,
} from './types';

type PlannerMatrixProps = {
  days: OrganicCalendarDay[];
  platforms: PlannerPlatform[];
  selectedDraftId: string | null;
  selectedDraftIds: string[];
  todayId: string;
  onSelectDraft: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onRegenerate: (draftId: string) => void;
  onClearFailure?: (draftId: string) => void;
  onEnrich?: (draftId: string) => void;
  onRealize?: (draftId: string) => void;
  onNativeDrop?: (
    dayId: string,
    time: string,
    data: OrganicSeedDragPayload,
    platformKey?: OrganicPlatformTag,
  ) => void;
  onCreatePost: (options: CreatePostOptions) => void;
};

const EMPTY_DRAFTS: OrganicCalendarDraft[] = [];

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
          'sticky top-0 z-20 border-r border-b border-border/50 px-1.5 py-1.5 text-center backdrop-blur last:border-r-0',
          isToday ? 'bg-primary/[0.05]' : 'bg-background/95',
        )}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {isToday ? (
          <span className="mt-1 inline-flex size-6 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-xs font-semibold text-primary">
            {dayNumber}
          </span>
        ) : (
          <p className="mt-1 text-sm font-semibold text-foreground">{dayNumber}</p>
        )}
      </div>
    </AddPostContextMenu>
  );
}

export function PlannerMatrix({
  days,
  platforms,
  selectedDraftId,
  selectedDraftIds,
  todayId,
  onSelectDraft,
  onToggleSelection,
  onRegenerate,
  onClearFailure,
  onEnrich,
  onRealize,
  onNativeDrop,
  onCreatePost,
}: PlannerMatrixProps) {
  const gridStatus = useCalendarStore((state) => state.gridStatus);
  const gridProgress = useCalendarStore((state) => state.gridProgress);

  const selectedDraftIdSet = React.useMemo(() => new Set(selectedDraftIds), [selectedDraftIds]);

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

        const platforms = new Set(
          draft.platforms.filter(
            (platform): platform is OrganicPlatformTag =>
              platform === 'instagram' || platform === 'linkedin',
          ),
        );

        platforms.forEach((platform) => {
          byPlatform[platform].push(draft);
        });
      });

      const schedulablePlatforms: OrganicPlatformTag[] = ['instagram', 'linkedin'];
      schedulablePlatforms.forEach((platform) => {
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

  return (
    <div className="relative min-h-0 flex-1 overflow-auto rounded-lg ring-1 ring-border/45 bg-background/90">
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
      <div className="min-w-[880px]">
        <div className="grid grid-cols-[96px_repeat(7,minmax(124px,1fr))]">
          <div className="sticky top-0 left-0 z-30 flex items-center justify-center border-r border-b border-border/50 bg-background/95 px-2 py-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
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

          {platforms.map((platform, platformIndex) => (
            <React.Fragment key={platform.key}>
              <div
                className={cn(
                  'sticky left-0 z-10 flex flex-col items-center justify-center border-r border-b border-border/50 bg-background/95 px-1.5 backdrop-blur',
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
                    'font-semibold uppercase tracking-wide text-muted-foreground',
                    platform.comingSoon ? 'text-3xs' : 'text-xs',
                  )}
                >
                  {platform.label}
                </span>
                {platform.comingSoon ? (
                  <Badge
                    variant="outline"
                    className="h-4 border-muted-foreground/30 bg-muted px-1 text-3xs text-muted-foreground"
                  >
                    soon
                  </Badge>
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
                      selectedDraftId={selectedDraftId}
                      selectedDraftIdSet={selectedDraftIdSet}
                      showGhosts={false}
                      compact
                      isToday={day.id === todayId}
                      isLastColumn={dayIndex === days.length - 1}
                      isLastRow={platformIndex === platforms.length - 1}
                      onSelectDraft={onSelectDraft}
                      onToggleSelection={onToggleSelection}
                      onRegenerate={onRegenerate}
                      onClearFailure={onClearFailure}
                      onEnrich={onEnrich}
                      onRealize={onRealize}
                      onNativeDrop={onNativeDrop}
                      onCreatePost={onCreatePost}
                    />
                  );
                }

                const schedulablePlatformKey = platform.key as OrganicPlatformTag;
                const cellDrafts =
                  draftsByCell.get(`${day.id}::${schedulablePlatformKey}`) ?? EMPTY_DRAFTS;

                return (
                  <PlannerCell
                    key={`${day.id}-${platform.key}`}
                    dayId={day.id}
                    platform={platform}
                    drafts={cellDrafts}
                    selectedDraftId={selectedDraftId}
                    selectedDraftIdSet={selectedDraftIdSet}
                    showGhosts={platformIndex === 0}
                    isToday={day.id === todayId}
                    isLastColumn={dayIndex === days.length - 1}
                    isLastRow={platformIndex === platforms.length - 1}
                    onSelectDraft={onSelectDraft}
                    onToggleSelection={onToggleSelection}
                    onRegenerate={onRegenerate}
                    onClearFailure={onClearFailure}
                    onEnrich={onEnrich}
                    onRealize={onRealize}
                    onNativeDrop={onNativeDrop}
                    onCreatePost={onCreatePost}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
