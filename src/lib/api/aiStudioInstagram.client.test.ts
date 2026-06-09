import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { InstagramTopMediaResponse } from "@continuum/contracts";

const requestMock = mock(async (_options: Record<string, unknown>): Promise<InstagramTopMediaResponse> => ({
  account: { username: "nasa", name: "NASA", followersCount: 1 },
  posts: [],
}));

mock.module("@/lib/api/http", () => ({
  http: { request: requestMock },
}));

import { fetchInstagramTopMedia } from "./aiStudioInstagram.client";

describe("fetchInstagramTopMedia", () => {
  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockResolvedValue({ account: { username: "nasa", name: "NASA", followersCount: 1 }, posts: [] });
  });

  it("POSTs the brandId + username to the top-media endpoint with a validating schema", async () => {
    await fetchInstagramTopMedia({ brandId: "b-1", username: "nasa" });

    expect(requestMock).toHaveBeenCalledTimes(1);
    const arg = requestMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.path).toBe("/api/ai-studio/instagram/top-media");
    expect(arg.method).toBe("POST");
    expect(arg.body).toEqual({ brandId: "b-1", username: "nasa" });
    expect(arg.cache).toBe("no-store");
    expect(arg.schema).toBeDefined();
  });

  it("returns the parsed response", async () => {
    const response: InstagramTopMediaResponse = {
      account: { username: "nasa", name: "NASA", followersCount: 100 },
      posts: [
        {
          id: "1",
          shortcode: "SC1",
          permalink: "https://www.instagram.com/p/SC1/",
          kind: "post",
          coverUrl: "https://cdn/a.jpg",
          mediaCount: 1,
          items: [{ kind: "image", url: "https://cdn/a.jpg" }],
        },
      ],
    };
    requestMock.mockResolvedValueOnce(response);
    const result = await fetchInstagramTopMedia({ brandId: "b-1", username: "nasa" });
    expect(result).toEqual(response);
  });

  it("forwards the abort signal", async () => {
    const controller = new AbortController();
    await fetchInstagramTopMedia({ brandId: "b-1", username: "nasa", signal: controller.signal });
    const arg = requestMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.signal).toBe(controller.signal);
  });
});
