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
import { ScaffoldAdSetDetail, ScaffoldCampaignDetail } from './ScaffoldNodeDetail';
import { ScaffoldStatusPill } from './ScaffoldStatusPill';
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
      choices: { objective: 'OUTCOME_SALES', optimizationGoal: 'OFFSITE_CONVERSIONS' },
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
    it(`${locale}: keeps budgets, targeting data and names intact while rendering localized controls and safe errors`, () => {
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
          <ScaffoldAdSetDetail data={data} />
          <ScaffoldCampaignDetail data={{ adSetCount: 1, adCount: 2, choices: data.choices }} />
          <ScaffoldStatusPill status="indeterminate" />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText('Customer authored name')).toBeTruthy();
      expect(
        screen.getAllByText({ en: 'Sales', 'pt-BR': 'Vendas', es: 'Ventas' }[locale]),
      ).toHaveLength(2);
      expect(document.body.textContent).not.toContain(data.errorMessage);
      expect(document.body.textContent).toContain(t('scaffoldNodeCounts', { sets: 1, ads: 2 }));
      expect(JSON.stringify(data)).toBe(before);
    });
  }
});
