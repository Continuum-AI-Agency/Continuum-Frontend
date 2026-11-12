import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import en from '../../../../../../messages/scale/en.json';
import es from '../../../../../../messages/scale/es.json';
import pt from '../../../../../../messages/scale/pt-BR.json';
import { HISTORY, NOW } from './__fixtures__/googleTab';
import type { HistoryRead } from './campaignExplorerModel';
import { strategyWords, systemStatusWords } from './campaignExplorerModel';
import { recentGoogleChanges, recentSummary, type WritesRead } from './GoogleRecentChanges';
import { Missing } from './GoogleSection';
import {
  campaignsFixture,
  keywordQualityFixture,
  networkFixture,
  pmaxFixture,
} from './views/__fixtures__/googleViews';
import { buildMoneyLeft } from './views/moneyLeftModel';
import { buildPmaxHealth, networkSplit } from './views/pmaxHealthModel';
import { buildQualityScoreMap } from './views/qualityScoreModel';

afterEach(cleanup);
describe('Google Ads UI language boundaries', () => {
  for (const [locale, messages] of [
    ['en', en],
    ['pt-BR', pt],
    ['es', es],
  ] as const) {
    const t = createTranslator({
      locale,
      messages: { scale: messages },
      namespace: 'scale',
    });
    it(`${locale}: translates control labels and accessible missing-value guidance`, () => {
      expect(strategyWords('TARGET_ROAS', t)).toBe(t('googleCopy_58e69583de'));
      expect(systemStatusWords('ENABLED', t)).toBe(
        {
          en: 'Learned',
          'pt-BR': 'Aprendizado concluído',
          es: 'Aprendizaje completado',
        }[locale],
      );
      render(
        <NextIntlClientProvider locale={locale} messages={{ scale: messages }} timeZone="UTC">
          <Missing reason="Google has not rated this asset group" />
        </NextIntlClientProvider>,
      );
      expect(screen.getByTestId('missing').getAttribute('title')).toBe(
        {
          en: 'Google has not rated this asset group',
          'pt-BR': 'O Google ainda não avaliou este grupo de recursos',
          es: 'Google aún no evaluó este grupo de recursos',
        }[locale],
      );
    });
    it(`${locale}: keeps whole recent-change summaries and every read state localized`, () => {
      const history: HistoryRead = { status: 'ready', history: HISTORY };
      const before = JSON.stringify(HISTORY);
      for (const writes of [
        { status: 'loading' },
        { status: 'error' },
        { status: 'ready', rows: [] },
      ] satisfies WritesRead[]) {
        for (const read of [
          { status: 'loading' },
          { status: 'error' },
          history,
        ] satisfies HistoryRead[]) {
          const result = recentSummary(writes, read, NOW, t);
          expect(result).toBe(
            t('googleRecentSummary', {
              writesState: writes.status,
              historyState: read.status,
              writes: writes.status === 'ready' ? writes.rows.length : 0,
              changes: recentGoogleChanges(read, NOW).length,
              days: 7,
            }),
          );
          if (locale !== 'en') expect(result).not.toBe(recentSummary(writes, read, NOW));
        }
      }
      expect(JSON.stringify(HISTORY)).toBe(before);
    });
    it(`${locale}: preserves financial calculations, provider names, missing-data flags and source records`, () => {
      const campaigns = campaignsFixture();
      const signals = pmaxFixture();
      const breakdown = networkFixture();
      const quality = keywordQualityFixture();
      const before = JSON.stringify({ campaigns, signals, breakdown, quality });
      const original = buildMoneyLeft(campaigns, [], 'MXN');
      const localized = buildMoneyLeft(campaigns, [], 'MXN', t, locale);
      const facts = (m: typeof original) => ({
        offSearch: m.offSearch,
        budgetLimited: m.budgetLimited,
        extraSpendPerDay: m.extraSpendPerDay,
        rankLimited: m.rankLimited,
        rows: m.rows.map((r) => [r.id, r.name, r.extraSpendPerDay, r.rankOverBudget]),
      });
      expect(facts(localized)).toEqual(facts(original));
      expect(localized.rows.find((r) => r.id === '111')?.buysBasis).toBe(
        t('googleLinearBasis', { days: 7 }),
      );
      expect(localized.rows.find((r) => r.id === '111')?.budgetPerDay.text).toContain('MXN');
      const pmax = buildPmaxHealth(signals, t, locale);
      const oldPmax = buildPmaxHealth(signals);
      expect(pmax.kind).toBe('read');
      if (pmax.kind !== 'read' || oldPmax.kind !== 'read') throw Error('Expected fixture read');
      expect(pmax.groups.map((g) => [g.id, g.name, g.poor, g.missingItems])).toEqual(
        oldPmax.groups.map((g) => [g.id, g.name, g.poor, g.missingItems]),
      );
      expect(networkSplit(breakdown, 'MXN', locale, t).map((s) => [s.spend, s.share])).toEqual(
        networkSplit(breakdown, 'MXN').map((s) => [s.spend, s.share]),
      );
      const qs = buildQualityScoreMap(quality, locale, t);
      const oldQs = buildQualityScoreMap(quality);
      expect(qs.buckets).toEqual(oldQs.buckets);
      expect(qs.waste).toEqual(oldQs.waste);
      expect(qs.rows.map((r) => [r.id, r.keyword, r.where, r.waste])).toEqual(
        oldQs.rows.map((r) => [r.id, r.keyword, r.where, r.waste]),
      );
      expect(JSON.stringify({ campaigns, signals, breakdown, quality })).toBe(before);
    });
  }
});
