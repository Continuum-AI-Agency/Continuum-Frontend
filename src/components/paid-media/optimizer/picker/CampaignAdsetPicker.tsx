'use client';

// The enrollment selector as a searchable DATA TABLE, grouped by campaign. Each
// campaign is a collapsible group header carrying a tri-state "select all eligible"
// checkbox + campaign-level aggregates (budget / spend / CPA / ads); its ad-set
// rows show the same metrics per ad set. Ad sets the optimizer can't move budget
// for (CBO/lifetime, ingest-frozen) are disabled with a legible, VISIBLE reason —
// never dropped. Selection is controlled by the parent as a flat id array.
//
// In campaign mode each snapshot is self-referential (one campaign per section),
// so the group header is dropped and every campaign renders as a single selectable
// row — the row IS the entity. Eligible campaigns carry a Daily/Lifetime chip;
// ABO campaigns (no campaign budget) are held with the same visible-reason pattern.

import type { AdSetSnapshot, PortfolioLevel } from '@continuum/contracts';
import {
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Search,
  SearchX,
  ServerCrash,
  TriangleAlert,
} from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatCpa, formatCurrency } from '../format';
import { AdsetAdList } from './AdsetAdList';
import {
  type AdsetPickItem,
  buildCampaignSections,
  type CampaignSection,
  filterSection,
  sectionEligibleIds,
} from './campaignGroups';

const COLS = 7;
const DASH = '—';

type CampaignAdsetPickerProps = {
  snapshots: AdSetSnapshot[];
  selectedAdsetIds: string[];
  onChange: (ids: string[]) => void;
  brandId: string;
  accountId: string;
  currency?: string | null;
  disabled?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  // 'adset' (default) groups ad sets under campaigns; 'campaign' selects whole
  // campaigns (one self-referential row per section, no ad-set children).
  mode?: PortfolioLevel;
};

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function money(value: number | null | undefined, currency?: string | null): string {
  return value == null || value <= 0 ? DASH : formatCurrency(value, currency);
}

const BUDGET_TYPE_LABEL: Record<'daily' | 'lifetime', string> = {
  daily: 'Daily',
  lifetime: 'Lifetime',
};

function AdsetTableRow({
  row,
  checked,
  disabled,
  currency,
  adsOpen,
  showAds,
  onToggle,
  onToggleAds,
}: {
  row: AdsetPickItem;
  checked: boolean;
  disabled: boolean;
  currency?: string | null;
  adsOpen: boolean;
  // Campaign mode hides the ads disclosure (a campaign id is not an ad-set id).
  showAds: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onToggleAds: (id: string) => void;
}) {
  const controlId = `optimizer-adset-${safeId(row.id)}`;
  return (
    <TableRow
      data-state={checked ? 'selected' : undefined}
      className={cn(!row.eligible && 'opacity-95')}
    >
      <TableCell className="w-9 py-1.5 pl-3 align-top">
        <Checkbox
          id={controlId}
          className="mt-1"
          checked={checked}
          disabled={disabled || !row.eligible}
          aria-label={row.name}
          onCheckedChange={(value) => onToggle(row.id, value === true)}
        />
      </TableCell>
      <TableCell className="py-1.5 align-top">
        <label
          htmlFor={controlId}
          className={cn('block min-w-0', row.eligible ? 'cursor-pointer' : 'cursor-not-allowed')}
        >
          <span className="flex items-center gap-2">
            <span
              className={cn(
                'truncate text-sm',
                row.eligible ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {row.name}
            </span>
            {row.eligible && row.budgetType ? (
              <Badge variant="outline" className="shrink-0 text-3xs">
                {BUDGET_TYPE_LABEL[row.budgetType]}
              </Badge>
            ) : null}
            {!row.eligible ? (
              <Badge variant="warning" className="shrink-0 text-3xs">
                Held
              </Badge>
            ) : null}
          </span>
          {!row.eligible && row.reason ? (
            <span className="mt-0.5 block text-2xs text-warning">{row.reason}</span>
          ) : null}
        </label>
      </TableCell>
      <TableCell className="py-1.5 text-right text-xs tabular-nums align-top">
        {row.eligible ? formatCurrency(row.currentBudget, currency) : DASH}
      </TableCell>
      <TableCell className="py-1.5 text-right text-xs tabular-nums align-top">
        {money(row.spend14, currency)}
      </TableCell>
      <TableCell className="py-1.5 text-right text-xs tabular-nums align-top">
        {row.cpa != null ? formatCpa(row.cpa, currency) : DASH}
      </TableCell>
      <TableCell className="py-1.5 text-right text-xs tabular-nums align-top">
        {row.adCount > 0 ? row.adCount : DASH}
      </TableCell>
      <TableCell className="w-9 py-1.5 pr-2 align-top">
        {showAds ? (
          <button
            type="button"
            onClick={() => onToggleAds(row.id)}
            aria-label={`Show ads in ${row.name}`}
            aria-expanded={adsOpen}
            className="rounded p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ImageIcon className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function CampaignGroupRow({
  section,
  visible,
  selected,
  disabled,
  currency,
  collapsed,
  onToggleCollapse,
  onToggleMany,
}: {
  section: CampaignSection;
  visible: AdsetPickItem[];
  selected: Set<string>;
  disabled: boolean;
  currency?: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onToggleMany: (ids: string[], checked: boolean) => void;
}) {
  const eligibleIds = sectionEligibleIds(visible);
  const total = eligibleIds.length;
  const selectedCount = eligibleIds.reduce((n, id) => (selected.has(id) ? n + 1 : n), 0);
  const allSelected = total > 0 && selectedCount === total;
  const partiallySelected = selectedCount > 0 && selectedCount < total;
  const selectAllId = `optimizer-campaign-${safeId(section.campaignId)}`;

  return (
    <TableRow className="border-border/60 bg-muted/40 hover:bg-muted/50">
      <TableCell className="w-9 py-2 pl-3">
        <Checkbox
          id={selectAllId}
          checked={partiallySelected ? 'indeterminate' : allSelected}
          disabled={disabled || total === 0}
          aria-label={`Select all eligible ad sets in ${section.campaignName}`}
          onCheckedChange={(value) => onToggleMany(eligibleIds, value === true)}
        />
      </TableCell>
      <TableCell className="py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className="flex min-w-0 items-center gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="truncate font-semibold text-sm text-foreground">
            {section.campaignName}
          </span>
          <span className="shrink-0 text-2xs text-muted-foreground">
            {selectedCount}/{total} of {section.totalCount}
          </span>
        </button>
      </TableCell>
      <TableCell className="py-2 text-right text-xs font-medium tabular-nums">
        {money(section.totalBudget, currency)}
      </TableCell>
      <TableCell className="py-2 text-right text-xs font-medium tabular-nums">
        {money(section.totalSpend14, currency)}
      </TableCell>
      <TableCell className="py-2 text-right text-xs font-medium tabular-nums">
        {section.cpa != null ? formatCpa(section.cpa, currency) : DASH}
      </TableCell>
      <TableCell className="py-2 text-right text-xs font-medium tabular-nums">
        {section.totalAds > 0 ? section.totalAds : DASH}
      </TableCell>
      <TableCell className="w-9 py-2" />
    </TableRow>
  );
}

export function CampaignAdsetPicker({
  snapshots,
  selectedAdsetIds,
  onChange,
  brandId,
  accountId,
  currency,
  disabled = false,
  isLoading = false,
  isError = false,
  mode = 'adset',
}: CampaignAdsetPickerProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adsOpen, setAdsOpen] = useState<Set<string>>(new Set());

  const campaignMode = mode === 'campaign';
  const entityLabel = campaignMode ? 'campaigns' : 'ad sets';
  const sections = useMemo(() => buildCampaignSections(snapshots, mode), [snapshots, mode]);
  const selected = useMemo(() => new Set(selectedAdsetIds), [selectedAdsetIds]);
  const totalEligible = useMemo(
    () => sections.reduce((sum, section) => sum + section.eligibleCount, 0),
    [sections],
  );

  function toggleOne(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange([...next]);
  }

  function toggleMany(ids: string[], checked: boolean) {
    const next = new Set(selected);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    onChange([...next]);
  }

  function toggleCollapse(campaignId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(campaignId)) next.delete(campaignId);
      else next.add(campaignId);
      return next;
    });
  }

  function toggleAds(adsetId: string) {
    setAdsOpen((current) => {
      const next = new Set(current);
      if (next.has(adsetId)) next.delete(adsetId);
      else next.add(adsetId);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 rounded-md bg-muted/70" />
        <Skeleton className="h-9 rounded-md bg-muted/70" />
        <Skeleton className="h-9 w-3/4 rounded-md bg-muted/70" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2.5 text-warning text-xs">
        <ServerCrash className="size-4 shrink-0" aria-hidden />
        Couldn&rsquo;t load {entityLabel} for this account. The optimizer service may be offline.
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 border-dashed py-8 text-center">
        <SearchX className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground text-sm">
          No active {entityLabel} found for this account.
        </p>
      </div>
    );
  }

  const searching = query.trim().length > 0;
  const rendered = sections
    .map((section) => ({ section, visible: filterSection(section, query) }))
    .filter(({ visible }) => !searching || visible.length > 0);

  return (
    <div className="flex flex-col gap-2">
      {snapshots.length > 6 ? (
        <div className="relative">
          <Search
            className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={campaignMode ? 'Search campaigns' : 'Search campaigns or ad sets'}
            className="h-8 pl-8 text-sm"
            aria-label={campaignMode ? 'Search campaigns' : 'Search campaigns or ad sets'}
          />
        </div>
      ) : null}

      {totalEligible === 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2.5 text-2xs text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {campaignMode
              ? 'Every campaign here splits its budget at the ad-set level (ABO), so there’s nothing to reallocate at the campaign level. Optimize these as an ad-set portfolio instead.'
              : 'Every ad set here has its budget managed at the campaign level (CBO or lifetime), so there’s nothing for the optimizer to reallocate. Connect an account with ad-set daily budgets to enroll.'}
          </span>
        </div>
      ) : null}

      <Table containerClassName="max-h-[60vh] overflow-y-auto overscroll-contain rounded-lg border border-border/60">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-9 pl-3" />
            <TableHead className="text-xs">{campaignMode ? 'Campaign' : 'Ad set'}</TableHead>
            <TableHead className="text-right text-xs">
              {campaignMode ? 'Budget' : 'Budget/day'}
            </TableHead>
            <TableHead className="text-right text-xs">Spend 14d</TableHead>
            <TableHead className="text-right text-xs">CPA</TableHead>
            <TableHead className="text-right text-xs">Ads</TableHead>
            <TableHead className="w-9" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rendered.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={COLS} className="py-6 text-center text-muted-foreground text-sm">
                No {campaignMode ? 'campaigns' : 'campaigns or ad sets'} match &ldquo;{query.trim()}
                &rdquo;.
              </TableCell>
            </TableRow>
          ) : (
            rendered.map(({ section, visible }) => {
              // Campaign mode: the section IS a single self-referential row — render
              // it directly (no group header, no ad-set children, no ads disclosure).
              if (campaignMode) {
                const row = visible[0] ?? section.adsets[0];
                return (
                  <AdsetTableRow
                    key={section.campaignId}
                    row={row}
                    checked={selected.has(row.id)}
                    disabled={disabled}
                    currency={currency}
                    adsOpen={false}
                    showAds={false}
                    onToggle={toggleOne}
                    onToggleAds={toggleAds}
                  />
                );
              }
              const isCollapsed = !searching && collapsed.has(section.campaignId);
              return (
                <Fragment key={section.campaignId}>
                  <CampaignGroupRow
                    section={section}
                    visible={visible}
                    selected={selected}
                    disabled={disabled}
                    currency={currency}
                    collapsed={isCollapsed}
                    onToggleCollapse={() => toggleCollapse(section.campaignId)}
                    onToggleMany={toggleMany}
                  />
                  {isCollapsed
                    ? null
                    : visible.map((row) => (
                        <Fragment key={row.id}>
                          <AdsetTableRow
                            row={row}
                            checked={selected.has(row.id)}
                            disabled={disabled}
                            currency={currency}
                            adsOpen={adsOpen.has(row.id)}
                            showAds
                            onToggle={toggleOne}
                            onToggleAds={toggleAds}
                          />
                          {adsOpen.has(row.id) ? (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={COLS} className="bg-muted/20 p-0">
                                <AdsetAdList
                                  brandId={brandId}
                                  accountId={accountId}
                                  adsetId={row.id}
                                />
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      ))}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
