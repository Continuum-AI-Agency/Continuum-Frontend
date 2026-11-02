import { describe, expect, it } from 'bun:test';
import { GoogleKeywordQualityReadSchema, qualityLensTakeaway } from '@continuum/contracts';
import { keywordQualityFixture } from '../../../google/views/__fixtures__/googleViews';
import { easyFitKeywordQuality } from '../../../google/views/__fixtures__/lensReads';
import { buildQualityLens, type QualityLensModel } from './qualityModel';

function readModel(model: QualityLensModel) {
  if (model.kind !== 'read') throw new Error(`expected a read model, got ${model.kind}`);
  return model;
}

const round = (value: number) => Math.round(value * 100) / 100;

describe('buildQualityLens', () => {
  const easyFit = GoogleKeywordQualityReadSchema.parse(easyFitKeywordQuality());

  it('Easy Fit: 29% of the keyword spend ($4,323) sits at Quality Score ≤ 3', () => {
    const model = readModel(buildQualityLens(easyFit));
    expect(round(model.keywordSpend)).toBe(14873.14);
    expect(round(model.low.spend)).toBe(4323.32);
    expect(Math.round(model.low.share * 100)).toBe(29);
    expect(round(model.unscored.spend)).toBe(3404.61);
  });

  it("keeps the map's own spend per score, empty scores included", () => {
    const model = readModel(buildQualityLens(easyFit));
    expect(model.histogram.map((bucket) => round(bucket.spend))).toEqual([
      45.41, 1287.63, 2990.28, 471.32, 612.47, 1340.42, 303.17, 1463.55, 1259.86, 1694.42,
    ]);
  });

  it('rates the low-score spend per component: the landing page and the expected CTR drag it', () => {
    const model = readModel(buildQualityLens(easyFit));
    const landing = model.lowComponents.find((split) => split.component === 'landing_page');
    expect(round(landing?.rated ?? 0)).toBe(4139.93);
    expect(landing?.spend.BELOW_AVERAGE).toBe(landing?.rated);
    const relevance = model.lowComponents.find((split) => split.component === 'ad_relevance');
    expect(round(relevance?.spend.ABOVE_AVERAGE ?? 0)).toBe(2826.3);
    // A tie between two components at 100% names the one V5's card fixes first.
    expect(model.weakest).toEqual({ component: 'landing_page', share: 1 });
  });

  it('lists the low-score keywords that spent most, each with its three ratings', () => {
    const model = readModel(buildQualityLens(easyFit));
    expect(model.lowest.map((keyword) => [keyword.keyword, keyword.score])).toEqual([
      ['entrenamiento funcional', 3],
      ['gym 24 horas', 2],
      ['gym', 2],
      ['gym cerca de mí', 3],
    ]);
    expect(model.lowest[0]?.ratings).toEqual({
      expected_ctr: 'BELOW_AVERAGE',
      ad_relevance: 'ABOVE_AVERAGE',
      landing_page: 'BELOW_AVERAGE',
    });
  });

  it('an account with nothing at Quality Score ≤ 3 names no component to fix', () => {
    const read = GoogleKeywordQualityReadSchema.parse(keywordQualityFixture());
    for (const keyword of read.keywords) {
      if (keyword.quality_score !== null && keyword.quality_score <= 3) keyword.quality_score = 7;
    }
    const model = readModel(buildQualityLens(read));
    expect(model.low).toEqual({ keywords: 0, spend: 0, share: 0 });
    expect(model.weakest).toBeNull();
  });

  it('no keyword spend reads as empty', () => {
    const read = GoogleKeywordQualityReadSchema.parse(
      keywordQualityFixture({ keywords: [], total_keywords: 0, scored_keywords: 0 }),
    );
    expect(buildQualityLens(read).kind).toBe('empty');
  });
});

describe('qualityLensTakeaway', () => {
  it("says the low share, its money and the component to fix, in the account's language", () => {
    expect(
      qualityLensTakeaway({
        share: '29%',
        money: '$4,323 MXN',
        keywords: 10,
        weakest: { component: 'landing_page', share: '100%' },
      }),
    ).toBe(
      'El 29% del gasto en keywords ($4,323 MXN, 10 keywords) está en Quality Score de 3 o menos; la página de destino está por debajo del promedio en el 100% de ese gasto.',
    );
    expect(qualityLensTakeaway({ share: '0%', money: '$0 MXN', keywords: 0, weakest: null })).toBe(
      'Ninguna keyword con Quality Score de 3 o menos gastó en la ventana.',
    );
  });
});
