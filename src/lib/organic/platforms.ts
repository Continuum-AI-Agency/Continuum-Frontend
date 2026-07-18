import { PLATFORMS, type PlatformKey } from '@/components/onboarding/platforms';

export const ORGANIC_PLATFORM_KEYS = [
  'instagram',
  'facebook',
  'tiktok',
  'linkedin',
  'youtube',
] as const;

export type OrganicPlatformKey = (typeof ORGANIC_PLATFORM_KEYS)[number];

export const ORGANIC_MVP_PLATFORM_KEYS = [
  'instagram',
  'facebook',
  'linkedin',
] as const satisfies readonly OrganicPlatformKey[];

const LABEL_LOOKUP = PLATFORMS.reduce<Record<PlatformKey, string>>(
  (acc, item) => {
    acc[item.key] = item.label;
    return acc;
  },
  {} as Record<PlatformKey, string>,
);

export const ORGANIC_PLATFORMS = ORGANIC_PLATFORM_KEYS.map((key) => ({
  key: key as PlatformKey,
  label: LABEL_LOOKUP[key as PlatformKey] ?? key,
}));

export function isOrganicPlatformKey(key: string): key is OrganicPlatformKey {
  return (ORGANIC_PLATFORM_KEYS as readonly string[]).includes(key);
}

// Display name for a platform, falling back to the key so an unmapped platform
// degrades to something readable rather than blank.
export function organicPlatformLabel(key: string): string {
  return LABEL_LOOKUP[key as PlatformKey] ?? key;
}
