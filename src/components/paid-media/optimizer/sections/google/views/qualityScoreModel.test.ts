import { describe, expect, it } from 'bun:test';
import { GoogleKeywordQualityReadSchema } from '@continuum/contracts';
import { keywordQualityFixture } from './__fixtures__/googleViews';
import { buildQualityScoreMap, isWaste, QS_ROWS_SHOWN, qsBand } from './qualityScoreModel';

describe('buildQualityScoreMap', () => {
  const read = GoogleKeywordQualityReadSchema.parse(keywordQualityFixture());

  it('spreads spend over every score 1–10 and keeps unscored keywords apart', () => {
    const model = buildQualityScoreMap(read);
    expect(model.buckets.map((bucket) => bucket.score)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(model.buckets[2]).toEqual({ score: 3, keywords: 2, spend: 2362.65, band: 'low' });
    expect(model.buckets[5]?.band).toBe('mid');
    expect(model.buckets[7]?.band).toBe('high');
    expect(model.unscored).toEqual({ keywords: 1, spend: 85.47 });
  });

  it('counts waste as Quality Score ≤ 3 with 0 conversions, never a low score that converted', () => {
    const model = buildQualityScoreMap(read);
    expect(model.waste).toEqual({ keywords: 2, spend: 2490.25 });
    expect(model.rows.filter((row) => row.waste).map((row) => row.keyword)).toEqual([
      'gimnasio barato',
      'clases de box',
    ]);
  });

  it('lists keywords by spend with the three components, and "—" with its reason when unscored', () => {
    const model = buildQualityScoreMap(read);
    expect(model.rows.map((row) => row.keyword)[0]).toBe('gimnasio cdmx');
    expect(model.rows[0]).toMatchObject({
      score: { text: '8', reason: null },
      expectedCtr: { text: 'Above avg' },
      landingPage: { text: 'Average' },
    });
    const unscored = model.rows.at(-1);
    expect(unscored?.score).toEqual({
      text: '—',
      reason: 'Google has not scored it yet: too little traffic',
    });
    expect(unscored?.adRelevance.reason).toBe('Google has not scored it yet: too little traffic');
    expect(model.average).toEqual({ text: '4.4', reason: null });
  });

  it('cannot call waste when conversions are not counted, and says so instead of a zero', () => {
    const ambiguous = keywordQualityFixture();
    for (const row of ambiguous.keywords) row.metrics.conversions = null;
    const model = buildQualityScoreMap(ambiguous);
    expect(model.waste).toBeNull();
    expect(model.rows[0]?.conversions.reason).toContain("Conversions aren't counted");
    const [, , lowScore] = ambiguous.keywords;
    expect(lowScore && isWaste(lowScore)).toBeNull();
  });

  it('shows at most QS_ROWS_SHOWN keywords and counts the rest', () => {
    const [base] = keywordQualityFixture().keywords;
    if (!base) throw new Error('fixture');
    const many = Array.from({ length: 40 }, (_, i) => ({ ...base, criterion_id: String(i) }));
    const model = buildQualityScoreMap(keywordQualityFixture({ keywords: many }));
    expect(model.rows).toHaveLength(QS_ROWS_SHOWN);
    expect(model.hiddenRows).toBe(15);
  });

  it('reads an account with no keyword as empty, with no average', () => {
    const model = buildQualityScoreMap(
      keywordQualityFixture({
        keywords: [],
        total_keywords: 0,
        scored_keywords: 0,
        average_quality_score: null,
      }),
    );
    expect(model.rows).toEqual([]);
    expect(model.waste).toEqual({ keywords: 0, spend: 0 });
    expect(model.average.reason).toBe('No keyword has a Quality Score yet');
  });

  it('bands scores: ≤3 low, 4–6 mid, 7+ high', () => {
    expect([1, 3, 4, 6, 7, 10].map(qsBand)).toEqual(['low', 'low', 'mid', 'mid', 'high', 'high']);
  });
});
