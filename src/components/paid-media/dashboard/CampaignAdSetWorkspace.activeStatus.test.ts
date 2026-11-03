import { describe, expect, it } from 'bun:test';
import { isActiveStatus } from './CampaignAdSetWorkspace';

// PP-DT-B-dashboard-active-only-hides-google (deep test 2026-10-31). The Dashboard's "Active only"
// filter, on by default, kept status === 'ACTIVE' — Meta's word. fetch-google-ads-campaigns
// returns Google's campaign.status, ENABLED for a running campaign, so every Google campaign was
// filtered out of a Google account's Dashboard.

describe('isActiveStatus — each platform’s own word for running', () => {
  it('Google ENABLED is active', () => {
    expect(isActiveStatus('ENABLED')).toBe(true);
  });

  it('Meta ACTIVE stays active', () => {
    expect(isActiveStatus('ACTIVE')).toBe(true);
    expect(isActiveStatus('active')).toBe(true);
  });

  it('TikTok ENABLE is active', () => {
    expect(isActiveStatus('ENABLE')).toBe(true);
  });

  it('paused, removed, ended and unknown are not', () => {
    for (const status of ['PAUSED', 'REMOVED', 'ENDED', 'DISABLE', 'ARCHIVED', '', undefined]) {
      expect(isActiveStatus(status)).toBe(false);
    }
  });
});
