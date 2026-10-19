import { useDroppable } from '@dnd-kit/core';
import { GalleryHorizontalEnd, Plus } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isCarouselMediaType } from '@/lib/organic/carousel';
import { postPlatformLabel } from '@/lib/organic/postPlatforms';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { AddPostContextMenu } from './AddPostContextMenu';
import { AddPostMenu } from './AddPostMenu';
import { parseTimeLabelToMinutes } from './calendar-utils';
import { DraggableDraftCard } from './DraggableDraftCard';
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
  /** The open published post, only when this cell holds it, so opening one re-renders one cell. */
  selectedPostId?: string | null;
  showGhosts: boolean;
  compact?: boolean;
  isLastColumn: boolean;
  isLastRow: boolean;
  isToday?: boolean;
  /** Why a read-only channel cannot be scheduled here. Rendered once per row, in its
      first empty cell, so the row is not just seven blanks. */
  readOnlyNotice?: string;
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

/** The planner's Metrics tab for a post, when the post carries the ids it needs. */
export function metricsPostHref(post: OrganicCalendarPostedContent): string | null {
  if (!post.integrationAccountId || !post.externalPostId) return null;
  return `?${new URLSearchParams({
    tab: 'metrics',
    platform: post.platform,
    accountId: post.integrationAccountId,
    postId: post.externalPostId,
  })}`;
}

// A published post opens in the preview panel, the path the month chip takes. It used to
// open a popover beside the cell, a second preview with its own geometry and no way back to
// the chip from the keyboard.
const PostedCellChip = React.memo(function PostedCellChip({
  post,
  isSelected,
  onSelectPost,
}: {
  post: OrganicCalendarPostedContent;
  isSelected: boolean;
  onSelectPost: (post: OrganicCalendarPostedContent, metricsHref: string | null) => void;
}) {
  const isCarousel = isCarouselMediaType(post.mediaType);
  return (
    <button
      type="button"
      data-post-id={post.id}
      aria-pressed={isSelected}
      // Opens with the visible "Posted", so a voice user can say what they see.
      aria-label={`${post.timeLabel} Posted on ${postPlatformLabel(post.platform)}: ${post.title}`}
      onClick={() => onSelectPost(post, metricsPostHref(post))}
      className={cn(
        'flex w-full min-w-0 flex-col gap-0.5 rounded-md border border-border/70 bg-muted/45 px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        isSelected && 'outline-2! outline-offset-1 outline-primary!',
      )}
    >
      {/* The badge wraps under the time in a narrow column rather than being clipped. */}
      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="shrink-0 whitespace-nowrap text-2xs font-bold uppercase tracking-wider tabular-nums text-muted-foreground/70">
          {post.timeLabel}
        </span>
        <Badge variant="success" className="px-1.5 py-0 text-3xs">
          Posted
        </Badge>
        {isCarousel ? <GalleryHorizontalEnd aria-hidden className="size-3 shrink-0" /> : null}
      </span>
      <span className="truncate text-foreground" title={post.title}>
        {post.title}
      </span>
    </button>
  );
});

export const PlannerCell = React.memo(function PlannerCell({
  dayId,
  platform,
  drafts,
  postedContent,
  selectedDraftId,
  selectedDraftIdSet,
  selectedPostId = null,
  showGhosts,
  compact = false,
  isLastColumn,
  isLastRow,
  isToday = false,
  readOnlyNotice,
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
  // A boolean, so moving the focus re-renders only the cells of the day it leaves and the
  // day it enters, not the week.
  const isFocusedDay = useCalendarStore((state) => state.focusedDayId === dayId);
  const setFocusedDayId = useCalendarStore((state) => state.setFocusedDayId);

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
        // `isolate`: the cards' z-10 and the corner "+"'s z-20 stay inside the cell, under the
        // sticky platform rail and day headers when the week scrolls beneath them.
        'group relative isolate align-top',
        compact
          ? 'min-h-[clamp(2.5rem,5dvh,5rem)] px-[var(--app-shell-pad-inline-tight)] py-[var(--app-shell-pad-block)]'
          : cn(
              // A filled cell is as tall as its cards: a 16dvh floor made a row of one-card
              // cells ~230px, so five platforms could never fit a 900px screen. The extra
              // bottom padding is the corner "+"'s lane, so it never sits on a card.
              'px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)] @max-[66rem]/planner-matrix:px-1',
              isEmptyCell ? 'min-h-[clamp(3.5rem,7dvh,6rem)]' : canCreate && 'pb-6',
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
            <PostedCellChip
              key={`posted-${item.id}`}
              post={item}
              isSelected={item.id === selectedPostId}
              onSelectPost={onSelectPost}
            />
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
        ) : canCreate && isEmptyCell ? (
          <AddPostMenu dayId={dayId} platformKey={platform.key} onCreatePost={onCreatePost}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mx-auto w-full border-dashed text-muted-foreground"
              aria-label={`Add post for ${dayId} ${platform.label}`}
            >
              <Plus data-icon="inline-start" />
              Create
            </Button>
          </AddPostMenu>
        ) : readOnlyNotice && isEmptyCell ? (
          <p className="text-2xs leading-snug text-muted-foreground opacity-80">{readOnlyNotice}</p>
        ) : null}
      </div>
      {canCreate && !isEmptyCell ? (
        // Every creatable cell keeps a create affordance with the same name. In a filled
        // cell it is a corner "+", not a full-width row under the cards: that row cost
        // every filled week row ~40px. Dimmed, never hidden — an `opacity-0` button read
        // as day-of-week conditional.
        <AddPostMenu dayId={dayId} platformKey={platform.key} onCreatePost={onCreatePost}>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            className="absolute right-1 bottom-0 z-20 size-6 rounded-full border-dashed bg-background text-muted-foreground opacity-80 transition-opacity duration-150 hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
            aria-label={`Add post for ${dayId} ${platform.label}`}
          >
            <Plus />
          </Button>
        </AddPostMenu>
      ) : null}
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
