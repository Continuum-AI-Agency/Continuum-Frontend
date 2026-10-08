import { describe, expect, it } from 'bun:test';

import { COMING_SOON_PROVIDER_GROUPS, isProviderComingSoon } from './platformIcons';

describe('isProviderComingSoon', () => {
  it('opens X now that it publishes (2026-10-06)', () => {
    expect(isProviderComingSoon('x')).toBe(false);
  });

  it('treats live providers as available', () => {
    expect(isProviderComingSoon('facebook')).toBe(false);
    expect(isProviderComingSoon('google')).toBe(false);
    expect(isProviderComingSoon('tiktok')).toBe(false);
  });

  it('returns false for unknown provider strings', () => {
    expect(isProviderComingSoon('instagram')).toBe(false);
    expect(isProviderComingSoon('')).toBe(false);
  });

  it('holds nothing back today', () => {
    expect(COMING_SOON_PROVIDER_GROUPS.size).toBe(0);
  });
});
