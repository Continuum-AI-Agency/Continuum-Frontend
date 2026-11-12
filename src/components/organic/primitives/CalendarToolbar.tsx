'use client';

import { endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import {
  CalendarIcon,
  Check,
  EyeOff,
  Plus,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
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
import { friendlyStreamError } from '@/lib/organic/streamErrorMessage';
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
  const uiText = useTranslations('organic');
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs">
            {uiText('status_legend_6da20ca')}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-foreground">{uiText('post_status_5db4bfb')}</p>
          <ul className="flex flex-col gap-1.5">
            {draftStatusLegendEntries(uiText).map((entry) => (
              <li key={entry.status} className="flex items-start gap-2">
                <StatusBadge status={entry.status} className="shrink-0" />
                <span className="text-2xs leading-snug text-muted-foreground">{entry.hint}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-border/50 pt-2 text-2xs text-muted-foreground">
            {uiText('draftReadinessNote')}
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

function formatRangeLabel(range: CalendarDateRange, locale: string): string {
  const from = parseISO(range.from);
  const to = parseISO(range.to);
  const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const fmt = (d: Date) => formatter.format(d);
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
  const uiText = useTranslations('organic');
  const uiLocale = useLocale();
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
      {presetButton('all', uiText('calendarPresetLabel', { preset: 'all' }))}
      {presetButton('week', uiText('calendarPresetLabel', { preset: 'week' }))}
      {presetButton('month', uiText('calendarPresetLabel', { preset: 'month' }))}
      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant={activePreset === 'custom' ? 'secondary' : 'ghost'}
              aria-pressed={activePreset === 'custom'}
              className={cn('h-7 gap-1.5 rounded px-2 text-xs font-normal')}
            >
              <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {activePreset === 'custom' && dateRange
                  ? formatRangeLabel(dateRange, uiLocale)
                  : uiText('calendarPresetLabel', { preset: 'custom' })}
              </span>
            </Button>
          }
        />
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
  compact?: boolean;
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
  /** Proposes a content plan for the visible week; absent when there is no brand. */
  onGeneratePlan?: () => void;
  isProposingPlan?: boolean;
  postedContentCount?: number;
  isFetchingPostedContent?: boolean;
  onFetchPostedContent?: () => void;
};

export function CalendarToolbar(props: CalendarToolbarProps) {
  const uiText = useTranslations('organic');
  const uiLocale = useLocale();
  const {
    compact = false,
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
    onGeneratePlan,
    isProposingPlan = false,
    postedContentCount = 0,
    isFetchingPostedContent = false,
    onFetchPostedContent,
  } = props;
  const showPlanned = useCalendarStore((state) => state.showPlanned);
  const setShowPlanned = useCalendarStore((state) => state.setShowPlanned);

  const addHint = describeAddPlaceholderBlock({ isGenerating }, uiText);
  const clearHint = describeClearBlock({ isGenerating, draftsCount }, uiText);
  // draftsCount already counts placeholder slots, so an empty calendar is the whole
  // condition for the planning note.
  const showPlanningNote = !isGenerating && draftsCount === 0;
  const scopeLabel =
    viewMode === 'week' ? 'This week' : viewMode === 'month' ? 'This month' : 'Visible range';

  if (compact) {
    return (
      <div className="rounded-lg bg-card/70 px-2.5 py-1.5 ring-1 ring-border/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center rounded-md border border-border bg-muted/35 p-0.5">
            {(['week', 'month', 'list'] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={viewMode === mode ? 'secondary' : 'ghost'}
                className="h-7 rounded px-2.5 text-xs"
                aria-pressed={viewMode === mode}
                onClick={() => onViewModeChange(mode)}
              >
                {mode === 'week'
                  ? uiText('week_e78041a')
                  : mode === 'month'
                    ? uiText('month_310ca50')
                    : uiText('list_6f202f5')}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {onGeneratePlan && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isGenerating || isProposingPlan}
                onClick={onGeneratePlan}
              >
                <Sparkles data-icon="inline-start" />
                {isProposingPlan ? uiText('proposing_adf1e98') : uiText('generate_plan_307cfb3')}
              </Button>
            )}
            <AddPostMenu onCreatePost={onCreatePost} align="end">
              <Button type="button" size="sm" disabled={isGenerating}>
                <Plus data-icon="inline-start" />
                {uiText('createContent')}
              </Button>
            </AddPostMenu>
          </div>
        </div>
        <details className="mt-1">
          <summary className="hit-area w-fit cursor-pointer rounded px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
            {uiText('more_calendar_tools_c835f4e')}
          </summary>
          <div className="mt-2">
            <CalendarToolbar {...props} compact={false} />
          </div>
        </details>
      </div>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          // A size container: beside an open preview the planner is ~820-930px wide, and the
          // row used to wrap there, pushing the grid down 33px on every selection. Below
          // 68rem the secondary actions keep their icons and names but drop the visible
          // label; below 58rem the two count badges fold away.
          <div className="@container/planner-toolbar rounded-lg bg-card/70 px-2.5 py-1.5 ring-1 ring-border/40">
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
                      {mode === 'week'
                        ? uiText('week_e78041a')
                        : mode === 'month'
                          ? uiText('month_310ca50')
                          : uiText('list_6f202f5')}
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
                    title={uiText('show_or_hide_planned_bulk_plan_content_on_the_2f11390')}
                  >
                    {uiText('planned_fb6f7c9')}
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
                  <TooltipTrigger
                    render={
                      <Badge
                        variant="outline"
                        className="text-2xs @max-[58rem]/planner-toolbar:hidden"
                      >
                        {uiText.rich('sentence_0702ac8a21e6', {
                          count: selectedTrendCount,
                          limited: typeof maxTrendSelections === 'number' ? 'yes' : 'no',
                          limit: maxTrendSelections ?? 0,
                        })}
                      </Badge>
                    }
                  />
                  <TooltipContent className="max-w-xs">
                    {uiText('a_trend_is_a_topic_continuum_found_moving_in__c53de40')}
                  </TooltipContent>
                </Tooltip>
                {postedContentCount > 0 ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Badge
                          variant="outline"
                          className="text-2xs uppercase tracking-wide @max-[58rem]/planner-toolbar:hidden"
                        >
                          {uiText.rich('sentence_7b72e752a266', {
                            scope: () => scopeLabel,
                            count: postedContentCount,
                          })}
                        </Badge>
                      }
                    />
                    <TooltipContent>
                      {uiText('published_posts_loaded_into_this_planning_wee_b497a72')}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {onFetchPostedContent ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={uiText('fetch_third_party_posted_content_aa266bc')}
                    disabled={isFetchingPostedContent}
                    onClick={onFetchPostedContent}
                    title={uiText('fetch_third_party_posted_content_aa266bc')}
                  >
                    <RefreshCw
                      className={cn(
                        'mr-1 h-3.5 w-3.5 @max-[68rem]/planner-toolbar:mr-0',
                        isFetchingPostedContent && 'animate-spin',
                      )}
                    />
                    <span className="@max-[68rem]/planner-toolbar:sr-only">
                      {uiText('posts_a80811c')}
                    </span>
                  </Button>
                ) : null}
                {/* Which of the brand's accounts this planner generates for and publishes to.
                  Renders only where there is more than one to choose from. */}
                <PlannerAccountSwitcher />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={uiText('open_trends_d927bff')}
                  onClick={onOpenTrends}
                  title={uiText('open_trends_what_is_moving_for_this_brand_rig_9f5d4ff')}
                >
                  <Zap className="mr-1 h-3.5 w-3.5 @max-[68rem]/planner-toolbar:mr-0" />
                  <span className="@max-[68rem]/planner-toolbar:sr-only">
                    {uiText('trends_e856c6c')}
                  </span>
                </Button>
                <Separator orientation="vertical" className="h-5" />
                {onGeneratePlan ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={uiText('generate_plan_307cfb3')}
                    data-testid="calendar-generate"
                    disabled={isGenerating || isProposingPlan}
                    onClick={onGeneratePlan}
                    title={uiText('propose_a_content_plan_for_this_week_you_appr_3c52994')}
                  >
                    <Sparkles
                      className={cn(
                        'mr-1 h-3.5 w-3.5 @max-[68rem]/planner-toolbar:mr-0',
                        isProposingPlan && 'animate-pulse',
                      )}
                    />
                    <span className="@max-[68rem]/planner-toolbar:sr-only">
                      {isProposingPlan ? uiText('proposing_adf1e98') : uiText('generate_49e49bb')}
                    </span>
                  </Button>
                ) : null}
                {isGenerating ? (
                  <DisabledControl hint={addHint}>
                    <Button type="button" size="sm" disabled>
                      <Plus className="animate-pulse" data-icon="inline-start" />
                      {uiText('createContent')}
                    </Button>
                  </DisabledControl>
                ) : (
                  <AddPostMenu onCreatePost={onCreatePost} align="end">
                    <Button type="button" size="sm">
                      <Plus data-icon="inline-start" />
                      {uiText('createContent')}
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
                    title={uiText('hides_posts_from_this_view_nothing_is_deleted_78728de')}
                  >
                    <EyeOff className="mr-1 h-3.5 w-3.5 @max-[68rem]/planner-toolbar:mr-0" />
                    <span className="@max-[68rem]/planner-toolbar:sr-only">
                      {uiText('clear_view_428ffb8')}
                    </span>
                  </Button>
                </DisabledControl>
              </div>
            </div>

            {showPlanningNote ? (
              <div className="mt-2 rounded-md bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground text-pretty">
                {uiText.rich('toolbarPlanningNote', {
                  mode: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
                })}
              </div>
            ) : null}

            {slotProgress ? (
              <div className="mt-2 space-y-1" aria-live="polite" aria-atomic="true">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {uiText.rich('sentence_3d8b12a4946d', {
                      completed: slotProgress.completed,
                      total: slotProgress.total,
                      hasFailed: slotProgress.failed > 0 ? 'yes' : 'no',
                      failed: slotProgress.failed ?? 0,
                    })}
                  </p>
                  {gridProgress.stage ? (
                    <p className="text-2xs uppercase tracking-wide text-muted-foreground/70">
                      {uiText('generationStageLabel', { stage: gridProgress.stage })}
                    </p>
                  ) : null}
                  {gridProgress.message ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground/80">
                      {uiText('generationWorking')}
                    </p>
                  ) : null}
                </div>
                <Progress value={gridProgress.percent} className="h-1.5 bg-muted/70" />
              </div>
            ) : null}

            {/* Grid status banners */}
            {gridStatus === 'complete' && (
              <div className="mt-2 flex items-center gap-2 rounded-md bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                {uiText('allPostsGenerated', { count: slotProgress?.total ?? 0 })}
              </div>
            )}
            {gridStatus === 'complete_with_errors' && (
              <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-500/5 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                <TriangleAlert className="h-3.5 w-3.5" />
                {uiText('gridPartialGeneration', {
                  completed: slotProgress?.completed ?? 0,
                  total: slotProgress?.total ?? 0,
                  failed: slotProgress?.failed ?? 0,
                })}
                {onRetryGeneration && (
                  <button
                    type="button"
                    onClick={onRetryGeneration}
                    className="ml-1 underline underline-offset-2 hover:text-amber-700"
                  >
                    {uiText('retry_2026dde')}
                  </button>
                )}
              </div>
            )}
            {gridStatus === 'error' && gridError && (
              <div className="mt-2 flex items-center gap-2 rounded-md bg-red-500/5 px-3 py-1.5 text-xs text-red-600 dark:text-red-400">
                <X className="h-3.5 w-3.5" />
                {uiText('gridGenerationError', { error: friendlyStreamError(gridError, uiText) })}
                {onRetryGeneration && (
                  <button
                    type="button"
                    onClick={onRetryGeneration}
                    className="ml-1 underline underline-offset-2 hover:text-red-700"
                  >
                    {uiText('retry_2026dde')}
                  </button>
                )}
              </div>
            )}
          </div>
        }
      />
      <ContextMenuContent>
        <ContextMenuLabel>{uiText('weekly_actions_6c465e8')}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => onCreatePost({ status: 'draft', mode: 'manual', format: 'Post' })}
        >
          {uiText('create_content_8cfba0b')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onClear}>
          <EyeOff className="mr-2 h-3.5 w-3.5" />
          {uiText('clear_view_428ffb8')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
