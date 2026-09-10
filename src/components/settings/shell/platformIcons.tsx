import { BarChart3, Sparkles } from 'lucide-react';
import type { PlatformKey } from '@/components/onboarding/platforms';
import {
  AmazonIcon,
  GoogleIcon,
  type IconComponent,
  InstagramIcon,
  LinkedInIcon,
  MetaIcon,
  ThreadsIcon,
  TikTokIcon,
  XIcon,
  YouTubeIcon,
} from '@/components/shared/icons';

export type { IconComponent };

export const PLATFORM_LABELS: Record<PlatformKey, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  x: 'X',
  linkedin: 'LinkedIn',
  googleAds: 'Google Ads',
  amazonAds: 'Amazon Ads',
  dv360: 'DV360',
  googleAnalytics: 'Google Analytics',
  threads: 'Threads',
  openai: 'OpenAI Ads',
};

export const PLATFORM_ICONS: Record<PlatformKey, IconComponent> = {
  youtube: YouTubeIcon,
  instagram: InstagramIcon,
  // Settings groups Facebook under the Meta mark, matching PROVIDER_GROUP_ICONS.
  facebook: MetaIcon,
  tiktok: TikTokIcon,
  x: XIcon,
  linkedin: LinkedInIcon,
  googleAds: GoogleIcon,
  amazonAds: AmazonIcon,
  dv360: BarChart3,
  googleAnalytics: GoogleIcon,
  threads: ThreadsIcon,
  // A lucide glyph rather than a brand mark, the same compromise dv360 makes above:
  // @/lib/brand-icons carries no OpenAI artwork yet. Swap it in there when it does.
  openai: Sparkles,
};

export type ProviderGroup = 'facebook' | 'google' | 'tiktok' | 'linkedin' | 'x' | 'openai';

// Display order for every surface that offers a provider connect. Single list so
// a newly supported provider reaches Settings and onboarding at the same time.
export const PROVIDER_GROUPS: readonly ProviderGroup[] = [
  'facebook',
  'google',
  'tiktok',
  'linkedin',
  'x',
  'openai',
];

export const PROVIDER_GROUP_LABELS: Record<ProviderGroup, string> = {
  facebook: 'Meta',
  google: 'Google',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  x: 'X',
  openai: 'OpenAI Ads',
};

export const PROVIDER_GROUP_DESCRIPTIONS: Record<ProviderGroup, string> = {
  facebook: 'Facebook & Instagram',
  google: 'Google Ads & YouTube',
  tiktok: 'TikTok Marketing',
  linkedin: 'LinkedIn Ads / Organic',
  x: 'X (Twitter)',
  openai: 'ChatGPT Ads (API key)',
};

export const PROVIDER_GROUP_ICONS: Record<ProviderGroup, IconComponent> = {
  facebook: MetaIcon,
  google: GoogleIcon,
  tiktok: TikTokIcon,
  linkedin: LinkedInIcon,
  x: XIcon,
  openai: Sparkles,
};

// Provider groups that are surfaced but not yet open to users. Rendered
// greyed-out / disabled across connect surfaces. Re-enable by removing the key.
export const COMING_SOON_PROVIDER_GROUPS: ReadonlySet<ProviderGroup> = new Set(['x']);

export const isProviderComingSoon = (group: string): boolean =>
  COMING_SOON_PROVIDER_GROUPS.has(group as ProviderGroup);
