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

export function buildPlannerPlatforms(
  activePlatforms: OrganicPlatformKey[],
  days: OrganicCalendarDay[],
): PlannerPlatform[] {
  const discoveredSchedulable = new Set<OrganicPlatformTag>(['instagram', 'linkedin']);

  activePlatforms.forEach((platform) => {
    if (SCHEDULABLE_PLATFORM_ORDER.includes(platform)) {
      discoveredSchedulable.add(platform);
    }
  });
  days.forEach((day) => {
    day.slots.forEach((draft) => {
      draft.platforms.forEach((platform) => {
        if (SCHEDULABLE_PLATFORM_ORDER.includes(platform)) {
          discoveredSchedulable.add(platform);
        }
      });
    });
  });

  const schedulablePlatforms = SCHEDULABLE_PLATFORM_ORDER.filter((platform) =>
    discoveredSchedulable.has(platform),
  ).map((platform) => PLATFORM_META[platform]);

  const comingSoonPlatforms = COMING_SOON_ORDER.map((platform) => ({
    ...PLATFORM_META[platform],
    Icon: PLATFORM_META[platform].Icon ?? CircleDashed,
    comingSoon: true,
  }));

  return [...schedulablePlatforms, ...comingSoonPlatforms];
}
