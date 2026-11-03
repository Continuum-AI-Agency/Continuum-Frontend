'use client';

// The expanded pacing module: per currency, spent / plan / expected and the gap; then every
// portfolio with a plan — running (with its own spend, or why it has none yet), not started, or
// ended — each linking to its account in the Optimizer, where the plan is changed.
//
// No daily spend line: the only cached per-cycle figure (the run history's actualSpendToDate) is
// not monotonic in production — Easy Fit's flight read 3,161 MXN on Nov 2 and 1,541 MXN on Nov 3 —
// so a cumulative line drawn from it would show spend going backwards.

import Link from 'next/link';
import { formatMoney } from '@/lib/home/format';
import { cn } from '@/lib/utils';
import { PlanBar } from './PlanBar';
import { dayLabel, gapLabel, PACE_TONE } from './pacingFormat';
import { optimizerHref, type PacingRow, type PacingView } from './pacingModel';

type ReadyView = Extract<PacingView, { state: 'ready' }>;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="truncate font-medium text-sm tabular-nums">{value}</p>
    </div>
  );
}

function rowDetail(row: PacingRow): { line: string; tone: string | null } {
  const plan = `${formatMoney(row.plan, row.currency)} plan · ${dayLabel(row.start)} – ${dayLabel(row.end)}`;
  if (row.kind === 'not_started')
    return { line: `Starts ${dayLabel(row.start)} · ${plan}`, tone: null };
  if (row.kind === 'ended') return { line: `Ended ${dayLabel(row.end)} · ${plan}`, tone: null };
  const spend = row.spend;
  if (spend.status === 'read') {
    const expected = spend.through
      ? ` · ${formatMoney(spend.expected, row.currency)} expected by ${dayLabel(spend.through)}`
      : '';
    return {
      line: `${formatMoney(spend.spent, row.currency)} of ${plan}${expected} · ${gapLabel(spend.gap, spend.gapPct, row.currency)}`,
      tone: PACE_TONE[spend.pace],
    };
  }
  if (spend.status === 'error') return { line: `Spend could not be read · ${plan}`, tone: null };
  if (spend.status === 'pending') return { line: `Reading spend… · ${plan}`, tone: null };
  return { line: `Not paced against this plan yet · ${plan}`, tone: null };
}

export default function PacingModule({ view }: { view: ReadyView }) {
  return (
    <div className="space-y-5" data-testid="home-pacing-module">
      {view.groups.map((group) => (
        <section
          aria-label={`Pacing in ${group.currency ?? 'the account currency'}`}
          className="space-y-2"
          key={group.currency ?? 'none'}
        >
          <h4 className="font-medium text-sm">
            {group.currency ?? 'Unknown currency'} · {group.portfolios}{' '}
            {group.portfolios === 1 ? 'plan' : 'plans'} running
          </h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Spent so far" value={formatMoney(group.spent, group.currency)} />
            <Stat label="Plan" value={formatMoney(group.plan, group.currency)} />
            <Stat
              label={group.through ? `Expected by ${dayLabel(group.through)}` : 'Expected'}
              value={formatMoney(group.expected, group.currency)}
            />
            <Stat label="Against plan" value={gapLabel(group.gap, group.gapPct, group.currency)} />
          </div>
          <PlanBar group={group} />
        </section>
      ))}
      <section aria-label="Portfolios with a plan" className="space-y-2">
        <h4 className="font-medium text-sm">Portfolios with a plan</h4>
        <ul className="hit-area-column divide-y divide-border/60" data-testid="home-pacing-rows">
          {view.rows.map((row) => {
            const detail = rowDetail(row);
            return (
              <li
                className="min-w-0 py-2"
                data-kind={row.kind}
                data-testid="home-pacing-row"
                key={row.id}
              >
                <Link
                  className="hit-area block truncate font-medium text-sm hover:underline"
                  data-testid="home-pacing-row-link"
                  href={optimizerHref(row.adAccountId)}
                >
                  {row.name}
                </Link>
                <p className={cn('text-muted-foreground text-xs', detail.tone)}>{detail.line}</p>
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground text-xs">
          Spend is the Optimizer’s figure from its latest daily cycle, through the day before it
          ran.
        </p>
      </section>
    </div>
  );
}
