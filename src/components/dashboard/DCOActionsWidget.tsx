'use client';

import { ArrowUpToLine, RotateCw, ScrollText, SquareArrowOutUpRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
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
import { dcoActionLabel, dcoScopeLabel, dcoStatusLabel } from './dcoControlLabels';

function formatTimestamp(isoString: string, locale = 'en'): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' }).format(
      -diffMins,
      'minute',
    );
  } else if (diffHours < 24) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' }).format(
      -Math.floor(diffHours),
      'hour',
    );
  } else {
    return date.toLocaleDateString(locale, {
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

function formatCurrency(value: number | string, locale = 'en'): string {
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

function formatDetailValue(key: string, value: unknown, locale = 'en'): string {
  const lowerKey = key.toLowerCase();
  const isCurrencyKey = CURRENCY_KEYS.some((term) => lowerKey.includes(term));

  if (typeof value === 'number') {
    if (isCurrencyKey) {
      return formatCurrency(value, locale);
    }
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(value);
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
        return `${prefix}${formatCurrency(numberPart, locale)}`;
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
      return `${keyword} ${prefix.trim()} ${formatCurrency(number, locale)}`
        .trim()
        .replace(/\s+/g, ' ');
    });
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function DetailSection({ data, label }: { data: Record<string, unknown> | null; label: string }) {
  const uiLocale = useLocale();

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
                {formatDetailValue(key, value, uiLocale)}
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
  const uiLocale = useLocale();

  const uiText = useTranslations('dashboard');
  return (
    <div>
      <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {uiText('product_swap_28725af')}
      </span>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border bg-red-50/40 p-3 text-sm">
          <div className="mb-2 flex items-center gap-2">
            <ShadcnBadge variant="destructive" className="text-2xs">
              {uiText('outgoing_3619cf0')}
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
              {uiText('replacement_cefd665')}
            </ShadcnBadge>
            {replacement.discount != null && (
              <span className="text-2xs font-semibold text-green-700">
                {uiText.rich('sentence_1bbee745d52c', { v0: () => replacement.discount })}
              </span>
            )}
          </div>
          <p className="font-medium leading-snug">{replacement.name}</p>
          <p className="text-xs text-muted-foreground">
            {replacement.brand} · #{replacement.external_id}
          </p>
          {replacement.sizes && (
            <p className="mt-1 text-xs text-muted-foreground">
              {uiText.rich('sentence_73995ad03da2', { v0: () => replacement.sizes })}
            </p>
          )}
          {(replacement.similarity_score != null || replacement.quality_score != null) && (
            <div className="mt-1.5 flex gap-3 text-xs text-muted-foreground">
              {replacement.similarity_score != null && (
                <span>
                  {uiText.rich('sentence_ba1c7ec7bee0', {
                    v0: () =>
                      replacement.similarity_score === undefined
                        ? ''
                        : new Intl.NumberFormat(uiLocale, {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          }).format(replacement.similarity_score),
                  })}
                </span>
              )}
              {replacement.quality_score != null && (
                <span>
                  {uiText.rich('sentence_428e98b5586b', {
                    v0: () =>
                      replacement.quality_score === undefined
                        ? ''
                        : new Intl.NumberFormat(uiLocale, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }).format(replacement.quality_score),
                  })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionItemContent({ log }: { log: ActionLog }) {
  const uiText = useTranslations('dashboard');
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
            {uiText('decision_note_4990c10')}
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
        <DetailSection data={log.paramsChanged} label={uiText('parameters_changed_df2cd18')} />
      )}

      <DetailSection
        data={cleanedPayload as Record<string, unknown>}
        label={uiText('action_payload_c62a605')}
      />

      <DetailSection data={log.result} label={uiText('result_6e7d50e')} />

      {log.error && (
        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-destructive">
            {uiText('error_54a0e8c')}
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
  const uiText = useTranslations('dashboard');
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{uiText('ad_account_0360aa2')}</span>
      <Select
        value={selectedId ?? ''}
        onValueChange={(value) => onChange(value === 'all' ? undefined : value)}
      >
        <SelectTrigger className="w-[200px]" disabled={isLoading}>
          <SelectValue placeholder={uiText('all_accounts_f4f6813')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{uiText('all_accounts_f4f6813')}</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name || account.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading && <Skeleton className="h-6 w-6 rounded" />}
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
  const uiText = useTranslations('dashboard');
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{uiText('campaign_2983410')}</span>
      <Select
        value={selectedId ?? ''}
        onValueChange={(value) => onChange(value === 'all' ? undefined : value)}
      >
        <SelectTrigger className="w-[200px]" disabled={isLoading}>
          <SelectValue placeholder={uiText('all_campaigns_ffdb9c4')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{uiText('all_campaigns_ffdb9c4')}</SelectItem>
          {campaigns.map((campaign) => (
            <SelectItem key={campaign.id} value={campaign.id}>
              {campaign.name || campaign.id.slice(0, 12) + '...'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading && <Skeleton className="h-6 w-6 rounded" />}
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
  const uiText = useTranslations('dashboard');
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{uiText('sort_by_27ab006')}</span>
      <Select value={value} onValueChange={(val) => onChange(val as 'occurred_at' | 'campaign_id')}>
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="occurred_at">{uiText('date_default_2013b7f')}</SelectItem>
          <SelectItem value="campaign_id">{uiText('campaign_id_1078a0a')}</SelectItem>
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
  const uiText = useTranslations('dashboard');
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{uiText('range_01059eb')}</span>
      <Select
        value={value.toString()}
        onValueChange={(val) => onChange(Number(val) as DateRangeDays)}
      >
        <SelectTrigger className="w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7">{uiText('last_7d_9976054')}</SelectItem>
          <SelectItem value="30">{uiText('last_30d_bbada0d')}</SelectItem>
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
  const uiText = useTranslations('dashboard');
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
          <SelectValue placeholder={uiText('status_920e413')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{uiText('all_status_4310add')}</SelectItem>
          <SelectItem value="APPROVED">{uiText('approved_87b42e4')}</SelectItem>
          <SelectItem value="SUCCESS">{uiText('success_c88a0b9')}</SelectItem>
          <SelectItem value="EXECUTED">{uiText('executed_3aa8b68')}</SelectItem>
          <SelectItem value="REJECTED">{uiText('rejected_aea4a04')}</SelectItem>
          <SelectItem value="FAILED">{uiText('failed_031a8f0')}</SelectItem>
          <SelectItem value="PENDING">{uiText('pending_331551b')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.actionType ?? ''}
        onValueChange={(value) => onFilterChange('actionType', value === 'all' ? undefined : value)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={uiText('action_64cff13')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{uiText('all_actions_d409578')}</SelectItem>
          <SelectItem value="PAUSE_CAMPAIGN">{uiText('pause_campaign_0f63c6b')}</SelectItem>
          <SelectItem value="ALERT_ACCOUNT">{uiText('alert_account_04d4764')}</SelectItem>
          <SelectItem value="NOOP">{uiText('no_op_d5440dd')}</SelectItem>
          <SelectItem value="SWITCH_CREATIVE">{uiText('switch_creative_3040cdc')}</SelectItem>
          <SelectItem value="CREATIVE_SWITCH_EXTERNAL">
            {uiText('creative_switch_external_201b340')}
          </SelectItem>
          <SelectItem value="ADJUST_BUDGET">{uiText('adjust_budget_e6fadbc')}</SelectItem>
          <SelectItem value="SCALE_BUDGET">{uiText('scale_budget_ea66b21')}</SelectItem>
          <SelectItem value="SCALE_CAMPAIGN">{uiText('scale_campaign_db3b15e')}</SelectItem>
          <SelectItem value="SCALE_AD">{uiText('scale_ad_b92ac59')}</SelectItem>
          <SelectItem value="PAUSE_AD">{uiText('pause_ad_4f3b26a')}</SelectItem>
          <SelectItem value="CREATE_VARIANT">{uiText('create_variant_94ef3ff')}</SelectItem>
          <SelectItem value="ARCHIVE_ENTITY">{uiText('archive_entity_7b12ae7')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.scopeType ?? ''}
        onValueChange={(value) => onFilterChange('scopeType', value === 'all' ? undefined : value)}
      >
        <SelectTrigger className="w-[100px]">
          <SelectValue placeholder={uiText('scope_b073f6c')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{uiText('all_scopes_c2e1087')}</SelectItem>
          <SelectItem value="GLOBAL">{uiText('global_a258b30')}</SelectItem>
          <SelectItem value="ACCOUNT">{uiText('account_7e1b0d5')}</SelectItem>
          <SelectItem value="CAMPAIGN">{uiText('campaign_268286d')}</SelectItem>
          <SelectItem value="ADSET">{uiText('ad_set_8fa52e4')}</SelectItem>
          <SelectItem value="AD">{uiText('ad_1d97c9f')}</SelectItem>
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
  const uiLocale = useLocale();

  const uiText = useTranslations('dashboard');
  const {
    logs,
    isLoading,
    error,
    selectorError,
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
                <ScrollText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <h3 className="truncate text-xs font-semibold sm:text-sm">
                  {uiText('dco_actions_d3f7a22')}
                </h3>
                <span className="whitespace-nowrap rounded border border-border/70 bg-background px-1.5 py-0.5 text-2xs text-muted-foreground tabular-nums">
                  {uiText.rich('sentence_3b6c7451c3a7', {
                    v0: () => pagination.totalCount,
                    v1: () => dateRangeDays,
                  })}
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
                    <SelectValue placeholder={uiText('status_920e413')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{uiText('all_status_32b9b2c')}</SelectItem>
                    <SelectItem value="APPROVED">{uiText('approved_87b42e4')}</SelectItem>
                    <SelectItem value="SUCCESS">{uiText('success_c88a0b9')}</SelectItem>
                    <SelectItem value="EXECUTED">{uiText('executed_3aa8b68')}</SelectItem>
                    <SelectItem value="REJECTED">{uiText('rejected_aea4a04')}</SelectItem>
                    <SelectItem value="FAILED">{uiText('failed_031a8f0')}</SelectItem>
                    <SelectItem value="PENDING">{uiText('pending_331551b')}</SelectItem>
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
                    <SelectItem value="7">{uiText('7d_a7c7426')}</SelectItem>
                    <SelectItem value="30">{uiText('30d_e3ba17e')}</SelectItem>
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
                        aria-label={uiText('refresh_actions_ee8e81d')}
                      >
                        <RotateCw className={isLoading ? 'animate-spin' : undefined} />
                      </Button>
                    }
                  />
                  <TooltipContent>{uiText('refresh_actions_ee8e81d')}</TooltipContent>
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
                  {uiText('retry_942087c')}
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
                <p className="text-sm font-medium">
                  {uiText.rich('sentence_76b541083484', { count: dateRangeDays })}
                </p>
                {dateRangeDays < 30 ? (
                  <button
                    type="button"
                    onClick={() => handleDateRangeChange(30)}
                    className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {uiText('try_last_30_days_b7594fe')}
                  </button>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {uiText('automation_activity_will_appear_here_9183eb5')}
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
                              {dcoStatusLabel(log.status, uiText)}
                            </ShadcnBadge>
                            <span className="truncate text-xs text-muted-foreground">
                              {dcoScopeLabel(log.scopeType, uiText)}
                            </span>
                          </span>
                          <span className="mt-1 block truncate text-xs font-medium">
                            {dcoActionLabel(log.actionType, uiText)}
                          </span>
                          {log.decisionNote ? (
                            <span className="mt-0.5 block line-clamp-2 text-xs leading-snug text-muted-foreground">
                              {log.decisionNote}
                            </span>
                          ) : null}
                        </span>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatTimestamp(log.occurredAt, uiLocale)}
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
                {uiText('prev_7391299')}
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
                {uiText('next_1ff57a2')}
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
              <ScrollText aria-hidden="true" />
            </Pill>
            <div>
              <h3 className="text-lg font-semibold">{uiText('dco_actions_4e1fede')}</h3>
              <p className="text-sm text-muted-foreground">
                {uiText.rich('sentence_409d00e19eb1', { count: dateRangeDays })}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="secondary" size="icon" onClick={refresh} disabled={isLoading}>
                    <RotateCw />
                  </Button>
                }
              />
              <TooltipContent>{uiText('refresh_0e91610')}</TooltipContent>
            </Tooltip>
            <Button
              variant="secondary"
              size="icon"
              aria-label={uiText('open_full_activity_log_b0964bb')}
            >
              <SquareArrowOutUpRight />
            </Button>
            <Button variant="secondary" size="icon" aria-label={uiText('pin_activity_log_85aa1aa')}>
              <ArrowUpToLine />
            </Button>
          </div>
        </div>

        <Separator className="mb-3" />

        {selectorError ? (
          <p className="mb-2 text-destructive-ink text-xs" role="alert">
            {selectorError}
          </p>
        ) : null}
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
            <span className="text-sm text-muted-foreground">
              {uiText.rich('sentence_6f4adc336b07', { count: pagination.totalCount })}
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="destructive" size="sm" className="mt-2" onClick={refresh}>
              {uiText('retry_942087c')}
            </Button>
          </div>
        )}

        {isLoading && <LoadingSkeleton />}

        {!isLoading && !error && logs.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              {uiText('no_dco_activity_in_the_selected_time_period_5d188a8')}
            </p>
            <span className="mt-1 block text-xs text-muted-foreground">
              {uiText('automations_will_appear_here_as_they_run_7dd9787')}
            </span>
          </div>
        )}

        {!isLoading && !error && logs.length > 0 && (
          <>
            <div className="flex-1 min-h-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiText('status_920e413')}</TableHead>
                    <TableHead>{uiText('action_64cff13')}</TableHead>
                    <TableHead>{uiText('scope_b073f6c')}</TableHead>
                    <TableHead>{uiText('occurred_553bd4f')}</TableHead>
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
                              {dcoStatusLabel(log.status, uiText)}
                            </ShadcnBadge>
                          </TableCell>
                          <TableCell>
                            <ShadcnBadge variant={getActionTypeColor(log.actionType)}>
                              {dcoActionLabel(log.actionType, uiText)}
                            </ShadcnBadge>
                          </TableCell>
                          <TableCell>
                            <ShadcnBadge variant="outline">
                              {dcoScopeLabel(log.scopeType, uiText)}
                            </ShadcnBadge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {formatTimestamp(log.occurredAt, uiLocale)}
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
