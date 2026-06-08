import { beforeEach, describe, expect, it, mock } from "bun:test";

const requestMock = mock(() => Promise.resolve({}));

mock.module("@/lib/api/http", () => ({
  http: {
    request: requestMock,
  },
}));

import { unfurlMediaFromUrl } from "@/lib/api/aiStudioUnfurl.client";

describe("aiStudioUnfurl.client", () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it("POSTs the url to the unfurl endpoint and returns the typed response", async () => {
    const response = {
      source: { requestedUrl: "https://www.linkedin.com/posts/x", via: "direct" },
      items: [{ kind: "image", url: "https://cdn.example.com/a.jpg" }],
      partial: false,
    };
    requestMock.mockResolvedValue(response);

    const result = await unfurlMediaFromUrl("https://www.linkedin.com/posts/x");

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/ai-studio/unfurl",
        method: "POST",
        body: { url: "https://www.linkedin.com/posts/x" },
      }),
    );
    expect(result).toEqual(response);
  });

  it("passes a response schema for boundary validation", async () => {
    requestMock.mockResolvedValue({
      source: { requestedUrl: "https://x", via: "direct" },
      items: [],
      partial: false,
    });

    await unfurlMediaFromUrl("https://x");

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ schema: expect.anything() }),
    );
  });
});
