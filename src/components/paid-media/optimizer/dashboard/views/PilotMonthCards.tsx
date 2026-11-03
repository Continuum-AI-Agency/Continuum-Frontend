// The three pilot months side by side (one column on a phone): sign-ups against the goal with
// the floor marked, Meta sign-ups against their goal, spend against the budget. The month in
// course wears the accent border.

import { cn } from '@/lib/utils';
import { formatMxn, formatNumber } from '../dashboardFormat';
import type { ChipTone, MonthState } from '../dashboardModel';
import type { DashboardDictionary } from '../i18n/dictionary';
import type { DashboardLocale } from '../i18n/useDashboardLocale';
import { SERIES_COLOR } from '../parts/palette';
import { StatusChip } from '../parts/StatusChip';
import type { PilotMonth } from '../pilotModel';

const STATE_TONE: Record<MonthState, ChipTone> = {
  upcoming: 'neutral',
  inProgress: 'warn',
  maturing: 'warn',
  closed: 'good',
};

function ProgressRow({
  label,
  value,
  goal,
  floor,
  color,
  format,
  floorLabel,
}: {
  label: string;
  value: number;
  goal: number;
  floor?: number;
  color: string;
  format: (value: number) => string;
  floorLabel?: string;
}) {
  const max = Math.max(goal, value, 1);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          <b className="font-mono text-sm font-semibold text-foreground tabular-nums">
            {format(value)}
          </b>{' '}
          / {format(goal)}
        </span>
      </div>
      <div
        aria-label={`${label}: ${format(value)} / ${format(goal)}`}
        aria-valuemax={goal}
        aria-valuemin={0}
        aria-valuenow={value}
        className="relative h-2.5 rounded-full bg-muted"
        role="progressbar"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${Math.min(100, (100 * value) / max)}%`, background: color }}
        />
        {floor != null ? (
          <span
            className="absolute -inset-y-1 w-0.5 bg-muted-foreground"
            data-testid="floor-marker"
            style={{ left: `${(100 * floor) / max}%` }}
            title={floorLabel}
          />
        ) : null}
      </div>
    </div>
  );
}

export function PilotMonthCards({
  months,
  locale,
  t,
}: {
  months: readonly PilotMonth[];
  locale: DashboardLocale;
  t: DashboardDictionary;
}) {
  const count = (value: number) => formatNumber(value, locale);
  const money = (value: number) => formatMxn(value, locale);
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:col-span-12">
      {months.map((month) => (
        <article
          className={cn(
            'min-w-0 space-y-3 rounded-lg border border-border/60 bg-card p-4',
            month.state === 'inProgress' && 'border-primary ring-1 ring-primary ring-inset',
          )}
          data-state={month.state}
          data-testid={`pilot-month-${month.month}`}
          key={month.month}
        >
          <header className="flex items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">{month.label}</h3>
            <StatusChip tone={STATE_TONE[month.state]}>{t.month[month.state]}</StatusChip>
          </header>
          <ProgressRow
            color={SERIES_COLOR.blue}
            floor={month.floor}
            floorLabel={t.piloto.floorMarker(count(month.floor))}
            format={count}
            goal={month.goal}
            label={t.piloto.progressSignups}
            value={month.signups}
          />
          <ProgressRow
            color={SERIES_COLOR.aqua}
            format={count}
            goal={month.metaGoal}
            label={t.piloto.progressMeta}
            value={month.metaSignups}
          />
          <ProgressRow
            color={SERIES_COLOR.orange}
            format={money}
            goal={month.budget}
            label={t.piloto.progressSpend}
            value={month.spend}
          />
          {month.projectedSignups != null ? (
            <p className="m-0 text-xs text-muted-foreground" data-testid="pilot-projection">
              {t.piloto.projection(count(month.projectedSignups))}
            </p>
          ) : null}
          <dl className="grid grid-cols-3 gap-2 border-t border-border/60 pt-2.5">
            {[
              [t.piloto.floor, count(month.floor)],
              [t.piloto.costGoal, money(month.costGoal)],
              [t.piloto.metaCostGoal, money(month.metaCostGoal)],
            ].map(([term, value]) => (
              <div className="min-w-0" key={term}>
                <dt className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {term}
                </dt>
                <dd className="m-0 font-mono text-sm tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  );
}
