// VENDORED from the monorepo root `test/setup-bun-test.ts`. Do not edit here.
//
// Why a copy and not `../test/setup-bun-test.ts`: Vercel clones Continuum-Frontend
// STANDALONE, so there is no monorepo root above it and that path does not resolve.
// Bun treats a missing preload as a hard error, so the whole suite died before a
// single test ran — `error: preload not found "../test/setup-bun-test.ts"`. Two
// separate cloud sessions independently hit this and had to stub the file by hand
// to get any test to run at all.
//
// Keep in sync with root `test/setup-bun-test.ts`; the root file is the source.
import { setSystemTime, vi } from 'bun:test';

type EnvSnapshot = Record<string, string | undefined>;
type GlobalSnapshot = Record<PropertyKey, PropertyDescriptor | undefined>;

type BunTestCompat = typeof vi & {
  advanceTimersByTime?: (ms: number) => void;
  advanceTimersByTimeAsync?: (ms: number) => Promise<void>;
  hoisted?: <T>(factory: () => T) => T;
  importActual?: <T>(specifier: string) => Promise<T>;
  importMock?: <T>(specifier: string) => Promise<T>;
  mocked?: <T>(item: T) => T;
  resetModules?: () => void;
  runAllTimers?: () => void;
  runAllTimersAsync?: () => Promise<void>;
  runOnlyPendingTimers?: () => void;
  runOnlyPendingTimersAsync?: () => Promise<void>;
  setSystemTime?: typeof setSystemTime;
  stubGlobal?: (key: string, value: unknown) => void;
  stubEnv?: (key: string, value: string) => void;
  unstubAllGlobals?: () => void;
  unstubAllEnvs?: () => void;
};

const compat = vi as BunTestCompat;
const originalMock = compat.mock.bind(compat);
const envSnapshot: EnvSnapshot = {};
const globalSnapshot: GlobalSnapshot = {};

// ---------------------------------------------------------------------------
// Hermetic unit tests
// ---------------------------------------------------------------------------
//
// A unit test that can reach shared infrastructure is not a unit test. These
// caches are read-through: with credentials present the code answers from Redis
// and never reaches the spec's mocked Supabase, so specs pass or fail depending
// on what some other process left in a production cache. It cuts both ways —
// tests that assert an error path go red because a cached value short-circuits
// it, and tests with incomplete Supabase fakes go GREEN because the cache hides
// the query they never stubbed.
//
// Benches and smoke scripts run outside this preload and are unaffected. A spec
// that genuinely needs a live cache opts in with ALLOW_TEST_NETWORK_CACHE=1.
const SHARED_INFRA_ENV = [
  'APP_CACHE_REDIS_URL',
  'APP_CACHE_REDIS_TOKEN',
  'MCP_REDIS_URL',
  'MCP_REDIS_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'REDIS_URL',
];

if (process.env.ALLOW_TEST_NETWORK_CACHE !== '1') {
  for (const key of SHARED_INFRA_ENV) delete process.env[key];
}

// ---------------------------------------------------------------------------
// Why there is no in-process fake-timer watchdog here
// ---------------------------------------------------------------------------
//
// vi.useFakeTimers() freezes EVERY in-process clock: the global setTimeout, the
// one re-exported by node:timers, Bun.sleep — and the one bun's own per-test
// `--timeout` watchdog runs on. All were measured; none survive. So a test that
// wedges while the clock is frozen cannot be preempted from inside the process,
// and `--timeout` is powerless against it.
//
// (Known wedge: `expect(promise).rejects.*` armed while fake timers are active.
// bun settles that matcher on a real timer, so it never resolves. Capture the
// rejection before advancing instead:
//     const settled = promise.catch((e) => e);
//     vi.advanceTimersByTime(ms);
//     expect(await settled).toBeInstanceOf(TimeoutError);
// A meta-spec guards against reintroducing the pattern.)
//
// The watchdog therefore lives OUTSIDE the process: scripts/test-isolated.mjs
// (`bun run test:mcp`) runs one bun process per spec file and SIGKILLs a hung one,
// reporting it as TIMEOUT. That is the only layer whose clock a spec cannot freeze.

compat.mock = ((specifier: string, factory?: unknown) => {
  if (typeof factory !== 'function') {
    return originalMock(specifier, factory as never);
  }

  const importOriginal = async <T>() => import(specifier) as Promise<T>;
  return originalMock(specifier, () =>
    (factory as (importOriginal: typeof importOriginal) => unknown)(importOriginal),
  );
}) as typeof vi.mock;

compat.hoisted ??= <T>(factory: () => T): T => factory();
compat.importActual ??= async <T>(specifier: string): Promise<T> => import(specifier) as Promise<T>;
compat.importMock ??= async <T>(specifier: string): Promise<T> => import(specifier) as Promise<T>;
// vitest's vi.mocked is a type-level helper that returns its argument unchanged at
// runtime; the value is already a Bun mock (created via vi.fn / vi.mock), so identity
// passthrough exposes the .mockImplementation/.mockResolvedValue methods callers use.
compat.mocked ??= <T>(item: T): T => item;
compat.resetModules ??= () => {
  // Bun does not currently expose a module-cache reset hook.
};
compat.setSystemTime ??= setSystemTime;
// Bun (through 1.3.x) implements the SYNCHRONOUS fake-timer API — useFakeTimers,
// advanceTimersByTime, runOnlyPendingTimers, runAllTimers — but none of the async
// variants. Build those on the natives: advance the FAKE clock, then let the promise
// chains the fired callbacks started settle.
//
// Never await a real setTimeout here. useFakeTimers() replaces setTimeout, so a
// fallback that sleeps on it deadlocks the moment a test fakes the clock — the whole
// file hangs before a single test reports.
//
// Where no native exists, fail loudly: a silent no-op makes TTL/expiry tests pass
// without ever advancing the clock.
const failLoudTimerShim = (name: string) => () => {
  throw new Error(
    `vi.${name} is not implemented by this Bun version and the compat shim refuses to fake it; ` +
      'restructure the test with vi.setSystemTime or upgrade Bun',
  );
};

// A timer callback may await (a mocked fetch, a Redis get). Draining a bounded number
// of microtask turns lets those chains resolve before the assertion runs.
const MICROTASK_DRAIN_TURNS = 16;
const drainMicrotasks = async (): Promise<void> => {
  for (let turn = 0; turn < MICROTASK_DRAIN_TURNS; turn += 1) {
    await Promise.resolve();
  }
};

compat.advanceTimersByTime ??= failLoudTimerShim('advanceTimersByTime');
compat.runAllTimers ??= failLoudTimerShim('runAllTimers');
compat.runOnlyPendingTimers ??= failLoudTimerShim('runOnlyPendingTimers');

// Drain BEFORE advancing as well as after. The code under test is usually async, so
// its setTimeout may not be armed yet at the moment the test advances the clock —
// advancing first would step over a timer that gets scheduled a microtask later and
// then never fires. This is what vitest's async timer helpers do, and what makes them
// usable against real async code.
compat.advanceTimersByTimeAsync ??= async (ms: number) => {
  await drainMicrotasks();
  compat.advanceTimersByTime?.(ms);
  await drainMicrotasks();
};
compat.runAllTimersAsync ??= async () => {
  await drainMicrotasks();
  compat.runAllTimers?.();
  await drainMicrotasks();
};
compat.runOnlyPendingTimersAsync ??= async () => {
  await drainMicrotasks();
  compat.runOnlyPendingTimers?.();
  await drainMicrotasks();
};
compat.stubGlobal ??= (key: string, value: unknown) => {
  if (!(key in globalSnapshot)) {
    globalSnapshot[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  }
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
};
compat.unstubAllGlobals ??= () => {
  for (const key of Reflect.ownKeys(globalSnapshot)) {
    const descriptor = globalSnapshot[key];
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      delete (globalThis as Record<PropertyKey, unknown>)[key];
    }
    delete globalSnapshot[key];
  }
};
compat.stubEnv ??= (key: string, value: string) => {
  if (!(key in envSnapshot)) {
    envSnapshot[key] = process.env[key];
  }
  process.env[key] = value;
};
compat.unstubAllEnvs ??= () => {
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
    delete envSnapshot[key];
  }
};
