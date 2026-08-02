// Per-view fallbacks for the planner's three `next/dynamic` views.
//
// Without a per-view `loading`, each dynamic import suspends all the way to the ROUTE
// boundary, whose fallback is one full-bleed grey block. That is the 10-13s "blank grey
// screen" users reported: the shell disappears along with the view. These skeletons keep
// the suspension local and shaped like the view that is arriving, so the swap reads as
// loading rather than as breakage.
//
// Geometry is mirrored from the real components on purpose — PlannerMatrix's
// `6rem` platform rail plus seven day columns, OrganicMonthlyCalendar's weekday header
// over `minmax(108px, 1fr)` week rows, OrganicListView's day-group headers over
// thumb-plus-title rows. A skeleton whose boxes do not match causes a layout jump at
// hand-off, which is the thing it exists to prevent.

import * as React from 'react';

import { Skeleton } from '@/components/ui/skeleton';

const indices = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

const DAYS_PER_WEEK = 7;
const PLATFORM_ROW_COUNT = 3;
const MONTH_WEEK_ROW_COUNT = 5;
const MONTH_CHIPS_PER_CELL = 2;
const LIST_GROUP_COUNT = 3;
const LIST_ROWS_PER_GROUP = 4;

const dayColumns = indices(DAYS_PER_WEEK);
const platformRows = indices(PLATFORM_ROW_COUNT);
const monthCells = indices(MONTH_WEEK_ROW_COUNT * DAYS_PER_WEEK);
const monthChips = indices(MONTH_CHIPS_PER_CELL);
const listGroups = indices(LIST_GROUP_COUNT);
const listRows = indices(LIST_ROWS_PER_GROUP);

export function WeekGridSkeleton(): React.JSX.Element {
  return (
    <div
      data-testid="planner-week-skeleton"
      aria-hidden="true"
      className="h-full min-h-0 overflow-hidden rounded-lg bg-background/90 ring-1 ring-border/45"
    >
      <div className="min-w-[58rem]">
        <div className="grid grid-cols-[6rem_repeat(7,minmax(7.5rem,1fr))]">
          <div className="flex items-center justify-center border-r-2 border-b-2 border-border/50 bg-muted/50 px-2 py-2">
            <Skeleton className="h-3 w-14 bg-muted/70" />
          </div>
          {dayColumns.map((day) => (
            <div
              key={`week-day-${day}`}
              className="flex flex-col items-center gap-1.5 border-r border-b-2 border-border/50 bg-muted/30 px-1.5 py-1.5 last:border-r-0"
            >
              <Skeleton className="h-3 w-8 bg-muted/70" />
              <Skeleton className="size-6 rounded-full bg-muted/70" />
            </div>
          ))}

          {platformRows.map((row) => (
            <React.Fragment key={`week-row-${row}`}>
              <div className="flex flex-col items-center justify-center gap-1 border-r-2 border-b border-border/50 bg-muted/50 px-1.5 py-3">
                <Skeleton className="size-7 rounded-full bg-muted/70" />
                <Skeleton className="h-3 w-12 bg-muted/70" />
              </div>
              {dayColumns.map((day) => (
                <div
                  key={`week-cell-${row}-${day}`}
                  className="flex min-h-[clamp(7rem,16dvh,14rem)] flex-col gap-1.5 border-r border-b border-border/50 p-1.5 last:border-r-0"
                >
                  <Skeleton className="h-3 w-10 bg-muted/70" />
                  <Skeleton className="min-h-0 flex-1 bg-muted/70" />
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MonthGridSkeleton(): React.JSX.Element {
  return (
    <div
      data-testid="planner-month-skeleton"
      aria-hidden="true"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-card/50 p-2"
    >
      <header className="mb-2 flex shrink-0 items-center justify-between">
        <Skeleton className="h-6 w-40 bg-muted/70" />
        <div className="flex items-center gap-1">
          <Skeleton className="size-7 rounded-md bg-muted/70" />
          <Skeleton className="h-7 w-16 rounded-md bg-muted/70" />
          <Skeleton className="size-7 rounded-md bg-muted/70" />
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-7 border-b border-border/30 pb-1">
        {dayColumns.map((day) => (
          <div key={`month-weekday-${day}`} className="flex justify-center py-1">
            <Skeleton className="h-3 w-7 bg-muted/70" />
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="grid grid-cols-7" style={{ gridAutoRows: 'minmax(108px, 1fr)' }}>
          {monthCells.map((cell) => (
            <div
              key={`month-cell-${cell}`}
              className="flex flex-col gap-1 border-r border-b border-border/30 p-1.5 last:border-r-0"
            >
              <Skeleton className="size-5 rounded-full bg-muted/70" />
              {monthChips.map((chip) => (
                <Skeleton key={`month-chip-${cell}-${chip}`} className="h-3.5 w-full bg-muted/70" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ListViewSkeleton(): React.JSX.Element {
  return (
    <div
      data-testid="planner-list-skeleton"
      aria-hidden="true"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-card/50"
    >
      {listGroups.map((group) => (
        <div key={`list-group-${group}`}>
          <div className="flex items-center gap-2 border-b border-border/50 bg-muted/30 px-4 py-2">
            <Skeleton className="size-3.5 bg-muted/70" />
            <Skeleton className="h-3 w-24 bg-muted/70" />
            <Skeleton className="h-4 w-6 rounded-md bg-muted/70" />
          </div>
          {listRows.map((row) => (
            <div
              key={`list-row-${group}-${row}`}
              className="flex items-center gap-2 border-b border-border/20 px-4 py-2"
            >
              <Skeleton className="size-8 shrink-0 rounded bg-muted/70" />
              <Skeleton className="h-3 min-w-0 flex-1 bg-muted/70" />
              <Skeleton className="h-3 w-16 shrink-0 bg-muted/70" />
              <Skeleton className="h-4 w-12 shrink-0 rounded-md bg-muted/70" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function PlannerViewSkeleton({
  view,
}: {
  view: 'week' | 'month' | 'list';
}): React.JSX.Element {
  if (view === 'week') return <WeekGridSkeleton />;
  if (view === 'list') return <ListViewSkeleton />;
  return <MonthGridSkeleton />;
}
