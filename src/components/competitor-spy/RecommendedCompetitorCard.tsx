'use client';

import type { RecommendedCompetitor } from '@continuum/contracts';
import { Check, Plus, X } from 'lucide-react';
import { initials, tileStyle } from './brandVisuals';

export function RecommendedCompetitorCard({
  competitor,
  onTrack,
  onDismiss,
  isTracking,
}: {
  competitor: RecommendedCompetitor;
  onTrack: () => void;
  onDismiss: () => void;
  isTracking: boolean;
}) {
  const { name, instagramHandle, insight, alreadyTracked } = competitor;
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-2.5">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
          style={tileStyle(name)}
        >
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{name}</div>
          {instagramHandle ? (
            <div className="truncate font-mono text-xs text-muted-foreground">
              @{instagramHandle}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss ${name}`}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {insight ? <p className="line-clamp-2 text-xs text-muted-foreground">{insight}</p> : null}

      {alreadyTracked ? (
        <span className="inline-flex items-center gap-1 self-start rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <Check className="size-3" /> Tracked
        </span>
      ) : (
        <button
          type="button"
          onClick={onTrack}
          disabled={isTracking}
          className="inline-flex items-center justify-center gap-1 self-start rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          <Plus className="size-3" /> {isTracking ? 'Tracking…' : 'Track'}
        </button>
      )}
    </article>
  );
}
