import { PLATFORM_CAPABILITIES } from '@continuum/contracts';
import { CircleDashed } from 'lucide-react';

import {
  FacebookIcon,
  type IconComponent,
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
  XIcon,
  YouTubeIcon,
} from '@/components/shared/icons';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import type { OrganicCalendarDay, OrganicCalendarPostedContent, OrganicPlatformTag } from './types';

export type PlannerPlatformKey = OrganicPlatformTag | 'x';

// Whether the + button seeds a manual from-scratch draft or an agent placeholder.
export type CreatePostMode = 'manual' | 'ai';

// The content format chosen at creation time — mirrors the sidebar format chip
// (PostMetaChips) so a carousel/reel can be seeded in one click from the + menu.
export type CreatePostFormat = 'Post' | 'Carousel' | 'Reel';

// Shared shape for every calendar + button (week planner, month, list, toolbar).
// dayId/platformKey are optional so the toolbar's context-free + can reuse the
// same menu; when absent the workspace defaults to the first visible day.
export type CreatePostOptions = {
  dayId?: string;
  platformKey?: PlannerPlatformKey;
  status?: 'draft' | 'scheduled' | 'placeholder';
  mode?: CreatePostMode;
  format?: CreatePostFormat;
};

export type PlannerPlatform = {
  key: PlannerPlatformKey;
  label: string;
  shortLabel: string;
  Icon: IconComponent;
  canCreate: boolean;
  comingSoon?: boolean;
};

const PLATFORM_META: Record<PlannerPlatformKey, Omit<PlannerPlatform, 'canCreate'>> = {
  instagram: {
    key: 'instagram',
    label: 'Instagram',
    shortLabel: 'IG',
    Icon: InstagramIcon,
  },
  linkedin: {
    key: 'linkedin',
    label: 'LinkedIn',
    shortLabel: 'IN',
    Icon: LinkedInIcon,
  },
  youtube: {
    key: 'youtube',
    label: 'YouTube',
    shortLabel: 'YT',
    Icon: YouTubeIcon,
  },
  facebook: {
    key: 'facebook',
    label: 'Facebook',
    shortLabel: 'FB',
    Icon: FacebookIcon,
  },
  tiktok: {
    key: 'tiktok',
    label: 'TikTok',
    shortLabel: 'TT',
    Icon: TikTokIcon,
  },
  x: {
    key: 'x',
    label: 'X',
    shortLabel: 'X',
    Icon: XIcon,
  },
};

/**
 * Which platforms the planner offers is DERIVED from what the backend can actually publish, never
 * listed by hand. Facebook had a complete, reviewed publisher for months while sitting in
 * "coming soon" here, so the planner could not create a Facebook post at all — the two lists
 * simply disagreed, and nothing made them agree.
 *
 * `PLATFORM_CAPABILITIES` is keyed by `PublishPlatform`, so a platform becomes creatable the moment
 * a publisher exists for it, and cannot be silently forgotten.
 */
const PUBLISHABLE_PLATFORMS = new Set<string>(Object.keys(PLATFORM_CAPABILITIES));

const SCHEDULABLE_PLATFORM_ORDER: OrganicPlatformTag[] = (
  ['instagram', 'linkedin', 'facebook', 'tiktok'] as OrganicPlatformTag[]
).filter((platform) => PUBLISHABLE_PLATFORMS.has(platform));

/** Whatever the planner can display but the backend cannot publish to. */
const COMING_SOON_ORDER: PlannerPlatformKey[] = (
  ['facebook', 'youtube', 'tiktok', 'x'] as PlannerPlatformKey[]
).filter((platform) => !PUBLISHABLE_PLATFORMS.has(platform));

const DISPLAY_PLATFORM_ORDER: PlannerPlatformKey[] = [
  'instagram',
  'linkedin',
  'facebook',
  'youtube',
  'tiktok',
  'x',
];

// A planner row is expensive: every one of its seven cells claims a whole cell's worth
// of vertical space. So a row has to earn its keep — a platform gets a row only if the
// brand can actually post to it (a connected account) or already has posts on it.
// Everything else, including the not-yet-supported channels, collapses out of the grid.
export type BuildPlannerPlatformsOptions = {
  /** Render the not-yet-supported channels as their own (compact) rows. Off by default;
      the workspace offers them behind a single collapsed strip instead. */
  includeComingSoon?: boolean;
};

export function comingSoonPlannerPlatforms(): PlannerPlatform[] {
  return COMING_SOON_ORDER.map((platform) => ({
    ...PLATFORM_META[platform],
    Icon: PLATFORM_META[platform].Icon ?? CircleDashed,
    canCreate: false,
    comingSoon: true,
  }));
}

export function buildPlannerPlatforms(
  activePlatforms: OrganicPlatformKey[],
  days: OrganicCalendarDay[],
  postedContent: OrganicCalendarPostedContent[] = [],
  options: BuildPlannerPlatformsOptions = {},
): PlannerPlatform[] {
  const visible = new Set<PlannerPlatformKey>();

  activePlatforms.forEach((platform) => {
    visible.add(platform);
  });
  days.forEach((day) => {
    day.slots.forEach((draft) => {
      draft.platforms.forEach((platform) => {
        visible.add(platform);
      });
    });
  });
  postedContent.forEach((post) => visible.add(post.platform));

  // A planner with no rows would have nowhere to drop a post and no "+" to press, so
  // the default channel always survives the filter.
  if (!SCHEDULABLE_PLATFORM_ORDER.some((platform) => visible.has(platform))) {
    visible.add('instagram');
  }

  const meaningfulPlatforms = DISPLAY_PLATFORM_ORDER.filter((platform) =>
    visible.has(platform),
  ).map((platform) => ({
    ...PLATFORM_META[platform],
    canCreate: SCHEDULABLE_PLATFORM_ORDER.includes(platform as OrganicPlatformTag),
  }));

  if (!options.includeComingSoon) return meaningfulPlatforms;

  const meaningfulKeys = new Set(meaningfulPlatforms.map((platform) => platform.key));
  return [
    ...meaningfulPlatforms,
    ...comingSoonPlannerPlatforms().filter((platform) => !meaningfulKeys.has(platform.key)),
  ];
}
