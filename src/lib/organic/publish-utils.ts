import { PLATFORM_CAPABILITIES, type PublishPlatform } from '@continuum/contracts';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';

// The body builder and the format→postType mapping live in @continuum/contracts: the
// backend parses the body it produces, and the publish bench drives it directly. Keeping
// a second copy here is what let the planner's case-sensitive "Carousel" check diverge
// from the backend's case-insensitive one and publish carousels as single images.
export {
  buildFullCaption,
  buildPublishBody,
  inferPostType,
  type PublishRequestBody,
  resolvePublishFormat,
} from '@continuum/contracts';

const PUBLISHABLE_PLATFORMS = Object.keys(PLATFORM_CAPABILITIES) as PublishPlatform[];

/** The platform a draft publishes to: its first tagged platform we can actually publish to. */
export function inferPublishPlatform(draft: OrganicCalendarDraft): PublishPlatform | null {
  return PUBLISHABLE_PLATFORMS.find((platform) => draft.platforms.includes(platform)) ?? null;
}
