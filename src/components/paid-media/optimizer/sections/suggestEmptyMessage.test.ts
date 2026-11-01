import { describe, expect, it } from 'bun:test';
import { suggestEmptyMessage } from './PortfolioSetup';

// PP-DT-E-optimizer-meta-reads-on-google-account, the copy half. optimizer-suggest reads a Google
// account's campaigns (never Meta ad sets) and answers `no_active` when none is live; on
// Tangassi's Google account the wizard then said "No active ad sets found for this account yet",
// a Meta sentence about an account that has no ad sets to find.

describe('suggestEmptyMessage', () => {
  it('speaks of Google campaigns on a Google account', () => {
    const message = suggestEmptyMessage('no_active', 'adset', { platform: 'google_ads' });
    expect(message).toContain('campaigns');
    expect(message).toContain('Google Ads');
    expect(message).not.toMatch(/ad sets?/i);
  });

  it('never tells a Google account it groups ad sets', () => {
    expect(suggestEmptyMessage(null, 'adset', { platform: 'google_ads' })).not.toMatch(/ad sets?/i);
    expect(suggestEmptyMessage('not_permitted', 'adset', { platform: 'google_ads' })).not.toMatch(
      /ad sets?/i,
    );
  });

  it('keeps the Meta sentences on a Meta account', () => {
    expect(suggestEmptyMessage('no_active', 'adset')).toBe(
      'No active ad sets found for this account yet. Once ad sets are live, suggestions will appear here.',
    );
    expect(suggestEmptyMessage('no_active', 'adset', { platform: 'meta' })).toBe(
      suggestEmptyMessage('no_active', 'adset'),
    );
  });
});
