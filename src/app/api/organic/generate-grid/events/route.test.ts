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

import { GET } from "./route";

describe("GET /api/organic/generate-grid/events", () => {
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

  it("returns 400 when job_id is missing", async () => {
    const response = await GET(
      new Request("http://localhost/api/organic/generate-grid/events") as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing job_id query parameter",
    });
  });

  it("proxies SSE response shape and forwards stream data", async () => {
    const getApiUrlMock = (
      globalThis as { __testGetApiUrl?: ReturnType<typeof vi.fn> }
    ).__testGetApiUrl as ReturnType<typeof vi.fn>;
    getApiUrlMock.mockReturnValue("https://organic.service/api/organic/generate-grid/events");

    const ssePayload =
      'event: progress\ndata: {"completed":1,"total":2,"message":"working"}\n\n' +
      'event: complete\ndata: {"data":{"weekly_grid":[{"day":"Monday","type":"Post","format":"Reel","tone":"Educational","title_topic":"Trend A","objective":"Awareness","target":"Founders","cta":"Comment below","num_slides":1}]}}\n\n';

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(ssePayload, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    const response = await GET(
      new Request(
        "http://localhost/api/organic/generate-grid/events?job_id=job-123"
      ) as never
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(
      "https://organic.service/api/organic/generate-grid/events?job_id=job-123"
    );
    expect(init.headers).toMatchObject({
      Accept: "text/event-stream",
      Authorization: "Bearer session-token",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    await expect(response.text()).resolves.toContain("event: complete");
  });
});
