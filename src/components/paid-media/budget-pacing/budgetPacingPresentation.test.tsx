import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { render, renderToStaticMarkup } from '@/i18n/__tests__/render';
import { BudgetPacingResponseSchema } from '@/lib/schemas/budgetPacing';
import commonEn from '../../../../messages/common/en.json';
import commonEs from '../../../../messages/common/es.json';
import commonPt from '../../../../messages/common/pt-BR.json';
import en from '../../../../messages/scale/en.json';
import es from '../../../../messages/scale/es.json';
import pt from '../../../../messages/scale/pt-BR.json';
import { getTimeRangeOptions, TIME_RANGE_OPTIONS, toMetricsRange } from '../dashboard/timeRange';
import { BudgetPacingStatusBadge } from './BudgetPacingStatusBadge';
import { BudgetPacingSummaryStrip } from './BudgetPacingSummaryStrip';
import { BudgetPacingTable } from './BudgetPacingTable';
import {
  budgetPacingColumnLabels,
  formatBudgetPacingCurrency,
  formatBudgetPacingPercent,
  getBudgetPacingRangeOptions,
  RANGE_OPTIONS,
} from './budgetPacingPresentation';

afterEach(cleanup);
const data = BudgetPacingResponseSchema.parse({
  campaigns: [
    {
      campaignId: 'campaign-1',
      campaignName: 'Daily Budget Cap',
      status: 'ACTIVE',
      budgetType: 'daily',
      totalBudget: 1000.49,
      spendToDate: 450.17,
      budgetRemaining: 550.32,
      pacePct: 0.15,
      paceStatus: 'on_pace',
      paceMethod: 'budget',
      todaySpend: 25.15,
      projectedEndSpend: 750.25,
      daysElapsed: 4,
      daysRemaining: 1,
      flightStart: '2026-11-01',
      flightEnd: '2026-11-20',
      dailyTrend: [
        { date: '2026-11-01', spend: 13.5, target: 15 },
        { date: '2026-11-02', spend: 27.25, target: 15 },
      ],
      budgetSource: 'campaign',
      adSets: [],
    },
  ],
  summary: {
    totalBudget: 1000.49,
    totalSpend: 450.17,
    totalTodaySpend: 25.15,
    totalBudgetRemaining: 550.32,
    overallPacePct: 0.15,
    paceStatus: 'on_pace',
    accountBudgetPeriod: 'daily',
  },
  range: { since: '2026-11-01', until: '2026-11-20' },
});
const labelKeys = {
  last_7d: 'last_7_days_0603dec',
  last_14d: 'last_14_days_d9f1e16',
  last_30d: 'last_30_days_f8f03fb',
  custom: 'custom_range_add9164',
} as const;
for (const [locale, messages, common] of [
  ['en', en, commonEn],
  ['pt-BR', pt, commonPt],
  ['es', es, commonEs],
] as const) {
  const t = createTranslator({ locale, namespace: 'scale', messages: { scale: messages } });
  const wrap = (children: ReactNode) => (
    <NextIntlClientProvider
      locale={locale}
      timeZone="Pacific/Honolulu"
      messages={{ scale: messages, common }}
    >
      {children}
    </NextIntlClientProvider>
  );
  describe(`Budget pacing presentation ${locale}`, () => {
    test('returns localized option clones with unchanged range values, seconds and timezone windows', () => {
      const original = structuredClone(RANGE_OPTIONS);
      const options = getBudgetPacingRangeOptions(locale, () => t('all_a52ace4'));
      expect(options.map((option) => [option.value, option.seconds])).toEqual(
        original.map((option) => [option.value, option.seconds]),
      );
      expect(options[0]).not.toBe(RANGE_OPTIONS[0]);
      expect(options.at(-1)?.label).toBe(t('all_a52ace4'));
      expect(RANGE_OPTIONS).toEqual(original);
      const timeOriginal = structuredClone(TIME_RANGE_OPTIONS);
      const timeOptions = getTimeRangeOptions((value) => t(labelKeys[value]));
      expect(timeOptions.map((option) => option.value)).toEqual(
        timeOriginal.map((option) => option.value),
      );
      expect(timeOptions[0]?.label).toBe(t('last_7_days_0603dec'));
      expect(timeOptions[0]).not.toBe(TIME_RANGE_OPTIONS[0]);
      expect(TIME_RANGE_OPTIONS).toEqual(timeOriginal);
      expect(
        toMetricsRange(
          { preset: 'last_7d' },
          new Date('2026-03-11T01:30:00Z'),
          'America/Sao_Paulo',
        ),
      ).toEqual({ preset: 'custom', since: '2026-03-03', until: '2026-03-09' });
      const columns = budgetPacingColumnLabels('14d', (field, days) =>
        t(field === 'spend' ? 'budgetWindowSpend' : 'budgetWindowRemaining', { days: days ?? 0 }),
      );
      expect(columns.spend).toBe(t('budgetWindowSpend', { days: 14 }));
      expect(columns.remaining).toBe(t('budgetWindowRemaining', { days: 14 }));
    });
    test('preserves USD identity, whole-dollar precision and toFixed percentage rounding', () => {
      expect(formatBudgetPacingCurrency(1000.49, locale)).toBe(
        new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(1000.49),
      );
      expect(formatBudgetPacingPercent(0.15, locale)).toBe(
        new Intl.NumberFormat(locale, {
          style: 'percent',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
          useGrouping: false,
        }).format(Number((0.15).toFixed(1)) / 100),
      );
      expect(formatBudgetPacingPercent(999.95, locale)).toBe(
        new Intl.NumberFormat(locale, {
          style: 'percent',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
          useGrouping: false,
        }).format(Number((999.95).toFixed(1)) / 100),
      );
    });
    test('renders all status and summary labels with original numeric data', () => {
      const before = structuredClone(data);
      for (const [status, key] of [
        ['on_pace', 'on_pace_740901e'],
        ['underspending', 'budgetUnderspending'],
        ['overspending', 'budgetOverspending'],
      ] as const)
        expect(renderToStaticMarkup(wrap(<BudgetPacingStatusBadge status={status} />))).toContain(
          t(key),
        );
      const html = renderToStaticMarkup(wrap(<BudgetPacingSummaryStrip data={data} />));
      expect(html).toContain(t('budgetDailyBudgetCap'));
      expect(html).toContain(t('budgetTodaySpend').replaceAll("'", '&#x27;'));
      expect(html).toContain(t('budgetTodayRemaining').replaceAll("'", '&#x27;'));
      expect(html).toContain(formatBudgetPacingCurrency(data.summary.totalBudget, locale));
      expect(html).toContain(formatBudgetPacingPercent(data.summary.overallPacePct, locale));
      expect(data).toEqual(before);
    });
    test('keeps authored campaign names and keyboard focus IDs independent of translated labels', () => {
      const before = structuredClone(data);
      const focus = mock((_key: string | null) => {});
      const view = render(
        wrap(
          <BudgetPacingTable
            campaigns={data.campaigns}
            focusKey={null}
            onFocusKey={focus}
            selectedRange="all"
          />,
        ),
      );
      const row = view.getByText('Daily Budget Cap').closest('[role="button"]');
      expect(row).not.toBeNull();
      if (row) fireEvent.keyDown(row, { key: 'Enter' });
      expect(focus).toHaveBeenCalledWith('campaign:campaign-1');
      expect(view.getByText(t('daily_b36c261'))).toBeTruthy();
      expect(data).toEqual(before);
    });
  });
}

test('legacy option and header APIs retain English defaults', () => {
  expect(getBudgetPacingRangeOptions()).toEqual(RANGE_OPTIONS);
  expect(getTimeRangeOptions()).toEqual(TIME_RANGE_OPTIONS);
  expect(budgetPacingColumnLabels('7d')).toEqual({ spend: '7D Spend', remaining: '7D Left' });
  expect(budgetPacingColumnLabels('all')).toEqual({ spend: 'Spend', remaining: 'Remaining' });
});
