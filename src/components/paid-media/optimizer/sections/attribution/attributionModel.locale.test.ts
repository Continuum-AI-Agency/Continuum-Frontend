import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import en from '../../../../../../messages/scale/en.json';
import es from '../../../../../../messages/scale/es.json';
import pt from '../../../../../../messages/scale/pt-BR.json';
import { FIXTURE_NOW, portfolioMetricsFixture } from './__fixtures__/portfolioMetricsFixture';
import {
  attributionHeader,
  buildSheetConfig,
  DATE_FORMAT_LABELS,
  formatAttributionPercent,
  formatReadAge,
  type SheetMappingDraft,
} from './attributionModel';

const draft: SheetMappingDraft = {
  headerRow: 1,
  columns: { date: 0, matchKey: 1, conversions: 2, value: 3, platform: 4 },
  matchKeyKind: 'adset_name',
  dateFormat: 'dmy',
  timezone: 'America/Mexico_City',
};
const location = {
  source: 'google_sheet',
  spreadsheetId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
  tab: 'Authored sheet name',
} as const;

describe('attribution UI language boundaries', () => {
  for (const [locale, messages] of [
    ['en', en],
    ['pt-BR', pt],
    ['es', es],
  ] as const) {
    const t = createTranslator({ locale, messages: { scale: messages }, namespace: 'scale' });
    it(`${locale}: retains mapping values, parser formats and scheduling timezone`, () => {
      const before = JSON.stringify(draft);
      expect(buildSheetConfig(location, draft, t)).toEqual(buildSheetConfig(location, draft));
      const missing = buildSheetConfig(
        location,
        { ...draft, columns: { ...draft.columns, conversions: null } },
        t,
      );
      expect(missing).toEqual({
        ok: false,
        missing: [{ en: 'Conversions', 'pt-BR': 'Conversões', es: 'Conversiones' }[locale]],
      });
      expect(DATE_FORMAT_LABELS).toMatchObject({
        iso: '2026-09-27',
        dmy: '27/09/2026',
        mdy: '09/27/2026',
      });
      expect(JSON.stringify(draft)).toBe(before);
    });
    it(`${locale}: preserves metric data and original rounding and relative-time buckets`, () => {
      const metrics = portfolioMetricsFixture({
        used: 'platform',
        configured: 'spreadsheet',
        fallback: 'coverage',
      });
      const before = JSON.stringify(metrics);
      const header = attributionHeader(metrics, FIXTURE_NOW, t, locale);
      expect(header.used).toBe('platform');
      expect(header.fallback).toBeTruthy();
      expect(JSON.stringify(metrics)).toBe(before);
      expect(formatAttributionPercent(0.805, locale)).toBe(
        new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(0.81),
      );
      const read = '2026-09-28T10:00:01Z';
      expect(formatReadAge(read, FIXTURE_NOW, locale, t)).toBe(
        locale === 'en'
          ? '1 h ago'
          : new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' }).format(
              -1,
              'hour',
            ),
      );
    });
  }
});
