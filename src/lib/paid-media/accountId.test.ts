import { describe, expect, it } from 'bun:test';
import { resolveInitialMetaAdAccountId } from './accountId';

describe('resolveInitialMetaAdAccountId', () => {
  it('uses a brand-assigned account when the timeline account lookup is unavailable', () => {
    expect(
      resolveInitialMetaAdAccountId(
        [],
        [{ accountId: 'act_000000000000000', platform: 'meta_ads' }],
      ),
    ).toBe('act_000000000000000');
  });

  it('prefers a timeline-present assigned account', () => {
    expect(
      resolveInitialMetaAdAccountId(
        [{ id: 'act_reachable' }, { id: '123' }],
        [
          { accountId: 'act_123', platform: 'meta_ads' },
          { accountId: 'act_assigned_only', platform: 'meta_ads' },
        ],
      ),
    ).toBe('123');
  });

  it('preserves the first reachable account fallback when assignment lookup is unavailable', () => {
    expect(resolveInitialMetaAdAccountId([{ id: 'act_reachable' }], [])).toBe('act_reachable');
  });

  it('never binds Meta-only Jaina to a Google Ads assignment', () => {
    expect(
      resolveInitialMetaAdAccountId(
        [],
        [{ accountId: 'google-customer-1', platform: 'google_ads' }],
      ),
    ).toBeNull();
  });
});
