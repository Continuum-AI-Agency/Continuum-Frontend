import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Bench session recycling.
//
// Every generateLink -> verifyOtp writes an auth.sessions row, a refresh token, a one-time token
// and two audit rows, and benches did that on every run (~350 mints/day on prod, 2026-10-28).
// A run now takes the session an earlier run left behind:
//   1. as-is while its access token has REUSE_MIN_LEFT_MS left and GoTrue still knows it
//      (GET /user, no writes; a bench that signed its session out leaves one GoTrue refuses);
//   2. refreshed with its refresh token under that, so a handout always has REUSE_MIN_LEFT_MS;
//   3. minted only when neither works.
//
// A session is never held by two live callers. Each call leases its own slot (a file) until its
// process exits, so one bench signing out, pinning a brand, or rotating the refresh token in its
// browser never reaches another's session: sessions are recycled across runs, never shared
// within one. A second call for the same email in one process gets the next slot, i.e. its own
// session, exactly as when every call minted.
//
// Files: ~/.cache/continuum-bench-sessions/<project ref>.<sha256(email)>.<slot>.json, mode 0600,
// holding the session JSON auth-js persisted (tokens: never print them).

export interface SessionSource {
  /** Does GoTrue still know this session? A signed-out one is refused. */
  alive(accessToken: string): Promise<boolean>;
  /** Trade the refresh token for a fresh pair (auth-js's persisted JSON); null when it is gone. */
  refresh(refreshToken: string): Promise<string | null>;
  /** generateLink -> verifyOtp (auth-js's persisted JSON): the last resort. */
  mint(): Promise<string>;
}

const SESSION_CACHE_DIR =
  process.env.BENCH_SESSION_CACHE_DIR ?? join(homedir(), '.cache', 'continuum-bench-sessions');
const SESSION_SLOTS = 4;
/** A cached session goes out as-is only with this much access-token life left; else refreshed. */
export const REUSE_MIN_LEFT_MS = 45 * 60_000;
/** A lease this old is abandoned even if its pid is alive again (pid reuse after a reboot). */
const LEASE_STALE_MS = 24 * 60 * 60_000;

/** `<ref>.<sha256(email)>.<slot>.json`; the ref keeps a local stack's session off prod and back. */
export function sessionCachePath(
  supabaseUrl: string,
  email: string,
  slot: number,
  dir = SESSION_CACHE_DIR,
): string {
  const host = new URL(supabaseUrl).host;
  const ref = host.endsWith('.supabase.co') ? host.split('.')[0] : host.replace(/[^\w.-]/g, '_');
  const id = createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 24);
  return join(dir, `${ref}.${id}.${slot}.json`);
}

const leased = new Set<string>();

/** Give back every slot this process holds (runs on exit; a test hook otherwise). */
export function releaseSessionLeases(): void {
  for (const path of leased) rmSync(`${path}.lease`, { force: true });
  leased.clear();
}
process.on('exit', releaseSessionLeases);

function takeLease(path: string, now: () => number): boolean {
  if (leased.has(path)) return false;
  const lease = `${path}.lease`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(lease, String(process.pid), { flag: 'wx', mode: 0o600 });
      leased.add(path);
      return true;
    } catch {
      if (!leaseAbandoned(lease, now)) return false;
      rmSync(lease, { force: true });
    }
  }
  return false;
}

function leaseAbandoned(lease: string, now: () => number): boolean {
  try {
    if (now() - statSync(lease).mtimeMs > LEASE_STALE_MS) return true;
    const pid = Number(readFileSync(lease, 'utf8'));
    if (!(pid > 0)) return true;
    process.kill(pid, 0);
    return false;
  } catch (error) {
    // ESRCH: its process is gone. EPERM: alive, just not ours.
    return (error as NodeJS.ErrnoException).code !== 'EPERM';
  }
}

function expiresAtMs(accessToken: string): number {
  try {
    const payload = accessToken.split('.')[1] ?? '';
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: number;
    };
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Lease a slot for `email` and fill it: the session an earlier run left there when it still
 * works, else a mint. `reused` says the session is not fresh from a mint. With every slot held
 * by a live run it mints uncached, as before the cache existed.
 */
export async function leaseSession(
  supabaseUrl: string,
  email: string,
  source: SessionSource,
  options: { dir?: string; now?: () => number } = {},
): Promise<{ raw: string; reused: boolean }> {
  const dir = options.dir ?? SESSION_CACHE_DIR;
  const now = options.now ?? Date.now;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (let slot = 0; slot < SESSION_SLOTS; slot += 1) {
    const path = sessionCachePath(supabaseUrl, email, slot, dir);
    if (!takeLease(path, now)) continue;
    const reused = await reuse(path, source, now);
    const raw = reused ?? (await source.mint());
    writeFileSync(path, raw, { mode: 0o600 });
    chmodSync(path, 0o600);
    return { raw, reused: reused !== null };
  }
  return { raw: await source.mint(), reused: false };
}

async function reuse(
  path: string,
  source: SessionSource,
  now: () => number,
): Promise<string | null> {
  let raw: string;
  let cached: { access_token?: unknown; refresh_token?: unknown };
  try {
    raw = readFileSync(path, 'utf8');
    cached = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof cached?.access_token !== 'string') return null;
  if (expiresAtMs(cached.access_token) - now() >= REUSE_MIN_LEFT_MS) {
    return (await source.alive(cached.access_token).catch(() => false)) ? raw : null;
  }
  if (typeof cached.refresh_token !== 'string') return null;
  return source.refresh(cached.refresh_token).catch(() => null);
}
