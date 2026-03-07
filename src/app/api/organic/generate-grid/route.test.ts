import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    (globalThis as { __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown })
      .__testCreateSupabaseServerClient?.(...args),
}));

vi.mock("@/lib/api/config", () => ({
  getApiUrl: (...args: unknown[]) =>
    (globalThis as { __testGetApiUrl?: (...params: unknown[]) => unknown })
      .__testGetApiUrl?.(...args),
}));

import { POST } from "./route";

describe("POST /api/organic/generate-grid", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    const createSupabaseServerClientMock = vi.fn().mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "session-token" } },
          error: null,
        }),
      },
    });
    const getApiUrlMock = vi.fn();

    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
        __testGetApiUrl?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient = createSupabaseServerClientMock;
    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
        __testGetApiUrl?: (...params: unknown[]) => unknown;
      }
    ).__testGetApiUrl = getApiUrlMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
        __testGetApiUrl?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient = undefined;
    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
        __testGetApiUrl?: (...params: unknown[]) => unknown;
      }
    ).__testGetApiUrl = undefined;
  });

  it("transforms camelCase request payload and maps job response shape", async () => {
    const getApiUrlMock = (
      globalThis as { __testGetApiUrl?: ReturnType<typeof vi.fn> }
    ).__testGetApiUrl as ReturnType<typeof vi.fn>;
    getApiUrlMock.mockReturnValue("https://organic.service/api/organic/generate-grid");

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          job_id: "job-123",
          channel: "organic-grid:job-123",
          status: "queued",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const requestBody = {
      platformAccountIds: {
        instagram: "ig-1",
        facebook: "fb-1",
        linkedin: "li-1",
        tiktok: "tt-1",
        youtube: "yt-1",
      },
      language: "English",
      userPrompt: "Plan this week's content",
      generationPrompt: "Prioritize product launches",
      selectedTrendIds: ["trend-1", "trend-2"],
      prompt: {
        id: "calendar-weekly-mvp",
        name: "Calendar Weekly MVP",
        description: "Generate weekly plan",
        content: "Generate weekly posts",
        source: "preset",
      },
    };

    const response = await POST(
      new Request("http://localhost/api/organic/generate-grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }) as never
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://organic.service/api/organic/generate-grid");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer session-token",
    });

    const forwarded = JSON.parse(String(init.body));
    expect(forwarded).toEqual({
      platform_account_ids: requestBody.platformAccountIds,
      language: requestBody.language,
      user_prompt: requestBody.userPrompt,
      generation_prompt: requestBody.generationPrompt,
      selected_trend_ids: requestBody.selectedTrendIds,
      prompt: {
        id: requestBody.prompt.id,
        name: requestBody.prompt.name,
        description: requestBody.prompt.description,
        content: requestBody.prompt.content,
        source: requestBody.prompt.source,
      },
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      jobId: "job-123",
      channel: "organic-grid:job-123",
      status: "queued",
    });
  });

  it("streams calendar payloads and forwards flattened placement data", async () => {
    const getApiUrlMock = (
      globalThis as { __testGetApiUrl?: ReturnType<typeof vi.fn> }
    ).__testGetApiUrl as ReturnType<typeof vi.fn>;
    getApiUrlMock.mockReturnValue("https://organic.service/api/organic/generate-calendar");

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response('{"type":"complete"}\n', {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      })
    );

    const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const requestBody = {
      brandProfileId: "brand_123",
      weekStart: "2026-02-23",
      timezone: "America/New_York",
      placements: [
        {
          placementId: "seed-2026-02-23-trend-42",
          schedule: {
            dayId: "2026-02-23",
            scheduledAt: "2026-02-23T14:00:00.000Z",
            timeLabel: "9:00 AM",
          },
          platform: {
            name: "instagram",
            accountId: "acct_instagram_1",
          },
          seed: {
            source: "trend",
            trendId: "trend-42",
          },
          content: {
            format: "carousel",
          },
          metadata: {
            priority: "high",
          },
        },
      ],
      platformAccountIds: {
        instagram: "acct_instagram_1",
        linkedin: "acct_linkedin_1",
      },
      options: {
        schedulePreset: "beta-launch",
        includeNewsletter: true,
        newsletterDayId: "2026-02-25",
        guidancePrompt: "Prioritize product education",
        language: "English",
        preferredPlatforms: ["instagram", "linkedin"],
      },
    };

    try {
      const response = await POST(
        new Request("http://localhost/api/organic/generate-grid", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/x-ndjson",
          },
          body: JSON.stringify(requestBody),
        }) as never
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://organic.service/api/organic/generate-calendar");
      expect(init.headers).toMatchObject({
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
        Authorization: "Bearer session-token",
        apikey: "anon-key",
        "x-supabase-auth": "session-token",
        "x-auth-token": "session-token",
        "X-Brand-Profile-Id": "brand_123",
      });

      const forwarded = JSON.parse(String(init.body));
      expect(forwarded).toEqual({
        brandProfileId: "brand_123",
        weekStart: "2026-02-23",
        timezone: "America/New_York",
        platformAccountIds: {
          instagram: "acct_instagram_1",
          linkedin: "acct_linkedin_1",
        },
        placements: [
          {
            timeLabel: "9:00 AM",
            platform: "instagram",
            accountId: "acct_instagram_1",
            seedSource: "trend",
            desiredFormat: "carousel",
            metadata: {
              priority: "high",
            },
          },
        ],
        options: {
          schedulePreset: "beta-launch",
          includeNewsletter: true,
          newsletterDayId: "2026-02-25",
          guidancePrompt: "Prioritize product education",
          language: "English",
          preferredPlatforms: ["instagram", "linkedin"],
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
      await expect(response.text()).resolves.toBe('{"type":"complete"}\n');
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    }
  });
});
