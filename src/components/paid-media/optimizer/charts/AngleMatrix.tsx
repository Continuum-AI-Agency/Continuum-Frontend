'use client';

// Audience × communication-angle CPA matrix. BKLit's HeatmapChart is a calendar
// contribution heatmap (weeks × weekdays), which would misrepresent this data, so
// this is a purpose-built CSS-grid matrix. The `angle` axis stays "untagged"
// until the v2 Jaina creative-angle worker runs — we render the real audience
// axis and the untagged column now so the shell lights up automatically when
// tags arrive (rather than hiding the capability). CPA per cell = spend /
// conversions (engine math — nothing lies). Cell fill rides the shared semantic
// good→bad ramp (cpaHeatFill) so it adapts to light/dark automatically.

import { type AngleMatrixCell, getOptimizationMetricDefinition } from '@continuum/contracts';

import { deriveEfficiency, formatCpa, humanize } from '../format';
import { ChartEmpty } from './ChartStates';
import { cpaHeatFill } from './chartScale';

type AngleMatrixProps = {
  cells: AngleMatrixCell[];
  currency?: string | null;
  objective?: string | null;
};

const AUDIENCE_ORDER = ['prospecting', 'retargeting', 'remarketing', 'unknown'];

export function AngleMatrix({ cells, currency, objective }: AngleMatrixProps) {
  const metric = getOptimizationMetricDefinition(objective);
  if (cells.length === 0) {
    return (
      <ChartEmpty message="No audience data yet — the matrix fills after the first scored cycle." />
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
    .map((cell) => deriveEfficiency(cell.spend, cell.conversions, metric.denominatorMultiplier))
    .filter((value): value is number => value != null);
  const minCpa = cpas.length ? Math.min(...cpas) : 0;
  const maxCpa = cpas.length ? Math.max(...cpas) : 1;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <div
          className="grid gap-1 text-2xs"
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
              costLabel={metric.costLabel}
              denominatorMultiplier={metric.denominatorMultiplier}
            />
          ))}
        </div>
      </div>
      {allUntagged ? (
        <p className="text-2xs text-muted-foreground">
          These ads haven&rsquo;t been analyzed for creative angle yet. The labeler processes this
          account automatically — the columns split by angle on their own once it has, no action
          needed.
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
  costLabel,
  denominatorMultiplier,
}: {
  audience: string;
  angles: string[];
  byKey: Map<string, AngleMatrixCell>;
  minCpa: number;
  maxCpa: number;
  currency?: string | null;
  costLabel: string;
  denominatorMultiplier: number;
}) {
  return (
    <>
      <div className="flex items-center truncate pr-1 text-muted-foreground">
        {humanize(audience)}
      </div>
      {angles.map((angle) => {
        const cell = byKey.get(`${audience}::${angle}`);
        const cpa = cell
          ? deriveEfficiency(cell.spend, cell.conversions, denominatorMultiplier)
          : null;
        const ratio = cpa == null ? null : maxCpa > minCpa ? (cpa - minCpa) / (maxCpa - minCpa) : 0;
        const label =
          cpa != null
            ? `${humanize(audience)}, ${angle === 'untagged' ? 'untagged' : humanize(angle)}: ${formatCpa(cpa, currency)} ${costLabel} across ${cell?.adsets ?? 0} ad sets`
            : `${humanize(audience)}, ${angle === 'untagged' ? 'untagged' : humanize(angle)}: no data`;
        return (
          <div
            key={angle}
            role="img"
            aria-label={label}
            className="grid h-10 place-items-center rounded-md border border-border/40 text-center tabular-nums"
            style={{ backgroundColor: cpaHeatFill(ratio) }}
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
