import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient?.(...args),
}));

import { POST } from "./route";

describe("POST /api/paid-media/timeline/accounts", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalSupabaseUrl: string | undefined;
  let originalAnonKey: string | undefined;
  let originalPublishableKey: string | undefined;

  beforeEach(() => {
    mock.restore();
    originalFetch = globalThis.fetch;
    originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    originalPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = "publishable-key";

    globalThis.fetch = mock() as unknown as typeof fetch;

    const createSupabaseServerClientMock = mock().mockResolvedValue({
      auth: {
        getSession: mock().mockResolvedValue({
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

  it("forwards request to edge function and returns timeline accounts", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          accounts: [{ id: "act_1034406624919675", name: "SMB_PRACTIHOGAR_ARS" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const request = new Request("http://localhost/api/paid-media/timeline/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: "brand-1" }),
    });

    const response = await POST(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("https://example.supabase.co/functions/v1/fetch-timeline-accounts");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer session-token",
      apikey: "publishable-key",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accounts: [{ id: "act_1034406624919675", name: "SMB_PRACTIHOGAR_ARS" }],
    });
  });
});
