'use client';

import type { useTranslations as ScaleTranslationHook } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import {
  dashboardActionLabel,
  dashboardScopeLabel,
  dashboardStatusLabel,
} from './dashboardPresentation';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

import { RotateCw, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useMemo } from 'react';
import { CreativeSwapComparison } from '@/components/dco/CreativeSwapComparison';
import { EmptyState, ErrorRetryState } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDCOActionLogs } from '@/hooks/useDCOActionLogs';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import type { ActionLog, ActionStatus, ScopeType } from '@/lib/types/dco';
import { cn } from '@/lib/utils';

type DCOActionAlertsBoxProps = {
  brandId: string;
  metaAccountId?: string;
  campaignId?: string;
  className?: string;
  onRefresh?: () => void;
};

type SortMode = 'newest' | 'oldest' | 'severity' | 'action';
type StatusFilter = 'all' | ActionStatus;
type ScopeFilter = 'all' | ScopeType;
type QuickView = 'all' | 'attention' | 'pending' | 'successful' | 'campaign' | 'adset';

const STATUS_ORDER: Record<ActionStatus, number> = {
  FAILED: 0,
  PENDING: 1,
  REJECTED: 2,
  APPROVED: 3,
  SUCCESS: 4,
  EXECUTED: 5,
};

const CREATIVE_SWITCH_ACTION_TYPES = new Set<ActionLog['actionType']>([
  'SWITCH_CREATIVE',
  'CREATIVE_SWITCH_EXTERNAL',
]);

const CREATIVE_SWAP_BEFORE_KEYS = [
  'original_creative_url',
  'before_creative_url',
  'previous_creative_url',
  'old_creative_url',
  'originalCreativeUrl',
  'beforeCreativeUrl',
];

const CREATIVE_SWAP_AFTER_KEYS = [
  'new_creative_url',
  'after_creative_url',
  'replacement_creative_url',
  'updated_creative_url',
  'newCreativeUrl',
  'afterCreativeUrl',
];

type CreativeSwapUrls = {
  before: string;
  after: string;
};

function formatTimestamp(isoString: string, uiLocale: UiLocale = 'en'): string {
  return new Date(isoString).toLocaleString(uiLocale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function summarizeAction(log: ActionLog, uiTranslate: ScaleCopy): string {
  if (log.error) return uiTranslate('dashboardActionFailed');
  if (log.decisionNote) return log.decisionNote;

  const payloadEntries = Object.entries(log.paramsChanged ?? {});
  if (payloadEntries.length > 0) {
    const [firstKey, firstValue] = payloadEntries[0];
    return `${firstKey}: ${String(firstValue)}`;
  }

  return uiTranslate('dashboardActionApplied', {
    action: dashboardActionLabel(log.actionType, uiTranslate),
    scope: dashboardScopeLabel(log.scopeType, uiTranslate),
  });
}

function badgeVariantForStatus(status: ActionStatus): 'destructive' | 'secondary' | 'outline' {
  if (status === 'FAILED' || status === 'REJECTED') return 'destructive';
  if (status === 'PENDING') return 'outline';
  return 'secondary';
}

function readSwapUrlFromRecord(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function extractCreativeSwapUrls(log: ActionLog): CreativeSwapUrls | null {
  if (!CREATIVE_SWITCH_ACTION_TYPES.has(log.actionType)) return null;

  const payloads: Array<Record<string, unknown> | null | undefined> = [
    log.actionPayload,
    log.paramsChanged,
    log.result,
  ];

  for (const payload of payloads) {
    const before = readSwapUrlFromRecord(payload, CREATIVE_SWAP_BEFORE_KEYS);
    const after = readSwapUrlFromRecord(payload, CREATIVE_SWAP_AFTER_KEYS);
    if (before && after) {
      return { before, after };
    }
  }

  return null;
}

function matchesQuickView(log: ActionLog, view: QuickView): boolean {
  if (view === 'all') return true;
  if (view === 'attention')
    return log.status === 'FAILED' || log.status === 'PENDING' || log.status === 'REJECTED';
  if (view === 'pending') return log.status === 'PENDING';
  if (view === 'successful')
    return log.status === 'SUCCESS' || log.status === 'APPROVED' || log.status === 'EXECUTED';
  if (view === 'campaign') return log.scopeType === 'CAMPAIGN';
  if (view === 'adset') return log.scopeType === 'ADSET' || log.scopeType === 'AD';
  return true;
}

export function DCOActionAlertsBox({
  brandId,
  metaAccountId,
  campaignId,
  className,
  onRefresh,
}: DCOActionAlertsBoxProps) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const QUICK_VIEW_LABEL: Record<QuickView, string> = useMemo(
    () => ({
      all: uiText('dashboardAllEvents'),
      attention: uiText('needs_attention_c1ebc78'),
      pending: uiText('pending_331551b'),
      successful: uiText('dashboardSuccessful'),
      campaign: uiText('dashboardCampaignScope'),
      adset: uiText('dashboardAdSetScope'),
    }),
    [uiText],
  );

  const [search, setSearch] = React.useState('');
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [sortMode, setSortMode] = React.useState<SortMode>('newest');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [scopeFilter, setScopeFilter] = React.useState<ScopeFilter>('all');
  const [quickView, setQuickView] = React.useState<QuickView>('all');
  const [hoveredRowId, setHoveredRowId] = React.useState<string | null>(null);

  const { logs, isLoading, error, pagination, setFilters, refresh, goToPage } = useDCOActionLogs({
    brandId,
    metaAccountId,
    initialPageSize: 80,
    initialDateRangeDays: 14,
  });

  React.useEffect(() => {
    setFilters({
      metaAccountId,
      campaignId,
    });
  }, [campaignId, metaAccountId, setFilters]);

  const filteredLogs = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const base = logs.filter((log) => {
      if (!matchesQuickView(log, quickView)) return false;
      if (statusFilter !== 'all' && log.status !== statusFilter) return false;
      if (scopeFilter !== 'all' && log.scopeType !== scopeFilter) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        log.actionType,
        log.status,
        log.scopeType,
        dashboardActionLabel(log.actionType, uiText),
        dashboardStatusLabel(log.status, uiText),
        dashboardScopeLabel(log.scopeType, uiText),
        log.metaCampaignId ?? '',
        log.metaAdsetId ?? '',
        log.decisionNote ?? '',
        log.error ?? '',
        summarizeAction(log, uiText),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    return base.sort((left, right) => {
      if (sortMode === 'newest') {
        return new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
      }
      if (sortMode === 'oldest') {
        return new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime();
      }
      if (sortMode === 'action') {
        return left.actionType.localeCompare(right.actionType);
      }

      const severityGap = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      if (severityGap !== 0) return severityGap;
      return new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
    });
  }, [logs, quickView, scopeFilter, search, sortMode, statusFilter, uiText]);

  const commandRows = React.useMemo(() => filteredLogs.slice(0, 8), [filteredLogs]);

  const contextLabel = uiText('dashboardContextLabel', {
    scope: campaignId ? 'campaign' : metaAccountId ? 'account' : 'brand',
  });

  const handleRefresh = React.useCallback(() => {
    refresh();
    onRefresh?.();
  }, [onRefresh, refresh]);

  return (
    <div
      className={cn(
        'grid h-[min(72vh,680px)] min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2',
        className,
      )}
    >
      <aside className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/10 p-2">
        <span className="rounded border border-border/70 bg-background px-2 py-1 text-xs text-muted-foreground">
          {contextLabel}
        </span>

        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {(Object.keys(QUICK_VIEW_LABEL) as QuickView[]).map((view) => (
            <button
              key={`alerts-quick-view-${view}`}
              type="button"
              onClick={() => setQuickView(view)}
              className={cn(
                'h-7 rounded-md px-2 text-left text-xs transition-colors',
                quickView === view
                  ? 'bg-primary/10 text-primary-ink'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {QUICK_VIEW_LABEL[view]}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger className="h-8 w-[8.5rem] text-xs">
              <SelectValue placeholder={uiText('status_920e413')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{uiText('all_status_32b9b2c')}</SelectItem>
              <SelectItem value="FAILED">{uiText('failed_031a8f0')}</SelectItem>
              <SelectItem value="PENDING">{uiText('pending_331551b')}</SelectItem>
              <SelectItem value="REJECTED">{uiText('rejected_aea4a04')}</SelectItem>
              <SelectItem value="APPROVED">{uiText('approved_87b42e4')}</SelectItem>
              <SelectItem value="SUCCESS">{uiText('success_c88a0b9')}</SelectItem>
              <SelectItem value="EXECUTED">{uiText('executed_3aa8b68')}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={scopeFilter}
            onValueChange={(value) => setScopeFilter(value as ScopeFilter)}
          >
            <SelectTrigger className="h-8 w-[8rem] text-xs">
              <SelectValue placeholder={uiText('scope_b073f6c')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{uiText('all_scope_1f811cf')}</SelectItem>
              <SelectItem value="GLOBAL">{uiText('global_a258b30')}</SelectItem>
              <SelectItem value="ACCOUNT">{uiText('account_7e1b0d5')}</SelectItem>
              <SelectItem value="CAMPAIGN">{uiText('campaign_268286d')}</SelectItem>
              <SelectItem value="ADSET">{uiText('ad_set_8fa52e4')}</SelectItem>
              <SelectItem value="AD">{uiText('ad_1d97c9f')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
            <SelectTrigger className="h-8 w-[8.5rem] text-xs">
              <SelectValue placeholder={uiText('sort_bec6903')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{uiText('newest_d15efa1')}</SelectItem>
              <SelectItem value="oldest">{uiText('oldest_505dc45')}</SelectItem>
              <SelectItem value="severity">{uiText('severity_5e9f981')}</SelectItem>
              <SelectItem value="action">{uiText('action_type_03af15a')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </aside>

      <section className="flex min-h-0 flex-col rounded-md border border-border/70 bg-background">
        <div className="space-y-2 border-b border-border/70 p-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">{uiText('dco_actions_4e1fede')}</div>
              <p className="text-xs text-muted-foreground">
                {uiText.rich('sentence_67fae59f31ef', {
                  v0: pagination.totalCount,
                  v1: filteredLogs.length,
                })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleRefresh}
              disabled={isLoading}
              aria-label={uiText('refresh_alerts_157e675')}
            >
              <RotateCw className={cn('h-4 w-4', isLoading ? 'animate-spin' : undefined)} />
            </Button>
          </div>

          <Command className="rounded-md border border-border/70 bg-muted/5">
            <CommandInput
              value={search}
              onValueChange={setSearch}
              onFocus={() => setCommandOpen(true)}
              onBlur={() => setCommandOpen(false)}
              placeholder={uiText('command_search_action_campaign_ad_set_status_3f60eae')}
            />
            {commandOpen ? (
              <CommandList
                className="max-h-[140px]"
                onMouseDown={(event) => event.preventDefault()}
              >
                <CommandGroup heading={uiText('quick_commands_ff858c3')}>
                  <CommandItem onSelect={() => setStatusFilter('FAILED')}>
                    {uiText('show_failed_only_8d37336')}
                  </CommandItem>
                  <CommandItem onSelect={() => setStatusFilter('PENDING')}>
                    {uiText('show_pending_only_d002fcb')}
                  </CommandItem>
                  <CommandItem onSelect={() => setQuickView('campaign')}>
                    {uiText('limit_to_campaign_scope_d3009b5')}
                  </CommandItem>
                  <CommandItem onSelect={() => setQuickView('adset')}>
                    {uiText('limit_to_ad_set_scope_67c9299')}
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading={uiText('matching_actions_2455fa5')}>
                  {commandRows.map((log) => (
                    <CommandItem
                      key={`alert-command-${log.id}`}
                      onSelect={() => setSearch(`${log.actionType} ${log.metaCampaignId ?? ''}`)}
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span className="truncate">
                        {dashboardActionLabel(log.actionType, uiText)}
                      </span>
                      <span className="ml-auto text-2xs text-muted-foreground">
                        {dashboardStatusLabel(log.status, uiText)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandEmpty>{uiText('no_matching_commands_4ea8244')}</CommandEmpty>
              </CommandList>
            ) : null}
          </Command>
        </div>

        <div className="flex-1 min-h-0">
          {error ? (
            <ErrorRetryState
              title={uiText('couldn_t_load_dco_actions_2776eae')}
              message={error}
              onRetry={handleRefresh}
              className="m-2 min-h-[220px]"
            />
          ) : isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 8 }).map((_, idx) => (
                <Skeleton key={`alert-skeleton-${idx}`} className="h-10 w-full bg-muted/70" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            logs.length === 0 ? (
              <EmptyState
                className="m-2 min-h-[220px]"
                headline={uiText('dashboardActionsEmpty')}
                description={uiText('once_optimization_runs_budget_moves_creative__7627c8e')}
              />
            ) : (
              <EmptyState
                className="m-2 min-h-[220px]"
                headline={uiText('dashboardActionsNoMatch')}
                description={uiText('adjust_the_status_scope_or_search_filters_to__3140e95')}
              />
            )
          ) : (
            <ScrollArea className="h-full">
              <Table className="text-xs">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-[130px]">{uiText('time_33b9347')}</TableHead>
                    <TableHead className="w-[110px]">{uiText('status_920e413')}</TableHead>
                    <TableHead className="w-[170px]">{uiText('action_64cff13')}</TableHead>
                    <TableHead className="w-[110px]">{uiText('scope_b073f6c')}</TableHead>
                    <TableHead className="w-[200px]">{uiText('entity_2ed3bb6')}</TableHead>
                    <TableHead>{uiText('detail_fb5f27d')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const creativeSwapUrls = extractCreativeSwapUrls(log);
                    const isExpanded = hoveredRowId === log.id;

                    return (
                      <React.Fragment key={log.id}>
                        <TableRow
                          onMouseEnter={() => setHoveredRowId(log.id)}
                          onMouseLeave={() => setHoveredRowId(null)}
                        >
                          <TableCell className="text-xs text-muted-foreground">
                            <div>{formatTimestamp(log.occurredAt, uiLocale)}</div>
                            <div>{formatRelativeTime(log.occurredAt, undefined, uiLocale)}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={badgeVariantForStatus(log.status)}>
                              {dashboardStatusLabel(log.status, uiText)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {dashboardActionLabel(log.actionType, uiText)}
                          </TableCell>
                          <TableCell>{dashboardScopeLabel(log.scopeType, uiText)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            <div>
                              {uiText.rich('sentence_b7e112e8911a', {
                                v0: log.metaCampaignId ?? '--',
                              })}
                            </div>
                            <div>
                              {uiText.rich('sentence_82ffc5148390', {
                                v0: log.metaAdsetId ?? '--',
                              })}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[360px] whitespace-normal text-foreground">
                            <div>{summarizeAction(log, uiText)}</div>
                            {creativeSwapUrls ? (
                              <div className="mt-1 text-2xs text-muted-foreground">
                                {uiText('hover_to_view_creative_comparison_6683999')}
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                        <AnimatePresence initial={false}>
                          {isExpanded && creativeSwapUrls ? (
                            <TableRow
                              key={`${log.id}-detail`}
                              onMouseEnter={() => setHoveredRowId(log.id)}
                              onMouseLeave={() => setHoveredRowId(null)}
                            >
                              <TableCell colSpan={6} className="p-0">
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{
                                    duration: 0.18,
                                    ease: [0.16, 1, 0.3, 1],
                                  }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 py-3">
                                    <CreativeSwapComparison
                                      originalUrl={creativeSwapUrls.before}
                                      newUrl={creativeSwapUrls.after}
                                    />
                                  </div>
                                </motion.div>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </AnimatePresence>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/70 px-2.5 py-2 text-xs">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => goToPage(Math.max(1, pagination.page - 1))}
            disabled={!pagination.hasPrevPage || isLoading}
          >
            {uiText('previous_a57b08a')}
          </Button>
          <span className="text-muted-foreground">
            {uiText.rich('sentence_51e015524070', {
              v0: pagination.page,
              v1: pagination.totalPages || 1,
            })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() =>
              goToPage(Math.min(Math.max(1, pagination.totalPages), pagination.page + 1))
            }
            disabled={!pagination.hasNextPage || isLoading}
          >
            {uiText('next_1ff57a2')}
          </Button>
        </div>
      </section>
    </div>
  );
}
