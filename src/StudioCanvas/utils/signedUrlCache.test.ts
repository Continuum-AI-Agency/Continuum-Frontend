import { afterEach, describe, expect, it } from 'bun:test';
import {
  clearSignedUrlCache,
  resolveSignedUrls,
  type SignedUrlCoordinate,
  signedUrlKey,
} from './signedUrlCache';

const coord = (path: string): SignedUrlCoordinate => ({ bucket: 'b', path });

// A signed URL whose token carries a real `exp`, so the cache stores it with a
// lifetime instead of falling back to the unknown-token TTL.
function signedUrl(path: string, secondsFromNow = 3600, nonce = 'n'): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow }),
  )
    .toString('base64')
    .replace(/=+$/, '');
  return `https://s.example/storage/v1/object/sign/b/${path}?token=h.${payload}.s${nonce}`;
}

/** Signer that records every coordinate it was actually asked to sign. */
function recordingSigner(opts: { delayMs?: number; omit?: string[]; ttl?: number } = {}) {
  const asked: string[][] = [];
  let calls = 0;
  const sign = async (pending: SignedUrlCoordinate[]): Promise<Map<string, string>> => {
    calls += 1;
    asked.push(pending.map((p) => p.path));
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    const out = new Map<string, string>();
    for (const p of pending) {
      if (opts.omit?.includes(p.path)) continue;
      out.set(signedUrlKey(p.bucket, p.path), signedUrl(p.path, opts.ttl ?? 3600, String(calls)));
    }
    return out;
  };
  return {
    sign,
    get calls() {
      return calls;
    },
    get asked() {
      return asked;
    },
  };
}

describe('resolveSignedUrls', () => {
  afterEach(() => clearSignedUrlCache());

  it('signs each coordinate once and returns a url per key', async () => {
    const signer = recordingSigner();
    const out = await resolveSignedUrls([coord('a'), coord('b')], signer.sign);
    expect(signer.calls).toBe(1);
    expect(out.size).toBe(2);
    expect(out.get(signedUrlKey('b', 'a'))).toContain('/object/sign/b/a');
  });

  it('de-duplicates repeated coordinates inside one call', async () => {
    const signer = recordingSigner();
    await resolveSignedUrls([coord('a'), coord('a'), coord('a')], signer.sign);
    expect(signer.asked[0]).toEqual(['a']);
  });

  it('serves a second caller from cache without signing again', async () => {
    const signer = recordingSigner();
    const first = await resolveSignedUrls([coord('a')], signer.sign);
    const second = await resolveSignedUrls([coord('a')], signer.sign);
    expect(signer.calls).toBe(1);
    // Same URL string is what stops the browser re-downloading the bytes.
    expect(second.get(signedUrlKey('b', 'a'))).toBe(first.get(signedUrlKey('b', 'a'))!);
  });

  // The regression this module exists for: the canvas signs from several places at
  // once on a cold open. Concurrent claims must SHARE one fetch, not race it.
  it('coalesces concurrent claims on the same pointer into one fetch', async () => {
    const signer = recordingSigner({ delayMs: 25 });
    const [a, b, c] = await Promise.all([
      resolveSignedUrls([coord('x')], signer.sign),
      resolveSignedUrls([coord('x')], signer.sign),
      resolveSignedUrls([coord('x')], signer.sign),
    ]);
    expect(signer.calls).toBe(1);
    const key = signedUrlKey('b', 'x');
    expect(a.get(key)).toBe(b.get(key)!);
    expect(b.get(key)).toBe(c.get(key)!);
  });

  it('a concurrent caller asking for a superset only signs the new pointers', async () => {
    const signer = recordingSigner({ delayMs: 25 });
    const [, second] = await Promise.all([
      resolveSignedUrls([coord('x')], signer.sign),
      resolveSignedUrls([coord('x'), coord('y')], signer.sign),
    ]);
    expect(signer.calls).toBe(2);
    expect(signer.asked.flat().sort()).toEqual(['x', 'y']);
    // The joining caller still receives BOTH urls, not just the one it signed.
    expect(second.get(signedUrlKey('b', 'x'))).toBeTruthy();
    expect(second.get(signedUrlKey('b', 'y'))).toBeTruthy();
  });

  it('evicts a pointer the signer omitted so a later caller retries it', async () => {
    const failing = recordingSigner({ omit: ['gone'] });
    const first = await resolveSignedUrls([coord('gone')], failing.sign);
    expect(first.has(signedUrlKey('b', 'gone'))).toBe(false);

    const working = recordingSigner();
    const second = await resolveSignedUrls([coord('gone')], working.sign);
    expect(working.calls).toBe(1);
    expect(second.get(signedUrlKey('b', 'gone'))).toBeTruthy();
  });

  it('does not cache a url that is already inside the refresh skew', async () => {
    const signer = recordingSigner({ ttl: 5 });
    await resolveSignedUrls([coord('soon')], signer.sign);
    await resolveSignedUrls([coord('soon')], signer.sign);
    expect(signer.calls).toBe(2);
  });

  it('a rejected signer resolves to no urls rather than throwing', async () => {
    const out = await resolveSignedUrls([coord('a')], async () => {
      throw new Error('network down');
    });
    expect(out.size).toBe(0);
  });
});
