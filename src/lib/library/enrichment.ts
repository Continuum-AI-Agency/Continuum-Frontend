'use client';

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

import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Ask for an asset the user just opened to be enriched. library-upload decides whether
 * it needs it (only never-analysed assets are enqueued) and holds the key analyze_media
 * accepts. Fire-and-forget by design: enrichment is a background nicety, and a failure
 * here must never surface as an error on a modal opened to look at a picture.
 */
export function enrichOnOpen(brandId: string, assetId: string): void {
  void createSupabaseBrowserClient()
    .functions.invoke('library-upload', {
      body: { action: 'enrich', brandId, assetIds: [assetId] },
    })
    .catch(() => undefined);
}
