// Single source of truth for "is this a carousel" across the organic planner.
// Drafts carry a `format` string ("carousel"/"Carousel"); real published posts
// carry a raw `mediaType` (Instagram "CAROUSEL_ALBUM"). Both are matched loosely
// so casing and provider spelling never leak into call sites.
//
// The draft-format predicate is re-exported from @continuum/contracts so what the
// planner renders as a carousel and what the publisher publishes as one can never
// disagree — they are now the same function.

export { isCarouselFormat } from '@continuum/contracts';

export function isCarouselMediaType(mediaType?: string | null): boolean {
  return (mediaType ?? '').toUpperCase().includes('CAROUSEL');
}

// Best-effort slide count for display. Prefers an explicit slide count, falls
// back to the number of realized image assets, and treats a bare carousel with
// no assets yet as at least one slide.
export function resolveCarouselSlideCount(input: {
  slideCount?: number | null;
  realizedMediaCount?: number | null;
}): number {
  const explicit = input.slideCount ?? 0;
  if (explicit > 0) return explicit;
  return Math.max(input.realizedMediaCount ?? 0, 0);
}
