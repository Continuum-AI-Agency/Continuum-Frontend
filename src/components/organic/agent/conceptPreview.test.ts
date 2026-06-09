import { describe, expect, it } from "bun:test";

import { resolveConceptPreviewUrl } from "./conceptPreview";

describe("resolveConceptPreviewUrl", () => {
  it("returns null for empty or missing preview", () => {
    expect(resolveConceptPreviewUrl(undefined)).toBeNull();
    expect(resolveConceptPreviewUrl(null)).toBeNull();
    expect(resolveConceptPreviewUrl({})).toBeNull();
    expect(resolveConceptPreviewUrl({ imageUrl: "   " })).toBeNull();
  });

  it("passes through http(s), data, and blob URLs unchanged", () => {
    expect(resolveConceptPreviewUrl({ imageUrl: "https://cdn/x.png" })).toBe("https://cdn/x.png");
    expect(resolveConceptPreviewUrl({ imageUrl: "http://cdn/x.png" })).toBe("http://cdn/x.png");
    expect(resolveConceptPreviewUrl({ imageUrl: "data:image/png;base64,abc" })).toBe(
      "data:image/png;base64,abc",
    );
    expect(resolveConceptPreviewUrl({ imageUrl: "blob:nanobanana" })).toBe("blob:nanobanana");
  });

  it("normalizes a bare base64 string into a PNG data URL", () => {
    expect(resolveConceptPreviewUrl({ imageUrl: "iVBORw0KGgoAAAANS" })).toBe(
      "data:image/png;base64,iVBORw0KGgoAAAANS",
    );
  });

  it("falls back to images[0] when imageUrl is absent", () => {
    expect(resolveConceptPreviewUrl({ images: ["https://cdn/1.png", "https://cdn/2.png"] })).toBe(
      "https://cdn/1.png",
    );
  });
});
