import { PLATFORMS, type PlatformKey } from "@/components/onboarding/platforms";

export const ORGANIC_PLATFORM_KEYS = [
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "youtube",
] as const;

export type OrganicPlatformKey = (typeof ORGANIC_PLATFORM_KEYS)[number];

const LABEL_LOOKUP = PLATFORMS.reduce<Record<PlatformKey, string>>((acc, item) => {
  acc[item.key] = item.label;
  return acc;
}, {} as Record<PlatformKey, string>);

export const ORGANIC_PLATFORMS = ORGANIC_PLATFORM_KEYS.map((key) => ({
  key: key as PlatformKey,
  label: LABEL_LOOKUP[key as PlatformKey] ?? key,
}));

export function isOrganicPlatformKey(key: string): key is OrganicPlatformKey {
  return (ORGANIC_PLATFORM_KEYS as readonly string[]).includes(key);
}
