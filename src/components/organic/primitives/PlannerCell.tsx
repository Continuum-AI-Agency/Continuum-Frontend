import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { AddPostContextMenu } from './AddPostContextMenu';
import { AddPostMenu } from './AddPostMenu';
import { parseTimeLabelToMinutes } from './calendar-utils';
import { DraggableDraftCard } from './DraggableDraftCard';
import { PostedContentQuickLook } from './PostedContentQuickLook';
import type { CreatePostOptions, PlannerPlatform } from './planner-platforms';
import type {
  OrganicCalendarDraft,
  OrganicCalendarPostedContent,
  OrganicPlatformTag,
  OrganicSeedDragPayload,
} from './types';

type PlannerCellProps = {
  dayId: string;
  platform: PlannerPlatform;
  drafts: OrganicCalendarDraft[];
  postedContent: OrganicCalendarPostedContent[];
  selectedDraftId: string | null;
  selectedDraftIdSet: ReadonlySet<string>;
  showGhosts: boolean;
  compact?: boolean;
  isLastColumn: boolean;
  isLastRow: boolean;
  isToday?: boolean;
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

export const PlannerCell = React.memo(function PlannerCell({
  dayId,
  platform,
  drafts,
  postedContent,
  selectedDraftId,
  selectedDraftIdSet,
  showGhosts,
  compact = false,
  isLastColumn,
  isLastRow,
  isToday = false,
  onSelectDraft,
  onToggleSelection,
  onRegenerate,
  onClearFailure,
  onEnrich,
  onRealize,
  onStitch,
  onNativeDrop,
  onCreatePost,
}: PlannerCellProps) {
  const isComingSoon = Boolean(platform.comingSoon);
  const canCreate = platform.canCreate && !isComingSoon;
  const droppableId = `planner-cell::${dayId}::${platform.key}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: {
      type: 'planner-cell',
      dayId,
      platform: platform.key,
    },
    disabled: !canCreate,
  });

  const ghosts = useCalendarStore((state) => (showGhosts ? state.ghosts[dayId] || 0 : 0));
  const focusedDayId = useCalendarStore((state) => state.focusedDayId);
  const setFocusedDayId = useCalendarStore((state) => state.setFocusedDayId);
  const isFocusedDay = focusedDayId === dayId;

  const timelineItems = React.useMemo(
    () =>
      [
        ...drafts.map((draft) => ({ kind: 'draft' as const, item: draft })),
        ...postedContent.map((post) => ({ kind: 'posted' as const, item: post })),
      ].sort((a, b) => {
        const timeA = parseTimeLabelToMinutes(a.item.timeLabel) ?? 0;
        const timeB = parseTimeLabelToMinutes(b.item.timeLabel) ?? 0;
        return timeA - timeB;
      }),
    [drafts, postedContent],
  );
  // Grid rows size to their tallest cell, so an empty cell only has to be tall enough to
  // be a drop target. A whole row of them (a connected channel with nothing planned this
  // week) then collapses instead of claiming a post's worth of height seven times over.
  const isEmptyCell = timelineItems.length === 0 && ghosts === 0;

  const handleNativeDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const rawData = event.dataTransfer.getData('application/json');
    if (!rawData || !onNativeDrop) return;

    try {
      const data = JSON.parse(rawData) as OrganicSeedDragPayload;
      if (canCreate) {
        onNativeDrop(dayId, '09:00', data, platform.key as OrganicPlatformTag);
      }
    } catch (error) {
      console.error('Failed to parse dropped trend payload', error);
    }
  };

  const cellSurface = (
    // Clicking the cell focuses its day so a context-free "+" targets it. Focus is a
    // pointer shortcut only: the cell's own "+" button already carries this dayId, so
    // keyboard users reach the same outcome without an extra tab stop here.
    // biome-ignore lint/a11y/noStaticElementInteractions: day-focus + drop surface, not a control
    // biome-ignore lint/a11y/useKeyWithClickEvents: pointer-only shortcut; the cell's "+" button is the keyboard path
    <div
      ref={setNodeRef}
      data-planner-cell={droppableId}
      onClick={() => setFocusedDayId(dayId)}
      className={cn(
        'group relative align-top',
        compact
          ? 'min-h-[clamp(2.5rem,5dvh,5rem)] px-[var(--app-shell-pad-inline-tight)] py-[var(--app-shell-pad-block)]'
          : cn(
              'px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]',
              isEmptyCell ? 'min-h-[clamp(3.5rem,7dvh,6rem)]' : 'min-h-[clamp(7rem,16dvh,14rem)]',
            ),
        'border-r border-b border-border/50',
        !isLastColumn && 'border-r',
        isLastColumn && 'border-r-0',
        isLastRow && 'border-b-0',
        isOver && canCreate && 'bg-primary/10',
        isToday && 'bg-primary/[0.03]',
        isFocusedDay && 'bg-primary/[0.06] ring-1 ring-inset ring-primary/40',
      )}
      onDragOver={(event) => {
        if (canCreate && event.dataTransfer.types.includes('application/json')) {
          event.preventDefault();
        }
      }}
      onDrop={handleNativeDrop}
    >
      <div
        className={cn(
          'relative z-10 flex flex-col gap-2',
          !compact && !isComingSoon && 'max-h-[clamp(180px,32dvh,460px)] overflow-y-auto pr-1',
        )}
      >
        {timelineItems.map(({ kind, item }) =>
          kind === 'draft' ? (
            <DraggableDraftCard
              key={`draft-${item.id}`}
              draft={item}
              isSelected={item.id === selectedDraftId}
              isMultiSelected={selectedDraftIdSet.has(item.id)}
              onSelect={onSelectDraft}
              onToggleSelection={onToggleSelection}
              onRegenerate={onRegenerate}
              onClearFailure={onClearFailure}
              onEnrich={onEnrich}
              onRealize={onRealize}
              onStitch={onStitch}
            />
          ) : (
            <PostedContentQuickLook key={`posted-${item.id}`} post={item} compact={compact} />
          ),
        )}

        {Array.from({ length: ghosts }).map((_, index) => (
          <Skeleton
            key={`ghost-${dayId}-${platform.key}-${index}`}
            className="h-16 border border-dashed border-border bg-muted/70"
          />
        ))}

        {isComingSoon ? (
          <div
            className={cn(
              'flex w-full items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/40 font-semibold uppercase tracking-wide text-muted-foreground',
              compact ? 'h-8 text-3xs' : 'h-16 text-xs',
            )}
          >
            Soon
          </div>
        ) : canCreate ? (
          <AddPostMenu dayId={dayId} platformKey={platform.key} onCreatePost={onCreatePost}>
            <Button
              type="button"
              variant="outline"
              size={isEmptyCell ? 'sm' : 'icon-sm'}
              className={cn(
                'mx-auto transition-opacity duration-150',
                isEmptyCell
                  ? 'w-full border-dashed text-muted-foreground'
                  : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
              )}
              aria-label={`Add post for ${dayId} ${platform.label}`}
            >
              <Plus data-icon={isEmptyCell ? 'inline-start' : undefined} />
              {isEmptyCell ? 'Create' : null}
            </Button>
          </AddPostMenu>
        ) : null}
      </div>
    </div>
  );

  if (!canCreate) return cellSurface;

  // Right-click anywhere on the cell offers the same create actions as its "+"
  // menu, preset to this day and platform. Read-only and coming-soon cells stay inert.
  return (
    <AddPostContextMenu
      dayId={dayId}
      platformKey={platform.key}
      platformLabel={platform.label}
      onCreatePost={onCreatePost}
    >
      {cellSurface}
    </AddPostContextMenu>
  );
});
