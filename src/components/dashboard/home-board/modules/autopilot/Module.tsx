'use client';

// The expanded Overnight: every action of the last 24 h with its reason, the one note about write
// outcomes, and how each portfolio is set to run — read-only. The autonomy controls stay in the
// Optimizer's automations page, linked from here; the Home writes none of them.

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { OPTIMIZER_LINKS } from '../opps/oppsModel';
import { ROW_LINK } from '../opps/tileParts';
import { OvernightRowItem } from './OvernightRowItem';
import { OUTCOME_NOTE, type OvernightRow, type PortfolioRun } from './overnightModel';

function runLine(run: PortfolioRun): string {
  if (run.writesOff) return `${run.mode} · writes off, the client applies the changes`;
  const parts = [run.mode];
  if (run.mode === 'Autopilot' && run.paused) parts.push('paused');
  if (run.maxChange) parts.push(`up to ${run.maxChange} per cycle`);
  if (run.maxDaily) parts.push(`up to ${run.maxDaily} a day`);
  return parts.join(' · ');
}

export default function AutopilotModule({
  rows,
  runs,
}: {
  rows: OvernightRow[];
  runs: PortfolioRun[];
}) {
  return (
    <div className="space-y-5" data-testid="home-overnight-module">
      <section className="space-y-2">
        <h4 className="font-medium text-sm">Last 24 hours</h4>
        <p className="text-muted-foreground text-xs leading-snug">{OUTCOME_NOTE}</p>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing ran in the last 24 h.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <OvernightRowItem key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <h4 className="font-medium text-sm">How each portfolio runs</h4>
        <ul className="flex flex-col gap-1.5">
          {runs.map((run) => (
            <li
              className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-xs"
              data-testid="home-overnight-run"
              key={run.id}
            >
              <span className="min-w-0 truncate font-medium">{run.name}</span>
              <span className="text-muted-foreground">{runLine(run)}</span>
            </li>
          ))}
        </ul>
        <Link className={cn(ROW_LINK, 'inline-block text-xs')} href={OPTIMIZER_LINKS.automations}>
          Change in Optimizer automations
        </Link>
      </section>
    </div>
  );
}
