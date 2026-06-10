import { describe, expect, it } from "bun:test";

import {
  DOCUMENT_CATEGORY_DEFAULT,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_CATEGORY_VALUES,
  documentCategorySchema,
  toDocumentCategory,
} from "./category";

describe("documentCategorySchema", () => {
  it("accepts each Core-5 category", () => {
    for (const value of DOCUMENT_CATEGORY_VALUES) {
      expect(documentCategorySchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects an unknown category", () => {
    expect(documentCategorySchema.safeParse("legal").success).toBe(false);
  });

  it("defaults to misc", () => {
    expect(DOCUMENT_CATEGORY_DEFAULT).toBe("misc");
  });

  it("has a human label for every category", () => {
    for (const value of DOCUMENT_CATEGORY_VALUES) {
      expect(DOCUMENT_CATEGORY_LABELS[value].length).toBeGreaterThan(0);
    }
  });
});

describe("toDocumentCategory", () => {
  it("passes through a valid category", () => {
    expect(toDocumentCategory("brand_guidelines")).toBe("brand_guidelines");
  });

  it("falls back to the default for null/unknown", () => {
    expect(toDocumentCategory(null)).toBe("misc");
    expect(toDocumentCategory("scribble")).toBe("misc");
    expect(toDocumentCategory(undefined)).toBe("misc");
  });
});
