'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  ChevronLeft,
  ChevronRight,
  GalleryHorizontalEnd,
  Pencil,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { isCarouselMediaType } from '@/lib/organic/carousel';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { EMPTY_SELECTION, selectionWithin } from '../hooks/useCalendarSelection';
import { AddPostContextMenu } from './AddPostContextMenu';
import { AddPostMenu } from './AddPostMenu';
import { formatDayId } from './calendar-utils';
import { CardTargets, StatusDot } from './DraftCardBadges';
import { DraftHoverCardContent } from './DraftHoverCardContent';
import { draftStatusPresentation, statusFrameClasses } from './draft-card-styles';
import { metricsPostHref } from './PlannerCell';
import { PostedContentPreview } from './PostedContentQuickLook';
import type { CreatePostOptions, PlannerPlatform } from './planner-platforms';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCalendarPostedContent,
} from './types';
import { useDraftDragHandle } from './useDraftDragHandle';

// Solid, and never `text-white` / `bg-slate-900`: the light theme remaps both (globals.css),
// which put foreground-navy text on a pink chip and turned the TikTok chip into a card.
const PLATFORM_CHIP_COLORS: Record<string, string> = {
  instagram: 'bg-pink-700 text-neutral-50',
  linkedin: 'bg-blue-700 text-neutral-50',
  facebook: 'bg-indigo-600 text-neutral-50',
  tiktok: 'bg-neutral-900 text-neutral-50',
  youtube: 'bg-red-700 text-neutral-50',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type OrganicMonthlyCalendarProps = {
  days: OrganicCalendarDay[];
  monthAnchorDate: Date;
  todayId?: string;
  platforms: PlannerPlatform[];
  postedContent: OrganicCalendarPostedContent[];
  /** Names the account in the published post's hover preview. */
  brandName?: string;
  selectedDraftId: string | null;
  /** The multi-selection, so a shift-click on a chip can extend it and a bulk drag can
      move the whole set — the same contract the week grid already honours. */
  selectedDraftIds?: string[];
  /** The published post open in the preview, if any; its chip reads as pressed. */
  selectedPostId?: string | null;
  onSelectDraft: (id: string) => void;
  onSelectPost: (post: OrganicCalendarPostedContent, metricsHref: string | null) => void;
  onToggleSelection?: (id: string) => void;
  onCreatePost: (options: CreatePostOptions) => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
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

const DraftChip = React.memo(function DraftChip({
  draft,
  isSelected,
  isMultiSelected,
  onSelect,
  onToggleSelection,
  onRegenerate,
  onDelete,
}: {
  draft: OrganicCalendarDraft;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: (id: string) => void;
  onToggleSelection?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const platform = draft.platforms[0] ?? 'instagram';
  const beginEditingDraft = useCalendarStore((state) => state.beginEditingDraft);
  const { setNodeRef, listeners, setActivatorNodeRef, activatorAttributes, isDragging, style } =
    useDraftDragHandle(draft.id);
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
        <HoverCardTrigger
          render={
            <ContextMenuTrigger
              render={
                // The wrapper is what moves; the button is the one tab stop and the drag
                // activator (see useDraftDragHandle).
                <div
                  ref={setNodeRef}
                  style={style}
                  className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
                  {...listeners}
                >
                  <button
                    type="button"
                    ref={setActivatorNodeRef}
                    {...activatorAttributes}
                    data-draft-id={draft.id}
                    data-draft-card=""
                    data-group-id={draft.groupId ?? undefined}
                    data-backend-draft-id={draft.backendDraftId}
                    aria-pressed={isSelected || isMultiSelected}
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
                      onSelect(draft.id);
                    }}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-xs font-medium leading-tight transition-opacity hover:opacity-80',
                      statusFrameClasses(platform, draft.status, 'chip'),
                      // `primary`: Tailwind emits no `*-brand-primary` utilities (the token is
                      // declared in :root, not @theme), so these rings drew in currentColor.
                      isSelected && 'ring-1 ring-primary ring-offset-1',
                      isMultiSelected && !isSelected && 'ring-1 ring-primary/50',
                    )}
                    // The chip is coloured by PLATFORM, so without the dot and this title the
                    // month grid was the one surface that named no status at all.
                    title={`${statusLabel} · ${draft.title || 'Untitled'}`}
                  >
                    <StatusDot status={draft.status} />
                    <span className="min-w-0 flex-1 truncate">{draft.title || 'Untitled'}</span>
                    <CardTargets draft={draft} className="max-w-[50%] text-3xs font-normal" />
                  </button>
                </div>
              }
            />
          }
        />
        <ContextMenuContent className="w-48">
          <ContextMenuItem onSelect={() => beginEditingDraft(draft.id)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Open in editor
          </ContextMenuItem>
          {onRegenerate && draft.status !== 'streaming' && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => onRegenerate(draft.id)}>
                <Zap className="mr-2 h-3.5 w-3.5" />
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
                <Trash2 className="mr-2 h-3.5 w-3.5" />
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
      >
        <DraftHoverCardContent draft={draft} />
      </HoverCardContent>
    </HoverCard>
  );
});

const PostedContentChip = React.memo(function PostedContentChip({
  post,
  brandName,
  isSelected,
  onSelect,
}: {
  post: OrganicCalendarPostedContent;
  brandName?: string;
  isSelected: boolean;
  onSelect: (post: OrganicCalendarPostedContent, metricsHref: string | null) => void;
}) {
  const colorClass = PLATFORM_CHIP_COLORS[post.platform] ?? 'bg-emerald-700 text-neutral-50';
  const isCarousel = isCarouselMediaType(post.mediaType);
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const metricsHref = metricsPostHref(post);
  // Stable, so the memoised preview inside the hover card does not re-render on every open.
  const viewMetrics = React.useCallback(() => {
    if (metricsHref) router.push(metricsHref);
  }, [metricsHref, router]);

  return (
    <HoverCard open={previewOpen} onOpenChange={setPreviewOpen} openDelay={300} closeDelay={100}>
      <HoverCardTrigger
        render={
          <button
            type="button"
            data-post-id={post.id}
            aria-pressed={isSelected}
            className={cn(
              'flex w-full cursor-pointer items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-xs font-medium leading-tight opacity-90 ring-0 transition-opacity hover:opacity-100',
              colorClass,
              isSelected && 'outline-2! outline-offset-1 outline-primary!',
            )}
            onClick={(event) => {
              event.stopPropagation();
              setPreviewOpen(false);
              onSelect(post, metricsHref);
            }}
            title={isCarousel ? `Carousel · ${post.title}` : post.title}
          >
            <span className="shrink-0 text-2xs font-bold uppercase">{post.timeLabel}</span>
            {isCarousel ? (
              <GalleryHorizontalEnd className="size-2.5 shrink-0" aria-label="Carousel" />
            ) : null}
            <span className="truncate">{post.title}</span>
          </button>
        }
      />
      <HoverCardContent
        side="right"
        align="start"
        className="p-0 border-none bg-transparent shadow-none"
      >
        <PostedContentPreview
          post={post}
          brandName={brandName}
          onViewMetrics={metricsHref ? viewMetrics : undefined}
        />
      </HoverCardContent>
    </HoverCard>
  );
});

const EMPTY_DRAFTS: OrganicCalendarDraft[] = [];
const EMPTY_POSTS: OrganicCalendarPostedContent[] = [];

type MonthDayCellProps = {
  dayId: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isFocused: boolean;
  drafts: OrganicCalendarDraft[];
  posts: OrganicCalendarPostedContent[];
  brandName?: string;
  /** Only when the selected draft is in this day, so a click re-renders two cells, not 35. */
  selectedDraftId: string | null;
  selectedDraftIdSet: ReadonlySet<string>;
  /** Only when the opened published post is in this day, for the same reason. */
  selectedPostId: string | null;
  onFocusDay: (dayId: string) => void;
  onOpenDay: (dayId: string) => void;
  onCreatePost: (options: CreatePostOptions) => void;
  onSelectDraft: (id: string) => void;
  onSelectPost: (post: OrganicCalendarPostedContent, metricsHref: string | null) => void;
  onToggleSelection?: (id: string) => void;
  onRegenerate?: (draftId: string) => void;
  onDeleteDraft?: (draftId: string) => void;
};

/**
 * One month cell: the day's chips AND the drop target for a draft dragged onto that day.
 *
 * The droppable id reuses the week grid's grammar verbatim, minus the platform segment —
 * `parsePlannerCellId` already reads a platform-less id as "reschedule the day, leave the
 * channel alone", which is the right semantics here because a month cell spans platforms.
 *
 * Memoised on primitive and stable props, never JSX children: each cell mounts a context
 * menu and a "+" menu, and re-rendering all of them was ~1.3k component renders per click.
 */
const MonthDayCell = React.memo(function MonthDayCell({
  dayId,
  dayOfMonth,
  isCurrentMonth,
  isToday,
  isFocused,
  drafts,
  posts,
  brandName,
  selectedDraftId,
  selectedDraftIdSet,
  selectedPostId,
  onFocusDay,
  onOpenDay,
  onCreatePost,
  onSelectDraft,
  onSelectPost,
  onToggleSelection,
  onRegenerate,
  onDeleteDraft,
}: MonthDayCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `planner-cell::${dayId}`,
    data: { type: 'planner-cell', dayId },
  });
  const visibleDrafts = drafts.slice(0, Math.max(0, 3 - Math.min(posts.length, 2)));
  const visiblePosts = posts.slice(0, Math.max(1, 3 - visibleDrafts.length));
  const overflowCount = drafts.length + posts.length - visibleDrafts.length - visiblePosts.length;

  const cell = (
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
      <div className="mb-1 flex items-center justify-between">
        {isToday ? (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-2xs font-semibold text-primary-foreground">
            {dayOfMonth}
          </span>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">{dayOfMonth}</span>
        )}
        {/* No platformKey: the workspace picks the brand's default platform,
            which a hardcoded "instagram" here would override. */}
        <AddPostMenu dayId={dayId} onCreatePost={onCreatePost} align="start">
          <button
            type="button"
            aria-label="Add post"
            className="flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
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
            onSelect={onSelectDraft}
            onToggleSelection={onToggleSelection}
            onRegenerate={onRegenerate}
            onDelete={onDeleteDraft}
          />
        ))}
        {visiblePosts.map((post) => (
          <PostedContentChip
            key={post.id}
            post={post}
            brandName={brandName}
            isSelected={post.id === selectedPostId}
            onSelect={onSelectPost}
          />
        ))}
        {overflowCount > 0 && (
          <button
            type="button"
            data-day-overflow={dayId}
            className="pl-1 text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
            aria-label={`Show all ${drafts.length + posts.length} posts for ${dayId}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenDay(dayId);
            }}
          >
            +{overflowCount} more
          </button>
        )}
      </div>
    </div>
  );

  // Right-click on the cell offers the same create actions as its "+" menu, preset to this
  // day. No platformKey by design: the workspace picks the brand's default platform (see
  // the "+" note above).
  return (
    <AddPostContextMenu dayId={dayId} onCreatePost={onCreatePost}>
      {cell}
    </AddPostContextMenu>
  );
});

export function OrganicMonthlyCalendar({
  days,
  monthAnchorDate,
  todayId: brandTodayId,
  selectedDraftId,
  selectedDraftIds,
  selectedPostId = null,
  onSelectDraft,
  onSelectPost,
  onToggleSelection,
  onCreatePost,
  onPreviousMonth,
  onNextMonth,
  onToday,
  onRegenerate,
  onDeleteDraft,
  postedContent,
  brandName,
}: OrganicMonthlyCalendarProps) {
  const todayId = brandTodayId ?? formatDayId(new Date());
  const selectedDraftIdSet = React.useMemo(
    () => (selectedDraftIds?.length ? new Set(selectedDraftIds) : EMPTY_SELECTION),
    [selectedDraftIds],
  );
  const focusedDayId = useCalendarStore((state) => state.focusedDayId);
  const setFocusedDayId = useCalendarStore((state) => state.setFocusedDayId);
  const [openDayId, setOpenDayId] = React.useState<string | null>(null);
  const handleOpenDay = React.useCallback(
    (dayId: string) => {
      setFocusedDayId(dayId);
      setOpenDayId(dayId);
    },
    [setFocusedDayId],
  );

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
          <Button type="button" variant="outline" size="sm" onClick={onToday}>
            Today
          </Button>
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

      <div data-planner-scroller="month" className="min-h-0 flex-1 overflow-auto">
        {/* min-h-full gives the 1fr rows a definite height to share, so five or six weeks
            fill the region instead of stopping at 108px each over a dead band. */}
        <div
          data-planner-content="month"
          className="grid min-h-full grid-cols-7"
          style={{ gridAutoRows: 'minmax(108px, 1fr)' }}
        >
          {gridCells.map((date) => {
            const dayId = formatDayId(date);
            const drafts = draftsByDayId.get(dayId) ?? EMPTY_DRAFTS;
            const posts = postedByDayId.get(dayId) ?? EMPTY_POSTS;
            const daySelection = selectionWithin(drafts, selectedDraftId, selectedDraftIdSet);

            return (
              <MonthDayCell
                key={dayId}
                dayId={dayId}
                dayOfMonth={date.getDate()}
                isCurrentMonth={date.getMonth() === currentMonth}
                isToday={dayId === todayId}
                isFocused={dayId === focusedDayId}
                drafts={drafts}
                posts={posts}
                brandName={brandName}
                selectedDraftId={daySelection.selectedDraftId}
                selectedDraftIdSet={daySelection.selectedDraftIdSet}
                selectedPostId={
                  posts.some((post) => post.id === selectedPostId) ? selectedPostId : null
                }
                onFocusDay={setFocusedDayId}
                onOpenDay={handleOpenDay}
                onCreatePost={onCreatePost}
                onSelectDraft={onSelectDraft}
                onSelectPost={onSelectPost}
                onToggleSelection={onToggleSelection}
                onRegenerate={onRegenerate}
                onDeleteDraft={onDeleteDraft}
              />
            );
          })}
        </div>
      </div>
      <Dialog open={openDayId !== null} onOpenChange={(open) => !open && setOpenDayId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {openDayId
                ? new Date(`${openDayId}T12:00:00`).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Posts'}
            </DialogTitle>
            <DialogDescription>All planned and published posts for this day.</DialogDescription>
          </DialogHeader>
          {openDayId && (
            <div className="flex flex-col gap-2">
              {(draftsByDayId.get(openDayId) ?? []).map((draft) => (
                <Button
                  key={draft.id}
                  type="button"
                  variant="outline"
                  className="h-auto min-w-0 justify-start gap-2 py-2 text-left"
                  onClick={() => {
                    onSelectDraft(draft.id);
                    setOpenDayId(null);
                  }}
                >
                  <span className="shrink-0 text-xs text-muted-foreground">{draft.timeLabel}</span>
                  <span className="min-w-0 flex-1 whitespace-normal break-words text-sm">
                    {draft.title || 'Untitled'}
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-2xs">
                    {draftStatusPresentation(draft.status).label}
                  </span>
                </Button>
              ))}
              {(postedByDayId.get(openDayId) ?? []).map((post) => (
                <Button
                  key={post.id}
                  type="button"
                  variant="outline"
                  className="h-auto min-w-0 justify-start gap-2 py-2 text-left"
                  onClick={() => {
                    onSelectPost(post, metricsPostHref(post));
                    setOpenDayId(null);
                  }}
                >
                  <span className="shrink-0 text-xs text-muted-foreground">{post.timeLabel}</span>
                  <span className="min-w-0 flex-1 whitespace-normal break-words text-sm">
                    {post.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-2xs">
                    Published
                  </span>
                </Button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
