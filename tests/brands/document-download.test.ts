import { describe, expect, it } from "bun:test";

import { normalizeBrandDocumentStoragePath } from "@/lib/brands/document-download";

describe("normalizeBrandDocumentStoragePath", () => {
  it("keeps an already-normalized storage path", () => {
    expect(normalizeBrandDocumentStoragePath("brand-1/doc-1/brief.pdf")).toBe(
      "brand-1/doc-1/brief.pdf"
    );
  });

  it("removes the brand-docs bucket prefix", () => {
    expect(normalizeBrandDocumentStoragePath("brand-docs/brand-1/doc-1/brief.pdf")).toBe(
      "brand-1/doc-1/brief.pdf"
    );
  });

  it("extracts storage path from Supabase storage URLs", () => {
    expect(
      normalizeBrandDocumentStoragePath(
        "https://abc.supabase.co/storage/v1/object/sign/brand-docs/brand-1/doc-1/brief.pdf?token=123"
      )
    ).toBe("brand-1/doc-1/brief.pdf");
  });

  it("throws when the path is empty", () => {
    expect(() => normalizeBrandDocumentStoragePath("   ")).toThrow("Storage path is required");
  });
});
