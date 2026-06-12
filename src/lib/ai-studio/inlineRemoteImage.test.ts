import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { inlineRemoteImage } from "./inlineRemoteImage";

describe("inlineRemoteImage", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts the url to the inline-media route and returns the data url + mime type", async () => {
    const fetchMock = mock().mockResolvedValue({
      ok: true,
      json: async () => ({
        dataUrl: "data:image/jpeg;base64,abc",
        mimeType: "image/jpeg",
        byteLength: 3,
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await inlineRemoteImage("https://scontent.cdninstagram.com/x.jpg");

    expect(result).toEqual({ dataUrl: "data:image/jpeg;base64,abc", mimeType: "image/jpeg" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ai-studio/instagram/inline-media");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      url: "https://scontent.cdninstagram.com/x.jpg",
    });
  });

  it("throws a meaningful error when the response is not ok", async () => {
    globalThis.fetch = mock().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: "Upstream fetch failed" }),
    }) as unknown as typeof fetch;

    await expect(
      inlineRemoteImage("https://scontent.cdninstagram.com/x.jpg"),
    ).rejects.toThrow("Upstream fetch failed");
  });
});
