import { describe, expect, it } from 'bun:test';
import {
  type AdsetCreativeWinRateRow,
  GLOBAL_ANGLE_COUNT,
  type PaidCreativeVerdict,
} from '@continuum/contracts';
import {
  type AdAngleFact,
  angleIdByAd,
  buildAccountAngleRows,
  buildNextAngleRows,
  composeAngleRead,
  neverTestedAngles,
  scopeVerdicts,
  scopeWinrateRows,
} from './creativeInsightsModel';

function row(
  over: Partial<AdsetCreativeWinRateRow> & { adsetId: string; value: string },
): AdsetCreativeWinRateRow {
  return {
    adsetName: `Ad set ${over.adsetId}`,
    dimension: 'angle_id',
    window: 'd7',
    kpi: 'leads',
    eligibleAds: 2,
    adsetAds: 4,
    winners: 1,
    winRate: 0.5,
    spend: 100,
    spendShare: 0.5,
    adsetMedianCpa: 80,
    flags: [],
    ...over,
  };
}

function verdict(over: Partial<PaidCreativeVerdict> & { adId: string }): PaidCreativeVerdict {
  return {
    adsetId: 'A1',
    campaignId: null,
    adName: null,
    funnelStage: 'tof',
    verdict: 'scale',
    reason: 'reason',
    flags: [],
    spend: 100,
    cpa: 50,
    cpaVsCohortMedian: null,
    window: 'd30',
    optimizerRecommendationId: null,
    thumbnailUrl: null,
    permalinkUrl: null,
    ...over,
  };
}

// Two ad sets in the account where testimonials and discounts compete, one single-variant ad
// set, and one ad set on ANOTHER account that must never leak in.
const WINRATE_ROWS: AdsetCreativeWinRateRow[] = [
  row({
    adsetId: 'A1',
    value: 'social_proof_peer',
    eligibleAds: 4,
    winners: 3,
    winRate: 0.75,
    spend: 200,
    spendShare: 0.25,
  }),
  row({
    adsetId: 'A1',
    value: 'offer_discount',
    eligibleAds: 4,
    winners: 1,
    winRate: 0.25,
    spend: 600,
    spendShare: 0.75,
  }),
  row({
    adsetId: 'A2',
    value: 'offer_discount',
    eligibleAds: 3,
    winners: 1,
    winRate: 1 / 3,
    spend: 300,
    spendShare: 0.75,
  }),
  row({
    adsetId: 'A2',
    value: 'social_proof_peer',
    eligibleAds: 2,
    winners: 2,
    winRate: 1,
    spend: 100,
    spendShare: 0.25,
  }),
  row({
    adsetId: 'A3',
    value: 'mechanism_how_it_works',
    eligibleAds: 2,
    winners: 1,
    winRate: 0.5,
    spend: 50,
    spendShare: 1,
    flags: ['single_variant'],
  }),
  row({ adsetId: 'B1', value: 'time_scarcity', eligibleAds: 6, winners: 6, winRate: 1 }),
  row({ adsetId: 'A1', dimension: 'angle', value: 'free text testimonial' }),
];

const ACCOUNT = new Set(['A1', 'A2', 'A3']);

const AD_FACTS: AdAngleFact[] = [
  { ad_id: 'ad-1', adset_id: 'A1', angle_id: 'social_proof_peer' },
  { ad_id: 'ad-2', adset_id: 'A2', angle_id: 'offer_discount' },
  { ad_id: 'ad-3', adset_id: 'B1', angle_id: 'time_scarcity' },
  { ad_id: 'ad-4', adset_id: 'A1', angle_id: null },
  { ad_id: 'ad-5', adset_id: 'A1', angle_id: 'not_a_vocabulary_id' },
  { ad_id: 'ad-6', adset_id: 'A1', angle_id: 'social_proof_peer' },
];

const VERDICTS: PaidCreativeVerdict[] = [
  verdict({ adId: 'ad-1', adName: 'Testimonial Ana', spend: 120 }),
  verdict({ adId: 'ad-6', adName: 'Testimonial Luis', spend: 300 }),
  verdict({ adId: 'ad-2', adsetId: 'A2', adName: 'Special price', verdict: 'kill' }),
  verdict({ adId: 'ad-3', adsetId: 'B1', adName: 'Other account ad' }),
];

function accountRows() {
  const scopedRows = scopeWinrateRows(WINRATE_ROWS, ACCOUNT);
  const standing = buildNextAngleRows(scopedRows);
  const angleByAd = angleIdByAd(AD_FACTS, ACCOUNT);
  const verdicts = scopeVerdicts(VERDICTS, ACCOUNT);
  return buildAccountAngleRows({ scopedRows, standing, angleByAd, verdicts });
}

describe('scopeWinrateRows', () => {
  it('keeps closed-vocabulary rows of the account ad sets only', () => {
    const scoped = scopeWinrateRows(WINRATE_ROWS, ACCOUNT);
    expect(scoped.map((r) => `${r.adsetId}:${r.value}`)).toEqual([
      'A1:social_proof_peer',
      'A1:offer_discount',
      'A2:offer_discount',
      'A2:social_proof_peer',
      'A3:mechanism_how_it_works',
    ]);
  });

  it('keeps every ad set when the account scope is unknown', () => {
    expect(scopeWinrateRows(WINRATE_ROWS, null)).toHaveLength(6);
  });
});

describe('angleIdByAd', () => {
  it('maps only confirmed vocabulary ids inside the scope', () => {
    const map = angleIdByAd(AD_FACTS, ACCOUNT);
    expect([...map.entries()]).toEqual([
      ['ad-1', 'social_proof_peer'],
      ['ad-2', 'offer_discount'],
      ['ad-6', 'social_proof_peer'],
    ]);
  });
});

describe('buildAccountAngleRows', () => {
  it('pools winners over eligible ads across ad sets, never averaging per-ad-set rates', () => {
    const social = accountRows().find((r) => r.angleId === 'social_proof_peer');
    // (3 + 2) / (4 + 2) — an average of 0.75 and 1.0 would have said 0.875.
    expect(social?.winners).toBe(5);
    expect(social?.comparedAds).toBe(6);
    expect(social?.winRate).toBeCloseTo(5 / 6, 6);
    expect(social?.adsetsCompared).toBe(2);
    expect(social?.adsetsLosing).toBe(0);
  });

  it('counts ads and spend share over every ad in scope', () => {
    const rows = accountRows();
    const discount = rows.find((r) => r.angleId === 'offer_discount');
    expect(discount?.ads).toBe(7);
    expect(discount?.spend).toBe(900);
    // 900 of 300 + 900 + 50 — the B1 row on the other account is not in the denominator.
    expect(discount?.spendShare).toBeCloseTo(900 / 1250, 6);
    expect(discount?.adsetsLosing).toBe(2);
  });

  it('leaves single-variant ad sets out of the win rate but keeps their ads and spend', () => {
    const mechanism = accountRows().find((r) => r.angleId === 'mechanism_how_it_works');
    expect(mechanism?.ads).toBe(2);
    expect(mechanism?.spend).toBe(50);
    expect(mechanism?.comparedAds).toBe(0);
    expect(mechanism?.winRate).toBeNull();
    // angleStanding crowns it inside its one-angle ad set; the account does not.
    expect(mechanism?.verdict).toBe('insufficient');
  });

  it("lifts angleStanding's verdicts to the account", () => {
    const rows = accountRows();
    expect(rows.find((r) => r.angleId === 'social_proof_peer')?.verdict).toBe('double_down');
    expect(rows.find((r) => r.angleId === 'offer_discount')?.verdict).toBe('behind');
  });

  it('calls an incumbent that carries the spend while losing "rebuild the craft"', () => {
    const scopedRows = [
      row({
        adsetId: 'R1',
        value: 'offer_bundle',
        eligibleAds: 4,
        winners: 1,
        winRate: 0.25,
        spendShare: 0.8,
      }),
      row({
        adsetId: 'R1',
        value: 'value_stack',
        eligibleAds: 2,
        winners: 0,
        winRate: 0,
        spendShare: 0.2,
      }),
    ];
    const rows = buildAccountAngleRows({
      scopedRows,
      standing: buildNextAngleRows(scopedRows),
      angleByAd: new Map(),
      verdicts: [],
    });
    expect(rows.find((r) => r.angleId === 'offer_bundle')?.verdict).toBe('rebuild_craft');
  });

  it('calls an angle another ad set should borrow "introduce"', () => {
    const scopedRows = [
      row({ adsetId: 'I1', value: 'risk_reversal_trial', winners: 1, winRate: 0.5 }),
      row({ adsetId: 'I1', value: 'offer_discount', winners: 2, winRate: 1 }),
      row({ adsetId: 'I2', value: 'offer_discount', winners: 0, winRate: 0 }),
      row({ adsetId: 'I2', value: 'value_stack', winners: 0, winRate: 0 }),
    ];
    const rows = buildAccountAngleRows({
      scopedRows,
      standing: buildNextAngleRows(scopedRows),
      angleByAd: new Map(),
      verdicts: [],
    });
    expect(rows.find((r) => r.angleId === 'risk_reversal_trial')?.verdict).toBe('introduce');
  });

  it('names the highest-spend in-scope ad as the example', () => {
    const rows = accountRows();
    expect(rows.find((r) => r.angleId === 'social_proof_peer')?.exampleAdName).toBe(
      'Testimonial Luis',
    );
    expect(rows.find((r) => r.angleId === 'offer_discount')?.exampleAdName).toBe('Special price');
    expect(rows.find((r) => r.angleId === 'mechanism_how_it_works')?.exampleAdName).toBeNull();
  });

  it('ranks compared angles by win rate and sinks the ones without a sample', () => {
    expect(accountRows().map((r) => r.angleId)).toEqual([
      'social_proof_peer',
      'offer_discount',
      'mechanism_how_it_works',
    ]);
  });
});

describe('neverTestedAngles', () => {
  it('lists vocabulary angles with no labelled ad and no win-rate row in scope', () => {
    const scopedRows = scopeWinrateRows(WINRATE_ROWS, ACCOUNT);
    const never = neverTestedAngles(angleIdByAd(AD_FACTS, ACCOUNT), scopedRows);
    const ids = never.map((angle) => angle.angleId);
    expect(ids).not.toContain('social_proof_peer');
    expect(ids).not.toContain('offer_discount');
    expect(ids).not.toContain('mechanism_how_it_works');
    expect(ids).not.toContain('unknown');
    // Ran on another account only, so never tested on this one.
    expect(ids).toContain('time_scarcity');
    expect(never).toHaveLength(GLOBAL_ANGLE_COUNT - 4);
    expect(never.find((angle) => angle.angleId === 'risk_reversal_trial')?.label).toBe(
      'Try before you commit',
    );
  });

  it('claims nothing before the labeller has confirmed any angle in scope', () => {
    expect(neverTestedAngles(new Map(), [])).toEqual([]);
  });
});

describe('composeAngleRead', () => {
  it('names the most-winning angle and the spend leader with how often it loses', () => {
    expect(composeAngleRead(accountRows())).toEqual([
      "“Proof by someone like you” wins most often: 5 of 6 ads beat their ad set's median cost, across 2 ad sets.",
      '“Discount offer” carries the most spend, 72%, and loses in 2 of the 2 ad sets where it competes.',
    ]);
  });

  it('folds the second sentence when the winner is also the spend leader', () => {
    const rows = accountRows().map((r) =>
      r.angleId === 'social_proof_peer' ? { ...r, spend: 5000, spendShare: 0.8 } : r,
    );
    expect(composeAngleRead(rows)[1]).toBe('It also carries the most spend, 80%.');
  });

  it('says nothing when nothing is computable', () => {
    expect(composeAngleRead([])).toEqual([]);
  });

  it('never crowns a winner on fewer than three compared ads', () => {
    const thin = accountRows().map((r) => ({ ...r, comparedAds: 2 }));
    const read = composeAngleRead(thin);
    expect(read).toHaveLength(1);
    expect(read[0]).toContain('carries the most spend');
  });
});

describe('scopeVerdicts', () => {
  it('drops verdicts from ad sets outside the account', () => {
    expect(scopeVerdicts(VERDICTS, ACCOUNT).map((v) => v.adId)).toEqual(['ad-1', 'ad-6', 'ad-2']);
    expect(scopeVerdicts(VERDICTS, null)).toHaveLength(4);
  });
});
