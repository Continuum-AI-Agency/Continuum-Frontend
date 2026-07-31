'use client';

import { useDroppable } from '@dnd-kit/core';
import { LightningBoltIcon, Pencil1Icon, TrashIcon } from '@radix-ui/react-icons';
import { ChevronLeft, ChevronRight, GalleryHorizontalEnd, Plus } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { isCarouselMediaType } from '@/lib/organic/carousel';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { AddPostContextMenu } from './AddPostContextMenu';
import { AddPostMenu } from './AddPostMenu';
import { formatDayId } from './calendar-utils';
import { StatusDot } from './DraftCardBadges';
import { DraftHoverCardContent } from './DraftHoverCardContent';
import { draftStatusPresentation, statusFrameClasses } from './draft-card-styles';
import { PostedContentPreview } from './PostedContentQuickLook';
import type { CreatePostOptions, PlannerPlatform } from './planner-platforms';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCalendarPostedContent,
} from './types';
import { useDraftDragHandle } from './useDraftDragHandle';

const PLATFORM_CHIP_COLORS: Record<string, string> = {
  instagram: 'bg-pink-500/80 text-white',
  linkedin: 'bg-blue-600/80 text-white',
  facebook: 'bg-indigo-500/80 text-white',
  tiktok: 'bg-slate-900/80 text-white',
  youtube: 'bg-red-500/80 text-white',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type OrganicMonthlyCalendarProps = {
  days: OrganicCalendarDay[];
  monthAnchorDate: Date;
  platforms: PlannerPlatform[];
  postedContent: OrganicCalendarPostedContent[];
  selectedDraftId: string | null;
  /** The multi-selection, so a shift-click on a chip can extend it and a bulk drag can
      move the whole set — the same contract the week grid already honours. */
  selectedDraftIds?: string[];
  onSelectDraft: (id: string) => void;
  onToggleSelection?: (id: string) => void;
  onCreatePost: (options: CreatePostOptions) => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onRegenerate?: (draftId: string) => void;
  onDeleteDraft?: (draftId: string) => void;
};

function buildMonthGrid(weekStart: Date): Date[] {
  const month = weekStart.getMonth();
  const year = weekStart.getFullYear();

  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(firstDay);
  gridStart.setDate(1 - startOffset);

  const lastDay = new Date(year, month + 1, 0);
  const endOffset = 6 - lastDay.getDay();
  const totalDays = startOffset + lastDay.getDate() + endOffset;

  const cells: Date[] = [];
  for (let i = 0; i < totalDays; i++) {
    const cell = new Date(gridStart);
    cell.setDate(gridStart.getDate() + i);
    cells.push(cell);
  }
  return cells;
}

function DraftChip({
  draft,
  isSelected,
  isMultiSelected,
  onClick,
  onToggleSelection,
  onRegenerate,
  onDelete,
}: {
  draft: OrganicCalendarDraft;
  isSelected: boolean;
  isMultiSelected: boolean;
  onClick: () => void;
  onToggleSelection?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const platform = draft.platforms[0] ?? 'instagram';
  const beginEditingDraft = useCalendarStore((state) => state.beginEditingDraft);
  const { setNodeRef, listeners, attributes, isDragging, style } = useDraftDragHandle(draft.id);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const { label: statusLabel } = draftStatusPresentation(draft.status);

  // Drag start has to close an open preview, not merely refuse to open a new one: the
  // 272px card otherwise sits under the cursor for the whole drag.
  React.useEffect(() => {
    if (isDragging) setIsPreviewOpen(false);
  }, [isDragging]);

  return (
    <HoverCard
      open={isPreviewOpen}
      onOpenChange={(next) => {
        if (isDragging) return;
        setIsPreviewOpen(next);
      }}
      openDelay={300}
      closeDelay={100}
    >
      <ContextMenu>
        <HoverCardTrigger asChild>
          <ContextMenuTrigger asChild>
            <div
              ref={setNodeRef}
              style={style}
              className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
              {...listeners}
              {...attributes}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  // A drag ends in a click on the chip it started from. Un-guarded, every
                  // month-view drag also swapped the preview panel — which is exactly why
                  // the month grid felt like it had no drag and drop at all.
                  if (isDragging) return;
                  if (e.shiftKey && onToggleSelection) {
                    onToggleSelection(draft.id);
                    return;
                  }
                  onClick();
                }}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-2xs font-medium leading-tight transition-opacity hover:opacity-80',
                  statusFrameClasses(platform, draft.status, 'chip'),
                  isSelected && 'ring-1 ring-brand-primary ring-offset-1',
                  isMultiSelected && !isSelected && 'ring-1 ring-brand-primary/50',
                )}
                // The chip is coloured by PLATFORM, so without the dot and this title the
                // month grid was the one surface that named no status at all.
                title={`${statusLabel} · ${draft.title || 'Untitled'}`}
              >
                <StatusDot status={draft.status} />
                <span className="truncate">{draft.title || 'Untitled'}</span>
              </button>
            </div>
          </ContextMenuTrigger>
        </HoverCardTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onSelect={() => beginEditingDraft(draft.id)}>
            <Pencil1Icon className="mr-2 h-3.5 w-3.5" />
            Open in editor
          </ContextMenuItem>
          {onRegenerate && draft.status !== 'streaming' && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => onRegenerate(draft.id)}>
                <LightningBoltIcon className="mr-2 h-3.5 w-3.5" />
                {draft.status === 'failed' ? 'Retry generation' : 'Regenerate'}
              </ContextMenuItem>
            </>
          )}
          {onDelete && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDelete(draft.id)}
              >
                <TrashIcon className="mr-2 h-3.5 w-3.5" />
                Delete
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <HoverCardContent
        side="right"
        align="start"
        className="p-0 border-none bg-transparent shadow-none"
        avoidCollisions
      >
        <DraftHoverCardContent
          draft={draft}
          onRegenerate={onRegenerate ? () => onRegenerate(draft.id) : undefined}
        />
      </HoverCardContent>
    </HoverCard>
  );
}

function PostedContentChip({ post }: { post: OrganicCalendarPostedContent }) {
  const colorClass = PLATFORM_CHIP_COLORS[post.platform] ?? 'bg-emerald-600/80 text-white';
  const isCarousel = isCarouselMediaType(post.mediaType);

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full cursor-default items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-2xs font-medium leading-tight opacity-90 ring-0 transition-opacity hover:opacity-100',
            colorClass,
          )}
          title={isCarousel ? `Carousel · ${post.title}` : post.title}
        >
          <span className="shrink-0 text-3xs font-bold uppercase">{post.timeLabel}</span>
          {isCarousel ? (
            <GalleryHorizontalEnd className="size-2.5 shrink-0" aria-label="Carousel" />
          ) : null}
          <span className="truncate">{post.title}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="p-0 border-none bg-transparent shadow-none"
        avoidCollisions
      >
        <PostedContentPreview post={post} />
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * One month cell: the day's chips AND the drop target for a draft dragged onto that day.
 *
 * The droppable id reuses the week grid's grammar verbatim, minus the platform segment —
 * `parsePlannerCellId` already reads a platform-less id as "reschedule the day, leave the
 * channel alone", which is the right semantics here because a month cell spans platforms.
 */
function MonthDayCell({
  dayId,
  isCurrentMonth,
  isToday,
  isFocused,
  onFocusDay,
  children,
}: {
  dayId: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isFocused: boolean;
  onFocusDay: (dayId: string) => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `planner-cell::${dayId}`,
    data: { type: 'planner-cell', dayId },
  });

  return (
    // Clicking the cell (not a chip) focuses the day, so the toolbar "+" and the
    // right-click "New post" target it. DraftChip stops propagation. No keyboard handler
    // by design: this is a pointer shortcut to a target keyboard users reach directly —
    // every cell's own "+" already carries its dayId — so a key handler here would only
    // add a dead tab stop.
    // biome-ignore lint/a11y/noStaticElementInteractions: day-focus surface; the cell is a drop target, not a control
    // biome-ignore lint/a11y/useKeyWithClickEvents: pointer-only shortcut; the cell's "+" button is the keyboard path
    <div
      ref={setNodeRef}
      data-planner-cell={`planner-cell::${dayId}`}
      onClick={() => onFocusDay(dayId)}
      className={cn(
        'group relative border-b border-r border-border/30 p-1.5 last:border-r-0',
        !isCurrentMonth && 'opacity-40',
        isToday && 'bg-primary/[0.04]',
        isOver && 'bg-primary/10',
        isFocused && 'ring-2 ring-inset ring-primary/40',
      )}
    >
      {children}
    </div>
  );
}

export function OrganicMonthlyCalendar({
  days,
  monthAnchorDate,
  selectedDraftId,
  selectedDraftIds,
  onSelectDraft,
  onToggleSelection,
  onCreatePost,
  onPreviousMonth,
  onNextMonth,
  onRegenerate,
  onDeleteDraft,
  postedContent,
}: OrganicMonthlyCalendarProps) {
  const todayId = React.useMemo(() => formatDayId(new Date()), []);
  const selectedDraftIdSet = React.useMemo(
    () => new Set(selectedDraftIds ?? []),
    [selectedDraftIds],
  );
  const focusedDayId = useCalendarStore((state) => state.focusedDayId);
  const setFocusedDayId = useCalendarStore((state) => state.setFocusedDayId);

  const draftsByDayId = React.useMemo(() => {
    const map = new Map<string, OrganicCalendarDraft[]>();
    days.forEach((day) => {
      if (day.slots.length > 0) {
        map.set(day.id, day.slots);
      }
    });
    return map;
  }, [days]);

  const postedByDayId = React.useMemo(() => {
    const map = new Map<string, OrganicCalendarPostedContent[]>();
    postedContent.forEach((post) => {
      const items = map.get(post.dayId) ?? [];
      items.push(post);
      map.set(post.dayId, items);
    });
    map.forEach((items) => items.sort((a, b) => a.timestamp.localeCompare(b.timestamp)));
    return map;
  }, [postedContent]);

  const gridCells = React.useMemo(() => buildMonthGrid(monthAnchorDate), [monthAnchorDate]);

  const currentMonth = monthAnchorDate.getMonth();
  const currentYear = monthAnchorDate.getFullYear();
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(currentYear, currentMonth, 1),
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-card/50 p-2">
      <header className="mb-2 flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onPreviousMonth}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onNextMonth}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-7 border-b border-border/30 pb-1">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-1 text-center text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid grid-cols-7" style={{ gridAutoRows: 'minmax(108px, 1fr)' }}>
          {gridCells.map((date) => {
            const dayId = formatDayId(date);
            const isCurrentMonth = date.getMonth() === currentMonth;
            const isToday = dayId === todayId;
            const drafts = draftsByDayId.get(dayId) ?? [];
            const posts = postedByDayId.get(dayId) ?? [];
            const visibleDrafts = drafts.slice(0, Math.max(0, 5 - Math.min(posts.length, 3)));
            const visiblePosts = posts.slice(0, Math.max(1, 5 - visibleDrafts.length));
            const overflowCount =
              drafts.length + posts.length - visibleDrafts.length - visiblePosts.length;

            return (
              // Right-click on the cell offers the same create actions as its "+"
              // menu, preset to this day. No platformKey by design: the workspace
              // picks the brand's default platform (see the "+" note below).
              <AddPostContextMenu key={dayId} dayId={dayId} onCreatePost={onCreatePost}>
                <MonthDayCell
                  dayId={dayId}
                  isCurrentMonth={isCurrentMonth}
                  isToday={isToday}
                  isFocused={dayId === focusedDayId}
                  onFocusDay={setFocusedDayId}
                >
                  <div className="mb-1 flex items-center justify-between">
                    {isToday ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-2xs font-semibold text-primary-foreground">
                        {date.getDate()}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">
                        {date.getDate()}
                      </span>
                    )}
                    {/* No platformKey: the workspace picks the brand's default platform,
                      which a hardcoded "instagram" here would override. */}
                    <AddPostMenu dayId={dayId} onCreatePost={onCreatePost} align="start">
                      <button
                        type="button"
                        aria-label="Add post"
                        className="flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                      >
                        <Plus className="size-3 text-muted-foreground" />
                      </button>
                    </AddPostMenu>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    {visibleDrafts.map((draft) => (
                      <DraftChip
                        key={draft.id}
                        draft={draft}
                        isSelected={draft.id === selectedDraftId}
                        isMultiSelected={selectedDraftIdSet.has(draft.id)}
                        onClick={() => onSelectDraft(draft.id)}
                        onToggleSelection={onToggleSelection}
                        onRegenerate={onRegenerate}
                        onDelete={onDeleteDraft}
                      />
                    ))}
                    {visiblePosts.map((post) => (
                      <PostedContentChip key={post.id} post={post} />
                    ))}
                    {overflowCount > 0 && (
                      <span className="pl-1 text-3xs text-muted-foreground/70">
                        +{overflowCount} more
                      </span>
                    )}
                  </div>
                </MonthDayCell>
              </AddPostContextMenu>
            );
          })}
        </div>
      </div>
    </div>
  );
}
