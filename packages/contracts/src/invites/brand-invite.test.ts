import { describe, expect, it } from 'bun:test';

import { deriveInviteStatus, inviteIsResendable } from './brand-invite';

const NOW = new Date('2026-08-14T00:00:00.000Z');
const PAST = '2026-08-01T00:00:00.000Z';
const FUTURE = '2026-09-01T00:00:00.000Z';

describe('deriveInviteStatus', () => {
  it('is pending while it is live, unaccepted and unrevoked', () => {
    expect(deriveInviteStatus({ acceptedAt: null, revokedAt: null, expiresAt: FUTURE }, NOW)).toBe(
      'pending',
    );
  });

  it('is expired once the window has lapsed', () => {
    expect(deriveInviteStatus({ acceptedAt: null, revokedAt: null, expiresAt: PAST }, NOW)).toBe(
      'expired',
    );
  });

  it('is accepted once claimed', () => {
    expect(deriveInviteStatus({ acceptedAt: PAST, revokedAt: null, expiresAt: FUTURE }, NOW)).toBe(
      'accepted',
    );
  });

  it('reads as revoked when an accepted member is removed', () => {
    // remove_member now stamps revoked_at on the accepted invite. Before, it
    // left accepted_at standing with no permissions row behind it — the state 3
    // live production rows are stuck in.
    expect(deriveInviteStatus({ acceptedAt: PAST, revokedAt: PAST, expiresAt: FUTURE }, NOW)).toBe(
      'revoked',
    );
  });

  it('keeps revocation ahead of expiry so a lapsed revoked invite never reads as merely stale', () => {
    expect(deriveInviteStatus({ acceptedAt: null, revokedAt: PAST, expiresAt: PAST }, NOW)).toBe(
      'revoked',
    );
  });

  it('treats a missing expiry as open-ended rather than expired', () => {
    expect(deriveInviteStatus({ acceptedAt: null, revokedAt: null, expiresAt: null }, NOW)).toBe(
      'pending',
    );
  });

  it('expires exactly at the boundary, not a moment after', () => {
    const boundary = '2026-08-14T00:00:00.000Z';
    expect(
      deriveInviteStatus({ acceptedAt: null, revokedAt: null, expiresAt: boundary }, NOW),
    ).toBe('expired');
  });
});

describe('inviteIsResendable', () => {
  it('allows a resend only where one would produce a usable link', () => {
    expect(inviteIsResendable('pending')).toBe(true);
    expect(inviteIsResendable('expired')).toBe(true);
    expect(inviteIsResendable('accepted')).toBe(false);
    expect(inviteIsResendable('revoked')).toBe(false);
  });
});
