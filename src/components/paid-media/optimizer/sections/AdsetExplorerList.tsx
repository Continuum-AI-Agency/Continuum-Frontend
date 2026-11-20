'use client';

import { useLocale, useTranslations } from 'next-intl';

// Left pane of the SuggestionExplorer: a searchable, internally-scrolling ticker
// of the suggestion's ad sets (the FE convention is a left-rail list, not a heavy
// data table). Each row still carries the inline Budget / Spend 14d / cost the old
// "Ad sets today" table showed, but selecting a row is what drives the creative
// mosaic on the right — the whole reason this replaced the in-cell preview.

import { SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { AdSetIdLabel } from '../charts/AdSetIdLabel';
import { formatCpa, formatCurrency } from '../format';
import type { OptimizerAdsetRow } from '../kpiColumns';
import * as typeScale from '../typeScale';

type AdsetExplorerListProps = {
  rows: OptimizerAdsetRow[];
  currency?: string | null;
  /** Objective cost header (e.g. CPM / CPL) — the same label the mosaic reads against. */
  metricLabel: string;
  selectedId: string | null;
  onSelect: (adsetId: string) => void;
};

function matches(row: OptimizerAdsetRow, query: string): boolean {
  if (!query) return true;
  const haystack = `${row.name ?? ''} ${row.adsetId}`.toLowerCase();
  return haystack.includes(query);
}

export function AdsetExplorerList({
  rows,
  currency,
  metricLabel,
  selectedId,
  onSelect,
}: AdsetExplorerListProps) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const [query, setQuery] = useState('');

  // Highest spend first, matching the old table's default sort — the ad set with the
  // most money behind it is the one an operator scans to first.
  const sorted = useMemo(() => [...rows].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0)), [rows]);
  const filtered = useMemo(
    () => sorted.filter((row) => matches(row, query.trim().toLowerCase())),
    [sorted, query],
  );

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="relative shrink-0">
        <SearchIcon
          className="pointer-events-none absolute top-2 left-2 size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          className="h-8 pl-7 text-xs"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={uiText('search_ad_sets_598b3cb')}
          value={query}
          aria-label={uiText('search_ad_sets_8f9a08f')}
        />
      </div>

      <div
        className={`${typeScale.label} grid shrink-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-3 px-2 font-medium text-muted-foreground`}
      >
        <span>{uiText('ad_set_639a64f')}</span>
        <span className="text-right">{uiText('budget_1c6225e')}</span>
        <span className="text-right">{uiText('spend_14d_4ab2cda')}</span>
        <span className="text-right">{metricLabel}</span>
      </div>

      <ScrollArea className="min-h-0 flex-1 rounded-md border border-border/60">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {uiText.rich('sentence_4d9920ba12bd', { v0: query.trim() })}
          </p>
        ) : (
          <ul>
            {filtered.map((row) => {
              const active = row.adsetId === selectedId;
              return (
                <li key={row.adsetId}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelect(row.adsetId)}
                    className={cn(
                      'grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-3 border-b border-border/40 px-2 py-2 text-left outline-none transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/50',
                      active && 'bg-muted/60',
                    )}
                  >
                    <AdSetIdLabel
                      className="w-full max-w-none"
                      id={row.adsetId}
                      name={row.name ?? undefined}
                    />
                    <span className="text-right text-xs tabular-nums text-foreground">
                      {formatCurrency(row.currentBudget, currency, uiLocale)}
                    </span>
                    <span className="text-right text-xs tabular-nums text-foreground">
                      {formatCurrency(row.spend, currency, uiLocale)}
                    </span>
                    <span className="text-right text-xs tabular-nums text-muted-foreground">
                      {row.cost != null ? formatCpa(row.cost, currency, uiLocale) : '—'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
