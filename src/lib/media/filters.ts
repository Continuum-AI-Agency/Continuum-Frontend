// Shared media-library filter vocabulary + query builder. Used by the library
// page filter chips, the useMediaLibrary pagination hook, and the ai-studio
// "Library" tab so every surface speaks the same source/type filter language.

import type { MediaKind, MediaSource } from "@continuum/contracts";

export type SourceFilterValue = MediaSource | "all";
export type KindFilterValue = MediaKind | "all";

export type FilterOption<T extends string> = { value: T; label: string };

export const SOURCE_FILTERS: FilterOption<SourceFilterValue>[] = [
  { value: "all", label: "All" },
  { value: "upload", label: "Uploads" },
  { value: "ai_generated", label: "AI Creations" },
  { value: "canvas", label: "Canvas" },
  { value: "backfill", label: "Imported" },
];

export const KIND_FILTERS: FilterOption<KindFilterValue>[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
];

export type LibraryQueryInput = {
  brandId: string;
  collectionId?: string | null;
  source?: SourceFilterValue | null;
  kind?: KindFilterValue | null;
  offset?: number;
  limit?: number;
};

// Build the query string for GET /api/library/assets. "all"/empty filters are
// omitted so the endpoint treats them as unset (no .eq applied server-side).
export function buildLibraryQuery(input: LibraryQueryInput): URLSearchParams {
  const params = new URLSearchParams({ brandId: input.brandId });
  if (input.collectionId) params.set("collectionId", input.collectionId);
  if (input.source && input.source !== "all") params.set("source", input.source);
  if (input.kind && input.kind !== "all") params.set("kind", input.kind);
  if (typeof input.offset === "number") params.set("offset", String(input.offset));
  if (typeof input.limit === "number") params.set("limit", String(input.limit));
  return params;
}

// Narrow a chip value to the contract source/kind (drops "all"). Used when
// threading filters into the search request body.
export function toContractSource(value?: SourceFilterValue | null): MediaSource | undefined {
  return value && value !== "all" ? value : undefined;
}

export function toContractKind(value?: KindFilterValue | null): MediaKind | undefined {
  return value && value !== "all" ? value : undefined;
}
