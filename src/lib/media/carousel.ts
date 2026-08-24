import { HIDDEN_LIBRARY_TAGS_FILTER, type MediaAsset } from '@continuum/contracts';
import type { MediaAssetRow } from './schema';
import type { SignablePath } from './signed-urls';

// A cover row (slideIndex 0 of a saved carousel) records its full ordered slide
// index under origin_ref.slides. This module turns that into the transient,
// signed `carousel` field the Library grid pages through — and provides the tag
// filter that hides the non-cover slide rows from the flat grid.

// PostgREST array "not contains" value: excludes rows carrying a hidden system tag,
// so a saved carousel occupies exactly one grid slot (its cover) and generated Element
// references stay out of the grid. Those rows remain reachable via search — this only
// shapes the human library list. The tag list is shared (contracts) so the four
// surfaces that hide rows cannot drift apart.
export const EXCLUDE_CAROUSEL_SLIDES_FILTER = HIDDEN_LIBRARY_TAGS_FILTER;

interface StoredSlideRef {
  slideIndex: number;
  assetId: string | null;
  assetVersionId: string | null;
  kind: 'image' | 'video';
  bucket: string;
  storagePath: string;
}

// Parse origin_ref.slides defensively (untyped jsonb); drop malformed entries.
export function coverSlideRefs(row: Pick<MediaAssetRow, 'origin_ref'>): StoredSlideRef[] {
  const slides = (row.origin_ref as { slides?: unknown } | null)?.slides;
  if (!Array.isArray(slides)) return [];
  return slides
    .flatMap((entry): StoredSlideRef[] => {
      if (!entry || typeof entry !== 'object') return [];
      const r = entry as Record<string, unknown>;
      const slideIndex = typeof r.slideIndex === 'number' ? r.slideIndex : null;
      const kind = r.kind === 'video' ? 'video' : r.kind === 'image' ? 'image' : null;
      const bucket = typeof r.bucket === 'string' ? r.bucket : null;
      const storagePath = typeof r.storagePath === 'string' ? r.storagePath : null;
      if (slideIndex === null || !kind || !bucket || !storagePath) return [];
      return [
        {
          slideIndex,
          assetId: typeof r.assetId === 'string' ? r.assetId : null,
          assetVersionId: typeof r.assetVersionId === 'string' ? r.assetVersionId : null,
          kind,
          bucket,
          storagePath,
        },
      ];
    })
    .sort((a, b) => a.slideIndex - b.slideIndex);
}

// The signable slide paths across a page of rows, to fold into one batch sign.
export function carouselSignablePaths(rows: Pick<MediaAssetRow, 'origin_ref'>[]): SignablePath[] {
  return rows.flatMap((row) =>
    coverSlideRefs(row).map((slide) => ({ path: slide.storagePath, bucket: slide.bucket })),
  );
}

// Build the transient `carousel` field for a cover row, or null when the row is
// not a multi-slide group. Signed urls come from the shared batch map (by path).
export function buildCarousel(
  row: Pick<MediaAssetRow, 'origin_ref'>,
  signedUrlByPath: Map<string, string>,
): NonNullable<MediaAsset['carousel']> | null {
  const refs = coverSlideRefs(row);
  if (refs.length < 2) return null;
  return {
    slideCount: refs.length,
    slides: refs.map((slide) => ({
      slideIndex: slide.slideIndex,
      ...(slide.assetId ? { assetId: slide.assetId } : {}),
      ...(slide.assetVersionId ? { assetVersionId: slide.assetVersionId } : {}),
      kind: slide.kind,
      signedUrl: signedUrlByPath.get(slide.storagePath) ?? null,
    })),
  };
}
