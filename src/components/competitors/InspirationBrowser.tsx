'use client';

// The one Inspiration surface, shared by the Library tab, the Brand Spy
// workspace, and the dashboard organic widget. Sorts competitor content by
// source (Organic | Paid | All), scopes it to a tracked competitor via the
// health-aware rail, pulls fresh content with Sync (server-side Instagram
// business-discovery unwrap + cache), and saves/freezes any item to a board.
// Per-source bodies reuse the existing organic explorer and paid grid; the "All"
// body interleaves both. `compact` trims chrome for the dashboard widget.

import { RefreshCw, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { AdSnapshotGrid } from '@/components/competitor-spy/AdSnapshotGrid';
import { CompetitorQuickSelectChips } from '@/components/competitor-spy/CompetitorQuickSelectChips';
import { CompetitorRail } from '@/components/competitor-spy/CompetitorRail';
import { competitorHealthChip } from '@/components/competitor-spy/competitorHealth';
import { SaveToBoardButton } from '@/components/competitor-spy/SaveToBoardButton';
import {
  MAX_INSTAGRAM_POSTS,
  useAdCounts,
  useAdTimeline,
  useCompetitorSync,
  useCompetitors,
  useInstagramPosts,
} from '@/lib/api/competitorSpy';
import { cn } from '@/lib/utils';
import { CompetitorOrganicExplorer } from './CompetitorOrganicExplorer';
import type { CompetitorPostView } from './competitorPostView';
import { InspirationFeedGrid } from './InspirationFeedGrid';
import { buildInspirationFeed } from './inspirationFeed';
import { SaveToLibraryButton } from './SaveToLibraryButton';

type Source = 'organic' | 'paid' | 'all';
type PaidStatus = 'active' | 'paused' | undefined;

const SOURCE_OPTIONS: Array<{ id: Source; label: string }> = [
  { id: 'organic', label: 'Organic' },
  { id: 'paid', label: 'Paid' },
  { id: 'all', label: 'All' },
];

const STATUS_OPTIONS: Array<{ id: 'all' | 'active' | 'paused'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
];

function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (id: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5">
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cn(
              'rounded-md font-medium transition-colors',
              size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SyncButton({
  brandId,
  competitorId,
  size = 'md',
}: {
  brandId: string;
  competitorId?: string;
  size?: 'sm' | 'md';
}) {
  const sync = useCompetitorSync(brandId);
  const pending = sync.isPending;
  return (
    <button
      type="button"
      onClick={() => sync.mutate(competitorId ? [competitorId] : undefined)}
      disabled={pending}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-60',
        size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm',
      )}
    >
      <RefreshCw className={cn('size-4', pending && 'animate-spin')} />
      <span>{pending ? 'Syncing…' : 'Sync'}</span>
    </button>
  );
}

// One-line "is anything actually working?" summary for the compact widget, where
// the full health rail is hidden.
function HealthSummary({ brandId }: { brandId: string }) {
  const { data: competitors } = useCompetitors(brandId);
  const { data: adCounts } = useAdCounts(brandId);
  const list = competitors ?? [];
  if (list.length === 0) return null;
  const needsAttention = list.filter((competitor) => {
    const tone = competitorHealthChip(competitor, adCounts?.[competitor.id]).tone;
    return tone === 'warning' || tone === 'danger';
  }).length;
  return (
    <span className="text-xs text-muted-foreground">
      {list.length} competitor{list.length === 1 ? '' : 's'}
      {needsAttention > 0 ? ` · ${needsAttention} need attention` : ''}
    </span>
  );
}

function KeywordSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search copy, hooks, themes…"
        aria-label="Search paid ad copy"
        className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
      />
    </div>
  );
}

function OrganicSave({ brandId }: { brandId: string }) {
  return (view: CompetitorPostView): ReactNode => (
    <div className="flex items-center gap-1.5">
      {view.competitorId ? (
        <SaveToBoardButton
          brandId={brandId}
          request={{
            kind: 'organic',
            competitorId: view.competitorId,
            competitorName: view.competitorName,
            instagramUsername: view.instagramUsername,
            post: view.post,
          }}
        />
      ) : null}
      <SaveToLibraryButton brandId={brandId} view={view} />
    </div>
  );
}

// Kept in its own component so its two queries only run while "All" is selected.
function AllFeed({
  brandId,
  competitorId,
  status,
  q,
  feedLimit,
  gridClassName,
}: {
  brandId: string;
  competitorId?: string;
  status: PaidStatus;
  q?: string;
  feedLimit: number;
  gridClassName?: string;
}) {
  const posts = useInstagramPosts({ brandId, competitorId, limit: feedLimit });
  const timeline = useAdTimeline({ brandId, competitorId, status, q, limit: feedLimit });
  const items = useMemo(
    () => buildInspirationFeed(posts.data ?? [], timeline.data ?? []),
    [posts.data, timeline.data],
  );
  return (
    <InspirationFeedGrid
      brandId={brandId}
      items={items}
      isLoading={(posts.isLoading || timeline.isLoading) && items.length === 0}
      isError={posts.isError && timeline.isError}
      gridClassName={gridClassName}
    />
  );
}

export function InspirationBrowser({
  brandId,
  defaultSource = 'all',
  showRail = false,
  showSync = false,
  variant = 'full',
  gridClassName,
  feedLimit = MAX_INSTAGRAM_POSTS,
  onManageCompetitors,
}: {
  brandId: string;
  defaultSource?: Source;
  showRail?: boolean;
  showSync?: boolean;
  variant?: 'full' | 'compact';
  gridClassName?: string;
  feedLimit?: number;
  onManageCompetitors?: () => void;
}) {
  const router = useRouter();
  const [source, setSource] = useState<Source>(defaultSource);
  const [competitorId, setCompetitorId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<PaidStatus>(undefined);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  const { data: competitors } = useCompetitors(brandId);
  const { data: adCounts } = useAdCounts(brandId);
  const compact = variant === 'compact';

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const manage = onManageCompetitors ?? (() => router.push('/competitor-spy?tab=competitors'));
  const showKeyword = source !== 'organic';
  const q = debounced || undefined;

  return (
    <div className={cn('flex min-w-0 flex-col', compact ? 'gap-3' : 'gap-4')}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Segmented
          value={source}
          options={SOURCE_OPTIONS}
          onChange={setSource}
          size={compact ? 'sm' : 'md'}
        />
        {showKeyword && !compact ? <KeywordSearch value={query} onChange={setQuery} /> : null}
        {source === 'paid' && !compact ? (
          <Segmented
            value={status ?? 'all'}
            options={STATUS_OPTIONS}
            onChange={(next) => setStatus(next === 'all' ? undefined : next)}
          />
        ) : null}
        <div className={cn('flex items-center gap-2', compact ? '' : 'sm:ml-auto')}>
          {compact ? <HealthSummary brandId={brandId} /> : null}
          {showSync ? (
            <SyncButton
              brandId={brandId}
              competitorId={competitorId}
              size={compact ? 'sm' : 'md'}
            />
          ) : null}
        </div>
      </div>

      {!showRail && (competitors?.length ?? 0) > 0 ? (
        <CompetitorQuickSelectChips
          competitors={competitors ?? []}
          selectedId={competitorId}
          onSelect={setCompetitorId}
        />
      ) : null}

      <div className={cn('flex min-w-0 flex-col gap-4', showRail && 'md:flex-row md:gap-5')}>
        {showRail ? (
          <CompetitorRail
            competitors={competitors ?? []}
            selectedId={competitorId}
            onSelect={setCompetitorId}
            onAdd={manage}
            showHealth
            adCounts={adCounts}
            className="md:sticky md:top-0 md:w-60 md:shrink-0 md:self-start"
          />
        ) : null}

        <div className={cn('min-w-0 flex-1', compact && 'max-h-[28rem] overflow-y-auto pr-0.5')}>
          {source === 'organic' ? (
            <CompetitorOrganicExplorer
              brandId={brandId}
              competitorId={competitorId}
              feedLimit={feedLimit}
              gridClassName={gridClassName}
              renderActions={OrganicSave({ brandId })}
            />
          ) : null}

          {source === 'paid' ? (
            <AdSnapshotGrid
              brandId={brandId}
              competitorId={competitorId}
              status={status}
              q={q}
              limit={feedLimit}
              inspiration
            />
          ) : null}

          {source === 'all' ? (
            <AllFeed
              brandId={brandId}
              competitorId={competitorId}
              status={status}
              q={q}
              feedLimit={feedLimit}
              gridClassName={gridClassName}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
