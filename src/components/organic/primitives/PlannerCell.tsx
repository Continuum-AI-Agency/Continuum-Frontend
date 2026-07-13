import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { AddPostContextMenu } from './AddPostContextMenu';
import { AddPostMenu } from './AddPostMenu';
import { DraggableDraftCard } from './DraggableDraftCard';
import type { CreatePostOptions, PlannerPlatform } from './planner-platforms';
import type { OrganicCalendarDraft, OrganicPlatformTag, OrganicSeedDragPayload } from './types';

type PlannerCellProps = {
  dayId: string;
  platform: PlannerPlatform;
  drafts: OrganicCalendarDraft[];
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
  onNativeDrop,
  onCreatePost,
}: PlannerCellProps) {
  const isComingSoon = Boolean(platform.comingSoon);
  const droppableId = `planner-cell::${dayId}::${platform.key}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: {
      type: 'planner-cell',
      dayId,
      platform: platform.key,
    },
    disabled: isComingSoon,
  });

  const ghosts = useCalendarStore((state) => (showGhosts ? state.ghosts[dayId] || 0 : 0));
  const focusedDayId = useCalendarStore((state) => state.focusedDayId);
  const setFocusedDayId = useCalendarStore((state) => state.setFocusedDayId);
  const isFocusedDay = focusedDayId === dayId;

  const visibleDrafts = drafts;

  const handleNativeDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const rawData = event.dataTransfer.getData('application/json');
    if (!rawData || !onNativeDrop) return;

    try {
      const data = JSON.parse(rawData) as OrganicSeedDragPayload;
      if (!isComingSoon) {
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
      onClick={() => setFocusedDayId(dayId)}
      className={cn(
        'group relative align-top',
        compact
          ? 'min-h-[clamp(40px,5dvh,80px)] px-[var(--app-shell-pad-inline-tight)] py-[var(--app-shell-pad-block)]'
          : 'min-h-[clamp(96px,15dvh,220px)] px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]',
        'border-r border-b border-border/50',
        !isLastColumn && 'border-r',
        isLastColumn && 'border-r-0',
        isLastRow && 'border-b-0',
        isOver && !isComingSoon && 'bg-primary/10',
        isToday && 'bg-primary/[0.03]',
        isFocusedDay && 'bg-primary/[0.06] ring-1 ring-inset ring-primary/40',
      )}
      onDragOver={(event) => {
        if (!isComingSoon && event.dataTransfer.types.includes('application/json')) {
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
        {visibleDrafts.map((draft) => (
          <DraggableDraftCard
            key={draft.id}
            draft={draft}
            isSelected={draft.id === selectedDraftId}
            isMultiSelected={selectedDraftIdSet.has(draft.id)}
            onSelect={onSelectDraft}
            onToggleSelection={onToggleSelection}
            onRegenerate={onRegenerate}
            onClearFailure={onClearFailure}
            onEnrich={onEnrich}
            onRealize={onRealize}
          />
        ))}

        {Array.from({ length: ghosts }).map((_, index) => (
          <div
            key={`ghost-${dayId}-${platform.key}-${index}`}
            className="h-16 animate-pulse rounded-lg border border-dashed border-border bg-muted/40"
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
        ) : (
          <AddPostMenu dayId={dayId} platformKey={platform.key} onCreatePost={onCreatePost}>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className={cn(
                'mx-auto opacity-0 group-hover:opacity-100 transition-opacity duration-150',
                compact ? 'h-6 w-6' : 'h-7 w-7',
              )}
              aria-label={`Add post for ${dayId} ${platform.label}`}
            >
              <Plus className="size-3.5" />
            </Button>
          </AddPostMenu>
        )}
      </div>
    </div>
  );

  if (isComingSoon) return cellSurface;

  // Right-click anywhere on the cell offers the same create actions as its "+"
  // menu, preset to this day and platform. Coming-soon cells stay inert.
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
