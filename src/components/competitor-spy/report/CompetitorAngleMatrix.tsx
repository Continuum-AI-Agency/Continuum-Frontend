'use client';

// Competitors × top angles grid — the per-competitor decomposition of the
// cross-rollup angle table. CSS-grid matrix adapted from the optimizer
// AngleMatrix, with a single-hue intensity fill from longevityWeightedShare
// (the Ad Library exposes no spend, so share-of-longevity is the scale proxy).

import type { CompetitorAngleMapRow } from '@continuum/contracts';
import { humanize, percent } from './gapPresentation';

const MAX_ANGLES = 8;

export function CompetitorAngleMatrix({ rows }: { rows: CompetitorAngleMapRow[] }) {
  const angleRows = rows.filter((row) => row.dimension === 'angle');
  const crossRows = angleRows.filter((row) => row.competitorId === null);
  const competitorRows = angleRows.filter((row) => row.competitorId !== null);

  const topAngles = [...crossRows]
    .sort((a, b) => b.longevityWeightedShare - a.longevityWeightedShare)
    .slice(0, MAX_ANGLES)
    .map((row) => row.value);

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

  return (
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
