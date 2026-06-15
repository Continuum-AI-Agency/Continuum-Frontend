// Shared media-library filter vocabulary + query builder. Used by the library
// page filter chips, the useMediaLibrary pagination hook, and the ai-studio
// "Library" tab so every surface speaks the same source/type filter language.

import type { MediaKind, MediaSource } from "@continuum/contracts";

export type SourceFilterValue = MediaSource | "all";
export type KindFilterValue = MediaKind | "all";

export type FilterOption<T extends string> = { value: T; label: string };

// Canonical, ordered creative-source vocabulary — the single source of truth.
// Every library/grabber surface (filter chips, sidebar Browse folders, the
// grabber's source subfolders, badge labels) derives from this list, so adding a
// source (with its contract enum value + migration) lights it up everywhere at
// once. Each value is a delineated folder; the bytes may live in different
// storage buckets but composite into the one media.assets registry.
export const MEDIA_SOURCES: FilterOption<MediaSource>[] = [
  { value: "upload", label: "Uploads" },
  { value: "ai_generated", label: "AI Creations" },
  { value: "canvas", label: "Canvas" },
  { value: "inspiration", label: "Inspiration" },
  { value: "hyperframe", label: "HyperFrames" },
  { value: "chat_upload", label: "Chat Uploads" },
  { value: "clip", label: "Clips" },
  { value: "backfill", label: "Imported" },
];

export const SOURCE_FILTERS: FilterOption<SourceFilterValue>[] = [
  { value: "all", label: "All" },
  ...MEDIA_SOURCES,
];

// Per-source display label keyed by source value. Derived from MEDIA_SOURCES so
// it can never drift out of completeness with the contract enum.
export const SOURCE_LABEL: Record<MediaSource, string> = Object.fromEntries(
  MEDIA_SOURCES.map((s) => [s.value, s.label]),
) as Record<MediaSource, string>;

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
