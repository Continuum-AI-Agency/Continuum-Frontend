import { describe, expect, it } from 'bun:test';

import {
  isWarmLeaseOpen,
  WARM_LEASE_LONG_MS,
  WARM_LEASE_SHORT_MS,
  warmLeaseExpiry,
  warmLeaseKey,
} from './warm-lease';

describe('warmLeaseKey', () => {
  it('is brand-scoped', () => {
    expect(warmLeaseKey('brand-1')).toBe('continuum:warm-lease:b:brand-1');
  });
});

describe('warmLeaseExpiry', () => {
  it('encodes the absolute expiry as now + ttl', () => {
    expect(warmLeaseExpiry(1_000, WARM_LEASE_SHORT_MS)).toBe(String(1_000 + WARM_LEASE_SHORT_MS));
    expect(warmLeaseExpiry(1_000, WARM_LEASE_LONG_MS)).toBe(String(1_000 + WARM_LEASE_LONG_MS));
  });
});

describe('isWarmLeaseOpen', () => {
  const now = 10_000_000;

  it('is open when no lease has been written', () => {
    expect(isWarmLeaseOpen(null, now)).toBe(true);
  });

  it('is open when the stored value is not a finite number', () => {
    expect(isWarmLeaseOpen('not-a-number', now)).toBe(true);
  });

  it('is closed while the stored expiry is still in the future', () => {
    const expiry = warmLeaseExpiry(now, WARM_LEASE_SHORT_MS);
    expect(isWarmLeaseOpen(expiry, now)).toBe(false);
  });

  it('reopens once the stored expiry has passed', () => {
    const expiry = warmLeaseExpiry(now - WARM_LEASE_SHORT_MS - 1, WARM_LEASE_SHORT_MS);
    expect(isWarmLeaseOpen(expiry, now)).toBe(true);
  });

  it('a long success lease stays closed past the short retry window (no refire loop)', () => {
    const expiry = warmLeaseExpiry(now, WARM_LEASE_LONG_MS);
    expect(isWarmLeaseOpen(expiry, now + WARM_LEASE_SHORT_MS + 1)).toBe(false);
  });
});
