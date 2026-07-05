import { afterEach, describe, expect, it, mock } from "bun:test";
import type { Redis } from "@upstash/redis";
import { appCacheKeys } from "./keys";

// redis.server.ts imports "server-only"; the focused test runner doesn't apply
// the FE preload that stubs it, so mock it here before loading the module.
mock.module("server-only", () => ({}));
const { __setAppCacheClientForTests, cachedRead, invalidateCachePrefix } = await import(
  "./redis.server"
);

// Fake mirroring Upstash REST: `set` receives a JSON string (cachedRead
// stringifies), `get` auto-deserializes to the object.
function createFakeRedis() {
  const store = new Map<string, string>();
  const get = mock(async <T>(key: string): Promise<T | null> => {
    const raw = store.get(key);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  });
  const set = mock(async (key: string, value: string): Promise<string> => {
    store.set(key, value);
    return "OK";
  });
  const del = mock(async (...keys: string[]): Promise<number> => {
    let n = 0;
    for (const k of keys) if (store.delete(k)) n += 1;
    return n;
  });
  const scan = mock(async (_c: string, opts: { match: string }): Promise<[string, string[]]> => {
    const prefix = opts.match.replace(/\*$/, "");
    return ["0", [...store.keys()].filter((k) => k.startsWith(prefix))];
  });
  const fake = { get, set, del, scan } as unknown as Redis;
  return { fake, store, get, set };
}

afterEach(() => {
  __setAppCacheClientForTests(null);
});

describe("cachedRead", () => {
  it("loads once then serves from cache", async () => {
    const { fake } = createFakeRedis();
    __setAppCacheClientForTests(fake);
    const load = mock(async () => ({ n: 1 }));

    const a = await cachedRead({ key: "k", load });
    const b = await cachedRead({ key: "k", load });

    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache when the loader throws (error not pinned)", async () => {
    const { fake, store } = createFakeRedis();
    __setAppCacheClientForTests(fake);
    const load = mock(async () => {
      throw new Error("rpc failed");
    });

    await expect(cachedRead({ key: "k", load })).rejects.toThrow("rpc failed");
    expect(store.has("k")).toBe(false);
  });

  it("degrades to the loader every call when no client is configured", async () => {
    __setAppCacheClientForTests(null);
    const load = mock(async () => 5);
    expect(await cachedRead({ key: "k", load })).toBe(5);
    expect(await cachedRead({ key: "k", load })).toBe(5);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("falls open to the loader when a redis read throws", async () => {
    const { fake, get } = createFakeRedis();
    get.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    __setAppCacheClientForTests(fake);
    const load = mock(async () => 9);
    expect(await cachedRead({ key: "k", load })).toBe(9);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("invalidateCachePrefix", () => {
  it("clears every member's cached view of a brand, leaving other brands intact", async () => {
    const { fake, store } = createFakeRedis();
    __setAppCacheClientForTests(fake);
    const brand = "brandA";
    await cachedRead({ key: appCacheKeys.brandIntegrations(brand, "user1"), load: async () => 1 });
    await cachedRead({ key: appCacheKeys.brandIntegrations(brand, "user2"), load: async () => 2 });
    await cachedRead({ key: appCacheKeys.brandIntegrations("brandB", "user1"), load: async () => 3 });

    await invalidateCachePrefix(appCacheKeys.brandIntegrationsPrefix(brand));

    expect(store.has(appCacheKeys.brandIntegrations(brand, "user1"))).toBe(false);
    expect(store.has(appCacheKeys.brandIntegrations(brand, "user2"))).toBe(false);
    expect(store.has(appCacheKeys.brandIntegrations("brandB", "user1"))).toBe(true);
  });
});

describe("appCacheKeys leak-proofing", () => {
  it("keys brand integrations per (brand, user) so values never cross members", () => {
    const a = appCacheKeys.brandIntegrations("b1", "u1");
    const b = appCacheKeys.brandIntegrations("b1", "u2");
    expect(a).not.toEqual(b);
    expect(a.startsWith(appCacheKeys.brandIntegrationsPrefix("b1"))).toBe(true);
  });
});
