'use client';
import { Check, ChevronDown, Pencil, Plus, Trash2, X, Zap } from 'lucide-react';

import * as React from 'react';
import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import { useDraftWithFreshMedia } from '@/components/organic/hooks/useDraftWithFreshMedia';
import { useUnscheduleDraft } from '@/components/organic/hooks/useUnscheduleDraft';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { UNSCHEDULED_DAY_ID } from './calendar-utils';
import { CardTargets, StatusBadge, useCardCaption } from './DraftCardBadges';
import { resolveDraftMedia } from './DraftCardMedia';
import { useDraftDeletionConfirmation } from './DraftDeletionConfirmation';
import { DraftHoverCardContent } from './DraftHoverCardContent';
import { statusFrameClasses } from './draft-card-styles';
import type { CreatePostMode, PlannerPlatform } from './planner-platforms';
import type { OrganicCalendarDay, OrganicCalendarDraft } from './types';

type OnCreatePost = (options: {
  dayId?: string;
  platformKey?: string;
  status?: 'draft' | 'scheduled' | 'placeholder';
  mode?: CreatePostMode;
}) => void;

type OrganicListViewProps = {
  days: OrganicCalendarDay[];
  platforms: PlannerPlatform[];
  selectedDraftId: string | null;
  selectedDraftIds: string[];
  onSelectDraft: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onRegenerate: (draftId: string) => void;
  onCreatePost: OnCreatePost;
  brandProfileId?: string;
  backlogDrafts: OrganicCalendarDraft[];
  onAddBacklogDraft: (draft: OrganicCalendarDraft) => void;
  onDeleteBacklogDraft: (draftId: string) => void;
  onPromoteBacklogDraft: (draftId: string, dayId: string, timeLabel: string) => void;
};

/** Provenance tag for drafts that belong to a bulk content plan. */
function PlannedBadge() {
  return (
    <span className="rounded px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide bg-blue-500/15 text-blue-600 dark:text-blue-400">
      Planned
    </span>
  );
}

/**
 * Keyboard activation for a clickable row. The row cannot be a `<button>` — it
 * contains its own controls (checkbox, delete) — so it announces itself as one
 * and answers Enter/Space instead. A draft row also reports whether it is selected.
 */
function rowActivationProps(onSelect: () => void, pressed?: boolean) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-pressed': pressed,
    onClick: onSelect,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onSelect();
    },
  };
}

/**
 * Row thumbnail. It routes through `ChatMediaThumb` because a video draft used to
 * be fed to a raw `<img>` by an image-only resolver and rendered as a blank square.
 */
function DraftRowThumbnail({ draft: persistedDraft }: { draft: OrganicCalendarDraft }) {
  // Re-signed on read: a row whose upload-time signed URL has expired resolves to
  // nothing and renders an empty square until the page is reloaded.
  const draft = useDraftWithFreshMedia(persistedDraft);
  const media = resolveDraftMedia(draft);
  return (
    <div
      data-testid="draft-row-thumbnail"
      className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-muted"
    >
      {media ? (
        <ChatMediaThumb
          media={{
            id: draft.id,
            url: media.url,
            thumbnailUrl: media.poster ?? undefined,
            kind: media.kind,
            name: draft.title,
          }}
          fallbackSeed={draft.title}
        />
      ) : null}
    </div>
  );
}

/**
 * The floating preview for a list row.
 *
 * `side="right"` anchored on a full-width row had no room beside it whenever the
 * post-preview panel was open, so floating-ui flipped it to `side="left"` — which
 * anchors at the row's left edge minus the card width, off the left of the screen
 * with no further fallback (`shift` only rescues the alignment axis, never the
 * side axis). Anchoring below with `align="start"` puts the overflow on the axis
 * `shift` can actually correct. The explicit width matches the card the content
 * renders, so the collision box is not 48px wider than what the user sees.
 */
function DraftRowHoverPreview({ draft }: { draft: OrganicCalendarDraft }) {
  return (
    <HoverCardContent
      side="bottom"
      align="start"
      sideOffset={4}
      collisionPadding={12}
      className="w-[208px] border-none bg-transparent p-0 shadow-none"
    >
      <DraftHoverCardContent draft={draft} />
    </HoverCardContent>
  );
}

const NOOP_DRAFT_ACTION = (_draftId: string) => undefined;

// Rows take id-based handlers shared by the whole list. Per-row closures were new on every
// render, so the memo never held and a selection re-rendered every row.
const DraftRow = React.memo(function DraftRow({
  draft,
  isSelected,
  isMultiSelected,
  onSelect,
  onToggle,
  onDelete,
  onRegenerate,
}: {
  draft: OrganicCalendarDraft;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: (draftId: string) => void;
  onToggle: (draftId: string) => void;
  onDelete: (draftId: string) => void;
  onRegenerate?: (draftId: string) => void;
}) {
  const framePlatform = draft.platforms[0] ?? 'instagram';
  const beginEditingDraft = useCalendarStore((state) => state.beginEditingDraft);
  const caption = useCardCaption(draft);

  return (
    <HoverCard openDelay={300} closeDelay={120}>
      <ContextMenu>
        <HoverCardTrigger
          render={
            <ContextMenuTrigger
              render={
                <div
                  className={cn(
                    'group flex cursor-pointer items-center gap-3 border-b border-border/40 px-4 py-2.5 transition-colors hover:bg-muted/40',
                    statusFrameClasses(framePlatform, draft.status, 'row'),
                    isSelected && 'bg-primary/[0.05]',
                  )}
                  data-draft-id={draft.id}
                  data-draft-card=""
                  data-group-id={draft.groupId ?? undefined}
                  data-backend-draft-id={draft.backendDraftId}
                  {...rowActivationProps(() => onSelect(draft.id), isSelected || isMultiSelected)}
                >
                  <Checkbox
                    checked={isMultiSelected}
                    aria-label={`Select ${draft.title || 'Untitled'}`}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => onToggle(draft.id)}
                    // Base UI marks a ticked box `data-checked`; `data-[state=checked]` never matched,
                    // so a selected row's tick hid until hover. Focus shows it too.
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-checked:opacity-100"
                  />

                  <DraftRowThumbnail draft={draft} />

                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <CardTargets
                      draft={draft}
                      className="max-w-[40%] shrink-0 text-xs text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {draft.title || 'Untitled'}
                    </span>
                    {caption && (
                      <span className="hidden min-w-0 max-w-xs truncate text-xs text-muted-foreground lg:block">
                        {caption}
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {draft.dateLabel && (
                      <span className="text-xs text-muted-foreground">{draft.dateLabel}</span>
                    )}
                    {draft.contentPlanId && <PlannedBadge />}
                    <StatusBadge status={draft.status} />
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(draft.id);
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
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
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => onDelete(draft.id)}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <DraftRowHoverPreview draft={draft} />
    </HoverCard>
  );
});

const BacklogRow = React.memo(function BacklogRow({
  draft,
  isSelected,
  onSelect,
  onDelete,
}: {
  draft: OrganicCalendarDraft;
  isSelected: boolean;
  onSelect: (draftId: string) => void;
  onDelete: (draftId: string) => void;
}) {
  const caption = useCardCaption(draft);
  return (
    <HoverCard openDelay={300} closeDelay={120}>
      <HoverCardTrigger
        render={
          <div
            className={cn(
              'group flex cursor-pointer items-center gap-3 border-b border-border/40 px-4 py-2.5 transition-colors hover:bg-muted/40',
              isSelected && 'bg-primary/[0.05]',
            )}
            data-draft-id={draft.id}
            data-draft-card=""
            data-group-id={draft.groupId ?? undefined}
            data-backend-draft-id={draft.backendDraftId}
            {...rowActivationProps(() => onSelect(draft.id), isSelected)}
          >
            <DraftRowThumbnail draft={draft} />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <CardTargets
                draft={draft}
                className="max-w-[40%] shrink-0 text-xs text-muted-foreground"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {draft.title || 'Untitled'}
              </span>
              {caption && (
                <span className="hidden min-w-0 max-w-xs truncate text-xs text-muted-foreground lg:block">
                  {caption}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-2xs uppercase tracking-wide text-muted-foreground/60">
                Backlog
              </span>
              <button
                type="button"
                aria-label="Remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(draft.id);
                }}
                className="flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>
        }
      />
      <DraftRowHoverPreview draft={draft} />
    </HoverCard>
  );
});

function QuickCreateRow({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState('');
  return (
    <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-4 py-2">
      <Input
        autoFocus
        aria-label="Post idea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Post idea..."
        className="h-7 flex-1 text-sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) onSubmit(value.trim());
          if (e.key === 'Escape') onCancel();
        }}
      />
      <Button
        type="button"
        size="sm"
        aria-label="Save post idea"
        className="h-7 px-2"
        disabled={!value.trim()}
        onClick={() => {
          if (value.trim()) onSubmit(value.trim());
        }}
      >
        <Check className="size-3" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={onCancel}>
        <X className="size-3" />
      </Button>
    </div>
  );
}

type GroupState = Record<string, boolean>;

export function OrganicListView({
  days,
  selectedDraftId,
  selectedDraftIds,
  onSelectDraft,
  onToggleSelection,
  onRegenerate,
  onCreatePost,
  backlogDrafts,
  onAddBacklogDraft,
  onDeleteBacklogDraft,
}: OrganicListViewProps) {
  const [collapsed, setCollapsed] = React.useState<GroupState>({});
  const [creating, setCreating] = React.useState<string | null>(null);
  const bulkDeleteDrafts = useCalendarStore((s) => s.bulkDeleteDrafts);
  const { requestDraftDeletion } = useDraftDeletionConfirmation();

  // Undated drafts (the "unscheduled" sentinel day) get their own group; the
  // status groups below cover only dated drafts so each draft appears once.
  const unscheduledDrafts = React.useMemo(
    () => days.find((day) => day.id === UNSCHEDULED_DAY_ID)?.slots ?? [],
    [days],
  );
  const allDrafts = React.useMemo(
    () => days.filter((day) => day.id !== UNSCHEDULED_DAY_ID).flatMap((day) => day.slots),
    [days],
  );

  const selectedIdSet = React.useMemo(() => new Set(selectedDraftIds), [selectedDraftIds]);

  const draftDrafts = React.useMemo(
    () =>
      allDrafts.filter(
        (d) =>
          d.status === 'draft' ||
          d.status === 'placeholder' ||
          d.status === 'streaming' ||
          d.status === 'failed',
      ),
    [allDrafts],
  );
  const scheduledDrafts = React.useMemo(
    () => allDrafts.filter((d) => d.status === 'scheduled'),
    [allDrafts],
  );
  const publishedDrafts = React.useMemo(
    () => allDrafts.filter((d) => d.status === 'published'),
    [allDrafts],
  );

  const toggleGroup = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleDeleteDraft = React.useCallback(
    (draftId: string) => requestDraftDeletion([draftId], bulkDeleteDrafts),
    [bulkDeleteDrafts, requestDraftDeletion],
  );
  const handleDeleteBacklogDraft = React.useCallback(
    (draftId: string) =>
      requestDraftDeletion([draftId], (ids) => ids.forEach(onDeleteBacklogDraft)),
    [onDeleteBacklogDraft, requestDraftDeletion],
  );
  // A scheduled row's remove sends it back to draft rather than deleting it, through the
  // backend, which is what cancels its publish. A store-only flip left the row scheduled and
  // the post still going out.
  const { unschedule } = useUnscheduleDraft();
  const handleUnscheduleDraft = React.useCallback(
    (draftId: string) => {
      const draft = scheduledDrafts.find((item) => item.id === draftId);
      if (draft) void unschedule(draft);
    },
    [scheduledDrafts, unschedule],
  );

  const handleCreateBacklog = (title: string) => {
    const backlogId = `backlog-${crypto.randomUUID()}`;
    const draft: OrganicCalendarDraft = {
      id: backlogId,
      // User-authored → browser-owned: stable clientKey + manual origin so the
      // autosave persists it (the allowlist writes only origin === 'manual').
      clientKey: backlogId,
      origin: 'manual',
      title,
      summary: '',
      timeLabel: '',
      dateLabel: '',
      status: 'draft',
      platforms: ['instagram'],
      format: 'Post',
      objective: 'Draft',
      captionPreview: '',
      tags: [],
      mediaCount: 1,
    };
    onAddBacklogDraft(draft);
    setCreating(null);
  };

  const groupData: Array<{
    key: string;
    label: string;
    count: number;
    colorClass: string;
    showAdd: boolean;
    content: React.ReactNode;
  }> = [
    {
      key: 'backlog',
      label: 'Backlog',
      count: backlogDrafts.length,
      colorClass: 'text-muted-foreground',
      showAdd: true,
      content: (
        <>
          {creating === 'backlog' && (
            <QuickCreateRow onSubmit={handleCreateBacklog} onCancel={() => setCreating(null)} />
          )}
          {backlogDrafts.map((draft) => (
            <BacklogRow
              key={draft.id}
              draft={draft}
              isSelected={draft.id === selectedDraftId}
              onSelect={onSelectDraft}
              onDelete={handleDeleteBacklogDraft}
            />
          ))}
          {backlogDrafts.length === 0 && creating !== 'backlog' && (
            <div className="px-4 py-3 text-xs text-muted-foreground/60">
              No backlog items. Add ideas here to schedule later.
            </div>
          )}
        </>
      ),
    },
    // Drafts with no scheduled date (agent/bulk rows that never got a slot). They
    // can't sit on a date grid, so the list is the only place they surface.
    ...(unscheduledDrafts.length > 0
      ? [
          {
            key: 'unscheduled',
            label: 'Unscheduled',
            count: unscheduledDrafts.length,
            colorClass: 'text-muted-foreground',
            showAdd: false,
            content: (
              <>
                {unscheduledDrafts.map((draft) => (
                  <DraftRow
                    key={draft.id}
                    draft={draft}
                    isSelected={draft.id === selectedDraftId}
                    isMultiSelected={selectedIdSet.has(draft.id)}
                    onSelect={onSelectDraft}
                    onToggle={onToggleSelection}
                    onDelete={handleDeleteDraft}
                    onRegenerate={onRegenerate}
                  />
                ))}
              </>
            ),
          },
        ]
      : []),
    {
      key: 'draft',
      label: 'Draft',
      count: draftDrafts.length,
      colorClass: 'text-amber-600 dark:text-amber-500',
      showAdd: true,
      content: (
        <>
          {creating === 'draft' && (
            <QuickCreateRow
              onSubmit={(_title) => {
                onCreatePost({ status: 'draft', mode: 'manual' });
                setCreating(null);
              }}
              onCancel={() => setCreating(null)}
            />
          )}
          {draftDrafts.map((draft) => (
            <DraftRow
              key={draft.id}
              draft={draft}
              isSelected={draft.id === selectedDraftId}
              isMultiSelected={selectedIdSet.has(draft.id)}
              onSelect={onSelectDraft}
              onToggle={onToggleSelection}
              onDelete={handleDeleteDraft}
              onRegenerate={onRegenerate}
            />
          ))}
          {draftDrafts.length === 0 && creating !== 'draft' && (
            <div className="px-4 py-3 text-xs text-muted-foreground/60">
              No drafts this week. Use the + button or generate content.
            </div>
          )}
        </>
      ),
    },
    {
      key: 'scheduled',
      label: 'Scheduled',
      count: scheduledDrafts.length,
      colorClass: 'text-emerald-600 dark:text-emerald-500',
      showAdd: false,
      content: (
        <>
          {scheduledDrafts.map((draft) => (
            <DraftRow
              key={draft.id}
              draft={draft}
              isSelected={draft.id === selectedDraftId}
              isMultiSelected={selectedIdSet.has(draft.id)}
              onSelect={onSelectDraft}
              onToggle={onToggleSelection}
              onDelete={handleUnscheduleDraft}
            />
          ))}
          {scheduledDrafts.length === 0 && (
            <div className="px-4 py-3 text-xs text-muted-foreground/60">
              No scheduled posts yet. Approve drafts to schedule them.
            </div>
          )}
        </>
      ),
    },
    {
      key: 'published',
      label: 'Published',
      count: publishedDrafts.length,
      colorClass: 'text-emerald-700 dark:text-emerald-600',
      showAdd: false,
      content: (
        <>
          {publishedDrafts.map((draft) => (
            <DraftRow
              key={draft.id}
              draft={draft}
              isSelected={draft.id === selectedDraftId}
              isMultiSelected={selectedIdSet.has(draft.id)}
              onSelect={onSelectDraft}
              onToggle={onToggleSelection}
              onDelete={NOOP_DRAFT_ACTION}
            />
          ))}
          {publishedDrafts.length === 0 && (
            <div className="px-4 py-3 text-xs text-muted-foreground/60">
              No published posts yet.
            </div>
          )}
        </>
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-card/50">
      {/* `min-h-0` is load-bearing: `flex-1` alone leaves `min-height: auto`, so the
          ScrollArea root grows to its intrinsic content height, the parent's
          `overflow-hidden` clips it, and the viewport never overflows — a list that
          renders every row but scrolls none of them. */}
      <ScrollArea data-planner-scroller="list" className="min-h-0 flex-1">
        <div data-planner-content="list">
          {groupData.map(({ key, label, count, colorClass, showAdd, content }) => (
            <div key={key} className="group/section">
              <div
                className="flex cursor-pointer select-none items-center justify-between border-b border-border/50 bg-muted/30 px-4 py-2"
                {...rowActivationProps(() => toggleGroup(key))}
              >
                <div className="flex items-center gap-2">
                  <ChevronDown
                    className={cn(
                      'size-3.5 text-muted-foreground transition-transform duration-150',
                      collapsed[key] && '-rotate-90',
                    )}
                  />
                  <span className={cn('text-xs font-semibold uppercase tracking-wide', colorClass)}>
                    {label}
                  </span>
                  <Badge variant="outline" className="h-4 px-1.5 text-2xs">
                    {count}
                  </Badge>
                </div>
                {showAdd && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Add ${label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreating(key);
                      setCollapsed((prev) => ({ ...prev, [key]: false }));
                    }}
                    className="h-6 w-6 cursor-pointer opacity-0 transition-opacity hover:opacity-100 group-hover/section:opacity-100 focus-visible:opacity-100"
                  >
                    <Plus className="size-3" />
                  </Button>
                )}
              </div>
              {!collapsed[key] && content}
            </div>
          ))}
          {/* BulkActionToolbar is `fixed bottom-8` and rendered outside the panel
            group, so it takes no layout space and covers the last rows. Scroll
            clearance is the list's job because the list is what scrolls. */}
          {selectedDraftIds.length > 0 ? (
            <div
              aria-hidden="true"
              data-testid="bulk-toolbar-clearance"
              className="h-24 shrink-0"
            />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
