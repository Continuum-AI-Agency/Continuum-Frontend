'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { postPlatformLabel } from '@/lib/organic/postPlatforms';
import { cn } from '@/lib/utils';
import { UNSCHEDULED_DAY_ID } from './calendar-utils';
import type { CreatePostOptions, PlannerPlatform } from './planner-platforms';
import {
  attentionHeading,
  lookaheadHeading,
  type PlannerAttentionGroup,
  type PlannerAttentionGroupKey,
  type PlannerDock,
} from './plannerIntelligence';
import type { OrganicCalendarDraft } from './types';
import { useDraftDragHandle } from './useDraftDragHandle';

// The space the grid does not need. It is the second row of the view region's grid, so it
// is sized by CSS alone: the view takes min(content, space) and this takes what is left.
// Its own container queries decide how much of it shows, so a sliver never renders a
// half-drawn list — no measuring, no ResizeObserver. The lookahead's rows stretch to fill
// whatever height is left, so the dock never ends in a blank band.

type PlannerAttentionDockProps = {
  dock: PlannerDock;
  /** The list view already groups drafts by status, so there the dock shows the lookahead only. */
  showAttention: boolean;
  /** The planner's rows, for each draft's platform mark. */
  platforms: PlannerPlatform[];
  onSelectDraft: (id: string) => void;
  /** Selects the draft and opens its editor, where media is added. */
  onAddMedia: (id: string) => void;
  onCreatePost: (options: CreatePostOptions) => void;
};

// The row hugs its content, so a row's action sits beside its title rather than at the far
// edge of a dock as wide as the calendar.
const ROW_BUTTON_CLASS =
  'flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const SECTION_HEADING_CLASS =
  'flex min-h-9 shrink-0 items-center px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function formatDockDay(dayId: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${dayId}T12:00:00`).toLocaleDateString('en-US', options);
}

const formatSlotDay = (dayId: string) =>
  formatDockDay(dayId, { weekday: 'short', month: 'short', day: 'numeric' });

function draftWhen(draft: OrganicCalendarDraft, dayId: string): string {
  if (dayId === UNSCHEDULED_DAY_ID) return 'No date';
  const weekday = formatDockDay(dayId, { weekday: 'short' });
  return `${weekday} ${Number(dayId.slice(8, 10))} · ${draft.timeLabel}`;
}

function PlatformMark({ platform, platforms }: { platform: string; platforms: PlannerPlatform[] }) {
  const Icon = platforms.find((row) => row.key === platform)?.Icon;
  return (
    <>
      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      <span className="sr-only">{postPlatformLabel(platform)}</span>
    </>
  );
}

// Rows take the draft object itself, never a derived item: the store keeps an unchanged
// draft's identity across edits, so one caption keystroke re-renders one row.
type DraftRowProps = {
  draft: OrganicCalendarDraft;
  dayId: string;
  platforms: PlannerPlatform[];
  onSelect: (id: string) => void;
};

function DraftRowContent({ draft, dayId, platforms }: Omit<DraftRowProps, 'onSelect'>) {
  const title = draft.title || 'Untitled';
  return (
    <>
      <PlatformMark platform={draft.platforms[0] ?? 'instagram'} platforms={platforms} />
      <span className="shrink-0 whitespace-nowrap text-2xs tabular-nums text-muted-foreground">
        {draftWhen(draft, dayId)}
      </span>
      <span className="min-w-0 truncate text-foreground" title={title}>
        {title}
      </span>
    </>
  );
}

function DatedDraftButton({ draft, dayId, platforms, onSelect }: DraftRowProps) {
  return (
    <button type="button" className={ROW_BUTTON_CLASS} onClick={() => onSelect(draft.id)}>
      <DraftRowContent draft={draft} dayId={dayId} platforms={platforms} />
    </button>
  );
}

// An undated draft is dragged onto a week cell to give it a day: the same handle and the
// same drop handler as a calendar card, so the reschedule path is the one already tested.
// The handle sits on the row's own button, so the row is one tab stop; the button already
// is a button, so the handle's role and tabIndex are left off.
function UndatedDraftButton({ draft, dayId, platforms, onSelect }: DraftRowProps) {
  const { setNodeRef, listeners, attributes, isDragging, style } = useDraftDragHandle(draft.id);
  const { role: _role, tabIndex: _tabIndex, ...dragAttributes } = attributes;
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      className={`${ROW_BUTTON_CLASS} ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      {...listeners}
      {...dragAttributes}
      // The planner's keys stand down while this is set: Escape cancels the move, not the preview.
      data-dragging={isDragging || undefined}
      onClick={() => {
        // A drag ends in a click on the row it started from; that is a move, not an open.
        if (!isDragging) onSelect(draft.id);
      }}
    >
      <DraftRowContent draft={draft} dayId={dayId} platforms={platforms} />
    </button>
  );
}

const AttentionRow = React.memo(function AttentionRow({
  draft,
  dayId,
  groupKey,
  platforms,
  onSelectDraft,
  onAddMedia,
}: Omit<DraftRowProps, 'onSelect'> & { groupKey: PlannerAttentionGroupKey } & Pick<
    PlannerAttentionDockProps,
    'onSelectDraft' | 'onAddMedia'
  >) {
  return (
    <li
      data-dock-item=""
      data-dock-draft-id={draft.id}
      className="flex min-w-0 items-center gap-2 pr-1"
    >
      {dayId === UNSCHEDULED_DAY_ID ? (
        <UndatedDraftButton
          draft={draft}
          dayId={dayId}
          platforms={platforms}
          onSelect={onSelectDraft}
        />
      ) : (
        <DatedDraftButton
          draft={draft}
          dayId={dayId}
          platforms={platforms}
          onSelect={onSelectDraft}
        />
      )}
      {groupKey === 'needs-media' ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="shrink-0"
          aria-label={`Add media to ${draft.title || 'Untitled'}`}
          onClick={() => onAddMedia(draft.id)}
        >
          Add media
        </Button>
      ) : null}
    </li>
  );
});

const AttentionGroup = React.memo(function AttentionGroup({
  group,
  platforms,
  onSelectDraft,
  onAddMedia,
}: { group: PlannerAttentionGroup } & Pick<
  PlannerAttentionDockProps,
  'platforms' | 'onSelectDraft' | 'onAddMedia'
>) {
  return (
    <div>
      <h3 className="px-3 pt-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {group.label}
      </h3>
      <ul aria-label={group.label} className="px-1">
        {group.items.map((item) => (
          <AttentionRow
            key={item.draft.id}
            draft={item.draft}
            dayId={item.dayId}
            groupKey={group.key}
            platforms={platforms}
            onSelectDraft={onSelectDraft}
            onAddMedia={onAddMedia}
          />
        ))}
      </ul>
    </div>
  );
});

// One button per day. Every prop is a primitive (open platforms as a joined key list), so a
// derivation that leaves a day unchanged leaves its tile alone.
const LookaheadTile = React.memo(function LookaheadTile({
  dayId,
  planned,
  openKeys,
  past,
  isToday,
  showMonth,
  platforms,
  onCreatePost,
}: {
  dayId: string;
  planned: number;
  /** Comma-joined keys of the platforms still open that day. */
  openKeys: string;
  past: boolean;
  isToday: boolean;
  showMonth: boolean;
  platforms: PlannerPlatform[];
  onCreatePost: (options: CreatePostOptions) => void;
}) {
  const open = openKeys
    ? openKeys.split(',').flatMap((key) => platforms.filter((platform) => platform.key === key))
    : [];
  const dayNumber = Number(dayId.slice(8, 10));
  const label = `Plan a post for ${formatSlotDay(dayId)} · ${planned} planned · open: ${
    open.map((platform) => platform.label).join(', ') || 'none'
  }`;
  return (
    <button
      type="button"
      data-dock-item=""
      data-dock-day={dayId}
      aria-label={label}
      aria-current={isToday ? 'date' : undefined}
      disabled={past}
      // The toolbar's context-menu "Create content": a manual post on this day, on the first
      // platform it still has open.
      onClick={() =>
        onCreatePost({
          dayId,
          platformKey: open[0]?.key,
          status: 'draft',
          mode: 'manual',
          format: 'Post',
        })
      }
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border/40 px-1.5 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [@container(height<14rem)]:justify-center [@container(height<14rem)]:py-0',
        isToday && 'border-foreground/30 bg-muted/60',
      )}
    >
      <span className="flex w-full items-center justify-between gap-1">
        <span
          className={cn(
            'truncate text-xs tabular-nums text-muted-foreground [@container(height<14rem)]:leading-none',
            isToday && 'font-semibold text-foreground',
          )}
        >
          {showMonth ? formatDockDay(dayId, { month: 'short', day: 'numeric' }) : dayNumber}
        </span>
        {planned > 0 ? (
          <span className="shrink-0 rounded-full bg-foreground/10 px-1.5 text-2xs font-medium tabular-nums text-foreground [@container(height<14rem)]:leading-none">
            {planned}
          </span>
        ) : null}
      </span>
      {open.length > 0 ? (
        <span
          aria-hidden
          className="mt-auto flex flex-wrap gap-0.5 pt-0.5 text-muted-foreground [@container(height<14rem)]:hidden"
        >
          {open.map((platform) => (
            <platform.Icon key={platform.key} className="size-3 opacity-60" />
          ))}
        </span>
      ) : null}
    </button>
  );
});

export const PlannerAttentionDock = React.memo(function PlannerAttentionDock({
  dock,
  showAttention,
  platforms,
  onSelectDraft,
  onAddMedia,
  onCreatePost,
}: PlannerAttentionDockProps) {
  const attentionHeadingId = React.useId();
  const lookaheadHeadingId = React.useId();
  const hasAttention = showAttention && dock.attention.length > 0;
  const todayId = dock.lookahead.find((day) => !day.past)?.dayId;

  return (
    <div
      data-testid="planner-attention-dock"
      className="min-h-0 overflow-hidden [container-type:size]"
    >
      {/* Under the gap plus a header's height the whole dock folds away, sections and all, so
          a folded dock is not an empty landmark. Under a header plus one row the bodies fold,
          and so does a stacked second section, which would only show half its header. The gap
          is padding on this inner box: padding on the size container gave it a minimum
          height, and it hung 8px past a view that had already claimed every pixel.
          From 48rem wide the two sections sit side by side; below, the lookahead stacks under
          the attention list, which then takes at most half the height.
          The lookahead is a size container of its own, so its tiles answer to the height it
          actually got: under 14rem they drop the weekday row and the glyphs to one line each,
          and under 5.5rem only the heading stays, the last height at which a heading alone
          still leaves under 64px of blank dock below it. */}
      <div className="flex h-full flex-col pt-2 [@container(height<2.75rem)]:hidden">
        <div
          className={cn(
            'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-lg border border-border/45 bg-card/50',
            hasAttention
              ? 'grid-rows-[minmax(0,max-content)_minmax(0,1fr)] [@container(width>=48rem)]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [@container(width>=48rem)]:grid-rows-[minmax(0,1fr)]'
              : 'grid-rows-[minmax(0,1fr)]',
          )}
        >
          {hasAttention ? (
            <section
              data-dock-section="attention"
              aria-labelledby={attentionHeadingId}
              className="max-h-[50cqh] min-h-0 overflow-y-auto overscroll-contain pb-1.5 [@container(width>=48rem)]:max-h-none"
            >
              <h2 id={attentionHeadingId} className={SECTION_HEADING_CLASS}>
                {attentionHeading(dock.attention)}
              </h2>
              <div className="flex flex-col gap-1 [@container(height<4.5rem)]:hidden">
                {dock.attention.map((group) => (
                  <AttentionGroup
                    key={group.key}
                    group={group}
                    platforms={platforms}
                    onSelectDraft={onSelectDraft}
                    onAddMedia={onAddMedia}
                  />
                ))}
              </div>
            </section>
          ) : null}
          <section
            data-dock-section="lookahead"
            aria-labelledby={lookaheadHeadingId}
            className={cn(
              'flex min-h-0 flex-col pb-1.5 [container-type:size]',
              hasAttention &&
                '[@container(height<4.5rem)_and_(width<48rem)]:hidden [@container(width>=48rem)]:border-l [@container(width>=48rem)]:border-border/45',
            )}
          >
            <h2 id={lookaheadHeadingId} className={SECTION_HEADING_CLASS}>
              {lookaheadHeading(dock.openDays)}
            </h2>
            <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-[auto_repeat(4,minmax(0,1fr))] gap-1 px-2 [@container(height<14rem)]:grid-rows-[repeat(4,minmax(0,1fr))] [@container(height<14rem)]:gap-0.5 [@container(height<5.5rem)]:hidden">
              {WEEKDAYS.map((weekday) => (
                <span
                  key={weekday}
                  aria-hidden
                  className="px-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground [@container(height<14rem)]:hidden"
                >
                  {weekday}
                </span>
              ))}
              {dock.lookahead.map((day, index) => (
                <LookaheadTile
                  key={day.dayId}
                  dayId={day.dayId}
                  planned={day.planned}
                  openKeys={day.open.map((platform) => platform.key).join(',')}
                  past={day.past}
                  isToday={day.dayId === todayId}
                  showMonth={index === 0 || day.dayId.endsWith('-01')}
                  platforms={platforms}
                  onCreatePost={onCreatePost}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
});
