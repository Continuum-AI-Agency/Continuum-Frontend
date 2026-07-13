'use client';

import {
  CheckIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
  LightningBoltIcon,
  PlusIcon,
  TrashIcon,
} from '@radix-ui/react-icons';
import { endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { CalendarIcon, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import type { CalendarDateRange } from '@/lib/organic/store';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { DisabledControl } from '../DisabledControl';
import { describeAddPlaceholderBlock, describeClearBlock } from '../disabledReasons';
import { AddPostMenu } from './AddPostMenu';
import { PlannerAccountSwitcher } from './PlannerAccountSwitcher';
import type { CreatePostOptions } from './planner-platforms';

const WEEK_OPTS = { weekStartsOn: 1 } as const; // Monday-started, matches the planner

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
  const router = useRouter();
  const showPlanned = useCalendarStore((state) => state.showPlanned);
  const setShowPlanned = useCalendarStore((state) => state.setShowPlanned);

  const addHint = describeAddPlaceholderBlock({ isGenerating });
  const clearHint = describeClearBlock({ isGenerating, draftsCount });
  // draftsCount already counts placeholder slots, so an empty calendar is the whole
  // condition for the planning note.
  const showPlanningNote = !isGenerating && draftsCount === 0;

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
                    onClick={() => {
                      onViewModeChange(mode);
                      const next = new URLSearchParams(window.location.search);
                      next.set('view', mode);
                      router.replace(`?${next.toString()}`, { scroll: false });
                    }}
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
              <Badge variant="outline" className="text-2xs uppercase tracking-wide">
                {selectedTrendCount}
                {typeof maxTrendSelections === 'number' ? `/${maxTrendSelections}` : ''} trends
              </Badge>
              {postedContentCount > 0 ? (
                <Badge variant="outline" className="text-2xs uppercase tracking-wide">
                  {postedContentCount} posted
                </Badge>
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
              {isGenerating ? (
                <DisabledControl hint={addHint}>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label="Add post"
                    disabled
                  >
                    <PlusIcon className="h-3.5 w-3.5 animate-pulse" />
                  </Button>
                </DisabledControl>
              ) : (
                <AddPostMenu onCreatePost={onCreatePost} align="end">
                  <Button type="button" size="icon-sm" variant="outline" aria-label="Add post">
                    <PlusIcon className="h-3.5 w-3.5" />
                  </Button>
                </AddPostMenu>
              )}
              <DisabledControl hint={clearHint}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isGenerating || draftsCount === 0}
                  onClick={onClear}
                >
                  <TrashIcon className="mr-1 h-3.5 w-3.5" />
                  Clear
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
            <div className="mt-2 space-y-1">
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
          New post
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive focus:text-destructive" onSelect={onClear}>
          <TrashIcon className="mr-2 h-3.5 w-3.5" />
          Clear current week
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
