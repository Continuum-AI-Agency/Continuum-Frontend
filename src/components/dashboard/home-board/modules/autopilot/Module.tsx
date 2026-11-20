'use client';

// The expanded Overnight: every action of the last 24 h with its reason, what the cap held back
// (or, without the Backend's read, the one note that outcomes are pending), and how each portfolio
// is set to run — read-only. The autonomy controls stay in the Optimizer's automations page, linked
// from here; the Home writes none of them.

import type { HomeOvernightCapItem } from '@continuum/contracts';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { OPTIMIZER_LINKS } from '../opps/oppsModel';
import { ROW_LINK } from '../opps/tileParts';
import { OvernightRowItem } from './OvernightRowItem';
import type { OvernightRow, PortfolioRun } from './overnightModel';
import { capItemLine } from './overnightRead';

type DashboardText = ReturnType<typeof useTranslations<'dashboard'>>;

function runLine(run: PortfolioRun, uiText: DashboardText): string {
  if (run.writesOff) {
    return uiText('mode_writes_off_the_client_applies_the_change_90b7233', { mode: run.mode });
  }
  const parts = [run.mode];
  if (run.mode === 'Autopilot' && run.paused) parts.push(uiText('paused_a7a9dc5'));
  if (run.maxChange)
    parts.push(uiText('up_to_amount_per_cycle_30bcb94', { amount: run.maxChange }));
  if (run.maxDaily) parts.push(uiText('up_to_amount_a_day_77c3892', { amount: run.maxDaily }));
  return parts.join(' · ');
}

function CapSkipped({ items }: { items: readonly HomeOvernightCapItem[] }) {
  const uiText = useTranslations('dashboard');
  return (
    <section className="space-y-2" data-testid="home-overnight-cap">
      <h4 className="font-medium text-sm">
        {uiText('held_back_by_the_cap_count_a705e13', { count: items.length })}
      </h4>
      <p className="text-muted-foreground text-xs leading-snug">
        {uiText('the_autopilot_did_not_write_these_because_the_71147d4')}
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
  const uiText = useTranslations('dashboard');
  return (
    <div className="space-y-5" data-testid="home-overnight-module">
      <section className="space-y-2">
        <h4 className="font-medium text-sm">{uiText('last_24_hours_5c37cf8')}</h4>
        {outcomesPending ? (
          <p
            className="text-muted-foreground text-xs leading-snug"
            data-testid="home-overnight-note"
          >
            {uiText('a_write_reads_applied_only_when_the_platform__8809356')}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {uiText('nothing_ran_in_the_last_24_h_3c1b662')}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <OvernightRowItem key={row.id} row={row} />
            ))}
          </ul>
        )}
        {truncated ? (
          <p className="text-2xs text-muted-foreground">
            {uiText('the_newest_actions_of_a_longer_list_76f4374')}
          </p>
        ) : null}
      </section>
      {capSkipped.length > 0 ? <CapSkipped items={capSkipped} /> : null}
      <section className="space-y-2">
        <h4 className="font-medium text-sm">{uiText('how_each_portfolio_runs_da21817')}</h4>
        <ul className="flex flex-col gap-1.5">
          {runs.map((run) => (
            <li
              className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-xs"
              data-testid="home-overnight-run"
              key={run.id}
            >
              <span className="min-w-0 truncate font-medium">{run.name}</span>
              <span className="text-muted-foreground">{runLine(run, uiText)}</span>
            </li>
          ))}
        </ul>
        <Link className={cn(ROW_LINK, 'inline-block text-xs')} href={OPTIMIZER_LINKS.automations}>
          {uiText('change_in_optimizer_automations_98976a5')}
        </Link>
      </section>
    </div>
  );
}
