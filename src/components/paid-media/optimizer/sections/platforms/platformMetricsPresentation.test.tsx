import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { render } from '@/i18n/__tests__/render';
import commonEn from '../../../../../../messages/common/en.json';
import commonEs from '../../../../../../messages/common/es.json';
import commonPt from '../../../../../../messages/common/pt-BR.json';
import en from '../../../../../../messages/scale/en.json';
import es from '../../../../../../messages/scale/es.json';
import pt from '../../../../../../messages/scale/pt-BR.json';
import { EASY_FIT_MP1 } from './__fixtures__/accountPlatformMetrics';
import { TIKTOK_DOC_SHAPED_ENVELOPE } from './__fixtures__/tiktokSnapshots';
import { AllPlatformsHeadline, AllPlatformsTiles } from './AccountPlatformsOverview';
import {
  allPlatformsHeadlineSegments,
  kindWords,
  windowDaysLabel,
} from './accountPlatformMetricsModel';
import { buildPlatformComparison, cheapestSentence } from './platformComparisonModel';
import { TikTokAdsTabView } from './TikTokAdsTab';
import { buildTikTokOverview, TikTokSnapshotsEnvelopeSchema } from './tiktokAdsOverviewModel';

afterEach(cleanup);
const messages = (locale: 'en' | 'pt-BR' | 'es') => ({
  scale: locale === 'en' ? en : locale === 'pt-BR' ? pt : es,
  common: locale === 'en' ? commonEn : locale === 'pt-BR' ? commonPt : commonEs,
});
const translate = (locale: 'en' | 'pt-BR' | 'es') =>
  createTranslator({
    locale,
    messages: { scale: messages(locale).scale },
    namespace: 'scale',
    onError: (error) => {
      throw error;
    },
  });
describe('platform metrics locale presentation', () => {
  it('delegates known result words while preserving unknown kind labels and the original inclusive window', () => {
    expect(windowDaysLabel(EASY_FIT_MP1)).toBe('7 days');
    expect(windowDaysLabel(EASY_FIT_MP1, translate('pt-BR'))).toBe('7 dias');
    expect(windowDaysLabel(EASY_FIT_MP1, translate('es'))).toBe('7 días');
    expect(kindWords('purchases', translate('es'))).toEqual({
      one: 'compra',
      many: 'compras',
    });
    expect(kindWords('authored-custom', translate('pt-BR'))).toEqual({
      one: 'authored custom',
      many: 'authored custom',
    });
  });
  it('keeps the producer payload, headline figure metadata and comparison calculations unchanged', () => {
    const before = structuredClone(EASY_FIT_MP1);
    const comparison = buildPlatformComparison(EASY_FIT_MP1);
    expect(comparison).not.toBeNull();
    const figures = (locale: 'en' | 'pt-BR' | 'es') =>
      allPlatformsHeadlineSegments(EASY_FIT_MP1, 6, translate(locale), locale)
        .filter((s) => s.kind === 'figure')
        .map((s) => s.figure);
    expect(figures('pt-BR')).toEqual(figures('en'));
    expect(figures('es')).toEqual(figures('en'));
    if (comparison) {
      expect(cheapestSentence(comparison, translate('pt-BR'), 'pt-BR')).toContain('MXN');
      expect(cheapestSentence(comparison, translate('es'), 'es')).not.toContain('buys');
    }
    expect(EASY_FIT_MP1).toEqual(before);
    expect(buildPlatformComparison(EASY_FIT_MP1)).toEqual(comparison);
  });
  for (const locale of ['pt-BR', 'es'] as const) {
    it(`renders the headline, tiles and TikTok computed summaries in ${locale} with a throwing real provider`, () => {
      const overview = buildTikTokOverview(
        TikTokSnapshotsEnvelopeSchema.parse(TIKTOK_DOC_SHAPED_ENVELOPE),
      );
      const { container } = render(
        <NextIntlClientProvider
          locale={locale}
          timeZone="UTC"
          messages={messages(locale)}
          onError={(error) => {
            throw error;
          }}
        >
          <AllPlatformsHeadline metrics={EASY_FIT_MP1} pendingCount={6} />
          <AllPlatformsTiles metrics={EASY_FIT_MP1} pendingCount={6} onOpenActions={() => {}} />
          <TikTokAdsTabView state={{ status: 'ready', overview }} />
        </NextIntlClientProvider>,
      );
      expect(container.textContent).toContain(locale === 'pt-BR' ? '7 dias' : '7 días');
      expect(container.textContent).toContain(
        locale === 'pt-BR' ? 'sem resultados' : 'sin resultados',
      );
      expect(container.textContent).toContain('MXN');
      expect(container.textContent).not.toContain('spent, no results');
      const figure = container.querySelector('[data-figure="tiles.on-autopilot"]');
      expect(figure?.getAttribute('data-figure-raw')).toBe(String(EASY_FIT_MP1.autopilot.on));
    });
  }
});
