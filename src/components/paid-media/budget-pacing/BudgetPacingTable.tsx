'use client';

import { ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import type { BudgetPacingAdSetEntry, BudgetPacingEntry } from '@/lib/schemas/budgetPacing';
import { cn } from '@/lib/utils';
import type { RangeOption } from './BudgetPacingChart';
import { BudgetPacingStatusBadge } from './BudgetPacingStatusBadge';
import {
  budgetPacingColumnLabels,
  formatBudgetPacingPercent,
  formatBudgetPacingCurrency as formatCurrency,
} from './budgetPacingPresentation';

const PAGE_SIZE = 10;
const DAY_MS = 86_400_000;

type DailyPoint = { date: string; spend: number; target: number };

type Props = {
  campaigns: BudgetPacingEntry[];
  focusKey: string | null;
  onFocusKey: (key: string | null) => void;
  selectedRange: RangeOption;
};

function toDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function computeWindowSpend(trend: DailyPoint[], days: number | null): number {
  if (days === null) return trend.reduce((s, p) => s + p.spend, 0);
  const cutoff = toDay(new Date(Date.now() - days * DAY_MS));
  return trend.filter((p) => p.date >= cutoff).reduce((s, p) => s + p.spend, 0);
}

function computeWindowTarget(
  budgetType: 'daily' | 'lifetime',
  totalBudget: number,
  daysElapsed: number,
  daysRemaining: number | null,
  days: number | null,
): number | null {
  if (totalBudget <= 0) return null;
  if (days === null) return null; // "all" uses raw budgetRemaining

  const totalFlightDays = daysRemaining !== null ? daysElapsed + daysRemaining : null;

  if (budgetType === 'daily') {
    return totalBudget * days;
  }
  if (totalFlightDays && totalFlightDays > 0) {
    return (totalBudget / totalFlightDays) * days;
  }
  return null;
}

const RANGE_DAYS: Record<RangeOption, number | null> = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  all: null,
};

const paceColor: Record<string, string> = {
  on_pace: 'text-emerald-500',
  underspending: 'text-amber-500',
  overspending: 'text-red-500',
};

const GRID = 'grid-cols-[minmax(160px,1fr)_72px_104px_136px_136px_88px_96px]';

type RowData = {
  id: string;
  name: string;
  budgetType: 'daily' | 'lifetime';
  totalBudget: number;
  spendToDate: number;
  budgetRemaining: number;
  pacePct: number;
  paceStatus: 'on_pace' | 'underspending' | 'overspending';
  paceMethod: 'budget' | 'trend';
  todaySpend: number;
  daysElapsed: number;
  daysRemaining: number | null;
  dailyTrend: DailyPoint[];
  focusKeyValue: string;
};

function PacingRow({
  row,
  isFocused,
  onFocus,
  selectedRange,
  indent,
  expandSlot,
}: {
  row: RowData;
  isFocused: boolean;
  onFocus: () => void;
  selectedRange: RangeOption;
  indent?: boolean;
  expandSlot?: React.ReactNode;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const days = RANGE_DAYS[selectedRange];
  const windowSpend = computeWindowSpend(row.dailyTrend, days);
  const windowTarget = computeWindowTarget(
    row.budgetType,
    row.totalBudget,
    row.daysElapsed,
    row.daysRemaining,
    days,
  );
  const windowRemaining =
    days === null ? row.budgetRemaining : windowTarget !== null ? windowTarget - windowSpend : null;

  return (
    // biome-ignore lint/a11y/useSemanticElements: The grid row contains an independent expansion button.
    <div
      role="button"
      tabIndex={0}
      onClick={onFocus}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onFocus();
        }
      }}
      className={cn(
        `grid ${GRID} items-center gap-x-3 border-b border-border/40 px-4 py-2.5 last:border-b-0`,
        'cursor-pointer select-none transition-colors',
        indent && 'pl-8 bg-muted/20',
        isFocused ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted/40',
        !isFocused && !indent && row.paceStatus === 'overspending' && 'bg-red-500/5',
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        {expandSlot ?? <span className="w-4 shrink-0" />}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.name}</p>
          {row.daysRemaining !== null ? (
            <p className="text-xs text-muted-foreground">
              {uiText.rich('sentence_a846e5afbc10', {
                count: row.daysRemaining,
              })}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">—</p>
          )}
        </div>
      </div>

      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
        {uiText(row.budgetType === 'daily' ? 'daily_b36c261' : 'lifetime_bdcd897')}
      </span>

      <span className="tabular-nums text-sm text-right">
        {row.totalBudget > 0 ? formatCurrency(row.totalBudget, uiLocale) : '—'}
      </span>

      <div className="text-right">
        <p className="tabular-nums text-sm">{formatCurrency(windowSpend, uiLocale)}</p>
        {row.budgetType === 'daily' && (
          <p className="text-xs text-muted-foreground">
            {uiText.rich('sentence_01ebc82a3601', {
              v0: formatCurrency(row.todaySpend, uiLocale),
            })}
          </p>
        )}
      </div>

      <span className="tabular-nums text-sm text-right">
        {windowRemaining !== null ? formatCurrency(windowRemaining, uiLocale) : '—'}
      </span>

      <div className="flex flex-col items-end gap-1">
        <span className={cn('tabular-nums text-sm', paceColor[row.paceStatus])}>
          {row.paceMethod === 'trend' ? '~' : ''}
          {formatBudgetPacingPercent(row.pacePct, uiLocale)}
        </span>
        {row.paceMethod === 'trend' && (
          <span className="text-2xs text-muted-foreground">{uiText('vs_7d_avg_d7903c1')}</span>
        )}
        <Progress value={Math.min(100, row.pacePct)} className="h-1 w-16" />
      </div>

      <BudgetPacingStatusBadge status={row.paceStatus} />
    </div>
  );
}

function toCampaignRow(c: BudgetPacingEntry): RowData {
  return {
    id: c.campaignId,
    name: c.campaignName,
    budgetType: c.budgetType,
    totalBudget: c.totalBudget,
    spendToDate: c.spendToDate,
    budgetRemaining: c.budgetRemaining,
    pacePct: c.pacePct,
    paceStatus: c.paceStatus,
    paceMethod: c.paceMethod,
    todaySpend: c.todaySpend,
    daysElapsed: c.daysElapsed,
    daysRemaining: c.daysRemaining,
    dailyTrend: c.dailyTrend,
    focusKeyValue: `campaign:${c.campaignId}`,
  };
}

function toAdSetRow(a: BudgetPacingAdSetEntry): RowData {
  return {
    id: a.adSetId,
    name: a.adSetName,
    budgetType: a.budgetType,
    totalBudget: a.totalBudget,
    spendToDate: a.spendToDate,
    budgetRemaining: a.budgetRemaining,
    pacePct: a.pacePct,
    paceStatus: a.paceStatus,
    paceMethod: a.paceMethod,
    todaySpend: a.todaySpend,
    daysElapsed: a.daysElapsed,
    daysRemaining: a.daysRemaining,
    dailyTrend: a.dailyTrend,
    focusKeyValue: `adset:${a.adSetId}`,
  };
}

export function BudgetPacingTable({ campaigns, focusKey, onFocusKey, selectedRange }: Props) {
  const uiText = useTranslations('scale');
  const columnLabels = useMemo(
    () =>
      budgetPacingColumnLabels(selectedRange, (field, days) => {
        if (days === null) return uiText(field === 'spend' ? 'spend_85f3d55' : 'remaining_f3e4352');
        return uiText(field === 'spend' ? 'budgetWindowSpend' : 'budgetWindowRemaining', { days });
      }),
    [selectedRange, uiText],
  );

  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const active = [...campaigns]
    .filter((c) => c.status === 'ACTIVE')
    .sort((a, b) => a.campaignName.localeCompare(b.campaignName));

  const filtered = query.trim()
    ? active.filter((c) => c.campaignName.toLowerCase().includes(query.toLowerCase()))
    : active;

  if (active.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {uiText('no_active_campaigns_found_4be89d9')}
      </p>
    );
  }

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visibleCount;

  const toggleExpand = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <input
        type="search"
        placeholder={uiText('search_campaigns_a1f838c')}
        aria-label={uiText('search_campaigns_a1f838c')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setVisibleCount(PAGE_SIZE);
        }}
        className="w-full rounded border border-border/60 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />

      <div className="min-w-0 rounded-lg border border-border/60 overflow-x-auto overflow-y-hidden">
        <div
          className={`grid ${GRID} min-w-[640px] gap-x-3 border-b border-border/60 bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground`}
        >
          <span>{uiText('campaign_268286d')}</span>
          <span>{uiText('type_baaddf7')}</span>
          <span className="text-right">{uiText('budget_1c6225e')}</span>
          <span className="text-right">{columnLabels.spend}</span>
          <span className="text-right">{columnLabels.remaining}</span>
          <span className="text-right">{uiText('pace_9582b50')}</span>
          <span>{uiText('status_920e413')}</span>
        </div>

        <div className="min-w-[640px] max-h-[360px] overflow-y-auto">
          {visible.map((campaign) => {
            const isExpanded = expandedIds.has(campaign.campaignId);
            const isCampaignFocused = focusKey === `campaign:${campaign.campaignId}`;
            const hasAdSets = campaign.adSets.length > 0;

            return (
              <div key={campaign.campaignId}>
                <PacingRow
                  row={toCampaignRow(campaign)}
                  isFocused={isCampaignFocused}
                  selectedRange={selectedRange}
                  onFocus={() =>
                    onFocusKey(isCampaignFocused ? null : `campaign:${campaign.campaignId}`)
                  }
                  expandSlot={
                    hasAdSets ? (
                      <button
                        type="button"
                        className="flex shrink-0 items-center justify-center rounded p-1.5 hover:bg-muted min-w-[28px] min-h-[28px] active:scale-[0.96] transition-[transform,background-color]"
                        onClick={(e) => toggleExpand(campaign.campaignId, e)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ')
                            toggleExpand(campaign.campaignId, e);
                        }}
                        aria-label={
                          isExpanded
                            ? uiText('collapse_adsets_1efada8')
                            : uiText('expand_adsets_44968ba')
                        }
                      >
                        <ChevronRight
                          className={cn(
                            'size-4 text-muted-foreground transition-transform duration-200',
                            isExpanded && 'rotate-90',
                          )}
                        />
                      </button>
                    ) : (
                      <span className="w-4 shrink-0" />
                    )
                  }
                />
                {isExpanded &&
                  campaign.adSets.map((adSet) => {
                    const isAdSetFocused = focusKey === `adset:${adSet.adSetId}`;
                    return (
                      <PacingRow
                        key={adSet.adSetId}
                        row={toAdSetRow(adSet)}
                        isFocused={isAdSetFocused}
                        selectedRange={selectedRange}
                        indent
                        onFocus={() => onFocusKey(isAdSetFocused ? null : `adset:${adSet.adSetId}`)}
                      />
                    );
                  })}
              </div>
            );
          })}

          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              className="w-full py-2.5 text-center text-xs text-muted-foreground transition-[transform,background-color] hover:bg-muted/50 active:scale-[0.96]"
            >
              {uiText.rich('sentence_b5598cb3ecb1', {
                v0: Math.min(PAGE_SIZE, remaining),
                v1: remaining,
              })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
