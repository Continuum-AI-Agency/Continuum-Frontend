'use client';

// The expanded pacing module: per currency, spent / plan / expected and the gap; then every
// portfolio with a plan — running (with its own spend, or why it has none yet), not started, or
// ended — each linking to its account in the Optimizer, where the plan is changed.
//
// No daily spend line: the only cached per-cycle figure (the run history's actualSpendToDate) is
// not monotonic in production — Easy Fit's flight read 3,161 MXN on Nov 2 and 1,541 MXN on Nov 3 —
// so a cumulative line drawn from it would show spend going backwards.

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { formatMoney } from '@/lib/home/format';
import { cn } from '@/lib/utils';
import { PlanBar } from './PlanBar';
import { dayLabel, gapLabel, PACE_TONE } from './pacingFormat';
import { optimizerHref, type PacingRow, type PacingView } from './pacingModel';

type ReadyView = Extract<PacingView, { state: 'ready' }>;
type DashboardText = ReturnType<typeof useTranslations<'dashboard'>>;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="truncate font-medium text-sm tabular-nums">{value}</p>
    </div>
  );
}

function rowDetail(row: PacingRow, uiText: DashboardText): { line: string; tone: string | null } {
  const plan = uiText('amount_plan_start_end_54d4528', {
    amount: formatMoney(row.plan, row.currency),
    start: dayLabel(row.start),
    end: dayLabel(row.end),
  });
  if (row.kind === 'not_started')
    return {
      line: uiText('starts_day_plan_1f61b24', { day: dayLabel(row.start), plan }),
      tone: null,
    };
  if (row.kind === 'ended')
    return { line: uiText('ended_day_plan_14b0ccd', { day: dayLabel(row.end), plan }), tone: null };
  const spend = row.spend;
  if (spend.status === 'read') {
    const spent = formatMoney(spend.spent, row.currency);
    const gap = gapLabel(spend.gap, spend.gapPct, row.currency);
    return {
      line: spend.through
        ? uiText('spent_of_plan_expected_expected_by_day_gap_489c4b2', {
            spent,
            plan,
            expected: formatMoney(spend.expected, row.currency),
            day: dayLabel(spend.through),
            gap,
          })
        : uiText('spent_of_plan_gap_8216cd4', { spent, plan, gap }),
      tone: PACE_TONE[spend.pace],
    };
  }
  if (spend.status === 'error')
    return { line: uiText('spend_could_not_be_read_plan_094e284', { plan }), tone: null };
  if (spend.status === 'pending')
    return { line: uiText('reading_spend_plan_e730bf3', { plan }), tone: null };
  return { line: uiText('not_paced_against_this_plan_yet_plan_0d1b6f6', { plan }), tone: null };
}

export default function PacingModule({ view }: { view: ReadyView }) {
  const uiText = useTranslations('dashboard');
  return (
    <div className="space-y-5" data-testid="home-pacing-module">
      {view.groups.map((group) => (
        <section
          aria-label={
            group.currency
              ? uiText('pacing_in_currency_ce6f21e', { currency: group.currency })
              : uiText('pacing_in_the_account_currency_395d55f')
          }
          className="space-y-2"
          key={group.currency ?? 'none'}
        >
          <h4 className="font-medium text-sm">
            {group.currency ?? uiText('unknown_currency_4d3dc36')} ·{' '}
            {uiText('count_plural_one_plan_running_other_plans_run_d8e3be6', {
              count: group.portfolios,
            })}
          </h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label={uiText('spent_so_far_4f31ab9')}
              value={formatMoney(group.spent, group.currency)}
            />
            <Stat label={uiText('plan_fa8ed0b')} value={formatMoney(group.plan, group.currency)} />
            <Stat
              label={
                group.through
                  ? uiText('expected_by_day_bc413e4', { day: dayLabel(group.through) })
                  : uiText('expected_ca99b7f')
              }
              value={formatMoney(group.expected, group.currency)}
            />
            <Stat
              label={uiText('against_plan_df14cbb')}
              value={gapLabel(group.gap, group.gapPct, group.currency)}
            />
          </div>
          <PlanBar group={group} />
        </section>
      ))}
      <section aria-label={uiText('portfolios_with_a_plan_1eeca8a')} className="space-y-2">
        <h4 className="font-medium text-sm">{uiText('portfolios_with_a_plan_1eeca8a')}</h4>
        <ul className="hit-area-column divide-y divide-border/60" data-testid="home-pacing-rows">
          {view.rows.map((row) => {
            const detail = rowDetail(row, uiText);
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
          {uiText('spend_is_the_optimizer_s_figure_from_its_late_b4ecafa')}
        </p>
      </section>
    </div>
  );
}
