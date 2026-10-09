import { describe, expect, test } from 'bun:test';
import { rpcFailure } from './rpcFailure';

describe('members route rpcFailure', () => {
  test('the restricted-collections gate (0A000) is a 409 with its reason, not a 500', async () => {
    const response = rpcFailure({ code: '0A000', message: 'restricted_collections_disabled' });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('turned off');
  });
  test('the existing mappings hold', () => {
    expect(rpcFailure({ code: '42501', message: '' }).status).toBe(403);
    expect(rpcFailure({ code: 'P0002', message: '' }).status).toBe(404);
    expect(rpcFailure({ code: '22023', message: '' }).status).toBe(422);
    expect(rpcFailure({ code: 'XX000', message: '' }).status).toBe(500);
  });
});
