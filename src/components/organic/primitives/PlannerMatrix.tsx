import { AnimatePresence, motion } from 'motion/react';
import * as React from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { EMPTY_SELECTION, selectionWithin } from '../hooks/useCalendarSelection';
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
  /** The published post open in the preview, if any. */
  selectedPostId?: string | null;
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
  onSelectPost: (post: OrganicCalendarPostedContent, metricsHref: string | null) => void;
};

const EMPTY_DRAFTS: OrganicCalendarDraft[] = [];
const EMPTY_POSTED_CONTENT: OrganicCalendarPostedContent[] = [];

const sameDrafts = (a: readonly OrganicCalendarDraft[], b: readonly OrganicCalendarDraft[]) =>
  a.length === b.length && a.every((draft, index) => draft === b[index]);

/**
 * The one row a card is filed under: the first of its platforms in the order the rows are
 * shown. A post going to three platforms is one card, never three copies of it (C7); its
 * other platforms read on the card. A platformless draft goes under Instagram.
 */
function cardRow(draft: OrganicCalendarDraft, rowOrder: readonly string[]): string {
  return (
    rowOrder.find((row) => draft.platforms.includes(row as OrganicPlatformTag)) ??
    draft.platforms[0] ??
    'instagram'
  );
}

/**
 * Each `day::platform` cell's drafts, by time. A cell holding the same draft objects as in
 * `previous` keeps its previous array: every cell is memoised on it, and a fresh array per
 * cell made one caption keystroke re-render all 35 of them. Empty cells are left out.
 */
export function groupDraftsByCell(
  days: readonly OrganicCalendarDay[],
  previous: ReadonlyMap<string, OrganicCalendarDraft[]> = new Map(),
  rowOrder: readonly string[] = [],
): Map<string, OrganicCalendarDraft[]> {
  const map = new Map<string, OrganicCalendarDraft[]>();
  for (const day of days) {
    for (const draft of day.slots) {
      const key = `${day.id}::${cardRow(draft, rowOrder)}`;
      const cell = map.get(key);
      if (cell) cell.push(draft);
      else map.set(key, [draft]);
    }
  }
  for (const [key, cell] of map) {
    cell.sort(
      (a, b) =>
        (parseTimeLabelToMinutes(a.timeLabel) ?? 0) - (parseTimeLabelToMinutes(b.timeLabel) ?? 0),
    );
    const prior = previous.get(key);
    if (prior && sameDrafts(prior, cell)) map.set(key, prior);
  }
  return map;
}

// A platform earns a row as soon as it has a draft or a published post, even when the
// brand has no publishing connection for it. That row can only ever read, so it says so.
function readOnlyPlatformNotice(platformLabel: string): string {
  return `${platformLabel} is not connected for publishing, so nothing can be scheduled here. Posts already live on ${platformLabel} still appear in this row.`;
}

const DayHeader = React.memo(function DayHeader({
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
          // vertical platform rail on the left. The week only scrolls sideways on a
          // phone, where the sticky rail is 3rem: a day snaps in beside it, not under it.
          'sticky top-0 z-20 snap-start scroll-ml-12 border-r border-b-2 border-border/50 px-1.5 py-1.5 text-center backdrop-blur last:border-r-0',
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
});

export function PlannerMatrix({
  days,
  platforms,
  postedContent,
  selectedDraftId,
  selectedDraftIds,
  selectedPostId = null,
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
  onSelectPost,
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

  // The last committed grouping: a cell whose drafts are unchanged gets its old array back.
  const committedDraftsByCellRef = React.useRef<ReadonlyMap<string, OrganicCalendarDraft[]>>(
    new Map(),
  );
  const rowOrderKey = visiblePlatforms.map((platform) => platform.key).join(',');
  const draftsByCell = React.useMemo(
    () => groupDraftsByCell(days, committedDraftsByCellRef.current, rowOrderKey.split(',')),
    [days, rowOrderKey],
  );
  React.useEffect(() => {
    committedDraftsByCellRef.current = draftsByCell;
  }, [draftsByCell]);

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
    <div
      data-planner-scroller="week"
      // Stable gutter: a scrollbar appearing narrows the container, which can flip the
      // container queries below, which can remove the scrollbar again.
      className="@container/planner-matrix relative min-h-0 flex-1 snap-x snap-proximity overflow-auto rounded-lg bg-background/90 ring-1 ring-border/45 [scrollbar-gutter:stable]"
    >
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
      {/* The seven days always share the width: beside an open preview the calendar is
          ~820px, and a 65.5rem floor scrolled the week sideways there. Cards switch to their
          compact form by their own width, and below ~66rem the platform rail drops to icons
          (its labels and badges stay for screen readers). On a phone the seven columns would
          be ~48px each, too narrow for any card, so under 40rem the week keeps a 54rem floor
          (cards of at least 6rem) and scrolls sideways instead. Container queries, never a prop: a prop would
          re-render every memoised cell. */}
      <div
        data-planner-content="week"
        className="grid grid-cols-[6rem_repeat(7,minmax(0,1fr))] @max-[66rem]/planner-matrix:grid-cols-[3rem_repeat(7,minmax(0,1fr))] @max-[40rem]/planner-matrix:min-w-[54rem]"
      >
        <div className="sticky top-0 left-0 z-30 flex items-center justify-center border-r-2 border-b-2 border-border/50 bg-muted px-2 py-2 text-xs font-semibold uppercase tracking-wide text-foreground">
          <span className="@max-[66rem]/planner-matrix:sr-only">Platform</span>
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
              // The narrow rail is icon-only; the name stays for screen readers and here.
              title={
                platform.canCreate || platform.comingSoon
                  ? platform.label
                  : readOnlyPlatformNotice(platform.label)
              }
              className={cn(
                // Platform rail: a heavier muted column with a bold right edge
                // so the vertical "which platform" axis is unmistakable next
                // to the day cells it labels. Opaque and above the day headers: when the
                // week scrolls sideways on a phone, the cards pass under it, not through it.
                'sticky left-0 z-20 flex flex-col items-center justify-center border-r-2 border-b border-border/50 bg-muted px-1.5 @max-[66rem]/planner-matrix:px-0.5',
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
                  'font-semibold uppercase tracking-wide @max-[66rem]/planner-matrix:sr-only',
                  platform.comingSoon ? 'text-xs text-muted-foreground' : 'text-sm text-foreground',
                )}
              >
                {platform.label}
              </span>
              {platform.comingSoon ? (
                <Badge
                  variant="outline"
                  className="h-4 border-muted-foreground/30 bg-muted px-1 text-xs text-muted-foreground @max-[66rem]/planner-matrix:sr-only"
                >
                  soon
                </Badge>
              ) : !platform.canCreate ? (
                // A bare "view" was the row's only content on an empty read-only channel,
                // which read as a stray word. The label says what the row IS and the
                // tooltip says why it cannot be scheduled.
                <TooltipProvider delay={150}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Badge
                          variant="muted"
                          className="h-4 cursor-help px-1 text-xs @max-[66rem]/planner-matrix:sr-only"
                        >
                          Read-only
                        </Badge>
                      }
                    />
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
                    drafts={EMPTY_DRAFTS}
                    postedContent={EMPTY_POSTED_CONTENT}
                    selectedDraftId={null}
                    selectedDraftIdSet={EMPTY_SELECTION}
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
                    onSelectPost={onSelectPost}
                  />
                );
              }

              const schedulablePlatformKey = platform.key as OrganicPlatformTag;
              const cellDrafts =
                draftsByCell.get(`${day.id}::${schedulablePlatformKey}`) ?? EMPTY_DRAFTS;
              const cellPostedContent =
                postedByCell.get(`${day.id}::${schedulablePlatformKey}`) ?? EMPTY_POSTED_CONTENT;
              const cellSelection = selectionWithin(
                cellDrafts,
                selectedDraftId,
                selectedDraftIdSet,
              );
              const cellSelectedPostId = cellPostedContent.some(
                (post) => post.id === selectedPostId,
              )
                ? selectedPostId
                : null;

              return (
                <PlannerCell
                  key={`${day.id}-${platform.key}`}
                  dayId={day.id}
                  platform={platform}
                  drafts={cellDrafts}
                  postedContent={cellPostedContent}
                  selectedDraftId={cellSelection.selectedDraftId}
                  selectedDraftIdSet={cellSelection.selectedDraftIdSet}
                  selectedPostId={cellSelectedPostId}
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
                  onSelectPost={onSelectPost}
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
  );
}
