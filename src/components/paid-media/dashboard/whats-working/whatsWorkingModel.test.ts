import { describe, expect, it } from 'bun:test';
import { type PaidCreativeReport, paidCreativeReportSchema } from '@continuum/contracts';
import {
  cohortMultipleLabel,
  hasThinEvidence,
  isHttpUrl,
  money,
  percent,
  selectVerdictsByKind,
  selectWinRateRows,
} from './whatsWorkingModel';

const REPORT: PaidCreativeReport = paidCreativeReportSchema.parse({
  brandId: 'brand_1',
  generatedAt: '2026-07-18T00:00:00.000Z',
  winRates: [
    {
      dimension: 'hook_archetype',
      value: 'social_proof',
      funnelStage: 'tof',
      eligibleAds: 8,
      winners: 6,
      winRate: 0.75,
      flags: [],
    },
    {
      dimension: 'angle',
      value: 'price_led',
      funnelStage: 'bof',
      eligibleAds: 1,
      winners: 1,
      winRate: 1,
      flags: ['spend_concentrated'],
    },
    {
      dimension: 'theme',
      value: 'seasonal',
      funnelStage: 'tof',
      eligibleAds: 5,
      winners: 2,
      winRate: 0.4,
      flags: ['low_evidence'],
    },
    {
      dimension: 'funnel_stage',
      value: 'tof',
      funnelStage: 'tof',
      eligibleAds: 9,
      winners: 5,
      winRate: 0.55,
      flags: [],
    },
  ],
  verdicts: [
    {
      adId: 'ad_kill',
      adName: 'BOF | promo',
      funnelStage: 'bof',
      verdict: 'kill',
      reason: 'CPA $80.00 is 2.1x the BOF cohort median.',
      spend: 500,
      cpa: 80,
      cpaVsCohortMedian: 2.1,
    },
    {
      adId: 'ad_scale',
      adName: 'TOF | ugc',
      funnelStage: 'tof',
      verdict: 'scale',
      reason: 'CPA $12.00 beats the TOF cohort median by 40%.',
      spend: 900,
      cpa: 12,
      cpaVsCohortMedian: 0.6,
    },
    {
      adId: 'ad_iterate',
      adName: 'TOF | static',
      funnelStage: 'tof',
      verdict: 'iterate',
      reason: 'Hook rate trails the cohort median.',
      spend: 200,
      cpa: 25,
      cpaVsCohortMedian: null,
    },
    {
      adId: 'ad_watch',
      adName: 'MOF | carousel',
      funnelStage: 'mof',
      verdict: 'watch',
      reason: 'Not enough spend to call yet.',
      spend: 40,
    },
  ],
});

describe('selectWinRateRows', () => {
  it('drops the funnel_stage dimension, which restates the funnel column', () => {
    const rows = selectWinRateRows(REPORT, 'all');
    expect(rows.map((row) => row.dimension)).toEqual(['hook_archetype', 'angle', 'theme']);
  });

  it('filters to the selected funnel stage', () => {
    expect(selectWinRateRows(REPORT, 'bof').map((row) => row.value)).toEqual(['price_led']);
    expect(selectWinRateRows(REPORT, 'tof').map((row) => row.value)).toEqual([
      'social_proof',
      'seasonal',
    ]);
  });

  it('optionally hides thin cohorts without touching the numbers', () => {
    const rows = selectWinRateRows(REPORT, 'all', { hideThinEvidence: true });
    expect(rows.map((row) => row.value)).toEqual(['social_proof']);
  });

  it('returns nothing for a missing report', () => {
    expect(selectWinRateRows(null, 'all')).toEqual([]);
  });
});

describe('hasThinEvidence', () => {
  it('treats a sub-three-ad cohort as thin', () => {
    const [, singleAd] = REPORT.winRates;
    expect(hasThinEvidence(singleAd)).toBe(true);
  });

  it('treats an explicit low_evidence flag as thin even on a larger cohort', () => {
    const flagged = REPORT.winRates[2];
    expect(flagged.eligibleAds).toBeGreaterThanOrEqual(3);
    expect(hasThinEvidence(flagged)).toBe(true);
  });

  it('trusts a cohort that clears the floor with no flag', () => {
    expect(hasThinEvidence(REPORT.winRates[0])).toBe(false);
  });
});

describe('selectVerdictsByKind', () => {
  it('groups the three actionable kinds and excludes watch', () => {
    const grouped = selectVerdictsByKind(REPORT, 'all');
    expect(grouped.kill.map((v) => v.adId)).toEqual(['ad_kill']);
    expect(grouped.scale.map((v) => v.adId)).toEqual(['ad_scale']);
    expect(grouped.iterate.map((v) => v.adId)).toEqual(['ad_iterate']);
  });

  it('respects the funnel filter', () => {
    const grouped = selectVerdictsByKind(REPORT, 'tof');
    expect(grouped.kill).toEqual([]);
    expect(grouped.scale.map((v) => v.adId)).toEqual(['ad_scale']);
  });
});

describe('formatters', () => {
  it('renders percentages and money, with an em dash for nulls', () => {
    expect(percent(0.755)).toBe('76%');
    expect(percent(null)).toBe('—');
    expect(money(12)).toBe('$12.00');
    expect(money(null)).toBe('—');
  });

  it('labels the cohort multiple only when the assembler computed one', () => {
    expect(cohortMultipleLabel(REPORT.verdicts[0])).toBe('2.1x cohort median');
    expect(cohortMultipleLabel(REPORT.verdicts[2])).toBeNull();
  });

  it('accepts only http(s) urls', () => {
    expect(isHttpUrl('https://cdn.example/a.jpg')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
  });
});
