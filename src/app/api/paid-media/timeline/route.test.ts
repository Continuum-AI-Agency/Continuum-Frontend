import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient?.(...args),
}));

import { POST } from "./route";

describe("POST /api/paid-media/timeline", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalSupabaseUrl: string | undefined;
  let originalAnonKey: string | undefined;
  let originalPublishableKey: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = globalThis.fetch;
    originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    originalPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = "publishable-key";

    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    const createSupabaseServerClientMock = vi.fn().mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "session-token" } },
          error: null,
        }),
      },
    });

    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient = createSupabaseServerClientMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;

    if (typeof originalSupabaseUrl === "undefined") {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }

    if (typeof originalAnonKey === "undefined") {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    }

    if (typeof originalPublishableKey === "undefined") {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = originalPublishableKey;
    }

    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient = undefined;
  });

  it("forwards request to edge function and returns timeline blocks", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ blocks: [{ id: "block-1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const request = new Request("http://localhost/api/paid-media/timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: "brand-1",
        accountId: "act_123",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-01-31T23:59:59.999Z",
      }),
    });

    const response = await POST(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("https://example.supabase.co/functions/v1/fetch-timeline-blocks");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer session-token",
      apikey: "publishable-key",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ blocks: [{ id: "block-1" }] });
  });

  it("returns 401 when there is no session token", async () => {
    (
      globalThis as {
        __testCreateSupabaseServerClient?: ReturnType<typeof vi.fn>;
      }
    ).__testCreateSupabaseServerClient = vi.fn().mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/paid-media/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: "brand-1",
          accountId: "act_123",
        }),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});
