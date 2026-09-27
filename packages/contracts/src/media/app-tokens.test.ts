import { describe, expect, it } from 'bun:test';
import {
  APP_TOKEN_PREFIX,
  appTokenSchema,
  createAppTokenRequestSchema,
  createAppTokenResponseSchema,
  revokeAppTokenResponseSchema,
} from './app-tokens';

const ID = '11111111-1111-4111-8111-111111111111';
const AT = '2026-09-27T00:00:00Z';
const TOKEN = `${APP_TOKEN_PREFIX}${'ab12'.repeat(16)}`;

describe('app tokens', () => {
  it('parses a stored token row and defaults scopes to drive', () => {
    const parsed = appTokenSchema.parse({
      id: ID,
      userId: ID,
      name: 'MacBook',
      last4: 'ab12',
      createdAt: AT,
      lastUsedAt: null,
      revokedAt: null,
    });
    expect(parsed.scopes).toEqual(['drive']);
  });

  it('never carries the hash', () => {
    expect(
      appTokenSchema.safeParse({
        id: ID,
        userId: ID,
        name: 'MacBook',
        last4: 'ab12',
        tokenHash: 'x',
        createdAt: AT,
        lastUsedAt: null,
        revokedAt: null,
      }).success,
    ).toBe(false);
  });

  it('bounds the token name to 1..80 after trimming', () => {
    expect(createAppTokenRequestSchema.parse({ name: '  Drive  ' }).name).toBe('Drive');
    expect(createAppTokenRequestSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(createAppTokenRequestSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false);
  });

  it('parses the one-time create response and rejects a malformed token', () => {
    const response = {
      id: ID,
      name: 'Drive',
      token: TOKEN,
      last4: 'ab12',
      scopes: ['drive'],
      createdAt: AT,
    };
    expect(createAppTokenResponseSchema.parse(response).token).toBe(TOKEN);
    expect(
      createAppTokenResponseSchema.safeParse({ ...response, token: `tok_${'a'.repeat(64)}` })
        .success,
    ).toBe(false);
    expect(
      createAppTokenResponseSchema.safeParse({ ...response, token: 'cnt_short' }).success,
    ).toBe(false);
  });

  it('parses a revoke response', () => {
    expect(revokeAppTokenResponseSchema.parse({ id: ID, revokedAt: AT }).revokedAt).toBe(AT);
    expect(revokeAppTokenResponseSchema.safeParse({ id: ID }).success).toBe(false);
  });
});
