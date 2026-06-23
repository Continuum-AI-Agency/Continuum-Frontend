import { describe, expect, it } from "bun:test";
import type { MediaSource } from "@continuum/contracts";
import { mediaSourceSchema } from "@continuum/contracts";
import {
  buildLibraryQuery,
  MEDIA_SOURCES,
  SOURCE_FILTERS,
  SOURCE_LABEL,
  toContractKind,
  toContractSource,
} from "../filters";

describe("canonical source vocabulary", () => {
  it("MEDIA_SOURCES covers every contract MediaSource value (no drift)", () => {
    const vocab = new Set(MEDIA_SOURCES.map((s) => s.value));
    for (const value of mediaSourceSchema.options as MediaSource[]) {
      expect(vocab.has(value)).toBe(true);
    }
  });

  it("includes the composited orphan-bucket sources", () => {
    const vocab = MEDIA_SOURCES.map((s) => s.value);
    expect(vocab).toContain("inspiration");
    expect(vocab).toContain("hyperframe");
    expect(vocab).toContain("chat_upload");
  });

  it("SOURCE_FILTERS leads with 'all' then the canonical sources", () => {
    expect(SOURCE_FILTERS[0]).toEqual({ value: "all", label: "All" });
    expect(SOURCE_FILTERS.slice(1)).toEqual(MEDIA_SOURCES);
  });

  it("SOURCE_LABEL has a label for every MediaSource", () => {
    for (const value of mediaSourceSchema.options as MediaSource[]) {
      expect(typeof SOURCE_LABEL[value]).toBe("string");
    }
  });
});

describe("buildLibraryQuery", () => {
  it("includes brandId always", () => {
    const sp = buildLibraryQuery({ brandId: "brand-1" });
    expect(sp.get("brandId")).toBe("brand-1");
  });

  it("omits 'all' source and kind", () => {
    const sp = buildLibraryQuery({ brandId: "b", source: "all", kind: "all" });
    expect(sp.has("source")).toBe(false);
    expect(sp.has("kind")).toBe(false);
  });

  it("sets concrete source and kind", () => {
    const sp = buildLibraryQuery({ brandId: "b", source: "ai_generated", kind: "video" });
    expect(sp.get("source")).toBe("ai_generated");
    expect(sp.get("kind")).toBe("video");
  });

  it("includes collectionId, offset, and limit when provided", () => {
    const sp = buildLibraryQuery({ brandId: "b", collectionId: "c1", offset: 48, limit: 48 });
    expect(sp.get("collectionId")).toBe("c1");
    expect(sp.get("offset")).toBe("48");
    expect(sp.get("limit")).toBe("48");
  });

  it("omits null collectionId and undefined pagination", () => {
    const sp = buildLibraryQuery({ brandId: "b", collectionId: null });
    expect(sp.has("collectionId")).toBe(false);
    expect(sp.has("offset")).toBe(false);
    expect(sp.has("limit")).toBe(false);
  });

  it("includes offset of 0 (number, not falsy-dropped)", () => {
    const sp = buildLibraryQuery({ brandId: "b", offset: 0 });
    expect(sp.get("offset")).toBe("0");
  });
});

describe("toContractSource / toContractKind", () => {
  it("drops 'all' to undefined", () => {
    expect(toContractSource("all")).toBeUndefined();
    expect(toContractKind("all")).toBeUndefined();
  });

  it("passes concrete values through", () => {
    expect(toContractSource("upload")).toBe("upload");
    expect(toContractKind("image")).toBe("image");
  });

  it("returns undefined for null/undefined", () => {
    expect(toContractSource(null)).toBeUndefined();
    expect(toContractKind(undefined)).toBeUndefined();
  });
});
