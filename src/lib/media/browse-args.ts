import type { LibraryBrowseQuery } from '@continuum/contracts';

/**
 * The contract → RPC argument mapping for `media.library_browse_page` and
 * `library_browse_facets`.
 *
 * Deliberately NOT inside `browse.server.ts`: that module imports `server-only` (and, through
 * `signed-urls`, `next/headers`), so nothing outside a Next request can load it — which would
 * leave an end-to-end bench with no choice but to restate this mapping and grade its own copy.
 * A filter that is passed under the wrong argument name is exactly the bug such a copy hides.
 *
 * Every argument goes by NAME. `library_browse_page` has 20-odd defaulted parameters and they
 * have been added to over time; a positional call would silently shift the day one more lands.
 */
export function libraryBrowseRpcArgs(query: LibraryBrowseQuery) {
  return {
    p_brand_id: query.brandId,
    p_media_type: query.mediaType,
    p_sources: query.createdWith.length > 0 ? query.createdWith : null,
    p_tags: query.tags.length > 0 ? query.tags : null,
    p_review_statuses: query.reviewStatuses.length > 0 ? query.reviewStatuses : null,
    p_owner_ids: query.ownerIds.length > 0 ? query.ownerIds : null,
    p_campaign_ids: query.campaignIds.length > 0 ? query.campaignIds : null,
    p_usage_rights: query.usageRights.length > 0 ? query.usageRights : null,
    p_placements: query.placements.length > 0 ? query.placements : null,
    p_collection_id: query.collectionId ?? null,
    p_project_ids: query.projectIds.length > 0 ? query.projectIds : null,
    p_used: query.used ?? null,
    p_shared: query.shared ?? null,
    p_leading_only: query.leadingOnly,
    p_template_only: query.templateOnly,
    p_ratios: query.ratios.length > 0 ? query.ratios : null,
    p_fonts: query.fonts.length > 0 ? query.fonts : null,
    p_search: query.search || null,
    p_performance_window: query.performanceWindow,
    p_destination: query.destination ?? null,
    p_aspect_ratios: query.aspectRatios.length > 0 ? query.aspectRatios : null,
  };
}

/**
 * p_sort for library_browse_page. A custom-field sort travels INSIDE the existing text
 * argument ('field_asc:<field id>') rather than as a new one: a new argument would create
 * a second overload and PostgREST would refuse every browse call as ambiguous. Without a
 * field the SQL falls back to its default order, so this never sends a half-formed sort.
 */
export function libraryBrowseSortArg(query: Pick<LibraryBrowseQuery, 'sort' | 'sortFieldId'>) {
  if (query.sort === 'field_asc' || query.sort === 'field_desc') {
    return query.sortFieldId ? `${query.sort}:${query.sortFieldId}` : 'created_desc';
  }
  return query.sort;
}

/**
 * What the browse RPC cannot express and must be applied on top of its ranked rows: custom
 * review states and custom-field filters (no new RPC argument — a PostgREST overload takes the
 * whole read down). Every other browse filter stays in the RPC, so nothing is dropped when one
 * of these is on.
 */
export type LibraryBrowseNarrowing = {
  reviewStateIds: readonly string[];
  fieldConstraint:
    | { kind: 'unfiltered' }
    | { kind: 'ids'; ids: readonly string[] }
    | { kind: 'exclude'; ids: readonly string[] };
};

export function isNarrowed(narrowing: LibraryBrowseNarrowing): boolean {
  return narrowing.reviewStateIds.length > 0 || narrowing.fieldConstraint.kind !== 'unfiltered';
}

/**
 * The review statuses the RPC pre-filters on once custom states are chosen: the chosen bases
 * plus each chosen state's base (a state's assets carry its base). A superset — the exact
 * "base OR state" test is `browseNarrowingPredicate`.
 */
export function reviewPrefilterStatuses(
  reviewStatuses: readonly string[],
  stateBases: readonly string[],
): string[] {
  return [...new Set([...reviewStatuses, ...stateBases])];
}

/**
 * Whether a ranked asset passes the narrowing. Review follows the filter's semantics
 * (components/library/review/reviewFilterOptions): a chosen base status matches every asset
 * with that status, its custom states included; a chosen state matches only that state; the
 * choices are OR'd. Field constraints AND on top.
 */
export function browseNarrowingPredicate(
  reviewStatuses: readonly string[],
  narrowing: LibraryBrowseNarrowing,
): (row: { id: string; review_status: string | null; review_state_id: string | null }) => boolean {
  const statuses = new Set(reviewStatuses);
  const states = new Set(narrowing.reviewStateIds);
  const field = narrowing.fieldConstraint;
  const fieldIds = field.kind === 'unfiltered' ? null : new Set(field.ids);
  return (row) => {
    if (field.kind === 'ids' && !fieldIds?.has(row.id)) return false;
    if (field.kind === 'exclude' && fieldIds?.has(row.id)) return false;
    if (states.size === 0) return true;
    return (
      statuses.has(row.review_status ?? 'none') ||
      (row.review_state_id !== null && states.has(row.review_state_id))
    );
  };
}
