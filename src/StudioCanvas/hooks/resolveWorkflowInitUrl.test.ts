import { describe, expect, it } from "bun:test";
import { resolveWorkflowInitUrl } from "./resolveWorkflowInitUrl";

const mockGetApiUrl = (path: string) => `https://studio.continuum.test${path.startsWith("/") ? path : `/${path}`}`;
const mockGetApiUrlWithApiBase = (path: string) =>
  `https://studio.continuum.test/api${path.startsWith("/") ? path : `/${path}`}`;

describe("resolveWorkflowInitUrl", () => {
  it("uses local /api routes in browser when no client API base is configured", () => {
    const url = resolveWorkflowInitUrl({
      path: "/ai-studio/generate",
      hasWindow: true,
      windowOrigin: "https://studio.continuum.test",
      getApiUrl: mockGetApiUrl,
    });

    expect(url).toBe("/api/ai-studio/generate");
  });

  it("keeps direct backend URL on server when no client API base is configured", () => {
    const url = resolveWorkflowInitUrl({
      path: "/ai-studio/generate",
      hasWindow: false,
      getApiUrl: mockGetApiUrl,
    });

    expect(url).toBe("https://studio.continuum.test/ai-studio/generate");
  });

  it("adds /api prefix for same-origin client base without /api namespace", () => {
    const url = resolveWorkflowInitUrl({
      path: "/ai-studio/generate",
      hasWindow: true,
      windowOrigin: "https://studio.continuum.test",
      clientApiBase: "https://studio.continuum.test",
      getApiUrl: mockGetApiUrl,
    });

    expect(url).toBe("https://studio.continuum.test/api/ai-studio/generate");
  });

  it("does not double-prefix when same-origin base already includes /api", () => {
    const url = resolveWorkflowInitUrl({
      path: "/ai-studio/generate",
      hasWindow: true,
      windowOrigin: "https://studio.continuum.test",
      clientApiBase: "https://studio.continuum.test/api",
      getApiUrl: mockGetApiUrlWithApiBase,
    });

    expect(url).toBe("https://studio.continuum.test/api/ai-studio/generate");
  });

  it("does not prefix /api for external API bases", () => {
    const url = resolveWorkflowInitUrl({
      path: "/ai-studio/generate",
      hasWindow: true,
      windowOrigin: "https://studio.continuum.test",
      clientApiBase: "https://api.continuum.test",
      getApiUrl: (path) => `https://api.continuum.test${path.startsWith("/") ? path : `/${path}`}`,
    });

    expect(url).toBe("https://api.continuum.test/ai-studio/generate");
  });
});
