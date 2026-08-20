// Lazy enrichment: analyse an asset the first time somebody actually looks at it.
//
// The Library's intelligence (semantic search, transcripts, visual similarity)
// only exists for assets that have been through analyze_media. A library that
// predates that pipeline is full of assets with none of it, and a blanket
// backfill over thousands of them is a cost decision nobody asked to make.
//
// So the cost follows the attention instead: open an asset and it gets enriched,
// which means the library heals exactly where people are looking. A shelf nobody
// visits stays cold, and that is the correct outcome — it costs nothing and
// nobody misses it.
//
// This does NOT make an un-enriched asset findable by meaning before its first
// open — semantic search cannot match a vector that was never written. Closing
// that gap needs a deliberate, batched backfill; the batch endpoint here is the
// seam for it, but it must be a choice, never a surprise.

/** Statuses that mean "analysis has never successfully run on these bytes". */
const NEEDS_ENRICHMENT: ReadonlySet<string> = new Set(['stored']);

/**
 * Statuses we deliberately leave alone:
 *   analyzing    — already in flight; enqueuing again just burns tokens twice.
 *   ready        — already has its metadata.
 *   error        — a retry path already exists inside analyze_media; re-driving
 *                  a permanently-failing asset from every page view is a loop.
 *   skipped_free — a billing decision was taken. Honour it.
 *   skipped_long_form
 *                — the video is longer than vision analysis is scoped for. Re-driving
 *                  it would fail the same way every time someone opened the asset.
 */
export type EnrichmentCandidate = {
  id: string;
  status: string;
  bucket: string;
  storage_path: string;
  mime_type: string;
  file_name: string;
};

export function needsEnrichment(asset: { status: string }): boolean {
  return NEEDS_ENRICHMENT.has(asset.status);
}

/** The subset worth spending money on, capped so one call can never fan out. */
export function selectAssetsNeedingEnrichment<T extends { status: string }>(
  assets: readonly T[],
  limit: number,
): T[] {
  return assets.filter(needsEnrichment).slice(0, limit);
}

// One call can enrich at most this many assets. A page of the grid is 48; a
// careless caller passing "everything I can see" must not turn into a bill.
export const MAX_ENRICH_PER_CALL = 25;

/**
 * Ask the server to enrich an asset the user just opened. Fire-and-forget by
 * design: enrichment is a background nicety, and a failure here must never
 * surface as an error on a modal the user opened to look at a picture.
 */
export function enrichOnOpen(brandId: string, assetId: string): void {
  void fetch('/api/library/enrich', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandId, assetIds: [assetId] }),
  }).catch(() => undefined);
}
