'use client';

// The enrollment selector: a VIRTUALIZED, campaign-grouped table of ad sets.
//
// It used to render every ad set in the account into the DOM, inside a max-h-[60vh] box, inside
// a 672px column, with a scroll container fighting the one its parent already had. A 300-ad-set
// account produced 300+ rows and two competing scrollbars. It is now windowed by
// @tanstack/react-virtual (already a dependency, used by nothing), with exactly ONE scroll
// container that this component owns.
//
// Built from the shadcn primitives — Table/TableHeader/TableRow/TableCell inside a ScrollArea.
// Two things had to be reconciled to get there:
//
//   1. Virtualization needs absolutely-positioned rows, which fight table layout. So the table,
//      its body and its rows are laid out with `display: grid` on one shared column template.
//      The elements stay real <table>/<tr>/<td>, so the semantics (and their implicit ARIA
//      roles) survive; only the layout algorithm changes. Hand-rolling role="grid" on divs
//      would have thrown the semantics away to buy nothing.
//
//   2. Radix wraps a ScrollArea Viewport's children in a `display: table` div, so
//      `position: sticky` does not survive inside one. Rather than give up the pinned column
//      header, the header is lifted OUT of the scroller into its own header-only Table: it
//      cannot scroll away, so it never needs to be sticky. The overlay scrollbar takes no
//      layout width, so the two tables stay aligned on the shared GRID_COLS template.
//      ScrollArea exposes its viewport via the `viewportRef` prop on our copy of the component
//      (shadcn components live in this repo to be owned and extended).
//
// Ad sets the optimizer cannot move budget for (CBO/lifetime, ingest-frozen) are still disabled
// with a legible, VISIBLE reason — never dropped. New: with an `objective` in hand, ad sets that
// buy a DIFFERENT event are marked too. Those are eligible and yet completely inert, because
// runCycle freezes them on kpi_mismatch. On a live account 60 of 63 eligible ad sets were
// mismatched under a `purchase` objective — 95% of the budget enrolled and frozen solid. The
// picker could not see it, because eligibility is deliberately objective-agnostic. Now it can.
//
// In campaign mode each snapshot is self-referential (one campaign per section), so the group
// header is dropped and every campaign renders as a single selectable row — the row IS the
// entity.

import type { AdSetSnapshot, OptimizationObjective, PortfolioLevel } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  SearchX,
  ServerCrash,
  TriangleAlert,
} from 'lucide-react';
import { type CSSProperties, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatCpa, formatCurrency } from '../format';
import { AdsetAdList } from './AdsetAdList';
import {
  type AdsetPickItem,
  buildCampaignSections,
  type CampaignSection,
  defaultCollapsed,
  flattenRows,
  type PickerChip,
  type PickerRow,
  pickerCounts,
  sectionEligibleIds,
  sectionsMatching,
  topEligibleBySpend,
} from './campaignGroups';
import { PickerToolbar } from './PickerToolbar';

const DASH = '—';

// Fixed heights make estimateSize EXACT — no measureElement, no scroll jitter, and
// scrollToIndex lands where it says it will.
const ROW_H = { campaign: 44, adset: 40, held: 56 } as const;

// One template for the head and every row, so the columns line up without table layout.
const GRID_COLS =
  'grid grid-cols-[2rem_minmax(0,1fr)_6.5rem_6.5rem_5.5rem_3.5rem_2rem] items-center gap-2 px-3';

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
  mode?: PortfolioLevel;
  /** The portfolio's objective. Unlocks the KPI-mismatch marking and an objective-correct cost
   *  column. Optional so PortfolioManagePanel keeps working unchanged. */
  objective?: OptimizationObjective;
  /** How tall the scroll region is. The default suits an inline form; the two-pane builder
   *  passes h-full and gives the picker the whole pane. */
  heightClassName?: string;
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

const AdsetRow = memo(function AdsetRow({
  row,
  checked,
  disabled,
  currency,
  showAds,
  brandId,
  accountId,
  onToggle,
  style,
}: {
  row: AdsetPickItem;
  checked: boolean;
  disabled: boolean;
  currency?: string | null;
  showAds: boolean;
  brandId: string;
  accountId: string;
  onToggle: (id: string, checked: boolean) => void;
  style: CSSProperties;
}) {
  const controlId = `optimizer-adset-${safeId(row.id)}`;

  return (
    <TableRow
      data-state={checked ? 'selected' : undefined}
      style={style}
      className={cn(GRID_COLS, 'absolute top-0 left-0 w-full border-border/40')}
    >
      <TableCell className="p-0 flex justify-center">
        <Checkbox
          id={controlId}
          checked={checked}
          disabled={disabled || !row.eligible}
          aria-label={row.name}
          onCheckedChange={(value) => onToggle(row.id, value === true)}
        />
      </TableCell>

      <TableCell className="p-0 min-w-0">
        <label
          htmlFor={controlId}
          className={cn('block min-w-0', row.eligible ? 'cursor-pointer' : 'cursor-not-allowed')}
        >
          <span className="flex items-center gap-1.5">
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
            {row.eligible && row.mismatch ? (
              <Badge variant="warning" className="shrink-0 text-3xs">
                Wrong KPI
              </Badge>
            ) : null}
          </span>

          {/* The reason is always VISIBLE, never tooltip-only — line-clamped so the row height
              stays exact, with the full text on hover. */}
          {!row.eligible && row.reason ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="mt-0.5 line-clamp-1 block text-2xs text-warning">
                  {row.reason}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{row.reason}</TooltipContent>
            </Tooltip>
          ) : null}
          {row.eligible && row.mismatch ? (
            <span className="mt-0.5 line-clamp-1 block text-2xs text-warning">
              Buys {row.kpiField} — the optimizer freezes it and never moves its budget.
            </span>
          ) : null}
        </label>
      </TableCell>

      <TableCell className="p-0 text-right text-xs tabular-nums">
        {row.eligible ? formatCurrency(row.currentBudget, currency) : DASH}
      </TableCell>
      <TableCell className="p-0 text-right text-xs tabular-nums">
        {money(row.spend14, currency)}
      </TableCell>
      <TableCell className="p-0 text-right text-xs tabular-nums">
        {row.cpa != null ? formatCpa(row.cpa, currency) : DASH}
      </TableCell>
      <TableCell className="p-0 text-right text-xs tabular-nums">
        {row.adCount > 0 ? row.adCount : DASH}
      </TableCell>

      <TableCell className="p-0 flex justify-center">
        {/* A Popover, not a nested expanding row: a variable-height row is poison for a
            virtualizer, and the old one shoved everything below it off-screen. */}
        {showAds && row.adCount > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Show ads in ${row.name}`}
                className="rounded p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ImageIcon className="size-3.5" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-80 w-96 overflow-y-auto p-2">
              <AdsetAdList adsetId={row.id} brandId={brandId} accountId={accountId} />
            </PopoverContent>
          </Popover>
        ) : null}
      </TableCell>
    </TableRow>
  );
});

function CampaignHeaderRow({
  section,
  visibleCount,
  collapsed,
  selectedIds,
  disabled,
  currency,
  onToggleCollapse,
  onToggleAll,
  style,
}: {
  section: CampaignSection;
  visibleCount: number;
  collapsed: boolean;
  selectedIds: Set<string>;
  disabled: boolean;
  currency?: string | null;
  onToggleCollapse: (campaignId: string) => void;
  onToggleAll: (ids: string[], checked: boolean) => void;
  style: CSSProperties;
}) {
  const eligibleIds = sectionEligibleIds(section.adsets);
  const selectedCount = eligibleIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = eligibleIds.length > 0 && selectedCount === eligibleIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <TableRow
      style={style}
      className={cn(
        GRID_COLS,
        'absolute top-0 left-0 w-full border-border/60 bg-muted/30 hover:bg-muted/40',
      )}
    >
      <TableCell className="p-0 flex justify-center">
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          disabled={disabled || eligibleIds.length === 0}
          aria-label={`Select all eligible ad sets in ${section.campaignName}`}
          onCheckedChange={(value) => onToggleAll(eligibleIds, value === true)}
        />
      </TableCell>

      <TableCell className="p-0 flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onToggleCollapse(section.campaignId)}
          aria-expanded={!collapsed}
          className="flex min-w-0 items-center gap-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="truncate font-medium text-xs">{section.campaignName}</span>
        </button>
        <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
          {selectedCount}/{eligibleIds.length} of {visibleCount}
        </span>
        {section.mismatchCount > 0 ? (
          <Badge variant="warning" className="shrink-0 text-3xs">
            {section.mismatchCount} wrong KPI
          </Badge>
        ) : null}
      </TableCell>

      <TableCell className="p-0 text-right text-xs tabular-nums">
        {money(section.totalBudget, currency)}
      </TableCell>
      <TableCell className="p-0 text-right text-xs tabular-nums">
        {money(section.totalSpend14, currency)}
      </TableCell>
      <TableCell className="p-0 text-right text-xs tabular-nums">
        {section.cpa != null ? formatCpa(section.cpa, currency) : DASH}
      </TableCell>
      <TableCell className="p-0 text-right text-xs tabular-nums">
        {section.totalAds > 0 ? section.totalAds : DASH}
      </TableCell>
      <TableCell />
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
  objective,
  heightClassName = 'h-[24rem]',
}: CampaignAdsetPickerProps) {
  const [query, setQuery] = useState('');
  const [chips, setChips] = useState<PickerChip[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(
    () => buildCampaignSections(snapshots, mode, objective),
    [snapshots, mode, objective],
  );
  const counts = useMemo(() => pickerCounts(sections), [sections]);
  const selectedIds = useMemo(() => new Set(selectedAdsetIds), [selectedAdsetIds]);
  const isCampaignMode = mode === 'campaign';

  // Open with the biggest spenders visible and the long tail collapsed. A 300-ad-set account
  // that opens fully expanded is not a browsing experience.
  useEffect(() => {
    if (seeded || sections.length === 0 || isCampaignMode) return;
    setCollapsed(defaultCollapsed(sections));
    setSeeded(true);
  }, [sections, seeded, isCampaignMode]);

  // A new query opens the campaigns that have hits — otherwise the results hide behind a
  // collapse arrow. Collapsing WHILE searching still works (flattenRows honors the set), which
  // it did not before: the old picker made every collapse control inert the moment you typed.
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      const hits = sectionsMatching(sections, value, chips);
      if (hits.length === 0) return;
      setCollapsed((prev) => {
        const next = new Set(prev);
        for (const id of hits) next.delete(id);
        return next;
      });
    },
    [sections, chips],
  );

  const rows: PickerRow[] = useMemo(
    () =>
      isCampaignMode
        ? sections.flatMap((section) =>
            section.adsets.map((item) => ({ kind: 'adset' as const, item, section })),
          )
        : flattenRows(sections, { collapsed, query, chips }),
    [sections, collapsed, query, chips, isCampaignMode],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (!row) return ROW_H.adset;
      if (row.kind === 'campaign') return ROW_H.campaign;
      return !row.item.eligible || row.item.mismatch ? ROW_H.held : ROW_H.adset;
    },
    overscan: 12,
  });

  const toggleOne = useCallback(
    (id: string, checked: boolean) => {
      onChange(
        checked ? [...selectedAdsetIds, id] : selectedAdsetIds.filter((value) => value !== id),
      );
    },
    [onChange, selectedAdsetIds],
  );

  const toggleMany = useCallback(
    (ids: string[], checked: boolean) => {
      const set = new Set(selectedAdsetIds);
      for (const id of ids) {
        if (checked) set.add(id);
        else set.delete(id);
      }
      onChange([...set]);
    },
    [onChange, selectedAdsetIds],
  );

  const toggleCollapse = useCallback((campaignId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(campaignId)) next.delete(campaignId);
      else next.add(campaignId);
      return next;
    });
  }, []);

  // Select it, then take the user to it. The point of the Command palette is that an operator
  // who knows the ad set's name never has to scroll for it.
  const jumpTo = useCallback(
    (adsetId: string) => {
      if (!selectedIds.has(adsetId)) toggleOne(adsetId, true);
      const index = rows.findIndex((row) => row.kind === 'adset' && row.item.id === adsetId);
      if (index >= 0) virtualizer.scrollToIndex(index, { align: 'center' });
    },
    [rows, selectedIds, toggleOne, virtualizer],
  );

  const selectTop = useCallback(
    (count: number) => toggleMany(topEligibleBySpend(sections, count), true),
    [sections, toggleMany],
  );

  if (isLoading) {
    return (
      <div className="space-y-2" role="status" aria-busy="true">
        <span className="sr-only">Loading ad sets</span>
        <Skeleton className="h-8 rounded-lg bg-muted/70" />
        <Skeleton className={cn(heightClassName, 'rounded-lg bg-muted/70')} />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        <ServerCrash className="size-4 shrink-0" aria-hidden="true" />
        Couldn't load this account's ad sets. Retry in a moment.
      </p>
    );
  }

  if (counts.total === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-border/60 border-dashed px-3 py-6 text-xs text-muted-foreground">
        <SearchX className="size-4 shrink-0" aria-hidden="true" />
        No ad sets found on this account.
      </p>
    );
  }

  const metric = objective ? getOptimizationMetricDefinition(objective) : null;
  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {!isCampaignMode ? (
        <PickerToolbar
          sections={sections}
          counts={counts}
          query={query}
          chips={chips}
          selectedCount={selectedAdsetIds.length}
          disabled={disabled}
          onQueryChange={handleQueryChange}
          onChipsChange={setChips}
          onJumpTo={jumpTo}
          onSelectTop={selectTop}
        />
      ) : null}

      {counts.eligible === 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          None of these {isCampaignMode ? 'campaigns' : 'ad sets'} own a budget the optimizer can
          move — they are managed at the campaign level (CBO or lifetime).
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-border/60 border-dashed px-3 py-6 text-xs text-muted-foreground">
          <SearchX className="size-4 shrink-0" aria-hidden="true" />
          Nothing matches this search or filter.
        </p>
      ) : (
        // The column header lives OUTSIDE the scroller, so it never needs `position: sticky` —
        // which is what makes shadcn's ScrollArea usable here. (Radix wraps a Viewport's children
        // in a `display: table` div, and sticky does not survive that. Lifting the header out is
        // the fix; the overlay scrollbar takes no layout width, so the two tables stay aligned on
        // the shared GRID_COLS template.)
        <div className="min-h-0 overflow-hidden rounded-lg border border-border/60">
          <Table containerClassName="overflow-visible" className="grid bg-card">
            <TableHeader className="grid">
              <TableRow
                className={cn(
                  GRID_COLS,
                  'py-1.5 text-left font-medium text-2xs text-muted-foreground uppercase tracking-wide hover:bg-transparent',
                )}
              >
                <TableHead aria-label="Select" className="p-0" />
                <TableHead className="p-0 font-medium">
                  {isCampaignMode ? 'Campaign' : 'Ad set'}
                </TableHead>
                <TableHead className="p-0 text-right font-medium">Budget/day</TableHead>
                <TableHead className="p-0 text-right font-medium">Spend 14d</TableHead>
                <TableHead className="p-0 text-right font-medium">
                  {metric?.costLabel ?? 'CPA'}
                </TableHead>
                <TableHead className="p-0 text-right font-medium">Ads</TableHead>
                <TableHead aria-label="Creatives" className="p-0" />
              </TableRow>
            </TableHeader>
          </Table>

          <ScrollArea
            viewportRef={scrollRef}
            viewportClassName="overscroll-contain"
            className={heightClassName}
          >
            {/* display:grid on the table (and on its rows) is what lets rows be absolutely
                positioned without table layout fighting back. aria-rowcount is the REAL total,
                not the windowed count — a virtualized table that reports only what it rendered
                lies to assistive tech. */}
            <Table
              containerClassName="overflow-visible"
              className="grid"
              aria-rowcount={rows.length}
              aria-label={isCampaignMode ? 'Campaigns' : 'Ad sets by campaign'}
            >
              <TableBody
                className="relative grid"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  if (!row) return null;
                  const style: CSSProperties = {
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  };
                  return row.kind === 'campaign' ? (
                    <CampaignHeaderRow
                      key={virtualRow.key}
                      style={style}
                      section={row.section}
                      visibleCount={row.visibleCount}
                      collapsed={collapsed.has(row.section.campaignId)}
                      selectedIds={selectedIds}
                      disabled={disabled}
                      currency={currency}
                      onToggleCollapse={toggleCollapse}
                      onToggleAll={toggleMany}
                    />
                  ) : (
                    <AdsetRow
                      key={virtualRow.key}
                      style={style}
                      row={row.item}
                      checked={selectedIds.has(row.item.id)}
                      disabled={disabled}
                      currency={currency}
                      showAds={!isCampaignMode}
                      brandId={brandId}
                      accountId={accountId}
                      onToggle={toggleOne}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
