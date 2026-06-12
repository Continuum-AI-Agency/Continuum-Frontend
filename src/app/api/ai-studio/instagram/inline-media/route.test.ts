import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { POST } from "./route";

const ALLOWED_URL = "https://scontent-lax3-1.cdninstagram.com/v/photo.jpg";

function makeRequest(body: unknown): never {
  return new Request("http://localhost/api/ai-studio/instagram/inline-media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

function upstreamResponse(options: {
  ok?: boolean;
  status?: number;
  contentType?: string | null;
  contentLength?: string | null;
  bytes?: number[];
}) {
  const headers = new Map<string, string>();
  if (options.contentType) headers.set("content-type", options.contentType);
  if (options.contentLength) headers.set("content-length", options.contentLength);
  const bytes = options.bytes ?? [1, 2, 3];
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null },
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  };
}

describe("POST /api/ai-studio/instagram/inline-media", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects a missing url with 400 and never fetches", async () => {
    const fetchMock = mock();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("rejects a non-allowlisted host with 400 (SSRF guard) and never fetches", async () => {
    const fetchMock = mock();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await POST(makeRequest({ url: "https://evil.example.com/x.jpg" }));

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("rejects a non-https url with 400", async () => {
    const fetchMock = mock();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await POST(
      makeRequest({ url: "http://scontent-lax3-1.cdninstagram.com/x.jpg" }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("returns 415 when the upstream content-type is not an image", async () => {
    globalThis.fetch = mock().mockResolvedValue(
      upstreamResponse({ contentType: "text/html" }),
    ) as unknown as typeof fetch;

    const response = await POST(makeRequest({ url: ALLOWED_URL }));

    expect(response.status).toBe(415);
  });

  it("accepts an image at the 100 MiB cap", async () => {
    globalThis.fetch = mock().mockResolvedValue(
      upstreamResponse({ contentType: "image/jpeg", contentLength: String(100 * 1024 * 1024) }),
    ) as unknown as typeof fetch;

    const response = await POST(makeRequest({ url: ALLOWED_URL }));

    expect(response.status).toBe(200);
  });

  it("returns 413 when the content-length exceeds the image cap", async () => {
    globalThis.fetch = mock().mockResolvedValue(
      upstreamResponse({ contentType: "image/jpeg", contentLength: String(100 * 1024 * 1024 + 1) }),
    ) as unknown as typeof fetch;

    const response = await POST(makeRequest({ url: ALLOWED_URL }));

    expect(response.status).toBe(413);
  });

  it("refuses redirect responses and requests manual redirect handling (SSRF guard)", async () => {
    const fetchMock = mock().mockResolvedValue(
      upstreamResponse({ ok: false, status: 302, contentType: "text/html" }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await POST(makeRequest({ url: ALLOWED_URL }));

    expect(response.status).toBe(400);
    const init = (fetchMock.mock.calls[0] as [string, RequestInit?])[1];
    expect(init?.redirect).toBe("manual");
  });

  it("returns 502 when the upstream fetch is not ok", async () => {
    globalThis.fetch = mock().mockResolvedValue(
      upstreamResponse({ ok: false, status: 404, contentType: "image/jpeg" }),
    ) as unknown as typeof fetch;

    const response = await POST(makeRequest({ url: ALLOWED_URL }));

    expect(response.status).toBe(502);
  });

  it("returns a base64 data url on success", async () => {
    const fetchMock = mock().mockResolvedValue(
      upstreamResponse({ contentType: "image/jpeg", bytes: [1, 2, 3] }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await POST(makeRequest({ url: ALLOWED_URL }));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      dataUrl: string;
      mimeType: string;
      byteLength: number;
    };
    expect(payload.mimeType).toBe("image/jpeg");
    expect(payload.byteLength).toBe(3);
    expect(payload.dataUrl).toBe("data:image/jpeg;base64,AQID");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(ALLOWED_URL);
  });
});
