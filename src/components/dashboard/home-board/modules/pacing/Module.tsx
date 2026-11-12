'use client';
import {
  useTranslations as useBetaTranslations,
  useLocale as useNumberLocale,
  useLocale as usePacingLocale,
} from 'next-intl';

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

function rowDetail(
  row: PacingRow,
  t: ReturnType<typeof useBetaTranslations<'dashboard'>>,
  locale: import('@/i18n/config').UiLocale,
): { line: string; tone: string | null } {
  const plan = t('pacingPlan', {
    money: formatMoney(row.plan, row.currency, locale),
    start: dayLabel(row.start, locale),
    end: dayLabel(row.end, locale),
  });
  if (row.kind === 'not_started')
    return {
      line: t('pacingStarts', { date: dayLabel(row.start, locale), plan }),
      tone: null,
    };
  if (row.kind === 'ended')
    return {
      line: t('pacingEnded', { date: dayLabel(row.end, locale), plan }),
      tone: null,
    };
  const spend = row.spend;
  if (spend.status === 'read') {
    const expected = spend.through
      ? t('pacingExpected', {
          money: formatMoney(spend.expected, row.currency, locale),
          date: dayLabel(spend.through, locale),
        })
      : '';
    return {
      line: t('pacingSpent', {
        money: formatMoney(spend.spent, row.currency, locale),
        plan,
        expected,
        gap: gapLabel(spend.gap, spend.gapPct, row.currency, t, locale),
      }),
      tone: PACE_TONE[spend.pace],
    };
  }
  return {
    line: t('pacingReadState', { status: spend.status, plan }),
    tone: null,
  };
}

export default function PacingModule({ view }: { view: ReadyView }) {
  const numberLocale = useNumberLocale();

  const betaUiText = useBetaTranslations('dashboard');
  const pacingLocale = usePacingLocale();

  return (
    <div className="space-y-5" data-testid="home-pacing-module">
      {view.groups.map((group) => (
        <section
          aria-label={betaUiText('beta_77b86d7c7dfb', {
            value0: String(group.currency ?? 'unknown'),
          })}
          className="space-y-2"
          key={group.currency ?? 'none'}
        >
          <h4 className="font-medium text-sm">
            {group.currency ?? betaUiText('beta_4d3dc365844e')} · {group.portfolios}{' '}
            {group.portfolios === 1
              ? betaUiText('beta_64879f7d6b96')
              : betaUiText('beta_c404dc69b55c')}{' '}
            {betaUiText('beta_c071cf5f5ed6')}
          </h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label={betaUiText('beta_4f31ab9b270c')}
              value={formatMoney(group.spent, group.currency, numberLocale)}
            />
            <Stat
              label={betaUiText('beta_fa8ed0bdabdd')}
              value={formatMoney(group.plan, group.currency, numberLocale)}
            />
            <Stat
              label={
                group.through
                  ? betaUiText('beta_caa284847448', {
                      value0: String(dayLabel(group.through, pacingLocale)),
                    })
                  : betaUiText('beta_ca99b7f1b14e')
              }
              value={formatMoney(group.expected, group.currency, numberLocale)}
            />
            <Stat
              label={betaUiText('beta_df14cbb04c0a')}
              value={gapLabel(group.gap, group.gapPct, group.currency, betaUiText, pacingLocale)}
            />
          </div>
          <PlanBar group={group} />
        </section>
      ))}
      <section aria-label={betaUiText('beta_1eeca8a1037d')} className="space-y-2">
        <h4 className="font-medium text-sm">{betaUiText('beta_1eeca8a1037d')}</h4>
        <ul className="hit-area-column divide-y divide-border/60" data-testid="home-pacing-rows">
          {view.rows.map((row) => {
            const detail = rowDetail(row, betaUiText, pacingLocale);
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
        <p className="text-muted-foreground text-xs">{betaUiText('beta_b4ecafa7b08d')}</p>
      </section>
    </div>
  );
}
