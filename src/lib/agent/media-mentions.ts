// Media-library context grabbing for the organic agent's @-mention menu.
//
// Surfaces the unified media library (media.assets) as nested mention
// subfolders — source folders (All / Uploads / AI creations / Canvas) plus the
// brand's smart and manual collections — so a creative can be grabbed as agent
// context the same way it is browsed in the Library. The pure mappers/builders
// are unit-tested; the fetch helpers speak to the same /api/library endpoints
// the Library page uses.

import type {
  AgentMentionReference,
  MediaAsset,
  MediaCollection,
  MediaSearchResultItem,
} from "@continuum/contracts";
import type { AgentMentionSuggestion } from "@/lib/agent-references";
import {
  buildLibraryQuery,
  toContractSource,
  type SourceFilterValue,
} from "@/lib/media/filters";

const MEDIA_GROUP = "Media library";
const MIN_SEMANTIC_QUERY = 2;

export type MediaSourceFolder = { value: SourceFilterValue; label: string };

// The browsable source folders shown when the user opens "Media library" with
// no query. Mirrors the Library sidebar's Browse group ("backfill" is folded
// into All media — it has no first-class folder there either).
export const MEDIA_SOURCE_FOLDERS: MediaSourceFolder[] = [
  { value: "all", label: "All media" },
  { value: "upload", label: "Uploads" },
  { value: "ai_generated", label: "AI creations" },
  { value: "canvas", label: "Canvas" },
];

export const MEDIA_SOURCE_FOLDER_PREFIX = "media-source:";
export const MEDIA_COLLECTION_FOLDER_PREFIX = "media-collection:";

export function mediaAssetToMentionSuggestion(asset: MediaAsset): AgentMentionSuggestion {
  const label = asset.title ?? asset.storagePath.split("/").pop() ?? asset.id;
  const reference: AgentMentionReference = {
    id: asset.id,
    type: "media_asset",
    label,
    source: "organic",
    metadata: {
      assetId: asset.id,
      kind: asset.kind,
      title: asset.title,
      description: asset.description,
      tags: asset.tags,
      mimeType: asset.mimeType,
      source: asset.source,
    },
  };
  return {
    key: `media:${asset.id}`,
    label,
    type: "media_asset",
    source: "organic",
    group: MEDIA_GROUP,
    description: [asset.kind, asset.description].filter(Boolean).join(" · "),
    badge: asset.kind,
    reference,
    preview: {
      url: asset.signedUrl ?? asset.thumbnailUrl,
      kind: asset.kind,
      label,
    },
  };
}

export function sourceFolderToSuggestion(folder: MediaSourceFolder): AgentMentionSuggestion {
  return {
    key: `${MEDIA_SOURCE_FOLDER_PREFIX}${folder.value}`,
    label: folder.label,
    type: "media_asset",
    source: "organic",
    group: MEDIA_GROUP,
    childrenLabel: "Browse creatives",
    isFolder: true,
  };
}

export function collectionToSuggestion(collection: MediaCollection): AgentMentionSuggestion {
  return {
    key: `${MEDIA_COLLECTION_FOLDER_PREFIX}${collection.id}`,
    label: collection.name,
    type: "media_asset",
    source: "organic",
    group: MEDIA_GROUP,
    childrenLabel: collection.kind === "smart" ? "Smart collection" : "Collection",
    isFolder: true,
  };
}

export function filterSuggestionsByQuery(
  suggestions: AgentMentionSuggestion[],
  query: string,
): AgentMentionSuggestion[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return suggestions;
  return suggestions.filter((s) =>
    [s.label, s.description].some((value) => value?.toLowerCase().includes(normalized)),
  );
}

// Maps a mention-menu folder key back to the source/collection it scopes to.
// Returns null for keys that are not media subfolders.
export function parseMediaFolderKey(
  key: string,
): { source: SourceFilterValue } | { collectionId: string } | null {
  if (key.startsWith(MEDIA_SOURCE_FOLDER_PREFIX)) {
    return { source: key.slice(MEDIA_SOURCE_FOLDER_PREFIX.length) as SourceFilterValue };
  }
  if (key.startsWith(MEDIA_COLLECTION_FOLDER_PREFIX)) {
    return { collectionId: key.slice(MEDIA_COLLECTION_FOLDER_PREFIX.length) };
  }
  return null;
}

export type FetchMediaMentionAssetsInput = {
  brandId: string;
  source?: SourceFilterValue;
  collectionId?: string;
  query?: string;
  limit?: number;
};

// Lists library assets as mention suggestions. A query runs semantic search
// (POST /api/library/search) honoring the source filter; an empty query — or
// any collection browse, since the search endpoint has no collection filter —
// lists via GET /api/library/assets and client-filters by the typed query.
export async function fetchMediaMentionAssets(
  input: FetchMediaMentionAssetsInput,
): Promise<AgentMentionSuggestion[]> {
  const { brandId, source, collectionId, query, limit = 24 } = input;
  const trimmed = (query ?? "").trim();

  if (trimmed.length >= MIN_SEMANTIC_QUERY && !collectionId) {
    const contractSource = toContractSource(source);
    const response = await fetch("/api/library/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId,
        mode: "text",
        query: trimmed,
        limit,
        ...(contractSource ? { filters: { source: contractSource } } : {}),
      }),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { items?: MediaSearchResultItem[] };
    return (payload.items ?? []).map((item) => mediaAssetToMentionSuggestion(item.asset));
  }

  const params = buildLibraryQuery({ brandId, source: source ?? "all", collectionId, limit });
  const response = await fetch(`/api/library/assets?${params.toString()}`);
  if (!response.ok) return [];
  const payload = (await response.json()) as { items?: MediaAsset[] };
  const suggestions = (payload.items ?? []).map(mediaAssetToMentionSuggestion);
  return filterSuggestionsByQuery(suggestions, trimmed);
}

async function fetchMediaMentionCollections(brandId: string): Promise<MediaCollection[]> {
  const response = await fetch(`/api/library/collections?brandId=${encodeURIComponent(brandId)}`);
  if (!response.ok) return [];
  const payload = (await response.json()) as { collections?: MediaCollection[] };
  return payload.collections ?? [];
}

// The subfolders shown when "Media library" is opened with no query: the source
// folders followed by the brand's collections. Fail-open on the collections
// fetch so a miss still yields the source folders.
export async function fetchMediaLibraryFolders(brandId: string): Promise<AgentMentionSuggestion[]> {
  const collections = await fetchMediaMentionCollections(brandId).catch(() => []);
  return [
    ...MEDIA_SOURCE_FOLDERS.map(sourceFolderToSuggestion),
    ...collections.map(collectionToSuggestion),
  ];
}
