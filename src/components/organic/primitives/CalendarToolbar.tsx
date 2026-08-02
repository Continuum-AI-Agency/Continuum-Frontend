'use client';

import {
  CheckIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
  LightningBoltIcon,
  PlusIcon,
} from '@radix-ui/react-icons';
import { endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { CalendarIcon, EyeOff, RefreshCw } from 'lucide-react';
import * as React from 'react';
import type { DateRange } from 'react-day-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CalendarDateRange } from '@/lib/organic/store';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { DisabledControl } from '../DisabledControl';
import { describeAddPlaceholderBlock, describeClearBlock } from '../disabledReasons';
import { AddPostMenu } from './AddPostMenu';
import { StatusBadge } from './DraftCardBadges';
import { DRAFT_READINESS_LEGEND_NOTE, draftStatusLegendEntries } from './draft-card-styles';
import { PlannerAccountSwitcher } from './PlannerAccountSwitcher';
import type { CreatePostOptions } from './planner-platforms';

const WEEK_OPTS = { weekStartsOn: 1 } as const; // Monday-started, matches the planner

/**
 * Derived from the same table the cards read (`DRAFT_STATUS_PRESENTATION`). The legend used
 * to be hardcoded, and drifted into four separate falsehoods — violet was labelled
 * "Generating" when it means "Seeded", Scheduled was drawn as an unfilled outline instead of
 * teal, `placeholder` was missing entirely, and Failed was a solid destructive fill.
 */
function StatusLegend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs">
          Status legend
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-foreground">Post status</p>
          <ul className="flex flex-col gap-1.5">
            {draftStatusLegendEntries().map((entry) => (
              <li key={entry.status} className="flex items-start gap-2">
                <StatusBadge status={entry.status} className="shrink-0" />
                <span className="text-2xs leading-snug text-muted-foreground">{entry.hint}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-border/50 pt-2 text-2xs text-muted-foreground">
            {DRAFT_READINESS_LEGEND_NOTE}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function toDayId(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function presetRange(preset: 'week' | 'month'): CalendarDateRange {
  const today = new Date();
  if (preset === 'week') {
    return {
      from: toDayId(startOfWeek(today, WEEK_OPTS)),
      to: toDayId(endOfWeek(today, WEEK_OPTS)),
    };
  }
  return { from: toDayId(startOfMonth(today)), to: toDayId(endOfMonth(today)) };
}

function rangesEqual(a: CalendarDateRange | null, b: CalendarDateRange): boolean {
  return a !== null && a.from === b.from && a.to === b.to;
}

function formatRangeLabel(range: CalendarDateRange): string {
  const from = parseISO(range.from);
  const to = parseISO(range.to);
  const fmt = (d: Date) => format(d, 'MMM d');
  return range.from === range.to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

/**
 * Timeframe control for the list view: pick a window wider than a week or narrower
 * than a month. A pure view filter over the fully-loaded draft set (no refetch).
 */
function TimeframeSelector({
  dateRange,
  onDateRangeChange,
}: {
  dateRange: CalendarDateRange | null;
  onDateRangeChange: (range: CalendarDateRange | null) => void;
}) {
  const [customOpen, setCustomOpen] = React.useState(false);

  const activePreset: 'all' | 'week' | 'month' | 'custom' = !dateRange
    ? 'all'
    : rangesEqual(dateRange, presetRange('week'))
      ? 'week'
      : rangesEqual(dateRange, presetRange('month'))
        ? 'month'
        : 'custom';

  const calendarSelection: DateRange | undefined = dateRange
    ? { from: parseISO(dateRange.from), to: parseISO(dateRange.to) }
    : undefined;

  const handleCustomSelect = (range: DateRange | undefined) => {
    if (!range?.from) {
      onDateRangeChange(null);
      return;
    }
    onDateRangeChange({ from: toDayId(range.from), to: toDayId(range.to ?? range.from) });
  };

  const presetButton = (key: 'all' | 'week' | 'month', label: string) => (
    <Button
      type="button"
      size="sm"
      variant={activePreset === key ? 'secondary' : 'ghost'}
      aria-pressed={activePreset === key}
      className="h-7 rounded px-2 text-xs"
      onClick={() => onDateRangeChange(key === 'all' ? null : presetRange(key))}
    >
      {label}
    </Button>
  );

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/35 p-0.5">
      {presetButton('all', 'All')}
      {presetButton('week', 'Week')}
      {presetButton('month', 'Month')}
      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={activePreset === 'custom' ? 'secondary' : 'ghost'}
            aria-pressed={activePreset === 'custom'}
            className={cn('h-7 gap-1.5 rounded px-2 text-xs font-normal')}
          >
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {activePreset === 'custom' && dateRange ? formatRangeLabel(dateRange) : 'Custom'}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="range"
            autoFocus
            defaultMonth={calendarSelection?.from}
            selected={calendarSelection}
            onSelect={handleCustomSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

type CalendarToolbarProps = {
  viewMode: 'week' | 'month' | 'list';
  onViewModeChange: (mode: 'week' | 'month' | 'list') => void;
  dateRange: CalendarDateRange | null;
  onDateRangeChange: (range: CalendarDateRange | null) => void;
  selectedTrendCount: number;
  maxTrendSelections?: number;
  isGenerating: boolean;
  onOpenTrends: () => void;
  onCreatePost: (options: CreatePostOptions) => void;
  onClear: () => void;
  draftsCount: number;
  slotProgress: { completed: number; total: number; failed: number } | null;
  gridProgress: { percent: number; message?: string; stage?: string };
  gridStatus: string;
  gridError: string | null;
  onRetryGeneration?: () => void;
  postedContentCount?: number;
  isFetchingPostedContent?: boolean;
  onFetchPostedContent?: () => void;
};

export function CalendarToolbar({
  viewMode,
  onViewModeChange,
  dateRange,
  onDateRangeChange,
  selectedTrendCount,
  maxTrendSelections,
  isGenerating,
  onOpenTrends,
  onCreatePost,
  onClear,
  draftsCount,
  slotProgress,
  gridProgress,
  gridStatus,
  gridError,
  onRetryGeneration,
  postedContentCount = 0,
  isFetchingPostedContent = false,
  onFetchPostedContent,
}: CalendarToolbarProps) {
  const showPlanned = useCalendarStore((state) => state.showPlanned);
  const setShowPlanned = useCalendarStore((state) => state.setShowPlanned);

  const addHint = describeAddPlaceholderBlock({ isGenerating });
  const clearHint = describeClearBlock({ isGenerating, draftsCount });
  // draftsCount already counts placeholder slots, so an empty calendar is the whole
  // condition for the planning note.
  const showPlanningNote = !isGenerating && draftsCount === 0;
  const scopeLabel =
    viewMode === 'week' ? 'This week' : viewMode === 'month' ? 'This month' : 'Visible range';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="rounded-lg bg-card/70 px-2.5 py-1.5 ring-1 ring-border/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-md border border-border bg-muted/35 p-0.5">
                {(['week', 'month', 'list'] as const).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={viewMode === mode ? 'secondary' : 'ghost'}
                    data-tour-id={mode === 'list' ? 'organic-list-view' : undefined}
                    className={
                      viewMode === mode
                        ? 'h-7 rounded px-2.5 text-xs'
                        : 'h-7 rounded px-2.5 text-xs text-muted-foreground hover:text-foreground'
                    }
                    aria-pressed={viewMode === mode}
                    // The store is the sole writer of the view mode; the workspace projects
                    // it into the URL. `router.replace` here made the same commit a Next
                    // transition, so React 19 kept the STALE view on screen — the reported
                    // "List → Month still shows the list".
                    onClick={() => onViewModeChange(mode)}
                  >
                    {mode === 'week' ? 'Week' : mode === 'month' ? 'Month' : 'List'}
                  </Button>
                ))}
              </div>
              {viewMode !== 'list' ? (
                <Button
                  type="button"
                  size="sm"
                  variant={showPlanned ? 'secondary' : 'ghost'}
                  aria-pressed={showPlanned}
                  className="h-7 rounded px-2.5 text-xs"
                  onClick={() => setShowPlanned(!showPlanned)}
                  title="Show or hide planned (bulk-plan) content on the calendar"
                >
                  Planned
                </Button>
              ) : (
                <TimeframeSelector dateRange={dateRange} onDateRangeChange={onDateRangeChange} />
              )}
              <StatusLegend />
              <Separator orientation="vertical" className="h-5" />
              {/* This counts the user's SELECTION against its cap — a different quantity from
                  the trend AVAILABILITY that Metrics and Home show from the same array. The
                  old "0/5 TRENDS" said neither, so three surfaces read as three numbers for
                  one word. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-2xs">
                    Trends selected: {selectedTrendCount}
                    {typeof maxTrendSelections === 'number' ? ` of ${maxTrendSelections}` : ''}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  A trend is a topic Continuum found moving in your market. Selecting one tags it
                  onto the posts you generate next. Open Trends to see what we found for your brand,
                  or generate a fresh set there.
                </TooltipContent>
              </Tooltip>
              {postedContentCount > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-2xs uppercase tracking-wide">
                      {scopeLabel} · {postedContentCount} posted
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Published posts loaded into this planning week</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {onFetchPostedContent ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label="Fetch third-party posted content"
                  disabled={isFetchingPostedContent}
                  onClick={onFetchPostedContent}
                  title="Fetch third-party posted content"
                >
                  <RefreshCw
                    className={
                      isFetchingPostedContent ? 'mr-1 h-3.5 w-3.5 animate-spin' : 'mr-1 h-3.5 w-3.5'
                    }
                  />
                  Posts
                </Button>
              ) : null}
              {/* Which of the brand's accounts this planner generates for and publishes to.
                  Renders only where there is more than one to choose from. */}
              <PlannerAccountSwitcher />
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="Open trends"
                onClick={onOpenTrends}
              >
                <LightningBoltIcon className="mr-1 h-3.5 w-3.5" />
                Trends
              </Button>
              <Separator orientation="vertical" className="h-5" />
              {isGenerating ? (
                <DisabledControl hint={addHint}>
                  <Button type="button" size="sm" disabled>
                    <PlusIcon className="animate-pulse" data-icon="inline-start" />
                    Create content
                  </Button>
                </DisabledControl>
              ) : (
                <AddPostMenu onCreatePost={onCreatePost} align="end">
                  <Button type="button" size="sm">
                    <PlusIcon data-icon="inline-start" />
                    Create content
                  </Button>
                </AddPostMenu>
              )}
              {/* A trash icon labelled "Clear" on a control that only hides posts is the most
                  trust-damaging thing in the planner. The act is a lens, so it looks like one. */}
              <DisabledControl hint={clearHint}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isGenerating || draftsCount === 0}
                  onClick={onClear}
                  title="Hides posts from this view. Nothing is deleted."
                >
                  <EyeOff className="mr-1 h-3.5 w-3.5" />
                  Clear view
                </Button>
              </DisabledControl>
            </div>
          </div>

          {showPlanningNote ? (
            <div className="mt-2 rounded-md bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground text-pretty">
              <span className="font-medium text-foreground">Planning mode</span> — no account
              needed. Add a placeholder or open Trends to sketch a week, or ask the agent to draft
              ideas. AI drafts pull from your Brand Book; publishing needs a connected account.
            </div>
          ) : null}

          {slotProgress ? (
            <div className="mt-2 space-y-1" aria-live="polite" aria-atomic="true">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {slotProgress.completed}/{slotProgress.total} completed
                  {slotProgress.failed > 0 ? ` • ${slotProgress.failed} failed` : ''}
                </p>
                {gridProgress.stage ? (
                  <p className="text-2xs uppercase tracking-wide text-muted-foreground/70">
                    {gridProgress.stage}
                  </p>
                ) : null}
                {gridProgress.message ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground/80">
                    {gridProgress.message}
                  </p>
                ) : null}
              </div>
              <Progress value={gridProgress.percent} className="h-1.5 bg-muted/70" />
            </div>
          ) : null}

          {/* Grid status banners */}
          {gridStatus === 'complete' && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckIcon className="h-3.5 w-3.5" />
              All {slotProgress?.total ?? 0} posts generated
            </div>
          )}
          {gridStatus === 'complete_with_errors' && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-500/5 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
              <ExclamationTriangleIcon className="h-3.5 w-3.5" />
              {slotProgress?.completed ?? 0} of {slotProgress?.total ?? 0} generated.{' '}
              {slotProgress?.failed ?? 0} failed
              {onRetryGeneration && (
                <button
                  type="button"
                  onClick={onRetryGeneration}
                  className="ml-1 underline underline-offset-2 hover:text-amber-700"
                >
                  — retry
                </button>
              )}
            </div>
          )}
          {gridStatus === 'error' && gridError && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-red-500/5 px-3 py-1.5 text-xs text-red-600 dark:text-red-400">
              <Cross2Icon className="h-3.5 w-3.5" />
              Generation failed: {gridError}
              {onRetryGeneration && (
                <button
                  type="button"
                  onClick={onRetryGeneration}
                  className="ml-1 underline underline-offset-2 hover:text-red-700"
                >
                  — retry
                </button>
              )}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>Weekly Actions</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => onCreatePost({ status: 'draft', mode: 'manual', format: 'Post' })}
        >
          Create content
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onClear}>
          <EyeOff className="mr-2 h-3.5 w-3.5" />
          Clear view
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
