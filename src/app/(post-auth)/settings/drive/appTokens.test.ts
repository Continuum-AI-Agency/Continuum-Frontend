import { describe, expect, it } from 'bun:test';
import { type AppTokenStore, createAppToken, listAppTokens, revokeAppToken } from './appTokens';

const id = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const token = `cnt_${'ab'.repeat(32)}`;

function fakeStore(overrides: Partial<AppTokenStore> = {}) {
  const calls: string[] = [];
  const store: AppTokenStore = {
    list: async () => {
      calls.push('list');
      return {
        data: [
          {
            id,
            user_id: user,
            name: 'Edit bay Mac',
            last4: 'abab',
            scopes: ['drive'],
            created_at: '2026-09-27T10:00:00Z',
            last_used_at: null,
            revoked_at: null,
          },
        ],
        error: null,
      };
    },
    create: async (name) => {
      calls.push(`create:${name}`);
      return {
        data: {
          id,
          name,
          token,
          last4: 'abab',
          scopes: ['drive'],
          createdAt: '2026-09-27T10:00:00Z',
        },
        error: null,
      };
    },
    revoke: async (tokenId) => {
      calls.push(`revoke:${tokenId}`);
      return { data: { id: tokenId, revokedAt: '2026-09-27T11:00:00Z' }, error: null };
    },
    ...overrides,
  };
  return { store, calls };
}

describe('app token server actions', () => {
  it('lists the caller’s tokens in the contract shape, never the hash', async () => {
    const { store } = fakeStore();
    const [row] = await listAppTokens(store);
    expect(row).toEqual({
      id,
      userId: user,
      name: 'Edit bay Mac',
      last4: 'abab',
      scopes: ['drive'],
      createdAt: '2026-09-27T10:00:00Z',
      lastUsedAt: null,
      revokedAt: null,
    });
  });

  it('creates a token with a trimmed name and returns the plaintext once', async () => {
    const { store, calls } = fakeStore();
    const created = await createAppToken(store, { name: '  Edit bay Mac  ' });
    expect(calls).toEqual(['create:Edit bay Mac']);
    expect(created.token).toBe(token);
  });

  it('refuses an empty or oversized name before touching the database', async () => {
    const { store, calls } = fakeStore();
    await expect(createAppToken(store, { name: '   ' })).rejects.toThrow();
    await expect(createAppToken(store, { name: 'x'.repeat(81) })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('refuses a create response that is not a well-formed token', async () => {
    const { store } = fakeStore({
      create: async () => ({ data: { id, name: 'x', token: 'not-a-token' }, error: null }),
    });
    await expect(createAppToken(store, { name: 'x' })).rejects.toThrow();
  });

  it('revokes only a uuid', async () => {
    const { store, calls } = fakeStore();
    expect((await revokeAppToken(store, id)).id).toBe(id);
    await expect(revokeAppToken(store, "1' or 1=1")).rejects.toThrow();
    expect(calls).toEqual([`revoke:${id}`]);
  });

  it('surfaces a database refusal with its reason', async () => {
    const { store } = fakeStore({
      revoke: async () => ({ data: null, error: { message: 'app_token_not_found' } }),
    });
    await expect(revokeAppToken(store, id)).rejects.toThrow('app_token_not_found');
  });
});
