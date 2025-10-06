export type PlatformKey =
  | "youtube"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "googleAds"
  | "amazonAds"
  | "dv360"
  | "threads";

export const PLATFORMS: { key: PlatformKey; label: string }[] = [
  { key: "youtube", label: "YouTube" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "googleAds", label: "Google Ads" },
  { key: "amazonAds", label: "Amazon Ads" },
  { key: "dv360", label: "DV360" },
  { key: "threads", label: "Threads" },
];


