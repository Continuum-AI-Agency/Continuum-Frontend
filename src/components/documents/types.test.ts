import { describe, expect, it } from "bun:test";

import { categoryLabel, documentCategoryOf, filterDocumentsByCategory } from "./types";
import type { DocumentView } from "./types";

function makeDoc(overrides: Partial<DocumentView> = {}): DocumentView {
  return {
    id: overrides.id ?? "doc-1",
    name: overrides.name ?? "file.pdf",
    source: "upload",
    createdAt: "2026-06-10T00:00:00.000Z",
    status: "ready",
    ...overrides,
  };
}

describe("documentCategoryOf", () => {
  it("returns the document's category when set", () => {
    expect(documentCategoryOf(makeDoc({ category: "brand_guidelines" }))).toBe("brand_guidelines");
  });

  it("defaults to misc when category is absent", () => {
    expect(documentCategoryOf(makeDoc())).toBe("misc");
  });
});

describe("categoryLabel", () => {
  it("maps a category to its human label", () => {
    expect(categoryLabel("creative_strategy")).toBe("Creative strategy");
    expect(categoryLabel("misc")).toBe("Misc");
  });
});

describe("filterDocumentsByCategory", () => {
  const docs: DocumentView[] = [
    makeDoc({ id: "a", category: "brand_guidelines" }),
    makeDoc({ id: "b", category: "creative_strategy" }),
    makeDoc({ id: "c" }), // no category -> misc
  ];

  it("returns all documents when filter is 'all'", () => {
    expect(filterDocumentsByCategory(docs, "all")).toHaveLength(3);
  });

  it("keeps only documents matching the selected category", () => {
    const result = filterDocumentsByCategory(docs, "brand_guidelines");
    expect(result.map((d) => d.id)).toEqual(["a"]);
  });

  it("treats uncategorized documents as misc", () => {
    const result = filterDocumentsByCategory(docs, "misc");
    expect(result.map((d) => d.id)).toEqual(["c"]);
  });
});
