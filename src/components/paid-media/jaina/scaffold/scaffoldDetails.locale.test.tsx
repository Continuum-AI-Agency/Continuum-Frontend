import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { targetingSummary } from '@/lib/paid-media/scaffoldTree';
import commonEn from '../../../../../messages/common/en.json';
import commonEs from '../../../../../messages/common/es.json';
import commonPt from '../../../../../messages/common/pt-BR.json';
import en from '../../../../../messages/scale/en.json';
import es from '../../../../../messages/scale/es.json';
import pt from '../../../../../messages/scale/pt-BR.json';
import { ScaffoldSummaryStrip } from './ScaffoldPlanSections';
import { formatDailyBudget } from './scaffoldBudget';

afterEach(cleanup);
describe('scaffold detail UI language boundaries', () => {
  for (const [locale, messages, common] of [
    ['en', en, commonEn],
    ['pt-BR', pt, commonPt],
    ['es', es, commonEs],
  ] as const) {
    const t = createTranslator({
      locale,
      messages: { scale: messages },
      namespace: 'scale',
      onError: (error) => {
        throw error;
      },
    });
    const data = {
      productKey: 'Customer authored name',
      adCount: 1000,
      choices: {
        objective: 'OUTCOME_SALES',
        optimizationGoal: 'OFFSITE_CONVERSIONS',
      },
      derived: {
        targeting: {
          custom_audiences: [{ id: 'a' }],
          excluded_custom_audiences: [{ id: 'b' }, { id: 'c' }],
          geo_locations: { countries: ['US'] },
          age_min: 18,
          age_max: 65,
        },
      },
      errorMessage: 'private backend diagnostic 123',
    };
    it(`${locale}: keeps budgets, targeting and authored names intact in the current summary UI`, () => {
      const before = JSON.stringify(data);
      const budget = formatDailyBudget(6199, 'USD', t, locale);
      expect(budget).toContain('USD');
      expect(budget).not.toContain('R$');
      expect(formatDailyBudget(null, 'USD', t, locale)).toBe(
        {
          en: 'Placeholder budget',
          'pt-BR': 'Orçamento provisório',
          es: 'Presupuesto provisional',
        }[locale],
      );
      const summary = targetingSummary(data.derived.targeting, t, locale);
      expect(summary).toContain(t('scaffoldIncludedAudiences', { count: 1 }));
      expect(summary).toContain('18–65');
      render(
        <NextIntlClientProvider
          locale={locale}
          messages={{ scale: messages, common }}
          timeZone="UTC"
          onError={(error) => {
            throw error;
          }}
        >
          <ScaffoldSummaryStrip
            summary={{
              objective: data.productKey,
              dailyBudgetMinorUnits: 6199,
              budgetHeldByCampaign: false,
              currency: 'USD',
              conversionsPerDay: 1.2,
              cpa: 51.66,
              audiences: 1000,
              creatives: 1,
              ads: 2,
              optimizer: null,
            }}
          />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText('Customer authored name')).toBeTruthy();
      expect(screen.getByTestId('scaffold-summary-creatives').textContent).toContain(
        t('scaffoldSummaryCreativeCount', { creatives: 1, ads: 2 }),
      );
      expect(screen.getByTestId('scaffold-summary-optimizer').textContent).toContain(
        t('scaffoldSummaryNotPlanned'),
      );
      expect(screen.getByTestId('scaffold-summary-budget').textContent).toContain('USD');
      if (locale !== 'en')
        expect(screen.getByTestId('scaffold-summary-budget').textContent).not.toContain(
          'Total across ad sets',
        );
      expect(JSON.stringify(data)).toBe(before);
    });
  }
});
