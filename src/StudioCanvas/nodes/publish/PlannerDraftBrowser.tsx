'use client';

import type {
  CanvasPublishingFormat,
  OrganicCanvasTarget,
  OrganicCanvasTargetSearchResponse,
} from '@continuum/contracts';
import { AlertTriangle, ImageOff, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { draftWindowRange, groupDraftTargets } from './groupDraftTargets';
import { publishingApi } from './publishingApi';

const STATUS_FILTERS = ['draft', 'placeholder', 'approved', 'scheduled'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const RANGE_FILTERS = [
  { value: 'any', label: 'Any date' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'month', label: 'Next 30 days' },
  { value: 'past', label: 'Past' },
] as const;
type RangeFilter = (typeof RANGE_FILTERS)[number]['value'];

const FORMAT_LABELS: Record<CanvasPublishingFormat, string> = {
  image: 'Post',
  carousel: 'Carousel',
  video: 'Reel',
};

const PAGE_SIZE = 12;

/**
 * Find a Planner draft to bind this canvas branch to.
 *
 * Deliberately does NOT hide drafts whose format differs from the node's: the old picker
 * filtered them out server-side, so a brand full of reels and carousels reported "no
 * editable drafts match this format" and the feature read as broken. Mismatches are
 * listed, labelled with what they need, and selectable only through the explicit
 * format-switch action — visible and refused beats invisible.
 */
export function PlannerDraftBrowser({
  brandId,
  format,
  selectedDraftId,
  onSelect,
  onSwitchFormat,
}: {
  brandId: string;
  format: CanvasPublishingFormat;
  selectedDraftId?: string;
  onSelect: (target: OrganicCanvasTarget) => void;
  onSwitchFormat: (format: CanvasPublishingFormat) => void;
}) {
  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<StatusFilter[]>([]);
  const [range, setRange] = useState<RangeFilter>('any');
  const [items, setItems] = useState<OrganicCanvasTarget[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (nextCursor: string | null): Promise<OrganicCanvasTargetSearchResponse> =>
      publishingApi.searchOrganic({
        brandId,
        limit: PAGE_SIZE,
        ...(query.trim() ? { query: query.trim() } : {}),
        ...(statuses.length > 0 ? { statuses } : {}),
        ...draftWindowRange(range, new Date()),
        ...(nextCursor ? { cursor: nextCursor } : {}),
      }),
    [brandId, query, range, statuses],
  );

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await search(null);
        if (cancelled) return;
        setItems(result.items);
        setCursor(result.nextCursor);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Could not load drafts.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [brandId, search]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const result = await search(cursor);
      setItems((previous) => [...previous, ...result.items]);
      setCursor(result.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load more drafts.');
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, search]);

  const toggleStatus = (status: StatusFilter) =>
    setStatuses((previous) =>
      previous.includes(status)
        ? previous.filter((value) => value !== status)
        : [...previous, status],
    );

  const groups = useMemo(() => groupDraftTargets(items), [items]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Input
        className="nodrag h-8 text-xs"
        placeholder="Search drafts by title or caption"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="nodrag flex flex-wrap items-center gap-1">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={statuses.includes(status)}
            className={cn(
              'rounded-full border px-2 py-0.5 text-2xs capitalize',
              statuses.includes(status)
                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                : 'border-border text-muted-foreground',
            )}
            onClick={() => toggleStatus(status)}
          >
            {status}
          </button>
        ))}
        <select
          className="nodrag ml-auto h-6 rounded-md border border-border bg-background px-1 text-2xs"
          value={range}
          onChange={(event) => setRange(event.target.value as RangeFilter)}
          aria-label="Scheduled window"
        >
          {RANGE_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="nodrag nowheel min-h-0 flex-1 overflow-y-auto rounded-md border border-border/60">
        {loading ? (
          <p className="flex items-center gap-1.5 p-2 text-2xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Searching…
          </p>
        ) : null}
        {error ? <p className="p-2 text-2xs text-destructive">{error}</p> : null}
        {!loading && !error && items.length === 0 ? (
          <p className="p-2 text-2xs text-muted-foreground">
            No drafts yet. Switch to New draft to create one.
          </p>
        ) : null}

        {groups.map((group) => (
          <div key={group.key}>
            <p className="sticky top-0 bg-muted/80 px-2 py-1 text-2xs font-medium text-muted-foreground backdrop-blur">
              {group.heading}
            </p>
            {group.targets.map((target) => (
              <DraftRow
                key={target.id}
                target={target}
                nodeFormat={format}
                selected={selectedDraftId === target.id}
                onSelect={() => onSelect(target)}
                onSwitchFormat={() => onSwitchFormat(target.format)}
              />
            ))}
          </div>
        ))}

        {cursor ? (
          <Button
            type="button"
            variant="ghost"
            className="nodrag h-7 w-full text-2xs"
            disabled={loadingMore}
            onClick={loadMore}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DraftRow({
  target,
  nodeFormat,
  selected,
  onSelect,
  onSwitchFormat,
}: {
  target: OrganicCanvasTarget;
  nodeFormat: CanvasPublishingFormat;
  selected: boolean;
  onSelect: () => void;
  onSwitchFormat: () => void;
}) {
  const formatMatches = target.format === nodeFormat;
  const scheduled = target.scheduledAt ? new Date(target.scheduledAt) : null;
  const dateLabel =
    scheduled && !Number.isNaN(scheduled.getTime())
      ? scheduled.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : 'Unscheduled';

  return (
    <div
      className={cn(
        'flex gap-2 border-b border-border/60 p-2 last:border-b-0',
        selected && 'bg-muted',
      )}
    >
      <button
        type="button"
        // The row is only selectable when the creative it would receive fits: attaching a
        // carousel to a reel draft is refused by the planner, so offering it here would
        // just relocate the error.
        disabled={!formatMatches || !target.deliverable}
        className="nodrag flex min-w-0 flex-1 items-start gap-2 text-left disabled:opacity-60"
        onClick={onSelect}
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
          {target.thumbnailUrl ? (
            // biome-ignore lint/performance/noImgElement: a short-lived signed preview URL, not a static asset
            <img
              src={target.thumbnailUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <ImageOff className="size-3.5 text-muted-foreground" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{target.title}</span>
          <span className="block truncate text-2xs text-muted-foreground">
            {target.platform} · {FORMAT_LABELS[target.format]} · {target.status} · {dateLabel}
          </span>
          {target.captionPreview ? (
            <span className="mt-0.5 block truncate text-2xs text-muted-foreground/80">
              {target.captionPreview}
            </span>
          ) : null}
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {target.empty ? (
              <Pill variant="outline" className="text-2xs">
                Empty slot
              </Pill>
            ) : null}
            {target.mediaCount > 0 ? (
              <Pill variant="outline" className="text-2xs">
                {target.mediaCount} attached
              </Pill>
            ) : null}
            {target.blockers.map((blocker) => (
              <Pill key={blocker} variant="destructive" className="text-2xs">
                <AlertTriangle className="size-2.5" aria-hidden />
                {blocker === 'account_orphaned' ? 'Account not connected' : blocker}
              </Pill>
            ))}
          </span>
        </span>
      </button>
      {formatMatches ? null : (
        <button
          type="button"
          className="nodrag self-start whitespace-nowrap text-2xs text-brand-primary underline"
          onClick={onSwitchFormat}
        >
          Needs {FORMAT_LABELS[target.format]}
        </button>
      )}
    </div>
  );
}
