import { describe, expect, it } from 'bun:test';
import { shareLinkSchema } from '@continuum/contracts';

import {
  buildShareUrl,
  expiresAtFromDays,
  rowToShareLink,
  type ShareLinkRow,
  shareLinkStatus,
} from './shareValidation';

const NOW = new Date('2026-07-11T12:00:00.000Z');

const ROW: ShareLinkRow = {
  id: 'link-1',
  brand_id: 'b1',
  token: 'tok_abc',
  scope: 'asset',
  asset_id: 'asset-1',
  collection_id: null,
  permissions: 'view',
  created_by: 'user-9',
  expires_at: null,
  revoked_at: null,
  created_at: '2026-07-01T00:00:00.000Z',
};

describe('shareLinkStatus', () => {
  it('is active with no expiry and no revocation', () => {
    expect(shareLinkStatus({ revokedAt: null, expiresAt: null }, NOW)).toEqual({ active: true });
  });

  it('is active before the expiry instant', () => {
    expect(shareLinkStatus({ expiresAt: '2026-07-11T12:00:00.001Z' }, NOW)).toEqual({
      active: true,
    });
  });

  it('expires at exactly the expiry instant', () => {
    expect(shareLinkStatus({ expiresAt: NOW.toISOString() }, NOW)).toEqual({
      active: false,
      reason: 'expired',
    });
    expect(shareLinkStatus({ expiresAt: '2026-01-01T00:00:00.000Z' }, NOW)).toEqual({
      active: false,
      reason: 'expired',
    });
  });

  it('revocation wins over any expiry state', () => {
    expect(
      shareLinkStatus(
        { revokedAt: '2026-07-02T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' },
        NOW,
      ),
    ).toEqual({ active: false, reason: 'revoked' });
  });
});

describe('expiresAtFromDays', () => {
  it('returns null when no expiry was requested', () => {
    expect(expiresAtFromDays(undefined, NOW)).toBeNull();
  });

  it('adds whole days to now', () => {
    expect(expiresAtFromDays(7, NOW)).toBe('2026-07-18T12:00:00.000Z');
  });
});

describe('rowToShareLink', () => {
  it('maps snake_case rows to a contract-valid ShareLink', () => {
    const link = rowToShareLink(ROW, 'https://app.trycontinuum.ai');
    expect(shareLinkSchema.safeParse(link).success).toBe(true);
    expect(link.brandId).toBe('b1');
    expect(link.assetId).toBe('asset-1');
    expect(link.url).toBe('https://app.trycontinuum.ai/share/tok_abc');
  });

  it('leaves url null when no origin is known', () => {
    expect(rowToShareLink(ROW).url).toBeNull();
  });
});

describe('buildShareUrl', () => {
  it('tolerates a trailing slash on the origin', () => {
    expect(buildShareUrl('https://x.test/', 't1')).toBe('https://x.test/share/t1');
  });
});
