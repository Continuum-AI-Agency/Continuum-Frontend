import { describe, expect, it } from 'bun:test';
import type { AdsetCreativeWinRateRow } from '@continuum/contracts';
import { buildAdsetAngleStanding, portfolioAngleRanking, sortAngleRows } from './angleStanding';

function row(over: Partial<AdsetCreativeWinRateRow> & { adsetId: string; value: string }) {
  return {
    adsetName: `Ad set ${over.adsetId}`,
    dimension: 'angle',
    window: 'd14',
    kpi: 'leads',
    eligibleAds: 4,
    adsetAds: 8,
    winners: 2,
    winRate: 0.5,
    spend: 100,
    spendShare: 0.4,
    adsetMedianCpa: 25,
    flags: [],
    ...over,
  } as AdsetCreativeWinRateRow;
}

describe('buildAdsetAngleStanding', () => {
  it('recommends doubling down on the angle proven inside the ad set', () => {
    const rows = [
      row({ adsetId: 'a1', value: 'social proof', winRate: 0.75, winners: 3 }),
      row({ adsetId: 'a1', value: 'discount', winRate: 0.2, winners: 1 }),
    ];
    const [out] = buildAdsetAngleStanding({ winrateRows: rows, enrolledIds: ['a1'] });
    expect(out.verdict).toBe('double_down');
    expect(out.recommendedAngle?.value).toBe('social proof');
    expect(out.action).toContain('social proof');
  });

  // A 1-for-1 ad is not better evidence than 6-of-10, even though its win rate is higher.
  it('prefers the bigger sample when win rates tie', () => {
    const rows = [
      row({ adsetId: 'a1', value: 'thin', winRate: 0.6, eligibleAds: 2, winners: 1 }),
      row({ adsetId: 'a1', value: 'deep', winRate: 0.6, eligibleAds: 10, winners: 6 }),
    ];
    const [out] = buildAdsetAngleStanding({ winrateRows: rows, enrolledIds: ['a1'] });
    expect(out.recommendedAngle?.value).toBe('deep');
  });

  it('ignores an angle with too few eligible ads to be evidence', () => {
    const rows = [row({ adsetId: 'a1', value: 'lucky', winRate: 1, eligibleAds: 1, winners: 1 })];
    const [out] = buildAdsetAngleStanding({ winrateRows: rows, enrolledIds: ['a1'] });
    expect(out.verdict).not.toBe('double_down');
  });

  // Keep the idea, fix the execution — the angle-vs-craft split the engine already makes.
  it('calls for a craft rebuild when the incumbent wins but underperforms on most of the spend', () => {
    const rows = [
      row({
        adsetId: 'a1',
        value: 'founder story',
        winRate: 0.3,
        winners: 3,
        eligibleAds: 10,
        spendShare: 0.8,
      }),
    ];
    const [out] = buildAdsetAngleStanding({ winrateRows: rows, enrolledIds: ['a1'] });
    expect(out.verdict).toBe('rebuild_craft');
    expect(out.action).toContain('rebuild the execution');
  });

  it('borrows a portfolio-proven angle for an ad set with nothing working', () => {
    const rows = [
      row({ adsetId: 'a1', value: 'social proof', winRate: 0.8, winners: 8, eligibleAds: 10 }),
      row({ adsetId: 'a2', value: 'discount', winRate: 0, winners: 0, eligibleAds: 4 }),
    ];
    const out = buildAdsetAngleStanding({ winrateRows: rows, enrolledIds: ['a1', 'a2'] });
    const a2 = out.find((r) => r.adsetId === 'a2');
    expect(a2?.verdict).toBe('introduce');
    expect(a2?.recommendedAngle?.value).toBe('social proof');
  });

  // Recommending what it already runs is not advice.
  it('never borrows an angle the ad set is already running', () => {
    const rows = [
      row({ adsetId: 'a1', value: 'social proof', winRate: 0.8, winners: 8, eligibleAds: 10 }),
      row({ adsetId: 'a2', value: 'social proof', winRate: 0, winners: 0, eligibleAds: 4 }),
    ];
    const out = buildAdsetAngleStanding({ winrateRows: rows, enrolledIds: ['a1', 'a2'] });
    expect(out.find((r) => r.adsetId === 'a2')?.verdict).toBe('insufficient');
  });

  // An un-analyzed ad set and a losing ad set are different states; dropping the first
  // makes the panel look like a shorter list of healthy ad sets.
  it('still returns a row for an ad set with no creative intel at all', () => {
    const out = buildAdsetAngleStanding({ winrateRows: [], enrolledIds: ['ghost'] });
    expect(out).toHaveLength(1);
    expect(out[0].verdict).toBe('insufficient');
    expect(out[0].adsetId).toBe('ghost');
  });

  it('marks a single-variant winner as thin rather than hiding it', () => {
    const rows = [
      row({ adsetId: 'a1', value: 'only one', winRate: 1, winners: 2, flags: ['single_variant'] }),
    ];
    const [out] = buildAdsetAngleStanding({ winrateRows: rows, enrolledIds: ['a1'] });
    expect(out.confidence).toBe('thin');
  });

  it('reports where the spend currently sits', () => {
    const rows = [
      row({ adsetId: 'a1', value: 'incumbent', spendShare: 0.9, winRate: 0.1, winners: 1 }),
      row({ adsetId: 'a1', value: 'challenger', spendShare: 0.1, winRate: 0.9, winners: 4 }),
    ];
    const [out] = buildAdsetAngleStanding({ winrateRows: rows, enrolledIds: ['a1'] });
    expect(out.currentAngle?.value).toBe('incumbent');
    expect(out.recommendedAngle?.value).toBe('challenger');
  });

  it('ignores ad sets outside the portfolio', () => {
    const rows = [row({ adsetId: 'foreign', value: 'x', winRate: 0.9, winners: 4 })];
    expect(buildAdsetAngleStanding({ winrateRows: rows, enrolledIds: ['a1'] })).toHaveLength(1);
  });

  it('falls back to the supplied name map when the row carries no name', () => {
    const rows = [row({ adsetId: 'a1', value: 'x', adsetName: null })];
    const [out] = buildAdsetAngleStanding({
      winrateRows: rows,
      enrolledIds: ['a1'],
      nameById: new Map([['a1', 'Prospecting Broad']]),
    });
    expect(out.adsetName).toBe('Prospecting Broad');
  });
});

describe('portfolioAngleRanking', () => {
  it('pools win rates across ad sets and drops never-winners', () => {
    const rows = [
      row({ adsetId: 'a1', value: 'winner', winners: 4, eligibleAds: 5 }),
      row({ adsetId: 'a2', value: 'winner', winners: 4, eligibleAds: 5 }),
      row({ adsetId: 'a1', value: 'loser', winners: 0, eligibleAds: 6 }),
    ];
    const ranked = portfolioAngleRanking(rows);
    expect(ranked.map((c) => c.value)).toEqual(['winner']);
    expect(ranked[0].winRate).toBeCloseTo(0.8);
  });
});

describe('sortAngleRows', () => {
  it('puts actionable rows above insufficient ones', () => {
    const rows = buildAdsetAngleStanding({
      winrateRows: [row({ adsetId: 'a1', value: 'good', winRate: 0.9, winners: 4 })],
      enrolledIds: ['ghost', 'a1'],
    });
    expect(sortAngleRows(rows).map((r) => r.adsetId)).toEqual(['a1', 'ghost']);
  });
});
