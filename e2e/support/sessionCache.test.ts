import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  leaseSession,
  REUSE_MIN_LEFT_MS,
  releaseSessionLeases,
  type SessionSource,
  sessionCachePath,
} from './sessionCache';

const PROJECT = 'https://abcdefghijklmnopqrst.supabase.co';
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A GoTrue stand-in: one-hour sessions as auth-js persists them, counting each path's cost. */
function setup(behaviour = { alive: true, refreshes: true }) {
  const clock = { now: Date.now() };
  const dir = mkdtempSync(join(tmpdir(), 'bench-sessions-'));
  const calls = { alive: 0, refresh: 0, mint: 0 };
  let issued = 0;
  const issue = () => {
    issued += 1;
    const exp = Math.floor((clock.now + 3_600_000) / 1000);
    return JSON.stringify({
      access_token: `h.${b64({ exp })}.s${issued}`,
      refresh_token: `r${issued}`,
    });
  };
  const source: SessionSource = {
    async alive() {
      calls.alive += 1;
      return behaviour.alive;
    },
    async refresh() {
      calls.refresh += 1;
      return behaviour.refreshes ? issue() : null;
    },
    async mint() {
      calls.mint += 1;
      return issue();
    },
  };
  const lease = () => leaseSession(PROJECT, 'owner@test', source, { dir, now: () => clock.now });
  return { clock, dir, calls, lease };
}

afterEach(releaseSessionLeases);

describe('leaseSession', () => {
  test('a later run gets the session an earlier run left, once GoTrue confirms it is live', async () => {
    const { lease, calls } = setup();
    const first = await lease();
    releaseSessionLeases(); // the first run's process exits
    const second = await lease();
    expect(first.reused).toBe(false);
    expect(second).toEqual({ raw: first.raw, reused: true });
    expect(calls).toEqual({ mint: 1, alive: 1, refresh: 0 });
  });

  test('two live callers never share a session', async () => {
    const { lease, calls } = setup();
    const [a, b] = await Promise.all([lease(), lease()]);
    expect(a.raw).not.toBe(b.raw);
    expect(calls.mint).toBe(2);
  });

  test('a session its last run signed out is replaced by a mint', async () => {
    const { lease, calls } = setup({ alive: false, refreshes: false });
    await lease();
    releaseSessionLeases();
    expect((await lease()).reused).toBe(false);
    expect(calls).toEqual({ mint: 2, alive: 1, refresh: 0 });
  });

  test('under the reuse margin it is refreshed, and a refused refresh falls back to a mint', async () => {
    const { lease, calls, clock } = setup();
    const first = await lease();
    releaseSessionLeases();
    clock.now += 3_600_000 - REUSE_MIN_LEFT_MS + 1;
    const second = await lease();
    expect(second.reused).toBe(true);
    expect(second.raw).not.toBe(first.raw);
    expect(calls).toEqual({ mint: 1, alive: 0, refresh: 1 });

    const refused = setup({ alive: true, refreshes: false });
    await refused.lease();
    releaseSessionLeases();
    refused.clock.now += 3_600_000;
    expect((await refused.lease()).reused).toBe(false);
    expect(refused.calls).toEqual({ mint: 2, alive: 0, refresh: 1 });
  });

  test('a slot leased by a live process is skipped; an abandoned lease is taken over', async () => {
    const { lease, dir } = setup();
    const slot = (n: number) => sessionCachePath(PROJECT, 'owner@test', n, dir);
    writeFileSync(`${slot(0)}.lease`, String(process.pid)); // alive, but not this module's lease
    writeFileSync(`${slot(1)}.lease`, '99999999'); // no such process
    await lease();
    expect(existsSync(slot(0))).toBe(false);
    expect(existsSync(slot(1))).toBe(true);
  });

  test('with every slot held by a live run it mints uncached', async () => {
    const { lease, dir, calls } = setup();
    const slots = [0, 1, 2, 3].map((n) => sessionCachePath(PROJECT, 'owner@test', n, dir));
    for (const path of slots) writeFileSync(`${path}.lease`, String(process.pid));
    expect((await lease()).reused).toBe(false);
    expect(calls.mint).toBe(1);
    expect(slots.some((path) => existsSync(path))).toBe(false);
  });

  test('the cache file is 0600 and keyed by project ref and email', async () => {
    const { lease, dir } = setup();
    await lease();
    const path = sessionCachePath(PROJECT, 'owner@test', 0, dir);
    expect(statSync(path).mode.toString(8).slice(-3)).toBe('600');
    expect(path).toContain('abcdefghijklmnopqrst.');
    expect(sessionCachePath(PROJECT, 'Owner@Test ', 0, dir)).toBe(path);
    expect(sessionCachePath(PROJECT, 'other@test', 0, dir)).not.toBe(path);
    expect(sessionCachePath('http://127.0.0.1:54321', 'owner@test', 0, dir)).not.toBe(path);
  });
});
