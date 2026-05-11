import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  computePreviewInputHash,
  fetchPreviewLatest,
  fetchPreviewSnapshot,
  PreviewRateLimitedError,
  resumeOnboardingPreview,
  runOnboardingPreview,
  type OnboardingPreviewEvent,
} from "@/lib/onboarding/agentClient";

const ENV_KEYS = [
  "NEXT_PUBLIC_AGENTS_TS_BASE_URL",
  "AGENTS_TS_BASE_URL",
  "NEXT_PUBLIC_AGENT_PUBLIC_URL",
];

function setBaseUrl(url: string) {
  for (const key of ENV_KEYS) {
    process.env[key] = url;
  }
}

function clearBaseUrl() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

function makeStreamResponse(chunks: string[], headers?: Record<string, string>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream", ...(headers ?? {}) },
  });
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function sse(payload: Record<string, unknown>, sequence?: number): string {
  const idLine = sequence !== undefined ? `id: ${sequence}\n` : "";
  return `${idLine}data: ${JSON.stringify(payload)}\n\n`;
}

const minimalPayload = {
  brandProfile: { id: "brand-1", brand_name: "Acme", website_url: "https://acme.com" },
  runContext: {
    user_id: "user-1",
    brand_id: "brand-1",
    brand_name: "Acme",
    created_at: "2026-05-10T00:00:00.000Z",
    platform_urls: ["https://acme.com"],
    integrated_platforms: [] as string[],
    brand_voice_tags: [] as string[],
    integration_account_ids: [] as string[],
  },
  scrape: null,
};

describe("runOnboardingPreview SSE parser", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    setBaseUrl("https://agents.example.com");
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      (async () => makeStreamResponse([])) as unknown as typeof fetch
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    clearBaseUrl();
  });

  it("dispatches voice + complete events from a well-formed stream", async () => {
    fetchSpy.mockImplementationOnce(async () =>
      makeStreamResponse([
        sse({ kind: "data", section: "voice", data: { tone: "Bold" } }, 1),
        sse({ kind: "complete", phase: "preview", status: "ok" }, 2),
      ])
    );

    const events: OnboardingPreviewEvent[] = [];
    const sequences: number[] = [];
    await runOnboardingPreview({
      payload: minimalPayload,
      onEvent: (event: OnboardingPreviewEvent) => {
        events.push(event);
      },
      onSequence: (n: number) => {
        sequences.push(n);
      },
    });

    expect(events.some((e) => e.type === "voice")).toBe(true);
    expect(events.some((e) => e.type === "complete")).toBe(true);
    expect(sequences).toEqual([1, 2]);
  });

  it("captures X-Preview-Run-Id header and surfaces it via onRunId + return", async () => {
    fetchSpy.mockImplementationOnce(async () =>
      makeStreamResponse(
        [sse({ kind: "complete", phase: "preview", status: "ok" })],
        { "x-preview-run-id": "run-abc" }
      )
    );
    const observed: { runId: string | null } = { runId: null };
    const result = await runOnboardingPreview({
      payload: minimalPayload,
      onEvent: () => {},
      onRunId: (id: string | null) => {
        observed.runId = id;
      },
    });
    expect(observed.runId).toBe("run-abc");
    expect(result.runId).toBe("run-abc");
  });

  it("does NOT send X-Idempotency-Key (input-hash dedup is server-side)", async () => {
    fetchSpy.mockImplementationOnce(async () =>
      makeStreamResponse([sse({ kind: "complete", phase: "preview", status: "ok" })])
    );

    await runOnboardingPreview({ payload: minimalPayload, onEvent: () => {} });

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.["X-Idempotency-Key"]).toBeUndefined();
    expect(headers?.["X-Onboarding-UX"]).toBe("rich");
  });

  it("throws PreviewRateLimitedError on 429 with Retry-After", async () => {
    fetchSpy.mockImplementationOnce(
      async () =>
        new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "12" },
        })
    );
    try {
      await runOnboardingPreview({ payload: minimalPayload, onEvent: () => {} });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PreviewRateLimitedError);
      expect((error as PreviewRateLimitedError).retryAfterSeconds).toBe(12);
    }
  });

  it("logs a warning for unknown SSE event kinds without throwing", async () => {
    fetchSpy.mockImplementationOnce(async () =>
      makeStreamResponse([
        sse({ kind: "telemetry_unknown_v9", payload: { hello: "world" } }),
        sse({ kind: "complete", phase: "preview", status: "ok" }),
      ])
    );

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      await runOnboardingPreview({ payload: minimalPayload, onEvent: () => {} });
      const calls = warnSpy.mock.calls.map((args) => String(args[0] ?? ""));
      expect(calls.some((msg) => msg.includes("Unknown SSE event kind"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("throws when complete.status is not in the terminal-ok set", async () => {
    fetchSpy.mockImplementationOnce(async () =>
      makeStreamResponse([
        sse({ kind: "data", section: "voice", data: { tone: "Bold" } }),
        sse({ kind: "complete", phase: "preview", status: "partial" }),
      ])
    );

    await expect(
      runOnboardingPreview({ payload: minimalPayload, onEvent: () => {} })
    ).rejects.toThrow(/did not finish cleanly/i);
  });
});

describe("resumeOnboardingPreview", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    setBaseUrl("https://agents.example.com");
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      (async () => makeStreamResponse([])) as unknown as typeof fetch
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    clearBaseUrl();
  });

  it("GETs /events with Last-Event-ID when lastEventId > 0", async () => {
    fetchSpy.mockImplementationOnce(async () =>
      makeStreamResponse([sse({ kind: "complete", phase: "preview", status: "ok" })])
    );

    await resumeOnboardingPreview("run-abc", { lastEventId: 7, onEvent: () => {} });

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toContain("/onboarding/brand-profiles/preview/run-abc/events");
    const headers = (init as RequestInit | undefined)?.headers as Record<string, string> | undefined;
    expect(headers?.["Last-Event-ID"]).toBe("7");
    expect(headers?.["X-Onboarding-UX"]).toBe("rich");
  });

  it("omits Last-Event-ID when 0 or unset", async () => {
    fetchSpy.mockImplementationOnce(async () =>
      makeStreamResponse([sse({ kind: "complete", phase: "preview", status: "ok" })])
    );
    await resumeOnboardingPreview("run-abc", { onEvent: () => {} });
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.["Last-Event-ID"]).toBeUndefined();
  });

  it("throws on 404", async () => {
    fetchSpy.mockImplementationOnce(async () => new Response("not found", { status: 404 }));
    await expect(resumeOnboardingPreview("missing", { onEvent: () => {} })).rejects.toThrow(/not found/i);
  });
});

describe("fetchPreviewLatest + fetchPreviewSnapshot", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    setBaseUrl("https://agents.example.com");
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      (async () => jsonResponse({})) as unknown as typeof fetch
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    clearBaseUrl();
  });

  it("fetchPreviewLatest returns null on 404", async () => {
    fetchSpy.mockImplementationOnce(async () => new Response("nope", { status: 404 }));
    const result = await fetchPreviewLatest("brand-1");
    expect(result).toBeNull();
  });

  it("fetchPreviewLatest parses the discovery payload", async () => {
    fetchSpy.mockImplementationOnce(async () =>
      jsonResponse({
        run_id: "run-abc",
        brand_id: "brand-1",
        status: "completed",
        prompt_version: 1,
        started_at: "2026-05-10T00:00:00.000Z",
        completed_at: "2026-05-10T00:01:00.000Z",
        input_hash: "abc123",
      })
    );
    const result = await fetchPreviewLatest("brand-1");
    expect(result?.run_id).toBe("run-abc");
    expect(result?.status).toBe("completed");
    expect(result?.input_hash).toBe("abc123");
  });

  it("fetchPreviewSnapshot includes ?events=true when requested", async () => {
    fetchSpy.mockImplementationOnce(async () =>
      jsonResponse({
        run_id: "run-abc",
        brand_id: "brand-1",
        status: "completed",
        prompt_version: 1,
        started_at: "2026-05-10T00:00:00.000Z",
        completed_at: "2026-05-10T00:01:00.000Z",
        result: null,
      })
    );
    await fetchPreviewSnapshot("run-abc", { events: true });
    const url = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(url).toMatch(/\/preview\/run-abc\?events=true$/);
  });
});

describe("computePreviewInputHash", () => {
  it("is deterministic across key order", async () => {
    const a = await computePreviewInputHash({
      payload: {
        brandProfile: { id: "b", brand_name: "Acme" },
        runContext: {
          user_id: "u",
          brand_id: "b",
          brand_name: "Acme",
          created_at: "2026-05-10T00:00:00.000Z",
          platform_urls: [],
          integrated_platforms: [],
          brand_voice_tags: [],
          integration_account_ids: [],
        },
        scrape: null,
      },
    });
    const b = await computePreviewInputHash({
      payload: {
        runContext: {
          integration_account_ids: [],
          brand_voice_tags: [],
          integrated_platforms: [],
          platform_urls: [],
          created_at: "2026-05-10T00:00:00.000Z",
          brand_name: "Acme",
          brand_id: "b",
          user_id: "u",
        },
        brandProfile: { brand_name: "Acme", id: "b" },
        scrape: null,
      },
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when prompt_version bumps", async () => {
    const a = await computePreviewInputHash({
      payload: { brandProfile: { id: "b", brand_name: "Acme" }, runContext: {} as never, scrape: null },
      promptVersion: 1,
    });
    const b = await computePreviewInputHash({
      payload: { brandProfile: { id: "b", brand_name: "Acme" }, runContext: {} as never, scrape: null },
      promptVersion: 2,
    });
    expect(a).not.toBe(b);
  });
});
