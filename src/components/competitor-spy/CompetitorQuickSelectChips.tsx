'use client';

import type { Competitor } from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { initials, tileStyle } from './brandVisuals';

// Horizontal quick-select chip strip for competitors. Used where the vertical
// CompetitorRail is not shown (the compact dashboard organic widget) so a user can
// still scope the feed to one competitor without opening Brand Spy. Follower-ranked.

function chipClass(active: boolean): string {
  return cn(
    'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
    active
      ? 'border-foreground/20 bg-muted font-medium text-foreground'
      : 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
  );
}

export function CompetitorQuickSelectChips({
  competitors,
  selectedId,
  onSelect,
  max = 8,
  className,
}: {
  competitors: Competitor[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  max?: number;
  className?: string;
}) {
  if (competitors.length === 0) return null;
  const ranked = [...competitors]
    .sort((a, b) => (b.instagramFollowersCount ?? 0) - (a.instagramFollowersCount ?? 0))
    .slice(0, max);

  return (
    <div className={cn('flex items-center gap-1.5 overflow-x-auto', className)}>
      <button
        type="button"
        onClick={() => onSelect(undefined)}
        aria-current={selectedId === undefined}
        className={chipClass(selectedId === undefined)}
      >
        All
      </button>
      {ranked.map((competitor) => {
        const active = competitor.id === selectedId;
        const handle = competitor.instagramUsername
          ? `@${competitor.instagramUsername}`
          : competitor.name;
        return (
          <button
            key={competitor.id}
            type="button"
            onClick={() => onSelect(competitor.id)}
            aria-current={active}
            className={chipClass(active)}
            title={handle}
          >
            <span
              className="flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-medium"
              style={tileStyle(competitor.name)}
              aria-hidden
            >
              {initials(competitor.name)}
            </span>
            <span className="max-w-28 truncate">{competitor.name}</span>
          </button>
        );
      })}
    </div>
  );
}
