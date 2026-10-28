import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { act, renderHook } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import {
  canRetry,
  clearHold,
  confirmUnderHold,
  forgetPageSession,
  BEAT_MS,
  heldCopy,
  holdKeyOf,
  isHeld,
  oneJobId,
  RenderHeldError,
  resendHeld,
  SESSION_RETRY,
  STALE_MS,
  readHold,
  retryHeld,
  type SignedBatch,
  sendingElsewhere,
  useRenderHold,
} from './renderHold';

const SCOPE = {
  userId: 'user-a',
  brandId: 'brand-a',
  bindingId: 'binding-a',
  templateKey: '133',
  renderSetId: 'set-a',
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
  test('the key is the user, the brand, the binding, the template and the render set', () => {
    expect(holdKeyOf(SCOPE)).toBe('forge:held-render:user-a:brand-a:binding-a:133:set-a');
    expect(holdKeyOf({ ...SCOPE, bindingId: null, renderSetId: null })).toBe(
      'forge:held-render:user-a:brand-a:default:133:canvas',
    );
    for (const other of [
      { ...SCOPE, userId: 'user-b' },
      { ...SCOPE, brandId: 'brand-b' },
      { ...SCOPE, bindingId: 'binding-b' },
      { ...SCOPE, templateKey: '134' },
      // A failure in set A does not gate set B.
      { ...SCOPE, renderSetId: 'set-b' },
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
    // The page reloads before the answer: the hold stays, without its token, and while the send
    // may still be on its way it says so.
    forgetPageSession();
    const reloaded = readHold(SCOPE)!;
    expect(reloaded).toMatchObject({
      batchId: 'batch-1',
      inflight: true,
      signed: null,
      reason: null,
    });
    expect(canRetry(reloaded)).toBe(false);
    expect(heldCopy(reloaded)).toBe(
      'A Render of this set is still being sent. Wait a moment, then check the Render ledger.',
    );
    // Its heartbeat stale: the tab is gone, so it can be let go, and the ledger may still fill.
    expect(heldCopy(reloaded, reloaded.heldAt + STALE_MS + 1)).toBe(
      'Retry isn’t available on this page. Some or all rows may already be rendering. Open Render ledger to check before rendering again. Rows can keep appearing in the Render ledger for a few minutes after a send stops; check again before rendering any that are missing.',
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
    clearHold(SCOPE, SIGNED.batchId);
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
      retryHeld(SCOPE, async () => {
        throw noAnswer();
      }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(isHeld(SCOPE)).toBe(true);
    const sent: string[] = [];
    await retryHeld(SCOPE, async (token) => sent.push(token));
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
    const base = {
      heldAt: 0,
      inflight: false,
      saved: true,
      sending: false,
      signed: SIGNED,
      reason: { kind: 'no-answer' as const },
    };
    expect(await resendHeld({ ...base, batchId: oneJobId('f'.repeat(64)) }, 't1', api)).toEqual({
      jobs: ['a'],
    });
    expect(await resendHeld({ ...base, batchId: 'batch-1' }, 't2', api)).toEqual({
      jobs: ['a', 'b'],
    });
    expect(sent).toEqual(['job:t1', 'batch:t2']);
  });

  test('storage is the hold: once another tab clears it, Retry sends nothing and Render signs fresh', async () => {
    await confirmUnderHold(SCOPE, SIGNED, async () => {
      throw noAnswer();
    }).catch(() => undefined);
    expect(canRetry(readHold(SCOPE)!)).toBe(true);
    // Tab B opens the ledger: the key goes; this page still has the token in memory.
    localStorage.removeItem(holdKeyOf(SCOPE));
    expect(isHeld(SCOPE)).toBe(false);
    expect(readHold(SCOPE)).toBeNull();
    let retried = false;
    await expect(
      retryHeld(SCOPE, async () => {
        retried = true;
      }),
    ).rejects.toBeInstanceOf(RenderHeldError);
    expect(retried).toBe(false);
    let signedFresh = false;
    await confirmUnderHold(SCOPE, { ...SIGNED, token: 'fresh', batchId: 'batch-2' }, async () => {
      signedFresh = true;
    });
    expect(signedFresh).toBe(true);
  });

  test('a cleared key heard from another tab drops this page’s token for that batch', () => {
    return confirmUnderHold(SCOPE, SIGNED, async () => {
      throw noAnswer();
    })
      .catch(() => undefined)
      .then(() => {
        const { result } = renderHook(() => useRenderHold(SCOPE));
        const record = localStorage.getItem(holdKeyOf(SCOPE))!;
        act(() => {
          localStorage.removeItem(holdKeyOf(SCOPE));
          window.dispatchEvent(
            Object.assign(new Event('storage'), {
              key: holdKeyOf(SCOPE),
              oldValue: record,
              newValue: null,
            }),
          );
        });
        expect(result.current).toBeNull();
        // The same record written back (a late write elsewhere) holds, but this page's token went.
        localStorage.setItem(holdKeyOf(SCOPE), record);
        expect(readHold(SCOPE)?.signed).toBeNull();
      });
  });

  test('a hold the browser will not save is still sent, held in this page only, and says so', async () => {
    // A browser that will not keep site data: reads work, every write throws.
    const real = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => real.getItem(key),
        removeItem: (key: string) => real.removeItem(key),
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
    });
    try {
      let notSaved = 0;
      await expect(
        confirmUnderHold(
          SCOPE,
          SIGNED,
          async () => {
            throw noAnswer();
          },
          { onNotSaved: () => (notSaved += 1) },
        ),
      ).rejects.toBeInstanceOf(TypeError);
      expect(notSaved).toBe(1);
      // Held, in memory only: this page opens it, and a second send is refused.
      expect(readHold(SCOPE)).toMatchObject({ batchId: 'batch-1', saved: false });
      expect(canRetry(readHold(SCOPE)!)).toBe(true);
      await expect(confirmUnderHold(SCOPE, SIGNED, async () => undefined)).rejects.toBeInstanceOf(
        RenderHeldError,
      );
      // A reload forgets it: nothing was saved.
      forgetPageSession();
      expect(isHeld(SCOPE)).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: real });
    }
  });

  // Pinned to the backend: routes.ts authenticates before service.createBatch, and createJob raises
  // no 401 or 403, so either means nothing was made (see isSessionRefusal).
  test('a 401 or 403 is not held: nothing was made, the session is what to fix', async () => {
    for (const status of [401, 403]) {
      await confirmUnderHold(SCOPE, SIGNED, async () => {
        throw new ApiError('Unauthorized', status);
      }).catch(() => undefined);
      expect(isHeld(SCOPE)).toBe(false);
      expect(localStorage.getItem(holdKeyOf(SCOPE))).toBeNull();
    }
    // Another batch's hold is not cleared by this one's 401.
    const other = JSON.stringify({ batchId: 'batch-9', heldAt: Date.now() });
    localStorage.setItem(holdKeyOf(SCOPE), other);
    await expect(
      retryHeld(SCOPE, async () => {
        throw new ApiError('Unauthorized', 401);
      }),
    ).rejects.toBeInstanceOf(RenderHeldError);
    expect(localStorage.getItem(holdKeyOf(SCOPE))).toBe(other);
  });

  test('a retry in this page tells its readers, and the held view stays, sending, until it lands', async () => {
    await confirmUnderHold(SCOPE, SIGNED, async () => {
      throw noAnswer();
    }).catch(() => undefined);
    const { result } = renderHook(() => useRenderHold(SCOPE));
    expect(result.current?.sending).toBe(false);
    let answer: (value: unknown) => void = () => undefined;
    let retrying: Promise<unknown> = Promise.resolve();
    act(() => {
      retrying = retryHeld(SCOPE, () => new Promise((resolve) => (answer = resolve)));
    });
    // Re-rendered without waiting for anything else to render: still held, now sending.
    expect(result.current).toMatchObject({ batchId: 'batch-1', sending: true });
    expect(canRetry(result.current!)).toBe(false);
    expect(heldCopy(result.current!)).not.toContain('Retry isn’t available');
    await act(async () => {
      answer({ jobs: [] });
      await retrying;
    });
    expect(result.current).toBeNull();
  });

  test('a stop already worded as the render service is not prefixed again', () => {
    const held = {
      batchId: 'batch-1',
      heldAt: 0,
      inflight: false,
      saved: true,
      sending: false,
      signed: SIGNED,
      reason: {
        kind: 'stopped' as const,
        message: 'The render service refused this batch',
        retryable: false,
      },
    };
    expect(heldCopy(held)).toBe(
      'The render service refused this batch. Some rows may already be rendering. Open Render ledger to check, then Render to review again.',
    );
    expect(
      heldCopy({ ...held, reason: { ...held.reason, message: 'This review has expired' } }),
    ).toMatch(/^The render service stopped this batch: This review has expired\. /);
  });

  test('a retry that fails after its hold was let go does not write it back', async () => {
    await confirmUnderHold(SCOPE, SIGNED, async () => {
      throw noAnswer();
    }).catch(() => undefined);
    let fail: (error: unknown) => void = () => undefined;
    const retrying = retryHeld(SCOPE, () => new Promise((_, reject) => (fail = reject)));
    // Let go elsewhere while the retry was out.
    localStorage.removeItem(holdKeyOf(SCOPE));
    fail(noAnswer());
    await expect(retrying).rejects.toBeInstanceOf(TypeError);
    expect(isHeld(SCOPE)).toBe(false);
    expect(localStorage.getItem(holdKeyOf(SCOPE))).toBeNull();
  });

  test('a 401 or 403 on a retry keeps the hold and its Retry: sign in, then Retry', async () => {
    for (const status of [401, 403]) {
      await confirmUnderHold(SCOPE, SIGNED, async () => {
        throw noAnswer();
      }).catch(() => undefined);
      await expect(
        retryHeld(SCOPE, async () => {
          throw new ApiError('Unauthorized', status);
        }),
      ).rejects.toBeInstanceOf(ApiError);
      const held = readHold(SCOPE)!;
      expect(held.reason).toEqual({ kind: 'session' });
      expect(canRetry(held)).toBe(true);
      expect(heldCopy(held)).toBe(SESSION_RETRY);
      // Signed back in: the same token goes, and lands.
      await retryHeld(SCOPE, async (token) => expect(token).toBe('token-secret'));
      expect(isHeld(SCOPE)).toBe(false);
    }
  });

  test('a scoped clear never removes another batch’s hold', async () => {
    localStorage.setItem(
      holdKeyOf(SCOPE),
      JSON.stringify({ batchId: 'batch-b', heldAt: Date.now() }),
    );
    // Tab A's send of batch-1 finishes after tab B held batch-b: B's hold stays.
    clearHold(SCOPE, 'batch-1');
    expect(readHold(SCOPE)?.batchId).toBe('batch-b');
    clearHold(SCOPE, 'batch-b');
    expect(isHeld(SCOPE)).toBe(false);
  });

  test('a write-ahead read back as another tab’s batch is not sent; the hold opens instead', async () => {
    // Tab B's write lands between this tab's fresh read and its read-back.
    const real = globalThis.localStorage;
    const raced = JSON.stringify({ batchId: 'batch-b', heldAt: Date.now(), inflight: true });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => real.getItem(key),
        removeItem: (key: string) => real.removeItem(key),
        setItem: (key: string) => real.setItem(key, raced),
      },
    });
    try {
      let sent = false;
      await expect(
        confirmUnderHold(SCOPE, SIGNED, async () => {
          sent = true;
        }),
      ).rejects.toBeInstanceOf(RenderHeldError);
      expect(sent).toBe(false);
      expect(readHold(SCOPE)?.batchId).toBe('batch-b');
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: real });
    }
  });

  test('a live retry in tab A beats, so tab B cannot let it go; a stale beat can be', async () => {
    let clock = Date.now();
    const now = spyOn(Date, 'now').mockImplementation(() => clock);
    let answer: (value: unknown) => void = () => undefined;
    const timers: Array<() => void> = [];
    const interval = spyOn(globalThis, 'setInterval').mockImplementation(((beat: () => void) => {
      timers.push(beat);
      return 0;
    }) as unknown as typeof setInterval);
    try {
      await confirmUnderHold(SCOPE, SIGNED, async () => {
        throw noAnswer();
      }).catch(() => undefined);
      const retrying = retryHeld(SCOPE, () => new Promise((resolve) => (answer = resolve)));
      // Tab B: no token, the retry's write-ahead in storage.
      forgetPageSession();
      const tabB = () => readHold(SCOPE)!;
      expect(tabB()).toMatchObject({ inflight: true, signed: null });
      // Minutes of retries: each beat keeps it live in tab B.
      for (let beat = 0; beat < 10; beat += 1) {
        clock += BEAT_MS;
        for (const run of timers) run();
        expect(sendingElsewhere(tabB(), clock)).toBe(true);
        expect(heldCopy(tabB(), clock)).toBe(
          'A Render of this set is still being sent. Wait a moment, then check the Render ledger.',
        );
      }
      // Tab A goes away: no more beats. A minute later the entry is an orphan, and can go.
      clock += STALE_MS + 1;
      expect(sendingElsewhere(tabB(), clock)).toBe(false);
      answer({ jobs: [] });
      await retrying;
    } finally {
      now.mockRestore();
      interval.mockRestore();
    }
  });

  test('a hold from days ago is still held: only the ledger lets it go', () => {
    localStorage.setItem(
      holdKeyOf(SCOPE),
      JSON.stringify({ batchId: 'batch-1', heldAt: Date.now() - 9 * 24 * 3_600_000 }),
    );
    expect(isHeld(SCOPE)).toBe(true);
    expect(readHold(SCOPE)?.batchId).toBe('batch-1');
    clearHold(SCOPE, 'batch-1');
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
