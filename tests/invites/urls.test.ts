import { expect, test } from 'bun:test';

import { buildInviteCallbackPath, buildInviteLoginRedirect } from '@/lib/invites/urls';

test('buildInviteCallbackPath builds invite callback route with query params', () => {
  const result = buildInviteCallbackPath('token-123', 'brand-456');
  expect(result).toBe('/invite/callback?token=token-123&brand=brand-456');
});

test('buildInviteCallbackPath carries the sign-in handoff so the callback can redeem it', () => {
  const result = buildInviteCallbackPath('token-123', 'brand-456', {
    otp: 'hashed-abc',
    type: 'magiclink',
  });
  expect(result).toBe(
    '/invite/callback?token=token-123&brand=brand-456&otp=hashed-abc&type=magiclink',
  );
});

test('buildInviteCallbackPath omits an absent or empty sign-in handoff', () => {
  expect(buildInviteCallbackPath('t', 'b', { otp: null, type: null })).toBe(
    '/invite/callback?token=t&brand=b',
  );
  expect(buildInviteCallbackPath('t', 'b', { otp: '', type: '' })).toBe(
    '/invite/callback?token=t&brand=b',
  );
});

test('buildInviteLoginRedirect builds login route with invite params', () => {
  const result = buildInviteLoginRedirect('token-123', 'brand-456');
  expect(result).toBe('/login?token=token-123&brand=brand-456');
});
