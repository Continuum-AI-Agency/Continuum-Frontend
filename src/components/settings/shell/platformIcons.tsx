import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformKey } from "@/components/onboarding/platforms";
import {
  amazon,
  google,
  instagram,
  linkedin,
  meta,
  threads,
  tiktok,
  x,
  youtube,
} from "@/lib/brand-icons";

export type IconComponent = React.ComponentType<{ className?: string }>;

interface IconData {
  svg: string;
  title: string;
}

function makeSvgIcon(iconData: IconData): IconComponent {
  function SvgIcon({ className }: { className?: string }) {
    return (
      <span
        className={cn("h-4 w-4 inline-block shrink-0 [&>svg]:w-full [&>svg]:h-full [&>svg]:block", className)}
        title={iconData.title}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted inline brand-icon SVG from local @/lib/brand-icons constants, never user input
        dangerouslySetInnerHTML={{ __html: iconData.svg }}
      />
    );
  }
  SvgIcon.displayName = `PlatformIcon(${iconData.title})`;
  return SvgIcon;
}

const FacebookIcon = makeSvgIcon(meta);
const InstagramIcon = makeSvgIcon(instagram);
const GoogleIcon = makeSvgIcon(google);
const YouTubeIcon = makeSvgIcon(youtube);
const TikTokIcon = makeSvgIcon(tiktok);
const ThreadsIcon = makeSvgIcon(threads);
const MetaIcon = makeSvgIcon(meta);
const LinkedInIcon = makeSvgIcon(linkedin);
const AmazonIcon = makeSvgIcon(amazon);
const XIcon = makeSvgIcon(x);

export const PLATFORM_LABELS: Record<PlatformKey, string> = {
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

export const PLATFORM_ICONS: Record<PlatformKey, IconComponent> = {
  youtube: YouTubeIcon,
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
  x: XIcon,
  linkedin: LinkedInIcon,
  googleAds: GoogleIcon,
  amazonAds: AmazonIcon,
  dv360: BarChart3,
  googleAnalytics: GoogleIcon,
  threads: ThreadsIcon,
};

export type ProviderGroup = "facebook" | "google" | "tiktok" | "linkedin" | "x";

export const PROVIDER_GROUP_LABELS: Record<ProviderGroup, string> = {
  facebook: "Meta",
  google: "Google",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  x: "X",
};

export const PROVIDER_GROUP_DESCRIPTIONS: Record<ProviderGroup, string> = {
  facebook: "Facebook & Instagram",
  google: "Google Ads & YouTube",
  tiktok: "TikTok Marketing",
  linkedin: "LinkedIn Ads / Organic",
  x: "X (Twitter)",
};

export const PROVIDER_GROUP_ICONS: Record<ProviderGroup, IconComponent> = {
  facebook: MetaIcon,
  google: GoogleIcon,
  tiktok: TikTokIcon,
  linkedin: LinkedInIcon,
  x: XIcon,
};

// Provider groups that are surfaced but not yet open to users. Rendered
// greyed-out / disabled across connect surfaces. Re-enable by removing the key.
export const COMING_SOON_PROVIDER_GROUPS: ReadonlySet<ProviderGroup> = new Set(["x"]);

export const isProviderComingSoon = (group: string): boolean =>
  COMING_SOON_PROVIDER_GROUPS.has(group as ProviderGroup);
