import type { ChangeProjection } from '@continuum/contracts';
import {
  projectionBarsOf,
  projectionHeadlineOf,
  projectionRowsOf,
  projectionWindowText,
} from '@/lib/campaign-canvas/projection';
import { cn } from '@/lib/utils';

const ACTION_TONE: Record<string, string> = {
  increase: 'text-[color:var(--success)]',
  decrease: 'text-primary-ink',
  pause: 'text-destructive',
  unchanged: 'text-muted-foreground',
};

function Pair({ before, after, className }: { before: string; after: string; className?: string }) {
  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      <span className="text-muted-foreground">{before}</span>
      <span aria-hidden className="px-1 text-muted-foreground">
        →
      </span>
      <span className="sr-only"> to </span>
      <span className="font-medium text-foreground">{after}</span>
    </span>
  );
}

/**
 * How the campaigns would look after the proposed change: the table, results now vs after,
 * and the rule and window it rests on. A projection, labelled as one wherever it is read.
 */
export function ProjectionPanel({ projection }: { projection: ChangeProjection }) {
  const rows = projectionRowsOf(projection);
  const bars = projectionBarsOf(projection);
  return (
    <section
      className="space-y-3 px-3 py-3 text-[13px]"
      aria-label="Projected after"
      data-testid="projection-panel"
    >
      <header className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">
          How it would look after the change
          <span className="ml-2 rounded-full border border-border px-2 py-0.5 font-mono text-[11px] font-normal text-muted-foreground">
            projection
          </span>
        </h3>
        <p className="text-muted-foreground" data-testid="projection-window">
          {projectionWindowText(projection)}
        </p>
        <p className="text-foreground" data-testid="projection-headline">
          {projectionHeadlineOf(projection)}
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left" data-testid="projection-table">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Entity</th>
              <th className="py-1 pr-2 font-medium">Spend</th>
              <th className="py-1 pr-2 font-medium">{projection.resultLabel}</th>
              <th className="py-1 pr-2 font-medium">Cost per result</th>
              <th className="py-1 font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 align-top" data-testid="projection-row">
                <td className="py-1.5 pr-2">
                  <div className="font-medium text-foreground">{row.name}</div>
                  <div className={cn('text-xs', ACTION_TONE[row.action])}>{row.changeLabel}</div>
                </td>
                <td className="py-1.5 pr-2">
                  <Pair before={row.spend.before} after={row.spend.after} />
                </td>
                <td className="py-1.5 pr-2">
                  <Pair before={row.results.before} after={row.results.after} />
                  {row.results.range ? (
                    <div className="text-xs text-muted-foreground">range {row.results.range}</div>
                  ) : null}
                  {row.note ? (
                    <div className="max-w-[16rem] text-xs text-muted-foreground">{row.note}</div>
                  ) : null}
                </td>
                <td className="py-1.5 pr-2">
                  <Pair before={row.cost.before} after={row.cost.after} />
                </td>
                <td className="py-1.5">
                  <Pair before={row.share.before} after={row.share.after} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bars.length > 0 ? (
        <figure className="space-y-1.5" data-testid="projection-bars">
          <figcaption className="text-xs text-muted-foreground">
            {projection.resultLabel}: now (grey) and after (blue), projected
          </figcaption>
          {bars.map((bar) => (
            <div key={bar.id} className="grid grid-cols-[7rem_1fr] items-center gap-2">
              <span className="truncate text-xs text-foreground">{bar.label}</span>
              <div className="space-y-0.5">
                <div className="h-2 rounded-sm bg-muted-foreground/40" style={{ width: `${bar.beforePct}%` }} />
                <div className="h-2 rounded-sm bg-primary" style={{ width: `${bar.afterPct}%` }} />
              </div>
            </div>
          ))}
        </figure>
      ) : null}

      {projection.gaps.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground" data-testid="projection-gaps">
          {projection.gaps.map((gap) => (
            <li key={gap.entity}>
              <span className="font-medium text-foreground">{gap.entity}</span>: {gap.reason}
            </li>
          ))}
        </ul>
      ) : null}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          How this is projected
        </summary>
        <p className="mt-1">{projection.method.summary}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {projection.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
