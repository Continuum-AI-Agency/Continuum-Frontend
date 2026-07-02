import type { PlatformKey } from "../platforms";

export const GOOGLE_OAUTH_KEYS: PlatformKey[] = ["youtube", "googleAds", "dv360", "googleAnalytics"];
export const FACEBOOK_OAUTH_KEYS: PlatformKey[] = ["instagram", "facebook", "threads"];
export const TIKTOK_OAUTH_KEYS: PlatformKey[] = ["tiktok"];
export const COMING_SOON_KEYS: PlatformKey[] = ["amazonAds", "linkedin"];
export const COMING_SOON_EXTRA = [{ key: "x", label: "X" }] as const;
