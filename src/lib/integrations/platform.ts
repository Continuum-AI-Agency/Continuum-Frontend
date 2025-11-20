import type { PlatformKey } from "@/components/onboarding/platforms";

const TYPE_TO_PLATFORM_MAP: Record<string, PlatformKey> = {
  youtube_channel: "youtube",
  youtube: "youtube",
  google_ads_account: "googleAds",
  googleads_account: "googleAds",
  google_ads_customer: "googleAds",
  dv360_advertiser: "dv360",
  display_video_360_advertiser: "dv360",
  displayvideo360_advertiser: "dv360",
  instagram_business_account: "instagram",
  instagram_account: "instagram",
  facebook_page: "facebook",
  facebook_account: "facebook",
  meta_ad_account: "facebook",
  threads_profile: "threads",
  threads_account: "threads",
};

export function mapIntegrationTypeToPlatformKey(type?: string | null): PlatformKey | null {
  if (!type) {
    return null;
  }
  const normalized = type.trim().toLowerCase();
  return TYPE_TO_PLATFORM_MAP[normalized] ?? null;
}

