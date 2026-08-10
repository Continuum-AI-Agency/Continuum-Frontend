'use client';

import {
  ActivityLogIcon,
  OpenInNewWindowIcon,
  PinTopIcon,
  ReloadIcon,
} from '@radix-ui/react-icons';
import { AnimatePresence, motion } from 'motion/react';
import * as React from 'react';
import { CreativeSwapComparison } from '@/components/dco/CreativeSwapComparison';
import { Pill } from '@/components/kibo-ui/pill';
import { Badge as ShadcnBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDCOActionLogs } from '@/hooks/useDCOActionLogs';
import {
  type DateRangeDays,
  DEFAULT_DATE_RANGE_DAYS,
  getDateRangeFromDays,
} from '@/lib/dco/dateRange';
import type {
  ActionLog,
  ActionStatus,
  ActionType,
  CreativeSwitchExternalPayload,
  ProductSwapProduct,
} from '@/lib/types/dco';
import { cn } from '@/lib/utils';

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${Math.floor(diffHours)}h ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}

const getStatusVariant = (
  status: ActionStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case 'APPROVED':
      return 'default';
    case 'SUCCESS':
      return 'default';
    case 'EXECUTED':
      return 'secondary';
    case 'REJECTED':
      return 'destructive';
    case 'FAILED':
      return 'destructive';
    case 'PENDING':
      return 'secondary';
    default:
      return 'outline';
  }
};

const getActionTypeColor = (
  actionType: ActionType,
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (actionType.includes('PAUSE') || actionType.includes('ARCHIVE')) return 'destructive';
  if (actionType.includes('CREATE') || actionType.includes('SCALE') || actionType.includes('ALERT'))
    return 'default';
  return 'secondary';
};

const CURRENCY_KEYS = ['spend', 'budget', 'cost', 'price', 'bid', 'cpc', 'cpm', 'cpa', 'revenue'];

function formatCurrency(value: number | string): string {
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

function formatDetailValue(key: string, value: unknown): string {
  const lowerKey = key.toLowerCase();
  const isCurrencyKey = CURRENCY_KEYS.some((term) => lowerKey.includes(term));

  if (typeof value === 'number') {
    if (isCurrencyKey) {
      return formatCurrency(value);
    }
    return value.toString();
  }

  if (typeof value === 'string') {
    // Case 1: The value itself is a currency string with an operator (e.g. "> 2000")
    // and the key is a currency key.
    if (isCurrencyKey) {
      // Matches ">= 2000", "> 2000", "2000", etc.
      const match = value.match(/^([<>=!]+\s*)?(\d+(?:\.\d+)?)$/);
      if (match) {
        const prefix = match[1] || '';
        const numberPart = match[2];
        return `${prefix}${formatCurrency(numberPart)}`;
      }
    }

    // Case 2: It's a text block (like "reason") that mentions currency keywords.
    // "Account ROAS below 1.0 with spend > 2000"
    const currencyContextRegex =
      /\b(spend|budget|cost|price|bid|revenue|cpc|cpm|cpa)\s*([<>=]+|is|:|under|over|above|below)?\s*(\d+(?:\.\d{1,2})?)\b/gi;

    return value.replace(currencyContextRegex, (_match, keyword, operator, number) => {
      // Reconstruct the string with the formatted currency
      const prefix = operator ? `${operator} ` : '';
      // Clean up whitespace in reconstruction
      return `${keyword} ${prefix.trim()} ${formatCurrency(number)}`.trim().replace(/\s+/g, ' ');
    });
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function DetailSection({ data, label }: { data: Record<string, unknown> | null; label: string }) {
  if (!data || Object.keys(data).length === 0) return null;

  return (
    <div>
      <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="rounded-md border bg-muted/50 p-3 text-sm">
        <div className="grid gap-2">
          {Object.entries(data).map(([key, value]) => (
            <div key={key} className="grid grid-cols-[140px_1fr] gap-4">
              <span className="font-medium text-gray-500 capitalize truncate" title={key}>
                {key.replace(/_/g, ' ')}
              </span>
              <span className="text-gray-900 break-words font-mono text-xs">
                {formatDetailValue(key, value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductSwapSection({
  outgoing,
  replacement,
}: {
  outgoing: ProductSwapProduct;
  replacement: ProductSwapProduct;
}) {
  return (
    <div>
      <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Product Swap
      </span>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border bg-red-50/40 p-3 text-sm">
          <div className="mb-2 flex items-center gap-2">
            <ShadcnBadge variant="destructive" className="text-2xs">
              Outgoing
            </ShadcnBadge>
            {outgoing.reason && (
              <span className="text-2xs text-muted-foreground capitalize">
                {outgoing.reason.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <p className="font-medium leading-snug">{outgoing.name}</p>
          <p className="text-xs text-muted-foreground">
            {outgoing.brand} · #{outgoing.external_id}
          </p>
        </div>
        <div className="rounded-md border bg-green-50/40 p-3 text-sm">
          <div className="mb-2 flex items-center gap-2">
            <ShadcnBadge variant="default" className="text-2xs">
              Replacement
            </ShadcnBadge>
            {replacement.discount != null && (
              <span className="text-2xs font-semibold text-green-700">
                {replacement.discount}% off
              </span>
            )}
          </div>
          <p className="font-medium leading-snug">{replacement.name}</p>
          <p className="text-xs text-muted-foreground">
            {replacement.brand} · #{replacement.external_id}
          </p>
          {replacement.sizes && (
            <p className="mt-1 text-xs text-muted-foreground">Sizes: {replacement.sizes}</p>
          )}
          {(replacement.similarity_score != null || replacement.quality_score != null) && (
            <div className="mt-1.5 flex gap-3 text-xs text-muted-foreground">
              {replacement.similarity_score != null && (
                <span>Similarity: {replacement.similarity_score.toFixed(1)}</span>
              )}
              {replacement.quality_score != null && (
                <span>Quality: {replacement.quality_score.toFixed(2)}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionItemContent({ log }: { log: ActionLog }) {
  const payload = log.actionPayload as Partial<CreativeSwitchExternalPayload>;

  const hasOriginalCreativeUrl = typeof payload?.original_creative_url === 'string';
  const hasNewCreativeUrl = typeof payload?.new_creative_url === 'string';
  const isCreativeSwap =
    (log.actionType === 'SWITCH_CREATIVE' || log.actionType === 'CREATIVE_SWITCH_EXTERNAL') &&
    hasOriginalCreativeUrl &&
    hasNewCreativeUrl;

  const hasProductSwap =
    log.actionType === 'CREATIVE_SWITCH_EXTERNAL' &&
    payload?.outgoing_product != null &&
    payload?.replacement_product != null;

  const paramsChangedIsRedundant =
    JSON.stringify(log.paramsChanged) === JSON.stringify(log.actionPayload);

  const cleanedPayload = isCreativeSwap
    ? Object.fromEntries(
        Object.entries(log.actionPayload ?? {}).filter(
          ([k]) =>
            k !== 'original_creative_url' &&
            k !== 'new_creative_url' &&
            k !== 'outgoing_product' &&
            k !== 'replacement_product',
        ),
      )
    : log.actionPayload;

  return (
    <div className="flex flex-col gap-4 pt-2">
      {log.decisionNote && (
        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Decision Note
          </span>
          <div className="rounded-md border bg-blue-50/50 p-3 text-sm text-gray-900">
            {log.decisionNote}
          </div>
        </div>
      )}

      {isCreativeSwap && (
        <CreativeSwapComparison
          originalUrl={payload.original_creative_url!}
          newUrl={payload.new_creative_url!}
        />
      )}

      {hasProductSwap && (
        <ProductSwapSection
          outgoing={payload.outgoing_product!}
          replacement={payload.replacement_product!}
        />
      )}

      {!isCreativeSwap && !paramsChangedIsRedundant && (
        <DetailSection data={log.paramsChanged} label="Parameters Changed" />
      )}

      <DetailSection data={cleanedPayload as Record<string, unknown>} label="Action Payload" />

      <DetailSection data={log.result} label="Result" />

      {log.error && (
        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-destructive">
            Error
          </span>
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {log.error}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-hidden">
        <div className="grid grid-cols-[50px_1fr_1.2fr_1fr_1fr] gap-2 border-b bg-muted/20 px-3 py-2">
          {Array.from({ length: 5 }).map((_, idx) => (
            <Skeleton key={`dco-head-${idx}`} className="h-4 w-full" />
          ))}
        </div>
        <div className="space-y-2 p-3">
          {Array.from({ length: 4 }).map((_, rowIdx) => (
            <div
              key={`dco-row-${rowIdx}`}
              className="grid grid-cols-[50px_1fr_1.2fr_1fr_1fr] gap-2"
            >
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full rounded-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdAccountSelector({
  accounts,
  selectedId,
  onChange,
  isLoading,
}: {
  accounts: { id: string; name: string }[];
  selectedId?: string;
  onChange: (value: string | undefined) => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Ad Account:</span>
      <Select
        value={selectedId ?? ''}
        onValueChange={(value) => onChange(value === 'all' ? undefined : value)}
      >
        <SelectTrigger className="w-[200px]" disabled={isLoading}>
          <SelectValue placeholder="All accounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All accounts</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name || account.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading && <Skeleton className="h-6 w-6 rounded animate-pulse" />}
    </div>
  );
}

function CampaignSelector({
  campaigns,
  selectedId,
  onChange,
  isLoading,
}: {
  campaigns: { id: string; name: string }[];
  selectedId?: string;
  onChange: (value: string | undefined) => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Campaign:</span>
      <Select
        value={selectedId ?? ''}
        onValueChange={(value) => onChange(value === 'all' ? undefined : value)}
      >
        <SelectTrigger className="w-[200px]" disabled={isLoading}>
          <SelectValue placeholder="All campaigns" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All campaigns</SelectItem>
          {campaigns.map((campaign) => (
            <SelectItem key={campaign.id} value={campaign.id}>
              {campaign.name || campaign.id.slice(0, 12) + '...'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading && <Skeleton className="h-6 w-6 rounded animate-pulse" />}
    </div>
  );
}

function SortSelector({
  value,
  onChange,
}: {
  value: 'occurred_at' | 'campaign_id';
  onChange: (value: 'occurred_at' | 'campaign_id') => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Sort by:</span>
      <Select value={value} onValueChange={(val) => onChange(val as 'occurred_at' | 'campaign_id')}>
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="occurred_at">Date (default)</SelectItem>
          <SelectItem value="campaign_id">Campaign ID</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function DateRangeSelector({
  value,
  onChange,
}: {
  value: DateRangeDays;
  onChange: (value: DateRangeDays) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Range:</span>
      <Select
        value={value.toString()}
        onValueChange={(val) => onChange(Number(val) as DateRangeDays)}
      >
        <SelectTrigger className="w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7">Last 7d</SelectItem>
          <SelectItem value="30">Last 30d</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

interface FilterControlsProps {
  filters: {
    status?: string;
    actionType?: string;
    scopeType?: string;
    campaignId?: string;
    metaAccountId?: string;
  };
  campaigns: { id: string; name: string }[];
  adAccounts: { id: string; name: string }[];
  isLoadingCampaigns: boolean;
  isLoadingAdAccounts: boolean;
  onFilterChange: (key: string, value: string | undefined) => void;
}

function FilterControls({
  filters,
  campaigns,
  adAccounts,
  isLoadingCampaigns,
  isLoadingAdAccounts,
  onFilterChange,
}: FilterControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AdAccountSelector
        accounts={adAccounts}
        selectedId={filters.metaAccountId}
        onChange={(value) => onFilterChange('metaAccountId', value)}
        isLoading={isLoadingAdAccounts}
      />

      <CampaignSelector
        campaigns={campaigns}
        selectedId={filters.campaignId}
        onChange={(value) => onFilterChange('campaignId', value)}
        isLoading={isLoadingCampaigns}
      />

      <Select
        value={filters.status ?? ''}
        onValueChange={(value) => onFilterChange('status', value === 'all' ? undefined : value)}
      >
        <SelectTrigger className="w-[100px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="APPROVED">Approved</SelectItem>
          <SelectItem value="SUCCESS">Success</SelectItem>
          <SelectItem value="EXECUTED">Executed</SelectItem>
          <SelectItem value="REJECTED">Rejected</SelectItem>
          <SelectItem value="FAILED">Failed</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.actionType ?? ''}
        onValueChange={(value) => onFilterChange('actionType', value === 'all' ? undefined : value)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Action" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Actions</SelectItem>
          <SelectItem value="PAUSE_CAMPAIGN">Pause Campaign</SelectItem>
          <SelectItem value="ALERT_ACCOUNT">Alert Account</SelectItem>
          <SelectItem value="NOOP">No-op</SelectItem>
          <SelectItem value="SWITCH_CREATIVE">Switch Creative</SelectItem>
          <SelectItem value="CREATIVE_SWITCH_EXTERNAL">Creative Switch External</SelectItem>
          <SelectItem value="ADJUST_BUDGET">Adjust Budget</SelectItem>
          <SelectItem value="SCALE_BUDGET">Scale Budget</SelectItem>
          <SelectItem value="SCALE_CAMPAIGN">Scale Campaign</SelectItem>
          <SelectItem value="SCALE_AD">Scale Ad</SelectItem>
          <SelectItem value="PAUSE_AD">Pause Ad</SelectItem>
          <SelectItem value="CREATE_VARIANT">Create Variant</SelectItem>
          <SelectItem value="ARCHIVE_ENTITY">Archive Entity</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.scopeType ?? ''}
        onValueChange={(value) => onFilterChange('scopeType', value === 'all' ? undefined : value)}
      >
        <SelectTrigger className="w-[100px]">
          <SelectValue placeholder="Scope" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Scopes</SelectItem>
          <SelectItem value="GLOBAL">Global</SelectItem>
          <SelectItem value="ACCOUNT">Account</SelectItem>
          <SelectItem value="CAMPAIGN">Campaign</SelectItem>
          <SelectItem value="ADSET">Ad Set</SelectItem>
          <SelectItem value="AD">Ad</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

interface DCOActionsWidgetProps {
  brandId: string;
  metaAccountId?: string;
  campaignId?: string;
  className?: string;
  variant?: 'table' | 'rail';
}

export function DCOActionsWidget({
  brandId,
  metaAccountId,
  campaignId,
  className,
  variant = 'table',
}: DCOActionsWidgetProps) {
  const {
    logs,
    isLoading,
    error,
    pagination,
    filters,
    sort,
    campaigns,
    adAccounts,
    isLoadingCampaigns,
    isLoadingAdAccounts,
    setFilters,
    setSort,
    goToPage,
    refresh,
  } = useDCOActionLogs({
    brandId,
    metaAccountId,
  });

  const [dateRangeDays, setDateRangeDays] = React.useState<DateRangeDays>(DEFAULT_DATE_RANGE_DAYS);
  const [hoveredRowId, setHoveredRowId] = React.useState<string | null>(null);

  const handleFilterChange = (key: string, value: string | undefined) => {
    setFilters({ [key]: value });
  };

  const handleSortChange = React.useCallback(
    (newSortBy: 'occurred_at' | 'campaign_id') => {
      setSort({ sortBy: newSortBy, sortOrder: 'desc' });
    },
    [setSort],
  );

  const handleDateRangeChange = React.useCallback(
    (days: DateRangeDays) => {
      setDateRangeDays(days);
      const { dateFrom, dateTo } = getDateRangeFromDays(days);
      setFilters({ dateFrom, dateTo });
    },
    [setFilters],
  );

  React.useEffect(() => {
    setFilters({ campaignId });
  }, [campaignId, setFilters]);

  if (variant === 'rail') {
    const visibleLogs = logs.slice(0, 8);

    return (
      <TooltipProvider>
        <section
          className={cn(
            'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card',
            className,
          )}
        >
          <div className="border-b border-border/70 bg-muted/20 px-2 py-1">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <ActivityLogIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <h3 className="truncate text-xs font-semibold sm:text-sm">DCO actions</h3>
                <span className="whitespace-nowrap rounded border border-border/70 bg-background px-1.5 py-0.5 text-2xs text-muted-foreground tabular-nums">
                  {pagination.totalCount} · {dateRangeDays}d
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Select
                  value={filters.status ?? 'all'}
                  onValueChange={(value) =>
                    handleFilterChange('status', value === 'all' ? undefined : value)
                  }
                >
                  <SelectTrigger className="h-7 min-w-0 rounded-md px-2 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="SUCCESS">Success</SelectItem>
                    <SelectItem value="EXECUTED">Executed</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                    <SelectItem value="FAILED">Failed</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={dateRangeDays.toString()}
                  onValueChange={(value) => handleDateRangeChange(Number(value) as DateRangeDays)}
                >
                  <SelectTrigger className="h-7 w-[60px] rounded-md px-2 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7d</SelectItem>
                    <SelectItem value="30">30d</SelectItem>
                  </SelectContent>
                </Select>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={refresh}
                        disabled={isLoading}
                        aria-label="Refresh actions"
                      >
                        <ReloadIcon className={isLoading ? 'animate-spin' : undefined} />
                      </Button>
                    }
                  />
                  <TooltipContent>Refresh actions</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]">
            {error ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                <p className="text-xs text-destructive">{error}</p>
                <button
                  type="button"
                  onClick={refresh}
                  className="mt-2 text-xs font-medium text-destructive underline-offset-4 hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : null}

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={`dco-rail-row-${index}`} className="h-[74px] rounded-lg" />
                ))}
              </div>
            ) : null}

            {!isLoading && !error && visibleLogs.length === 0 ? (
              <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center">
                <p className="text-sm font-medium">No actions in the last {dateRangeDays}d</p>
                {dateRangeDays < 30 ? (
                  <button
                    type="button"
                    onClick={() => handleDateRangeChange(30)}
                    className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Try last 30 days
                  </button>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Automation activity will appear here.
                  </p>
                )}
              </div>
            ) : null}

            {!isLoading && !error && visibleLogs.length > 0 ? (
              <div className="space-y-1.5">
                {visibleLogs.map((log) => {
                  const isHovered = hoveredRowId === log.id;

                  return (
                    // biome-ignore lint/a11y/noStaticElementInteractions: hover-reveal of the action detail is progressive enhancement only; the same data is reachable via the expanded table view, so no role is warranted on this wrapper.
                    <div
                      key={log.id}
                      className="rounded-lg border bg-background/40"
                      onMouseEnter={() => setHoveredRowId(log.id)}
                      onMouseLeave={() => setHoveredRowId(null)}
                    >
                      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-2.5 py-2">
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <ShadcnBadge
                              variant={getStatusVariant(log.status)}
                              className="h-5 px-1.5 text-2xs"
                            >
                              {log.status}
                            </ShadcnBadge>
                            <span className="truncate text-xs text-muted-foreground">
                              {log.scopeType}
                            </span>
                          </span>
                          <span className="mt-1 block truncate text-xs font-medium">
                            {log.actionType.replace(/_/g, ' ')}
                          </span>
                          {log.decisionNote ? (
                            <span className="mt-0.5 block line-clamp-2 text-xs leading-snug text-muted-foreground">
                              {log.decisionNote}
                            </span>
                          ) : null}
                        </span>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatTimestamp(log.occurredAt)}
                        </span>
                      </div>

                      <AnimatePresence initial={false}>
                        {isHovered ? (
                          <motion.div
                            key="detail"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden border-t"
                          >
                            <div className="p-2">
                              <ActionItemContent log={log} />
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => goToPage(pagination.page - 1)}
                disabled={!pagination.hasPrevPage}
                className="font-medium text-foreground disabled:pointer-events-none disabled:opacity-35"
              >
                Prev
              </button>
              <span>
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => goToPage(pagination.page + 1)}
                disabled={!pagination.hasNextPage}
                className="font-medium text-foreground disabled:pointer-events-none disabled:opacity-35"
              >
                Next
              </button>
            </div>
          ) : null}
        </section>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className={className}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Pill variant="muted">
              <ActivityLogIcon aria-hidden="true" />
            </Pill>
            <div>
              <h3 className="text-lg font-semibold">DCO Actions</h3>
              <p className="text-sm text-muted-foreground">
                Last {dateRangeDays}d automated actions
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="secondary" size="icon" onClick={refresh} disabled={isLoading}>
                    <ReloadIcon />
                  </Button>
                }
              />
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Button variant="secondary" size="icon" aria-label="Open full activity log">
              <OpenInNewWindowIcon />
            </Button>
            <Button variant="secondary" size="icon" aria-label="Pin activity log">
              <PinTopIcon />
            </Button>
          </div>
        </div>

        <Separator className="mb-3" />

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <FilterControls
            filters={filters}
            campaigns={campaigns}
            adAccounts={adAccounts}
            isLoadingCampaigns={isLoadingCampaigns}
            isLoadingAdAccounts={isLoadingAdAccounts}
            onFilterChange={handleFilterChange}
          />

          <div className="flex items-center gap-3">
            <SortSelector value={sort.sortBy} onChange={handleSortChange} />
            <DateRangeSelector value={dateRangeDays} onChange={handleDateRangeChange} />
            <span className="text-sm text-muted-foreground">{pagination.totalCount} actions</span>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="destructive" size="sm" className="mt-2" onClick={refresh}>
              Retry
            </Button>
          </div>
        )}

        {isLoading && <LoadingSkeleton />}

        {!isLoading && !error && logs.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No DCO activity in the selected time period.
            </p>
            <span className="mt-1 block text-xs text-muted-foreground">
              Automations will appear here as they run.
            </span>
          </div>
        )}

        {!isLoading && !error && logs.length > 0 && (
          <>
            <div className="flex-1 min-h-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Occurred</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const isHovered = hoveredRowId === log.id;
                    return (
                      <React.Fragment key={log.id}>
                        <TableRow
                          className="group hover:bg-muted/50"
                          onMouseEnter={() => setHoveredRowId(log.id)}
                          onMouseLeave={() => setHoveredRowId(null)}
                        >
                          <TableCell>
                            <ShadcnBadge variant={getStatusVariant(log.status)}>
                              {log.status}
                            </ShadcnBadge>
                          </TableCell>
                          <TableCell>
                            <ShadcnBadge variant={getActionTypeColor(log.actionType)}>
                              {log.actionType.replace(/_/g, ' ')}
                            </ShadcnBadge>
                          </TableCell>
                          <TableCell>
                            <ShadcnBadge variant="outline">{log.scopeType}</ShadcnBadge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {formatTimestamp(log.occurredAt)}
                            </span>
                          </TableCell>
                        </TableRow>
                        <AnimatePresence initial={false}>
                          {isHovered ? (
                            <TableRow
                              key="detail"
                              className="bg-muted/50 hover:bg-muted/50"
                              onMouseEnter={() => setHoveredRowId(log.id)}
                              onMouseLeave={() => setHoveredRowId(null)}
                            >
                              <TableCell colSpan={4} className="p-0 border-b">
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-4">
                                    <ActionItemContent log={log} />
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
            </div>

            {pagination.totalPages > 1 && (
              <div className="mt-4 flex justify-center">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => goToPage(pagination.page - 1)}
                        disabled={!pagination.hasPrevPage}
                      />
                    </PaginationItem>

                    {Array.from({ length: Math.min(5, pagination.totalPages) }).map((_, i) => {
                      let pageNum: number;
                      if (pagination.totalPages <= 5) {
                        pageNum = i + 1;
                      } else {
                        if (pagination.page <= 3) {
                          pageNum = i + 1;
                        } else if (pagination.page >= pagination.totalPages - 2) {
                          pageNum = pagination.totalPages - 4 + i;
                        } else {
                          pageNum = pagination.page - 2 + i;
                        }
                      }

                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            onClick={() => goToPage(pageNum)}
                            isActive={pagination.page === pageNum}
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}

                    <PaginationItem>
                      <PaginationNext
                        onClick={() => goToPage(pagination.page + 1)}
                        disabled={!pagination.hasNextPage}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
