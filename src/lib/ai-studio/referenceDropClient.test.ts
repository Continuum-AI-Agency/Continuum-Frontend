import { afterEach, describe, expect, it, mock } from "bun:test";
import { resolveDroppedBase64 } from "./referenceDropClient";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("resolveDroppedBase64", () => {
  it("re-signs and retries library assets when the drag payload URL is expired", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://expired.example/asset.png") {
        return new Response("expired", { status: 403 });
      }
      if (url === "/api/library/sign") {
        return Response.json({ signedUrl: "https://fresh.example/asset.png" });
      }
      if (url === "https://fresh.example/asset.png") {
        return new Response(new Uint8Array([65, 66, 67]), {
          status: 200,
          headers: { "content-length": "3" },
        });
      }
      return new Response("unexpected", { status: 500 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveDroppedBase64(
      {
        kind: "remote",
        bucket: "media-library",
        path: "brand/asset.png",
        publicUrl: "https://expired.example/asset.png",
        mimeType: "image/png",
        assetId: "asset-1",
        brandId: "brand-1",
      },
      1024,
    );

    expect(result.base64).toBe("QUJD");
    expect(result.sourceUrl).toBe("https://fresh.example/asset.png");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
