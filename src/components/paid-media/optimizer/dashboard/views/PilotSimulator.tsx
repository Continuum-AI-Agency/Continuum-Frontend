'use client';

// "¿Llegamos a las altas de Meta del mes?" — pick a pilot month (it sets the goal and the
// budget), move budget, Google share, cost per contact and the offer mix, and read the Meta
// sign-ups that buys with a verdict in words: reaches (≥ goal), close (≥ 80%), short.

import { useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatMxn, formatNumber } from '../dashboardFormat';
import {
  balanceMix,
  type ChipTone,
  LOWEST_SEEN_COST_PER_CONTACT,
  type SimulatorRates,
  type SimulatorVerdict,
  simulate,
} from '../dashboardModel';
import type { DashboardDictionary } from '../i18n/dictionary';
import type { DashboardLocale } from '../i18n/useDashboardLocale';
import { Block, Note } from '../parts/layout';
import { StatusChip } from '../parts/StatusChip';
import type { PilotMonth } from '../pilotModel';

const VERDICT_TONE: Record<SimulatorVerdict, ChipTone> = {
  reaches: 'good',
  close: 'warn',
  short: 'bad',
};

const VERDICT_CLASS: Record<SimulatorVerdict, string> = {
  reaches: 'bg-success/10',
  close: 'bg-warning/10',
  short: 'bg-destructive/10',
};

function Slider({
  label,
  output,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  output: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-xs font-semibold text-muted-foreground">
        <label htmlFor={id}>{label}</label>
        <output className="font-mono text-foreground tabular-nums" htmlFor={id}>
          {output}
        </output>
      </div>
      <input
        className="w-full accent-primary"
        id={id}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </div>
  );
}

export function PilotSimulator({
  months,
  rates,
  startingCostPerContact,
  locale,
  t,
}: {
  months: readonly PilotMonth[];
  rates: SimulatorRates;
  startingCostPerContact: number;
  locale: DashboardLocale;
  t: DashboardDictionary;
}) {
  const [monthIndex, setMonthIndex] = useState(0);
  const [budget, setBudget] = useState(months[0]?.budget ?? 0);
  const [google, setGoogle] = useState(0);
  const [costPerContact, setCostPerContact] = useState(startingCostPerContact);
  const [mix, setMix] = useState({ pctDayPass: 50, pctAnnual: 0 });
  const month = months[monthIndex];
  if (!month) return null;

  const result = simulate(
    {
      budgetTotal: budget,
      googleSpend: google,
      costPerContact,
      pctDayPass: mix.pctDayPass,
      pctAnnual: mix.pctAnnual,
      metaSignupGoal: month.metaGoal,
    },
    rates,
  );
  const money = (value: number | null) => formatMxn(value, locale);
  const count = (value: number) => formatNumber(value, locale);
  const rate = (value: number) => formatNumber(value, locale, 1);
  const verdictLabel = {
    reaches: t.simulator.verdictReaches,
    close: t.simulator.verdictClose,
    short: t.simulator.verdictShort,
  }[result.verdict];
  const needed = Math.floor(result.costPerContactNeeded);

  return (
    <Block
      subtitle={t.simulator.subtitle(
        rate(rates.dayPass),
        rate(rates.annual),
        rate(rates.cheapFirstMonth),
      )}
      testId="pilot-simulator"
      title={t.simulator.title}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-3">
          <fieldset className="space-y-1">
            <legend className="flex w-full justify-between gap-2 text-xs font-semibold text-muted-foreground">
              {t.simulator.month}
              <span className="font-mono text-foreground">
                {t.simulator.goal(count(month.metaGoal))}
              </span>
            </legend>
            <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-[3px]">
              {months.map((option, index) => (
                <button
                  aria-pressed={index === monthIndex}
                  className={cn(
                    'h-7 rounded-md px-3 text-xs font-medium',
                    index === monthIndex
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  key={option.month}
                  onClick={() => {
                    setMonthIndex(index);
                    setBudget(option.budget);
                  }}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <Slider
            label={t.simulator.budget}
            max={200_000}
            min={60_000}
            onChange={setBudget}
            output={money(budget)}
            step={5_000}
            value={budget}
          />
          <Slider
            label={t.simulator.google}
            max={40_000}
            min={0}
            onChange={setGoogle}
            output={money(Math.min(google, budget))}
            step={1_000}
            value={google}
          />
          <Slider
            label={t.simulator.costPerContact}
            max={90}
            min={35}
            onChange={setCostPerContact}
            output={money(costPerContact)}
            step={1}
            value={costPerContact}
          />
          <Slider
            label={t.simulator.dayPass}
            max={100}
            min={0}
            onChange={(value) => setMix(balanceMix(value, mix.pctAnnual, 'dayPass'))}
            output={`${mix.pctDayPass}%`}
            step={5}
            value={mix.pctDayPass}
          />
          <Slider
            label={t.simulator.annual}
            max={100}
            min={0}
            onChange={(value) => setMix(balanceMix(mix.pctDayPass, value, 'annual'))}
            output={`${mix.pctAnnual}%`}
            step={5}
            value={mix.pctAnnual}
          />
          <Note>{t.simulator.rest}</Note>
        </div>
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            {[
              [t.simulator.outMetaSpend, money(result.metaSpend)],
              [t.simulator.outContacts, count(result.contacts)],
              [t.simulator.outSignups, count(result.metaSignups)],
              [t.simulator.outCost, money(result.costPerMetaSignup)],
            ].map(([term, value]) => (
              <div className="rounded-lg bg-muted px-3 py-2.5" key={term}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {term}
                </dt>
                <dd className="m-0 font-mono text-[22px] tabular-nums" data-testid={`sim-${term}`}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div
            aria-live="polite"
            className={cn('space-y-1.5 rounded-lg p-3 text-sm', VERDICT_CLASS[result.verdict])}
            data-testid="sim-verdict"
            data-verdict={result.verdict}
          >
            <StatusChip tone={VERDICT_TONE[result.verdict]}>{verdictLabel}</StatusChip>
            <p className="m-0">
              {result.verdict === 'reaches'
                ? t.simulator.reaches(
                    month.label.toLowerCase(),
                    count(result.metaSignups),
                    count(month.metaGoal),
                    money(result.costPerMetaSignup),
                  )
                : t.simulator.short(count(result.shortfall), count(month.metaGoal), money(needed))}
              {result.verdict !== 'reaches' && needed < LOWEST_SEEN_COST_PER_CONTACT
                ? t.simulator.neverSeen
                : null}
            </p>
          </div>
        </div>
      </div>
    </Block>
  );
}
