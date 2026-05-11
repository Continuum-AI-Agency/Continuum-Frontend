import Image from "next/image";
import {
  BarChart3,
  Briefcase,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformKey } from "@/components/onboarding/platforms";

export type IconComponent = React.ComponentType<{ className?: string }>;

function makeSvgIcon(src: string, alt: string): IconComponent {
  function SvgIcon({ className }: { className?: string }) {
    return (
      <Image
        src={src}
        alt={alt}
        width={20}
        height={20}
        className={cn("h-4 w-4 object-contain", className)}
        unoptimized
      />
    );
  }
  SvgIcon.displayName = `PlatformIcon(${alt})`;
  return SvgIcon;
}

const FacebookIcon = makeSvgIcon("/logos/facebook-icon.svg", "Facebook");
const InstagramIcon = makeSvgIcon("/logos/instagram-icon.svg", "Instagram");
const GoogleIcon = makeSvgIcon("/logos/google.svg", "Google");
const YouTubeIcon = makeSvgIcon("/logos/youtube.svg", "YouTube");
const TikTokIcon = makeSvgIcon("/logos/tiktok-icon-light.svg", "TikTok");
const ThreadsIcon = makeSvgIcon("/logos/threads.svg", "Threads");
const MetaIcon = makeSvgIcon("/logos/meta.svg", "Meta");

export const PLATFORM_LABELS: Record<PlatformKey, string> = {
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

export const PLATFORM_ICONS: Record<PlatformKey, IconComponent> = {
  youtube: YouTubeIcon,
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
  linkedin: Briefcase,
  googleAds: GoogleIcon,
  amazonAds: ShoppingBag,
  dv360: BarChart3,
  threads: ThreadsIcon,
};

export type ProviderGroup = "facebook" | "google" | "tiktok";

export const PROVIDER_GROUP_LABELS: Record<ProviderGroup, string> = {
  facebook: "Meta",
  google: "Google",
  tiktok: "TikTok",
};

export const PROVIDER_GROUP_DESCRIPTIONS: Record<ProviderGroup, string> = {
  facebook: "Facebook & Instagram",
  google: "Google Ads & YouTube",
  tiktok: "TikTok Marketing",
};

export const PROVIDER_GROUP_ICONS: Record<ProviderGroup, IconComponent> = {
  facebook: MetaIcon,
  google: GoogleIcon,
  tiktok: TikTokIcon,
};
