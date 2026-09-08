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
  };
}
