import { describe, expect, it } from 'bun:test';
import type { AdsetCreativeWinRateRow } from '@continuum/contracts';
import { createTranslator } from 'next-intl';
import en from '../../../../messages/scale/en.json';
import es from '../../../../messages/scale/es.json';
import pt from '../../../../messages/scale/pt-BR.json';
import {
  angleReadText,
  buildAccountAngleRows,
  buildNextAngleRows,
  composeAngleRead,
} from './creativeInsightsModel';

const row = (value: string, winners: number, spend: number): AdsetCreativeWinRateRow => ({
  adsetId: 'A1',
  adsetName: 'Authored ad set',
  dimension: 'angle_id',
  window: 'd7',
  kpi: 'leads',
  eligibleAds: 4,
  adsetAds: 8,
  winners,
  winRate: winners / 4,
  spend,
  spendShare: spend / 800,
  adsetMedianCpa: 80,
  flags: [],
  value,
});
describe('computed creative insights locale boundaries', () => {
  for (const [locale, messages] of [
    ['en', en],
    ['pt-BR', pt],
    ['es', es],
  ] as const) {
    it(`${locale}: retains styled figures, tone, source labels and calculation inputs with ICU word order`, () => {
      const t = createTranslator({
        locale,
        messages: { scale: messages },
        namespace: 'scale',
        onError: (error) => {
          throw error;
        },
      });
      const source = [row('social_proof_peer', 3, 200), row('offer_discount', 1, 600)];
      const standing = buildNextAngleRows(source);
      const rows = buildAccountAngleRows({
        scopedRows: source,
        standing,
        angleByAd: new Map(),
        verdicts: [],
      });
      const authored = 'Authored angle \uE00099\uE001';
      rows[0].label = authored;
      const before = JSON.stringify({ source, standing, rows });
      const localized = composeAngleRead(rows, standing, t);
      expect(localized.map((line) => line.kind)).toEqual(
        composeAngleRead(rows, standing).map((line) => line.kind),
      );
      expect(localized[0].parts).toContainEqual({
        kind: 'angle',
        text: authored,
      });
      expect(
        localized[0].parts.some((part) => part.kind === 'text' && part.tone === 'better'),
      ).toBe(true);
      expect(localized[0].parts.some((part) => part.kind === 'text' && part.tone === 'worse')).toBe(
        true,
      );
      expect(localized[0].parts.some((part) => part.kind === 'figure' && part.text === '3')).toBe(
        true,
      );
      expect(angleReadText(localized[0])).not.toContain('angleRead');
      expect(JSON.stringify({ source, standing, rows })).toBe(before);
    });
  }
});
