import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import { targetingSummary } from '@/lib/paid-media/scaffoldTree';
import en from '../../../../../messages/scale/en.json';
import es from '../../../../../messages/scale/es.json';
import pt from '../../../../../messages/scale/pt-BR.json';
import { formatCampaignBudgetShare, formatDailyBudget } from './scaffoldBudget';

describe('scaffold detail UI language boundaries', () => {
  for (const [locale, messages] of [
    ['en', en],
    ['pt-BR', pt],
    ['es', es],
  ] as const) {
    const t = createTranslator({
      locale,
      messages: { scale: messages },
      namespace: 'scale',
      onError: (error) => {
        throw error;
      },
    });
    const targeting = {
      custom_audiences: [{ id: 'a' }],
      excluded_custom_audiences: [{ id: 'b' }, { id: 'c' }],
      geo_locations: { countries: ['US'] },
      age_min: 18,
      age_max: 65,
    };
    it(`${locale}: keeps budgets and targeting data intact while wording them in the UI language`, () => {
      const before = JSON.stringify(targeting);
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
      const share = formatCampaignBudgetShare(
        { adSetCount: 3, campaignDailyBudgetMinorUnits: 30_000 },
        'USD',
        t,
        locale,
      );
      expect(share).toStartWith(t('1_count_of_the_campaign_budget_cbo_99e56ed', { count: 3 }));
      expect(share).toContain('USD');
      const summary = targetingSummary(targeting, t, locale);
      expect(summary).toContain(t('scaffoldIncludedAudiences', { count: 1 }));
      expect(summary).toContain('18–65');
      expect(JSON.stringify(targeting)).toBe(before);
    });
  }
});
