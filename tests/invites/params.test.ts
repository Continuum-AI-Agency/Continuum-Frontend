import { expect, test } from 'bun:test';

import { normalizeInviteBrandId, normalizeInviteToken } from '@/lib/invites/params';

test('normalizeInviteBrandId returns a normalized UUID', () => {
  const brandId = normalizeInviteBrandId('A90C3556-30A6-4D0D-9A04-1B5C058D05C5');
  expect(brandId).toBe('a90c3556-30a6-4d0d-9a04-1b5c058d05c5');
});

test('normalizeInviteBrandId extracts UUID from malformed query-style value', () => {
  const brandId = normalizeInviteBrandId('a90c3556-30a6-4d0d-9a04-1b5c058d05c5?token=abc123');
  expect(brandId).toBe('a90c3556-30a6-4d0d-9a04-1b5c058d05c5');
});

test('normalizeInviteBrandId returns null for invalid input', () => {
  expect(normalizeInviteBrandId('not-a-uuid')).toBeNull();
  expect(normalizeInviteBrandId(null)).toBeNull();
});

test('normalizeInviteToken trims token values', () => {
  expect(normalizeInviteToken(' token-123 ')).toBe('token-123');
  expect(normalizeInviteToken('   ')).toBeNull();
});
