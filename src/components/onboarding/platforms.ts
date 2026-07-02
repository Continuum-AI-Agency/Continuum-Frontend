export const PLATFORM_KEYS = [
  "youtube",
  "instagram",
  "facebook",
  "tiktok",
  "x",
  "linkedin",
  "googleAds",
  "amazonAds",
  "dv360",
  "googleAnalytics",
  "threads",
] as const;

export type PlatformKey = (typeof PLATFORM_KEYS)[number];

const PLATFORM_LABELS: Record<PlatformKey, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  x: "X",
  linkedin: "LinkedIn",
  googleAds: "Google Ads",
  amazonAds: "Amazon Ads",
  dv360: "DV360",
  googleAnalytics: "Google Analytics",
  threads: "Threads",
};

export const PLATFORMS: { key: PlatformKey; label: string }[] = PLATFORM_KEYS.map(key => ({
  key,
  label: PLATFORM_LABELS[key],
}));
