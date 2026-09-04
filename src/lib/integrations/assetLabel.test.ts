import { describe, expect, it } from 'bun:test';

import {
  assetFallbackLabel,
  formatGoogleCustomerId,
  resolveAssetLabel,
} from '@/lib/integrations/assetLabel';

describe('formatGoogleCustomerId', () => {
  it('groups a 10-digit customer id the way Google prints it', () => {
    expect(formatGoogleCustomerId('9891045148')).toBe('989-104-5148');
  });

  it('leaves an already-formatted id alone', () => {
    expect(formatGoogleCustomerId('989-104-5148')).toBe('989-104-5148');
  });

  it('returns anything that is not ten digits unchanged', () => {
    expect(formatGoogleCustomerId('UCvbo9ytYW')).toBe('UCvbo9ytYW');
  });
});

describe('assetFallbackLabel', () => {
  it('formats an unnamed Google Ads customer id', () => {
    expect(assetFallbackLabel('ads_customer', '9891045148')).toBe('989-104-5148');
  });

  it('covers the snapshot-table spelling of the same type', () => {
    expect(assetFallbackLabel('google_ad_account', '9891045148')).toBe('989-104-5148');
  });

  it('leaves a non-Ads identifier alone', () => {
    expect(assetFallbackLabel('youtube_channel', 'UCvbo9ytYW')).toBe('UCvbo9ytYW');
  });

  it('falls back to the identifier when the type is unknown', () => {
    expect(assetFallbackLabel('something_new', 'abc123')).toBe('abc123');
  });

  it('falls back to the platform when there is no identifier', () => {
    expect(assetFallbackLabel('ads_customer', null)).toBe('Google Ads');
  });

  it('never renders a provider string for an unknown type with no id', () => {
    expect(assetFallbackLabel(null, null)).toBe('Account');
  });
});

describe('resolveAssetLabel', () => {
  it('prefers the real name when Google returned one', () => {
    expect(
      resolveAssetLabel({ name: 'Munnin Lab', type: 'ads_customer', external_id: '9891045148' }),
    ).toBe('Munnin Lab');
  });

  // Every ads_customer row in production persists name: null because Google
  // refuses descriptive_name on an unapproved developer token.
  it('falls back for the null name Google Ads actually persists', () => {
    expect(resolveAssetLabel({ name: null, type: 'ads_customer', external_id: '9891045148' })).toBe(
      '989-104-5148',
    );
  });

  it('treats a whitespace-only name as missing', () => {
    expect(
      resolveAssetLabel({ name: '   ', type: 'ads_customer', external_id: '9891045148' }),
    ).toBe('989-104-5148');
  });
});
