export const PLATFORM_KEYS = [
  "youtube",
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "googleAds",
  "amazonAds",
  "dv360",
  "threads",
] as const;

export type PlatformKey = (typeof PLATFORM_KEYS)[number];

const PLATFORM_LABELS: Record<PlatformKey, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  googleAds: "Google Ads",
  amazonAds: "Amazon Ads",
  dv360: "DV360",
  threads: "Threads",
};

export const PLATFORMS: { key: PlatformKey; label: string }[] = PLATFORM_KEYS.map(key => ({
  key,
  label: PLATFORM_LABELS[key],
}));
