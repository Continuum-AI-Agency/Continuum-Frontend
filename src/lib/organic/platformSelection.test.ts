import { describe, expect, it } from 'bun:test';
import { captionLimits, PUBLISH_PLATFORM_ORDER } from '@continuum/contracts';
import { platformVerdicts } from './platformSelection';

const connected = (platform: (typeof PUBLISH_PLATFORM_ORDER)[number], needsReauth = false) => ({
  platform,
  needsReauth,
});

describe('platformVerdicts', () => {
  it('returns one verdict per platform', () => {
    const verdicts = platformVerdicts({ format: 'POST', caption: '', accounts: [], selected: [] });
    expect(Object.keys(verdicts).sort()).toEqual([...PUBLISH_PLATFORM_ORDER].sort());
  });

  it('refuses a platform with no account and names it', () => {
    const verdicts = platformVerdicts({
      format: 'POST',
      caption: 'hi',
      accounts: [connected('instagram')],
      selected: [],
    });
    expect(verdicts.instagram).toEqual({ available: true, reason: null });
    expect(verdicts.facebook.available).toBe(false);
    expect(verdicts.facebook.reason).toContain('Connect Facebook');
  });

  it('asks to reconnect when every account on the platform needs it', () => {
    const verdicts = platformVerdicts({
      format: 'POST',
      caption: 'hi',
      accounts: [connected('tiktok', true)],
      selected: [],
    });
    expect(verdicts.tiktok.available).toBe(false);
    expect(verdicts.tiktok.reason).toContain('Reconnect TikTok');
  });

  it('refuses a format the platform cannot publish, from a stored format string', () => {
    const verdicts = platformVerdicts({
      format: 'Story',
      caption: '',
      accounts: [connected('instagram'), connected('linkedin')],
      selected: [],
    });
    expect(verdicts.instagram.available).toBe(true);
    expect(verdicts.linkedin.available).toBe(false);
    expect(verdicts.linkedin.reason).toContain('LinkedIn');
  });

  it("refuses a caption over the platform's limit", () => {
    const max = captionLimits('x').maxLength;
    const verdicts = platformVerdicts({
      format: 'POST',
      caption: 'a'.repeat(max + 1),
      accounts: [connected('x'), connected('linkedin')],
      selected: [],
    });
    expect(verdicts.x.available).toBe(false);
    expect(verdicts.x.reason).toContain(String(max));
    expect(verdicts.linkedin.available).toBe(true);
  });

  it('keeps a selected platform available so it can be unticked', () => {
    const verdicts = platformVerdicts({
      format: 'POST',
      caption: '',
      accounts: [],
      selected: ['facebook'],
    });
    expect(verdicts.facebook).toEqual({ available: true, reason: null });
    expect(verdicts.instagram.available).toBe(false);
  });

  it("lets the post's own platform go in a group of any size (the server promotes another)", () => {
    const verdicts = platformVerdicts({
      format: 'POST',
      caption: 'Hi',
      accounts: [],
      selected: ['instagram', 'facebook', 'linkedin'],
    });
    expect(verdicts.instagram).toEqual({ available: true, reason: null });
    expect(verdicts.facebook).toEqual({ available: true, reason: null });
  });

  it('has no platform cap: every connected platform stays available', () => {
    const verdicts = platformVerdicts({
      format: 'POST',
      caption: 'hi',
      accounts: PUBLISH_PLATFORM_ORDER.map((platform) => connected(platform)),
      selected: ['instagram', 'facebook', 'linkedin'],
    });
    expect(verdicts.tiktok.available).toBe(true);
    expect(verdicts.x.available).toBe(true);
  });
});
