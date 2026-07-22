import { expect, test } from 'bun:test';

import { buildInviteCallbackPath, buildInviteLoginRedirect } from '@/lib/invites/urls';

test('buildInviteCallbackPath builds invite callback route with query params', () => {
  const result = buildInviteCallbackPath('token-123', 'brand-456');
  expect(result).toBe('/invite/callback?token=token-123&brand=brand-456');
});

test('buildInviteLoginRedirect builds login route with invite params', () => {
  const result = buildInviteLoginRedirect('token-123', 'brand-456');
  expect(result).toBe('/login?token=token-123&brand=brand-456');
});
