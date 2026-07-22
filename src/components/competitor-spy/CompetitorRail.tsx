'use client';

import type { Competitor, CompetitorHealthTone } from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { compactCount, initials, tileStyle } from './brandVisuals';
import { competitorHealthChip } from './competitorHealth';

// Left-rail ticker for competitor selection (replaces the filter dropdown).
// Vertical on md+, a horizontal scroll strip on mobile. Flat, hairline-bordered,
// monospace meta — editorial minimalism within the app's token system.

function rowClass(active: boolean): string {
  return cn(
    'flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
    'min-w-44 md:min-w-0 md:w-full',
    active ? 'bg-muted' : 'hover:bg-muted/60',
  );
}

function Tile({ children, style }: { children: string; style?: React.CSSProperties }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-medium',
        !style && 'bg-muted text-muted-foreground',
      )}
      style={style}
      aria-hidden
    >
      {children}
    </span>
  );
}

const TONE_DOT: Record<CompetitorHealthTone, string> = {
  positive: 'bg-emerald-500',
  info: 'bg-sky-500',
  warning: 'bg-amber-500',
  danger: 'bg-destructive',
  neutral: 'bg-muted-foreground',
};

// Non-interactive health signal for the rail row (which is itself a button, so it
// cannot nest the focusable CompetitorHealthBadge). Colour + native title convey
// state; the full diagnostics tooltip lives in the Competitors tab list.
function HealthDot({ competitor, adsFound }: { competitor: Competitor; adsFound?: number | null }) {
  const chip = competitorHealthChip(competitor, adsFound);
  return (
    <span
      role="img"
      className={cn('size-2 shrink-0 rounded-full', TONE_DOT[chip.tone])}
      title={chip.label}
      aria-label={`Health: ${chip.label}`}
    />
  );
}

export function CompetitorRail({
  competitors,
  selectedId,
  onSelect,
  onAdd,
  metricLabel = 'followers',
  showHealth = false,
  adCounts,
  className,
}: {
  competitors: Competitor[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  onAdd?: () => void;
  metricLabel?: string;
  showHealth?: boolean;
  adCounts?: Record<string, number>;
  className?: string;
}) {
  return (
    <aside className={cn('flex flex-col gap-1', className)}>
      <div className="mb-1 hidden items-baseline justify-between px-2.5 md:flex">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Competitors
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {competitors.length}
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:pb-0">
        <button
          type="button"
          onClick={() => onSelect(undefined)}
          aria-current={selectedId === undefined}
          className={rowClass(selectedId === undefined)}
        >
          <Tile>{'∗'}</Tile>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-foreground">All competitors</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {competitors.length} tracked
            </span>
          </span>
        </button>

        {competitors.map((competitor) => {
          const active = competitor.id === selectedId;
          const handle = competitor.instagramUsername ? `@${competitor.instagramUsername}` : null;
          const metric = compactCount(competitor.instagramFollowersCount);
          const needsReview = competitor.paidStatus === 'needs_review';
          return (
            <button
              key={competitor.id}
              type="button"
              onClick={() => onSelect(competitor.id)}
              aria-current={active}
              className={rowClass(active)}
            >
              <Tile style={tileStyle(competitor.name)}>{initials(competitor.name)}</Tile>
              <span className="min-w-0 flex-1">
                <span
                  className={cn('block truncate text-sm text-foreground', active && 'font-medium')}
                >
                  {competitor.name}
                </span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {needsReview ? 'needs review' : (handle ?? competitor.slug)}
                </span>
              </span>
              {showHealth || metric ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  {showHealth ? (
                    <HealthDot competitor={competitor} adsFound={adCounts?.[competitor.id]} />
                  ) : null}
                  {metric ? (
                    <span
                      className="font-mono text-xs tabular-nums text-muted-foreground"
                      title={metricLabel}
                    >
                      {metric}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}

        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground md:w-full"
          >
            <span className="flex size-8 shrink-0 items-center justify-center text-base leading-none">
              +
            </span>
            <span className="truncate">Add competitor</span>
          </button>
        ) : null}
      </div>
    </aside>
  );
}
