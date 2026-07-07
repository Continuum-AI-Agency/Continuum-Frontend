'use client';

// Audience × communication-angle CPA matrix. BKLit's HeatmapChart is a calendar
// contribution heatmap (weeks × weekdays), which would misrepresent this data, so
// this is a purpose-built CSS-grid matrix. The `angle` axis stays "untagged"
// until the v2 Jaina creative-angle worker runs — we render the real audience
// axis and the untagged column now so the shell lights up automatically when
// tags arrive (rather than hiding the capability). CPA per cell = spend /
// conversions (engine math — nothing lies).

import type { AngleMatrixCell } from '@continuum/contracts';

import { formatCpa, humanize } from '../format';

type AngleMatrixProps = {
  cells: AngleMatrixCell[];
  currency?: string | null;
};

const AUDIENCE_ORDER = ['prospecting', 'retargeting', 'remarketing', 'unknown'];

export function AngleMatrix({ cells, currency }: AngleMatrixProps) {
  if (cells.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No audience data yet — the matrix fills after the first scored cycle.
      </p>
    );
  }

  const audiences = [...new Set(cells.map((cell) => cell.audience_type))].sort(
    (a, b) => AUDIENCE_ORDER.indexOf(a) - AUDIENCE_ORDER.indexOf(b),
  );
  const angles = [...new Set(cells.map((cell) => cell.angle))].sort();
  const allUntagged = angles.every((angle) => angle === 'untagged');

  const byKey = new Map<string, AngleMatrixCell>();
  for (const cell of cells) byKey.set(`${cell.audience_type}::${cell.angle}`, cell);

  const cpas = cells
    .map((cell) => (cell.conversions > 0 ? cell.spend / cell.conversions : null))
    .filter((value): value is number => value != null);
  const minCpa = cpas.length ? Math.min(...cpas) : 0;
  const maxCpa = cpas.length ? Math.max(...cpas) : 1;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <div
          className="grid gap-1 text-[11px]"
          style={{ gridTemplateColumns: `7rem repeat(${angles.length}, minmax(4.5rem, 1fr))` }}
        >
          <div />
          {angles.map((angle) => (
            <div key={angle} className="truncate px-1 pb-1 text-center text-muted-foreground">
              {angle === 'untagged' ? 'untagged' : humanize(angle)}
            </div>
          ))}

          {audiences.map((audience) => (
            <MatrixRow
              key={audience}
              audience={audience}
              angles={angles}
              byKey={byKey}
              minCpa={minCpa}
              maxCpa={maxCpa}
              currency={currency}
            />
          ))}
        </div>
      </div>
      {allUntagged ? (
        <p className="text-[11px] text-muted-foreground">
          Angle tagging pending — the columns split by creative angle once the v2 tagging worker
          runs.
        </p>
      ) : null}
    </div>
  );
}

function MatrixRow({
  audience,
  angles,
  byKey,
  minCpa,
  maxCpa,
  currency,
}: {
  audience: string;
  angles: string[];
  byKey: Map<string, AngleMatrixCell>;
  minCpa: number;
  maxCpa: number;
  currency?: string | null;
}) {
  return (
    <>
      <div className="flex items-center truncate pr-1 text-muted-foreground">
        {humanize(audience)}
      </div>
      {angles.map((angle) => {
        const cell = byKey.get(`${audience}::${angle}`);
        const cpa = cell && cell.conversions > 0 ? cell.spend / cell.conversions : null;
        return (
          <div
            key={angle}
            className="grid h-10 place-items-center rounded-md border border-border/40 text-center tabular-nums"
            style={{ backgroundColor: cellColor(cpa, minCpa, maxCpa) }}
            title={cell ? `${cell.adsets} ad sets` : 'no data'}
          >
            {cpa != null ? (
              <span className="font-medium">{formatCpa(cpa, currency)}</span>
            ) : (
              <span className="text-muted-foreground/50">—</span>
            )}
          </div>
        );
      })}
    </>
  );
}

// Green (efficient / low CPA) → red (expensive / high CPA). Empty cells stay
// neutral. Low-alpha fills so text stays readable in both themes.
function cellColor(cpa: number | null, min: number, max: number): string {
  if (cpa == null) return 'transparent';
  const ratio = max > min ? (cpa - min) / (max - min) : 0;
  const hue = Math.round(140 - ratio * 140); // 140 = green, 0 = red
  return `hsl(${hue} 65% 45% / 0.18)`;
}
