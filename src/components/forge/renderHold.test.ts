import { afterEach, describe, expect, test } from 'bun:test';
import { act, renderHook } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import {
  canRetry,
  clearHold,
  confirmUnderHold,
  forgetPageSession,
  heldCopy,
  holdKeyOf,
  isHeld,
  oneJobId,
  RenderHeldError,
  resendHeld,
  readHold,
  retryHeld,
  type SignedBatch,
  useRenderHold,
} from './renderHold';

const SCOPE = {
  userId: 'user-a',
  brandId: 'brand-a',
  bindingId: 'binding-a',
  templateKey: '133',
};
const SIGNED: SignedBatch = {
  token: 'token-secret',
  request: {
    brandId: 'brand-a',
    templateKey: '133',
    contractHash: 'hash',
    records: [{ label: 'Spain' }],
  },
  expiresAt: '2099-01-01T00:00:00.000Z',
  batchId: 'batch-1',
};
const noAnswer = () => new TypeError('Failed to fetch');

afterEach(() => {
  forgetPageSession();
  localStorage.clear();
});

describe('renderHold', () => {
  test('the key is the user, the brand, the binding and the template, never the set', () => {
    expect(holdKeyOf(SCOPE)).toBe('forge:held-render:user-a:brand-a:binding-a:133');
    expect(holdKeyOf({ ...SCOPE, bindingId: null })).toBe(
      'forge:held-render:user-a:brand-a:default:133',
    );
    for (const other of [
      { ...SCOPE, userId: 'user-b' },
      { ...SCOPE, brandId: 'brand-b' },
      { ...SCOPE, bindingId: 'binding-b' },
      { ...SCOPE, templateKey: '134' },
    ])
      expect(holdKeyOf(other)).not.toBe(holdKeyOf(SCOPE));
  });

  test('the hold is written before createBatch, so a reload mid-call is still held', async () => {
    let answer: (value: unknown) => void = () => undefined;
    const confirming = confirmUnderHold(SCOPE, SIGNED, () => new Promise((r) => (answer = r)));
    // In flight: another surface or tab reading fresh sees it held; this page does not yet.
    expect(isHeld(SCOPE)).toBe(true);
    expect(JSON.parse(localStorage.getItem(holdKeyOf(SCOPE))!)).toMatchObject({
      batchId: 'batch-1',
      inflight: true,
    });
    expect(readHold(SCOPE)).toBeNull();
    // The page reloads before the answer: the hold stays, without its token.
    forgetPageSession();
    const reloaded = readHold(SCOPE)!;
    expect(reloaded).toMatchObject({ batchId: 'batch-1', signed: null, reason: null });
    expect(canRetry(reloaded)).toBe(false);
    expect(heldCopy(reloaded)).toBe(
      'Retry isn’t available after a reload. Some or all rows may already be rendering. Open Render ledger to check before rendering again.',
    );
    answer({ jobs: [] });
    await confirming;
  });

  test('a success clears the hold; a failure keeps it, with the token in memory only', async () => {
    await confirmUnderHold(SCOPE, SIGNED, async () => ({ jobs: [] }));
    expect(isHeld(SCOPE)).toBe(false);
    expect(localStorage.getItem(holdKeyOf(SCOPE))).toBeNull();

    await expect(
      confirmUnderHold(SCOPE, SIGNED, async () => {
        throw noAnswer();
      }),
    ).rejects.toBeInstanceOf(TypeError);
    const held = readHold(SCOPE)!;
    expect(held.signed?.token).toBe('token-secret');
    expect(canRetry(held)).toBe(true);
    const stored = localStorage.getItem(holdKeyOf(SCOPE))!;
    expect(Object.keys(JSON.parse(stored)).sort()).toEqual(['batchId', 'heldAt']);
    expect(stored).not.toContain('token-secret');
    // A second confirm is refused before anything is sent.
    let sent = false;
    await expect(
      confirmUnderHold(SCOPE, SIGNED, async () => {
        sent = true;
      }),
    ).rejects.toBeInstanceOf(RenderHeldError);
    expect(sent).toBe(false);
  });

  test('a 4xx refusal is held without Retry; a 5xx or no answer can be retried', async () => {
    await expect(
      confirmUnderHold(SCOPE, SIGNED, async () => {
        throw new ApiError('render_binding_changed', 409, undefined, {
          error: 'render_binding_changed',
          detail: 'The render binding changed.',
        });
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(canRetry(readHold(SCOPE)!)).toBe(false);
    clearHold(SCOPE);
    await expect(
      confirmUnderHold(SCOPE, SIGNED, async () => {
        throw new ApiError('Service Unavailable', 503, undefined, { error: 'Service Unavailable' });
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(canRetry(readHold(SCOPE)!)).toBe(true);
  });

  test('Retry clears the hold when it lands, and keeps it when it does not', async () => {
    await confirmUnderHold(SCOPE, SIGNED, async () => {
      throw noAnswer();
    }).catch(() => undefined);
    await expect(
      retryHeld(SCOPE, readHold(SCOPE)!, async () => {
        throw noAnswer();
      }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(isHeld(SCOPE)).toBe(true);
    const sent: string[] = [];
    await retryHeld(SCOPE, readHold(SCOPE)!, async (token) => sent.push(token));
    expect(sent).toEqual(['token-secret']);
    expect(isHeld(SCOPE)).toBe(false);
  });

  test('a held one-row confirm is re-sent as one job, a batch as a batch', async () => {
    const sent: string[] = [];
    const api = {
      createBatch: async (input: { confirmationToken: string }) => {
        sent.push(`batch:${input.confirmationToken}`);
        return { jobs: ['a', 'b'] };
      },
      createJob: async (input: { confirmationToken: string }) => {
        sent.push(`job:${input.confirmationToken}`);
        return 'a';
      },
    };
    const base = { heldAt: 0, signed: SIGNED, reason: { kind: 'no-answer' as const } };
    expect(await resendHeld({ ...base, batchId: oneJobId('f'.repeat(64)) }, 't1', api)).toEqual({
      jobs: ['a'],
    });
    expect(await resendHeld({ ...base, batchId: 'batch-1' }, 't2', api)).toEqual({
      jobs: ['a', 'b'],
    });
    expect(sent).toEqual(['job:t1', 'batch:t2']);
  });

  test('a hold from days ago is still held: only the ledger lets it go', () => {
    localStorage.setItem(
      holdKeyOf(SCOPE),
      JSON.stringify({ batchId: 'batch-1', heldAt: Date.now() - 9 * 24 * 3_600_000 }),
    );
    expect(isHeld(SCOPE)).toBe(true);
    expect(readHold(SCOPE)?.batchId).toBe('batch-1');
    clearHold(SCOPE);
    expect(isHeld(SCOPE)).toBe(false);
  });

  test('another tab’s write reaches this one through the storage event', () => {
    const { result } = renderHook(() => useRenderHold(SCOPE));
    expect(result.current).toBeNull();
    act(() => {
      localStorage.setItem(
        holdKeyOf(SCOPE),
        JSON.stringify({ batchId: 'batch-2', heldAt: Date.now(), inflight: true }),
      );
      // What the browser fires here when another tab writes this key.
      window.dispatchEvent(Object.assign(new Event('storage'), { key: holdKeyOf(SCOPE) }));
    });
    expect(result.current?.batchId).toBe('batch-2');
  });
});
