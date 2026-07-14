import type { OrganicPost } from '@/lib/schemas/organicMetrics';

/**
 * Detail responses carry newly signed media URLs. Prefer them field-by-field,
 * while retaining bulk-list media when a provider omits a detail field.
 */
export function mergePostWithFreshMedia(base: OrganicPost, detail: OrganicPost): OrganicPost {
  return {
    ...base,
    ...detail,
    mediaUrl: detail.mediaUrl ?? base.mediaUrl,
    thumbnailUrl: detail.thumbnailUrl ?? base.thumbnailUrl,
    carouselMedia: detail.carouselMedia ?? base.carouselMedia,
  };
}
