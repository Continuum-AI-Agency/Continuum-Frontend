import { describe, expect, it } from "vitest";
import {
  hasDurableAsset,
  resolveDurableImageUrls,
  resolveOrganicImageUrl,
  resolveOrganicImageUrls,
} from "./preview";

describe("resolveOrganicImageUrl", () => {
  it("returns null for empty media", () => {
    expect(resolveOrganicImageUrl(null)).toBeNull();
    expect(resolveOrganicImageUrl(undefined)).toBeNull();
    expect(resolveOrganicImageUrl({})).toBeNull();
  });

  it("surfaces a base64-only asset as a data URL (the 512px mockup case)", () => {
    expect(resolveOrganicImageUrl({ assetBase64: "iVBORw0KG", mimeType: "image/png" })).toBe(
      "data:image/png;base64,iVBORw0KG",
    );
  });

  it("defaults the mime type when absent", () => {
    expect(resolveOrganicImageUrl({ assetBase64: "abc" })).toBe("data:image/png;base64,abc");
  });

  it("passes through an existing data: URL untouched", () => {
    const dataUrl = "data:image/jpeg;base64,zzz";
    expect(resolveOrganicImageUrl({ assetBase64: dataUrl })).toBe(dataUrl);
  });

  it("prefers a hosted URL over base64", () => {
    expect(resolveOrganicImageUrl({ signedUrl: "https://x/a.png", assetBase64: "abc" })).toBe(
      "https://x/a.png",
    );
  });

  it("falls back signedUrl → url → assetUrl", () => {
    expect(resolveOrganicImageUrl({ url: "https://x/b.png" })).toBe("https://x/b.png");
    expect(resolveOrganicImageUrl({ assetUrl: "https://x/c.png" })).toBe("https://x/c.png");
  });
});

describe("resolveOrganicImageUrls", () => {
  it("returns carousel slides ordered by `order`, base64 as data URLs", () => {
    const urls = resolveOrganicImageUrls({
      assets: [
        { assetBase64: "two", mimeType: "image/png", order: 2 },
        { signedUrl: "https://x/one.png", order: 1 },
      ],
    });
    expect(urls).toEqual(["https://x/one.png", "data:image/png;base64,two"]);
  });

  it("falls back to the single top-level asset when no assets[]", () => {
    expect(resolveOrganicImageUrls({ assetBase64: "solo" })).toEqual(["data:image/png;base64,solo"]);
  });

  it("returns [] for empty media", () => {
    expect(resolveOrganicImageUrls(null)).toEqual([]);
  });
});

describe("durable asset resolution (no base64 masking)", () => {
  it("hasDurableAsset is true only for a hosted URL", () => {
    expect(hasDurableAsset({ signedUrl: "https://s/x.png" })).toBe(true);
    expect(hasDurableAsset({ url: "https://s/x.png" })).toBe(true);
    expect(hasDurableAsset({ assetUrl: "https://s/x.png" })).toBe(true);
  });

  it("hasDurableAsset is false for base64-only or empty (not durable)", () => {
    expect(hasDurableAsset({ assetBase64: "AAAA", mimeType: "image/png" })).toBe(false);
    expect(hasDurableAsset({})).toBe(false);
    expect(hasDurableAsset(null)).toBe(false);
  });

  it("resolveDurableImageUrls omits base64-only assets", () => {
    expect(resolveDurableImageUrls({ assetBase64: "AAAA" })).toEqual([]);
    expect(resolveDurableImageUrls({ signedUrl: "https://s/x.png" })).toEqual(["https://s/x.png"]);
    expect(
      resolveDurableImageUrls({
        assets: [
          { signedUrl: "https://s/1.png", order: 0 },
          { assetBase64: "BBBB", order: 1 },
        ],
      }),
    ).toEqual(["https://s/1.png"]);
  });
});
