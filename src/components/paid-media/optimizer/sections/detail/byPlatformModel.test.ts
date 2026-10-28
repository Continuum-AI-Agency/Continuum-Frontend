import { describe, expect, it } from 'bun:test';
import { portfolioMetricsFixture } from '../attribution/__fixtures__/portfolioMetricsFixture';
import { buildByPlatform, noBlendNote, spendShareLabel } from './byPlatformModel';

describe('buildByPlatform', () => {
  it('sums every platform’s spend once, and each share is of that sum', () => {
    const view = buildByPlatform(portfolioMetricsFixture());
    expect(view.totalSpend).toBe(8817);
    const shares = view.rows.map((row) => row.spendShare ?? 0);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1);
    expect(view.metaOnly).toBe(false);
  });

  it('names each platform that spent in the bar’s words, and none that did not', () => {
    const view = buildByPlatform(portfolioMetricsFixture({ platforms: ['meta', 'google_ads'] }));
    expect(spendShareLabel(view.rows)).toBe('Share of spend: Meta 46%, Google 54%');
    const idle = view.rows.map((row) =>
      row.platform === 'meta' ? { ...row, spendShare: 0 } : row,
    );
    expect(spendShareLabel(idle)).toBe('Share of spend: Google 54%');
  });

  it('says why there is no blended cost, by attribution source', () => {
    expect(noBlendNote(false, 'lead')).toContain('counts its leads its own way');
    expect(noBlendNote(true, 'lead')).toBe('Cost per lead stays per platform, in the rows above.');
  });
});
