'use client';

// The chrome both optimizer feeds share — the ACTION feed (what we did to the ad account)
// and the SERVER LOG (what the machine did). They render different rows from different RPCs;
// what they have in common is how a feed behaves: relative timestamps, a portfolio narrowing
// of what has loaded, a copyable Meta receipt, and an honest "load more" that appears only
// when the RPC's own cursor says there IS more.

import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ALL_PORTFOLIOS } from './logFilters';

const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6'];

export function FeedSkeleton() {
  return (
    <div className="space-y-2">
      {SKELETON_KEYS.map((key) => (
        <Skeleton key={key} className="h-12 rounded-lg" />
      ))}
    </div>
  );
}

export function formatWhen(ts: string): string {
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return ts;
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function RowHeader({ title, ts }: { title: string; ts: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <span className="truncate text-sm font-medium tracking-tight">{title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{formatWhen(ts)}</span>
    </div>
  );
}

/** The Meta trace id, one-click copyable — the receipt an operator pastes into a Graph API
 *  support ticket. Clipboard access is optional-chained so a render environment without it
 *  (or a denied permission) never throws. */
export function ReceiptToken({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(value)?.catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy Meta trace id ${value}`}
      className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-2xs tabular-nums text-muted-foreground transition-colors hover:bg-muted"
    >
      {copied ? (
        <CheckIcon aria-hidden="true" className="size-3 shrink-0 text-success" />
      ) : (
        <CopyIcon aria-hidden="true" className="size-3 shrink-0" />
      )}
      <span className="truncate">{value}</span>
    </button>
  );
}

export function PortfolioFilter({
  names,
  value,
  onChange,
  label,
}: {
  names: string[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  if (names.length < 2) return null;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-44 text-xs" aria-label={label}>
        {/* The trigger renders the raw VALUE, so the all-portfolios sentinel would show as
            the literal "__all__" without this mapping. */}
        <SelectValue>
          {(value: unknown) =>
            value == null || value === ALL_PORTFOLIOS ? 'All portfolios' : String(value)
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PORTFOLIOS}>All portfolios</SelectItem>
        {names.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The honest end of a feed.
 *
 * `hasMore` is the RPC's own cursor, not a guess from the page size, so "Load more" appears
 * exactly when there is more to load and the closing line is a statement of fact rather than
 * "showing the first 100 and hoping". Counts are of what is LOADED, and say so.
 */
export function FeedFooter({
  loaded,
  hasMore,
  isFetchingMore,
  onLoadMore,
  noun,
}: {
  loaded: number;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  noun: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
      <p className="text-2xs text-muted-foreground">
        {hasMore
          ? `${loaded} ${noun} loaded — there are older ones.`
          : `${loaded} ${noun} — that is all of them.`}
      </p>
      {hasMore ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={isFetchingMore}
          onClick={onLoadMore}
        >
          {isFetchingMore ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </div>
  );
}
