'use client';

import type { IntegrationErrorCode } from '@continuum/contracts';
import { RotateCw, Search } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { IntegrationErrorBanner } from '@/components/ui/IntegrationErrorBanner';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePaidCreativeRecovery } from '@/hooks/usePaidCreativeRecovery';
import type { ActionLog } from '@/lib/types/dco';
import { cn } from '@/lib/utils';

import { CreativeTile } from './CreativeTile';
import { filterAndSortCreatives } from './filterAndSortCreatives';
import type {
  CreativeAd,
  CreativeMetricKey,
  CreativeSortKey,
  CreativeStatusFilter,
  OpenCreativeDetail,
} from './types';

type CreativeGalleryLoadState = 'idle' | 'loading' | 'success' | 'error';

type CreativeGalleryProps = {
  ads: CreativeAd[];
  /** Recovery context for expired Meta thumbnail URLs (fresh re-resolve). */
  brandId?: string | null;
  accountId?: string | null;
  focusedAdSetName: string | null;
  loadState: CreativeGalleryLoadState;
  errorCode?: IntegrationErrorCode;
  errorMessage?: string;
  retryAfter?: number;
  platform?: string;
  segmentLabelSingular?: string;
  onRetry: () => void;
  selectedIds: ReadonlySet<string>;
  selectionCount: number;
  selectionLimit?: number;
  onToggleSelect: (adId: string) => void;
  activeMetric: CreativeMetricKey;
  formatMetric: (metric: CreativeMetricKey, value: number) => string;
  labelForMetric: (metric: CreativeMetricKey) => string;
  logs: ActionLog[];
  onOpenDetail: (detail: OpenCreativeDetail) => void;
};

const SORT_OPTIONS: ReadonlyArray<{ key: CreativeSortKey; label: string }> = [
  { key: 'spend', label: 'Spend' },
  { key: 'roas', label: 'ROAS' },
  { key: 'ctr', label: 'CTR' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'name', label: 'Name' },
];

const STATUS_OPTIONS: ReadonlyArray<{ key: CreativeStatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
];

const GRID_CLASS = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

export function CreativeGallery({
  ads,
  brandId,
  accountId,
  focusedAdSetName,
  loadState,
  errorCode,
  errorMessage,
  retryAfter,
  platform = 'meta',
  segmentLabelSingular = 'ad set',
  onRetry,
  selectedIds,
  selectionCount,
  selectionLimit = 3,
  onToggleSelect,
  activeMetric,
  formatMetric,
  labelForMetric,
  logs,
  onOpenDetail,
}: CreativeGalleryProps) {
  const [query, setQuery] = React.useState('');
  const [sortKey, setSortKey] = React.useState<CreativeSortKey>('spend');
  const [statusFilter, setStatusFilter] = React.useState<CreativeStatusFilter>('all');
  const [selectedOnly, setSelectedOnly] = React.useState(false);
  const { freshUrlById, recover } = usePaidCreativeRecovery({ brandId, adAccountId: accountId });

  const visible = React.useMemo(
    () => filterAndSortCreatives(ads, { query, sortKey, statusFilter, selectedOnly, selectedIds }),
    [ads, query, sortKey, statusFilter, selectedOnly, selectedIds],
  );

  const metricLabel = labelForMetric(activeMetric);
  const isBusy = loadState === 'idle' || loadState === 'loading';
  const hasFilters = query.trim().length > 0 || statusFilter !== 'all' || selectedOnly;

  const resetFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setSelectedOnly(false);
  };

  return (
    <section className="space-y-2 rounded-md border border-border/70 bg-card p-2 sm:p-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">
            Creatives{focusedAdSetName ? ` · ${focusedAdSetName}` : ''}
          </h3>
          <p className="text-xs text-muted-foreground">
            Select up to {selectionLimit} creatives to overlay KPI trends.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {loadState === 'success' ? (
            <span>
              {visible.length} of {ads.length}
            </span>
          ) : null}
          <span className="rounded border border-border/70 bg-muted/20 px-2 py-0.5">
            {selectionCount}/{selectionLimit} selected
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search creatives..."
            aria-label="Search creatives"
            className="h-8 pl-7 text-xs"
          />
        </div>

        <Select value={sortKey} onValueChange={(value) => setSortKey(value as CreativeSortKey)}>
          <SelectTrigger size="sm" className="w-[140px] text-xs" aria-label="Sort creatives">
            <span className="text-muted-foreground">Sort:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.key} value={option.key} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ButtonGroup aria-label="Filter by status">
          {STATUS_OPTIONS.map((option) => (
            <Button
              key={option.key}
              type="button"
              size="sm"
              variant={statusFilter === option.key ? 'default' : 'outline'}
              aria-pressed={statusFilter === option.key}
              onClick={() => setStatusFilter(option.key)}
              className="text-xs"
            >
              {option.label}
            </Button>
          ))}
        </ButtonGroup>

        <Button
          type="button"
          size="sm"
          variant={selectedOnly ? 'default' : 'outline'}
          aria-pressed={selectedOnly}
          onClick={() => setSelectedOnly((value) => !value)}
          className="text-xs"
        >
          Selected only
        </Button>
      </div>

      {loadState === 'error' ? (
        <div className="space-y-2">
          <IntegrationErrorBanner
            errorCode={errorCode}
            message={errorMessage}
            platform={platform}
            retryAfter={retryAfter}
          />
          <Button variant="outline" size="xs" onClick={onRetry}>
            <RotateCw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        </div>
      ) : isBusy ? (
        <div className={GRID_CLASS} aria-hidden>
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton
              key={`creative-skeleton-${index}`}
              className="aspect-[4/5] w-full rounded-lg"
            />
          ))}
        </div>
      ) : ads.length === 0 ? (
        <EmptyState message={`No creatives returned for this ${segmentLabelSingular}.`} />
      ) : visible.length === 0 ? (
        <EmptyState message="No creatives match your filters.">
          {hasFilters ? (
            <Button variant="outline" size="xs" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <div className={GRID_CLASS}>
          {visible.map((ad) => {
            const isSelected = selectedIds.has(ad.id);
            return (
              <CreativeTile
                key={ad.id}
                ad={ad}
                isSelected={isSelected}
                disabled={selectionCount >= selectionLimit && !isSelected}
                metricLabel={metricLabel}
                metricValue={formatMetric(activeMetric, ad.metrics?.[activeMetric] ?? 0)}
                logs={logs}
                adSetName={focusedAdSetName}
                freshUrl={freshUrlById[ad.id] ?? null}
                onRecoverCreative={recover}
                onToggleSelect={onToggleSelect}
                onOpenDetail={onOpenDetail}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function EmptyState({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 p-8 text-center',
      )}
    >
      <p className="text-xs text-muted-foreground">{message}</p>
      {children}
    </div>
  );
}
