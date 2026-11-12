'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// The expanded Overnight: every action of the last 24 h with its reason, what the cap held back
// (or, without the Backend's read, the one note that outcomes are pending), and how each portfolio
// is set to run — read-only. The autonomy controls stay in the Optimizer's automations page, linked
// from here; the Home writes none of them.

import type { HomeOvernightCapItem } from '@continuum/contracts';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { OPTIMIZER_LINKS } from '../opps/oppsModel';
import { ROW_LINK } from '../opps/tileParts';
import { OvernightRowItem } from './OvernightRowItem';
import { OUTCOME_NOTE, type OvernightRow, type PortfolioRun } from './overnightModel';
import { capItemLine } from './overnightRead';

function runLine(run: PortfolioRun): string {
  if (run.writesOff) return `${run.mode} · writes off, the client applies the changes`;
  const parts = [run.mode];
  if (run.mode === 'Autopilot' && run.paused) parts.push('paused');
  if (run.maxChange) parts.push(`up to ${run.maxChange} per cycle`);
  if (run.maxDaily) parts.push(`up to ${run.maxDaily} a day`);
  return parts.join(' · ');
}

function CapSkipped({ items }: { items: readonly HomeOvernightCapItem[] }) {
  const betaUiText = useBetaTranslations('dashboard');

  return (
    <section className="space-y-2" data-testid="home-overnight-cap">
      <h4 className="font-medium text-sm">
        {betaUiText('beta_0a8c92fdf218')} {items.length}
      </h4>
      <p className="text-muted-foreground text-xs leading-snug">
        {betaUiText('beta_71147d47ea1c')}
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li className="space-y-0.5 text-xs" data-testid="home-overnight-cap-item" key={item.id}>
            <p className="font-medium tabular-nums">{capItemLine(item)}</p>
            {item.reason ? (
              <p className="text-muted-foreground leading-snug">{item.reason}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AutopilotModule({
  rows,
  runs,
  outcomesPending = true,
  capSkipped = [],
  truncated = false,
}: {
  rows: OvernightRow[];
  runs: PortfolioRun[];
  /** The rows come from the action feed, which cannot say what each write's outcome was. */
  outcomesPending?: boolean;
  capSkipped?: readonly HomeOvernightCapItem[];
  /** The window held more actions than the read listed. */
  truncated?: boolean;
}) {
  const betaUiText = useBetaTranslations('dashboard');

  return (
    <div className="space-y-5" data-testid="home-overnight-module">
      <section className="space-y-2">
        <h4 className="font-medium text-sm">{betaUiText('beta_5c37cf8f018b')}</h4>
        {outcomesPending ? (
          <p
            className="text-muted-foreground text-xs leading-snug"
            data-testid="home-overnight-note"
          >
            {OUTCOME_NOTE}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{betaUiText('beta_3c1b6623b90c')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <OvernightRowItem key={row.id} row={row} />
            ))}
          </ul>
        )}
        {truncated ? (
          <p className="text-2xs text-muted-foreground">{betaUiText('beta_76f43747f470')}</p>
        ) : null}
      </section>
      {capSkipped.length > 0 ? <CapSkipped items={capSkipped} /> : null}
      <section className="space-y-2">
        <h4 className="font-medium text-sm">{betaUiText('beta_da21817fe212')}</h4>
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
          {betaUiText('beta_98976a561082')}
        </Link>
      </section>
    </div>
  );
}
