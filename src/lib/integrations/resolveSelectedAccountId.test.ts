import { describe, expect, it } from 'bun:test';
import { resolveSelectedAccountId } from './resolveSelectedAccountId';

const IG = [{ integrationAccountId: 'ig-1' }, { integrationAccountId: 'ig-2' }];
const YT = [{ integrationAccountId: 'yt-1' }];

describe('resolveSelectedAccountId', () => {
  it('seeds a YouTube view from the YouTube list, never a Meta/IG account', () => {
    // The bug: a stored Instagram selection (or the IG list's first account) was
    // leaking into the YouTube view because seeding validated against `accounts`.
    const selected = resolveSelectedAccountId({
      brandId: 'brand-1',
      platform: 'youtube',
      platformAccounts: YT,
      // A stale Instagram selection is remembered for youtube.
      getSelection: () => 'ig-1',
    });
    expect(selected).toBe('yt-1');
  });

  it("keeps a remembered selection when it belongs to the platform's own accounts", () => {
    const selected = resolveSelectedAccountId({
      brandId: 'brand-1',
      platform: 'instagram',
      platformAccounts: IG,
      getSelection: () => 'ig-2',
    });
    expect(selected).toBe('ig-2');
  });

  it("falls back to the platform's first account when nothing is remembered", () => {
    const selected = resolveSelectedAccountId({
      brandId: 'brand-1',
      platform: 'instagram',
      platformAccounts: IG,
      getSelection: () => null,
    });
    expect(selected).toBe('ig-1');
  });

  it('returns null when the platform has no connected accounts (no Meta leak)', () => {
    // YouTube not actually connected yet: must be null, not an IG account id.
    const selected = resolveSelectedAccountId({
      brandId: 'brand-1',
      platform: 'youtube',
      platformAccounts: [],
      getSelection: () => 'ig-1',
    });
    expect(selected).toBeNull();
  });
});
