import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("@/lib/api/config", () => ({
  getApiBaseUrl: () => "http://backend.test",
}));

import { GET } from "./route";

const originalFetch = globalThis.fetch;

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/agents/jaina/chat/runs/run_abc", {
    method: "GET",
    headers,
  });
}

const params = Promise.resolve({ run_id: "run_abc" });

describe("Jaina run status proxy route", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const response = await GET(makeRequest(), { params });
    expect(response.status).toBe(401);
  });

  it("returns 401 when the Authorization header is not a Bearer token", async () => {
    const response = await GET(makeRequest({ authorization: "Basic abc" }), { params });
    expect(response.status).toBe(401);
  });

  it("forwards to the backend and passes a 200 run payload through", async () => {
    const fetchMock = mock(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ run: { run_id: "run_abc", status: "running" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await GET(makeRequest({ authorization: "Bearer tok" }), { params });

    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toBe("http://backend.test/api/agents/jaina/chat/runs/run_abc");
    expect((calledInit.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.run.status).toBe("running");
  });

  it("passes a backend 404 through verbatim (the watchdog treats it as transient)", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ error: "Run not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    ) as unknown as typeof fetch;

    const response = await GET(makeRequest({ authorization: "Bearer tok" }), { params });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Run not found");
  });
});
