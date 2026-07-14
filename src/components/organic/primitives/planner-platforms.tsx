import {
  CircleDashed,
  Facebook,
  Instagram,
  Linkedin,
  Music2,
  Twitter,
  Youtube,
} from 'lucide-react';

import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import type { OrganicCalendarDay, OrganicPlatformTag } from './types';

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
  Icon: typeof Instagram;
  comingSoon?: boolean;
};

const PLATFORM_META: Record<PlannerPlatformKey, PlannerPlatform> = {
  instagram: {
    key: 'instagram',
    label: 'Instagram',
    shortLabel: 'IG',
    Icon: Instagram,
  },
  linkedin: {
    key: 'linkedin',
    label: 'LinkedIn',
    shortLabel: 'IN',
    Icon: Linkedin,
  },
  youtube: {
    key: 'youtube',
    label: 'YouTube',
    shortLabel: 'YT',
    Icon: Youtube,
  },
  facebook: {
    key: 'facebook',
    label: 'Facebook',
    shortLabel: 'FB',
    Icon: Facebook,
  },
  tiktok: {
    key: 'tiktok',
    label: 'TikTok',
    shortLabel: 'TT',
    Icon: Music2,
  },
  x: {
    key: 'x',
    label: 'X',
    shortLabel: 'X',
    Icon: Twitter,
  },
};

const SCHEDULABLE_PLATFORM_ORDER: OrganicPlatformTag[] = ['instagram', 'linkedin'];

const COMING_SOON_ORDER: PlannerPlatformKey[] = ['facebook', 'youtube', 'tiktok', 'x'];

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
    comingSoon: true,
  }));
}

export function buildPlannerPlatforms(
  activePlatforms: OrganicPlatformKey[],
  days: OrganicCalendarDay[],
  options: BuildPlannerPlatformsOptions = {},
): PlannerPlatform[] {
  const scheduled = new Set<OrganicPlatformTag>();

  activePlatforms.forEach((platform) => {
    if (SCHEDULABLE_PLATFORM_ORDER.includes(platform)) {
      scheduled.add(platform);
    }
  });
  days.forEach((day) => {
    day.slots.forEach((draft) => {
      draft.platforms.forEach((platform) => {
        if (SCHEDULABLE_PLATFORM_ORDER.includes(platform)) {
          scheduled.add(platform);
        }
      });
    });
  });

  // A planner with no rows would have nowhere to drop a post and no "+" to press, so
  // the default channel always survives the filter.
  if (scheduled.size === 0) scheduled.add('instagram');

  const schedulablePlatforms = SCHEDULABLE_PLATFORM_ORDER.filter((platform) =>
    scheduled.has(platform),
  ).map((platform) => PLATFORM_META[platform]);

  if (!options.includeComingSoon) return schedulablePlatforms;

  return [...schedulablePlatforms, ...comingSoonPlannerPlatforms()];
}
