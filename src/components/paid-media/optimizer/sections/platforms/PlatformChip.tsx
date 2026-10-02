// Which ad platform a card, a row or a tab belongs to: a coloured dot and the platform's name,
// never a logo alone (frontend.html §7, feature 02). The colours are identity, not judgement —
// Meta blue, Google yellow, TikTok purple (Ramiro, 2026-09-29) — so they mark the chip, its dot
// and the active tab's underline and never a figure; figures keep the ok/warn/bad state colours.
//
// This file is the ONLY place the --platform-* tokens are named. Anything that needs a
// platform's colour asks `platformColor()`, so a new platform or a retuned shade is one edit.

import { PLATFORM_ICONS } from '@/components/settings/shell/platformIcons';
import { cn } from '@/lib/utils';
import { type AdPlatform, PLATFORM_NAMES } from './platformTabsModel';

type PlatformColor = {
  /** The design token, for tests and for the rare inline style. */
  token: `--platform-${string}`;
  /** Solid identity colour: the chip's dot. */
  dot: string;
  /** The active tab's underline. */
  underline: string;
  /** The chip's surface and its text, contrast-checked as a pair. */
  chip: string;
};

// Literal class strings: Tailwind only generates what it can read in the source.
const PLATFORM_COLORS: Record<AdPlatform, PlatformColor> = {
  meta: {
    token: '--platform-meta',
    dot: 'bg-platform-meta',
    underline: 'border-platform-meta',
    chip: 'bg-platform-meta-soft text-platform-meta-fg',
  },
  google_ads: {
    token: '--platform-google',
    dot: 'bg-platform-google',
    underline: 'border-platform-google',
    chip: 'bg-platform-google-soft text-platform-google-fg',
  },
  tiktok_ads: {
    token: '--platform-tiktok',
    dot: 'bg-platform-tiktok',
    underline: 'border-platform-tiktok',
    chip: 'bg-platform-tiktok-soft text-platform-tiktok-fg',
  },
};

export function platformColor(platform: AdPlatform): PlatformColor {
  return PLATFORM_COLORS[platform];
}

const PLATFORM_ICON_KEYS = {
  meta: 'facebook',
  google_ads: 'googleAds',
  tiktok_ads: 'tiktok',
} as const;

/** The platform's mark, from the Settings icon set. Always beside the name, never instead of it. */
export function PlatformIcon({
  platform,
  className,
}: {
  platform: AdPlatform;
  className?: string;
}) {
  const Icon = PLATFORM_ICONS[PLATFORM_ICON_KEYS[platform]];
  return <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', className)} />;
}

export function PlatformChip({
  platform,
  className,
}: {
  platform: AdPlatform;
  className?: string;
}) {
  const color = platformColor(platform);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs leading-4',
        color.chip,
        className,
      )}
      data-platform={platform}
      data-testid="platform-chip"
      data-token={color.token}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', color.dot)} />
      {PLATFORM_NAMES[platform]}
    </span>
  );
}
