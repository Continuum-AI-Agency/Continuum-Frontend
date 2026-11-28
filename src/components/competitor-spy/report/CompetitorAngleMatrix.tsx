'use client';

// Competitors × top angles — the per-competitor decomposition of the cross-rollup angle
// table. Drawn first as a radar (polygon = the cross-competitor rollup, one dot per
// competitor on each spoke), with the exact figures one toggle away in the original
// CSS-grid matrix, a single-hue intensity fill from longevityWeightedShare (the Ad Library
// exposes no spend, so share-of-longevity is the scale proxy).

import type { CompetitorAngleMapRow } from '@continuum/contracts';
import { useState } from 'react';
import { RadarChart } from '@/components/ui/radar-chart';
import { cn } from '@/lib/utils';
import { humanize, percent } from './gapPresentation';

const MAX_ANGLES = 8;
// The rollup polygon takes the brand colour, so competitors start after it.
const COMPETITOR_COLORS = ['#1a9e8c', '#bf5af2', '#b8862b', 'var(--foreground)'];

type View = 'chart' | 'table';

export function CompetitorAngleMatrix({ rows }: { rows: CompetitorAngleMapRow[] }) {
  const [view, setView] = useState<View>('chart');
  const angleRows = rows.filter((row) => row.dimension === 'angle');
  const crossRows = angleRows.filter((row) => row.competitorId === null);
  const competitorRows = angleRows.filter((row) => row.competitorId !== null);

  const topRows = [...crossRows]
    .sort((a, b) => b.longevityWeightedShare - a.longevityWeightedShare)
    .slice(0, MAX_ANGLES);
  const topAngles = topRows.map((row) => row.value);

  const competitors = new Map<string, string>();
  for (const row of competitorRows) {
    if (row.competitorId && !competitors.has(row.competitorId)) {
      competitors.set(row.competitorId, row.competitorName ?? 'Unknown');
    }
  }

  if (topAngles.length === 0 || competitors.size === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
        The matrix fills once competitor ads carry labeled angles.
      </p>
    );
  }

  const byKey = new Map<string, CompetitorAngleMapRow>();
  for (const row of competitorRows) byKey.set(`${row.competitorId}::${row.value}`, row);

  const maxShare = Math.max(
    ...competitorRows
      .filter((row) => topAngles.includes(row.value))
      .map((row) => row.longevityWeightedShare),
    0.01,
  );

  const share = (competitorId: string, angle: string) =>
    byKey.get(`${competitorId}::${angle}`)?.longevityWeightedShare ?? 0;
  const top = topRows[0];

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-1 text-2xs">
        {(['chart', 'table'] as const).map((option) => (
          <button
            aria-pressed={view === option}
            className={cn(
              'rounded-md px-2 py-1 capitalize transition-colors',
              view === option
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            key={option}
            onClick={() => setView(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>

      {view === 'chart' ? (
        <RadarChart
          axes={topAngles.map(humanize)}
          className="mx-auto"
          format={percent}
          headline={{
            value: percent(top.longevityWeightedShare),
            caption: `${humanize(top.value)} leads`,
          }}
          max={Math.min(1, Math.ceil(Math.max(maxShare, top.longevityWeightedShare) * 10) / 10)}
          members={[...competitors.entries()].map(([competitorId, competitorName], i) => ({
            id: competitorId,
            label: competitorName,
            values: topAngles.map((angle) => share(competitorId, angle)),
            color: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length],
          }))}
          series={{
            id: 'all-competitors',
            label: 'All competitors',
            values: topRows.map((row) => row.longevityWeightedShare),
          }}
          subtitle="Share of each competitor's ad longevity"
          title="Angle share"
        />
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid gap-1 text-2xs"
            style={{ gridTemplateColumns: `9rem repeat(${topAngles.length}, minmax(5rem, 1fr))` }}
          >
            <div />
            {topAngles.map((angle) => (
              <div className="truncate px-1 pb-1 text-center text-muted-foreground" key={angle}>
                {humanize(angle)}
              </div>
            ))}

            {[...competitors.entries()].map(([competitorId, competitorName]) => (
              <MatrixRow
                angles={topAngles}
                byKey={byKey}
                competitorId={competitorId}
                competitorName={competitorName}
                key={competitorId}
                maxShare={maxShare}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MatrixRow({
  competitorId,
  competitorName,
  angles,
  byKey,
  maxShare,
}: {
  competitorId: string;
  competitorName: string;
  angles: string[];
  byKey: Map<string, CompetitorAngleMapRow>;
  maxShare: number;
}) {
  return (
    <>
      <div className="flex items-center truncate pr-1 text-muted-foreground">{competitorName}</div>
      {angles.map((angle) => {
        const cell = byKey.get(`${competitorId}::${angle}`);
        const ratio = cell ? Math.min(cell.longevityWeightedShare / maxShare, 1) : null;
        const label = cell
          ? `${competitorName}, ${humanize(angle)}: ${percent(cell.longevityWeightedShare)} of their ad longevity across ${cell.adCount} ads`
          : `${competitorName}, ${humanize(angle)}: no ads`;
        return (
          <div
            aria-label={label}
            className="grid h-10 place-items-center rounded-md border border-border/40 text-center tabular-nums"
            key={angle}
            role="img"
            style={
              ratio != null
                ? {
                    backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(
                      8 + ratio * 72,
                    )}%, transparent)`,
                  }
                : undefined
            }
            title={cell ? `${cell.adCount} ads · ${cell.activeAdCount} active` : 'no ads'}
          >
            {cell ? (
              <span className="font-medium">{percent(cell.longevityWeightedShare)}</span>
            ) : (
              <span className="text-muted-foreground/50">—</span>
            )}
          </div>
        );
      })}
    </>
  );
}
