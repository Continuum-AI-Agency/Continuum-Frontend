'use client';

import type { Competitor } from '@continuum/contracts';
import { X } from 'lucide-react';
import {
  useAdCounts,
  useCompetitors,
  useDeleteCompetitor,
  useResolvePaidPage,
} from '@/lib/api/competitorSpy';
import { compactCount, initials, tileStyle } from './brandVisuals';
import { CompetitorHealthBadge } from './CompetitorHealthBadge';

function paidBadge(c: Competitor): { label: string; className: string } {
  switch (c.paidStatus) {
    case 'ready':
      return {
        label: 'Paid ready',
        className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      };
    case 'resolving':
      return { label: 'Paid resolving', className: 'border-border bg-muted text-muted-foreground' };
    case 'needs_review':
      return {
        label: 'Paid needs review',
        className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      };
    case 'error':
      return {
        label: 'Paid error',
        className: 'border-destructive/30 bg-destructive/10 text-destructive',
      };
    default:
      return { label: 'Organic only', className: 'border-border bg-muted text-muted-foreground' };
  }
}

export function TrackedCompetitorsList({ brandId }: { brandId: string }) {
  const { data: competitors, isLoading } = useCompetitors(brandId);
  const { data: adCounts } = useAdCounts(brandId);
  const remove = useDeleteCompetitor(brandId);
  const resolvePaid = useResolvePaidPage(brandId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/70" />
        ))}
      </div>
    );
  }

  const tracked = competitors ?? [];
  if (tracked.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-sm font-medium">No competitors tracked yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Search above to add one, or accept a recommendation below.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {tracked.map((c) => {
        const paid = paidBadge(c);
        const followers = compactCount(c.instagramFollowersCount);
        const organicReady = c.organicStatus === 'ready';
        return (
          <li
            key={c.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
              style={tileStyle(c.name)}
            >
              {initials(c.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{c.name}</div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {c.instagramUsername ? (
                  <span className="font-mono">@{c.instagramUsername}</span>
                ) : null}
                {followers ? <span className="tabular-nums">{followers} followers</span> : null}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <CompetitorHealthBadge competitor={c} adsFound={adCounts?.[c.id]} />
                <span
                  className={`rounded-full border px-2 py-0.5 text-2xs font-medium ${
                    organicReady
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-border bg-muted text-muted-foreground'
                  }`}
                >
                  {organicReady ? 'Organic ready' : 'Needs Instagram'}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-2xs font-medium ${paid.className}`}
                >
                  {paid.label}
                </span>
                {c.source === 'auto' ? (
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
                    auto
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!c.metaPageId ? (
                <button
                  type="button"
                  onClick={() => resolvePaid.mutate(c.id)}
                  disabled={resolvePaid.isPending}
                  className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                >
                  Resolve paid
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => remove.mutate(c.id)}
                disabled={remove.isPending}
                aria-label={`Remove ${c.name}`}
                className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
