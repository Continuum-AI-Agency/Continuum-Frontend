import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

const mockCreateSupabaseServerClient = mock(() => Promise.resolve({} as any));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

import { fetchBrandDocuments } from "@/lib/brands/documents";

describe("fetchBrandDocuments", () => {
  beforeEach(() => {
    mockCreateSupabaseServerClient.mockReset();
  });

  it("maps brand document rows to onboarding documents", async () => {
    const rows = [
      {
        id: "doc-1",
        name: " Brand Deck ",
        source: "google-drive",
        status: "ready",
        size: 2048,
        storage_path: "brands/1/deck.pdf",
        external_url: "https://drive.google.com/file/1",
        error_message: null,
        created_at: "2026-02-26T10:00:00.000Z",
      },
      {
        id: "doc-2",
        name: "",
        source: "unknown",
        status: "queued",
        size: -5,
        storage_path: null,
        external_url: null,
        error_message: "  Processing failed  ",
        created_at: "2026-02-26T10:05:00.000Z",
      },
    ];

    const order = mock(() => Promise.resolve({ data: rows, error: null }));
    const query: any = {
      select: mock(() => query),
      eq: mock(() => query),
      order,
    };

    const supabase = {
      schema: mock((_schema: string) => ({
        from: mock((_table: string) => query),
      })),
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);

    const documents = await fetchBrandDocuments("brand-1");

    expect(documents).toEqual([
      {
        id: "doc-1",
        name: " Brand Deck ",
        source: "google-drive",
        createdAt: "2026-02-26T10:00:00.000Z",
        status: "ready",
        size: 2048,
        storagePath: "brands/1/deck.pdf",
        externalUrl: "https://drive.google.com/file/1",
      },
      {
        id: "doc-2",
        name: "Document",
        source: "upload",
        createdAt: "2026-02-26T10:05:00.000Z",
        status: "processing",
        errorMessage: "Processing failed",
      },
    ]);
  });

  it("returns an empty list when query fails", async () => {
    const order = mock(() => Promise.resolve({ data: null, error: new Error("failed") }));
    const query: any = {
      select: mock(() => query),
      eq: mock(() => query),
      order,
    };

    const supabase = {
      schema: mock((_schema: string) => ({
        from: mock((_table: string) => query),
      })),
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    const documents = await fetchBrandDocuments("brand-2");

    expect(documents).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
