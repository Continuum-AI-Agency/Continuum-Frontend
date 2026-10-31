// One campaign view, each platform's own words (design C, option 28). Meta says ad set, Google
// and TikTok say ad group, and a Performance Max campaign has no individual ads at all: its
// asset groups hold a pool of assets Google combines, so the third column is an assets summary.
//
// Pure: the platform of a campaign model is read from its source (a live change preview, a
// structure frame, the canvas store), and every view asks this file how to name a level.

export type CampaignPlatform = 'meta' | 'google_search' | 'google_pmax' | 'tiktok';

export type CampaignLevelWord = 'campaign' | 'adset' | 'ad';

export type PlatformLabels = {
  platform: CampaignPlatform;
  /** The header chip: "Meta", "Google Search", "Google PMax", "TikTok". */
  chip: string;
  /** Capitalised level names for headers and table columns. */
  level: Record<CampaignLevelWord, string>;
  /** Lowercase singular / plural for running text ("Pause the ad group", "3 asset groups"). */
  singular: Record<CampaignLevelWord, string>;
  plural: Record<CampaignLevelWord, string>;
  /** False for Performance Max: an asset group shows an assets summary instead of ads. */
  hasAds: boolean;
};

const META: PlatformLabels = {
  platform: 'meta',
  chip: 'Meta',
  level: { campaign: 'Campaign', adset: 'Ad set', ad: 'Ad' },
  singular: { campaign: 'campaign', adset: 'ad set', ad: 'ad' },
  plural: { campaign: 'campaigns', adset: 'ad sets', ad: 'ads' },
  hasAds: true,
};

const AD_GROUP_WORDS = {
  level: { campaign: 'Campaign', adset: 'Ad group', ad: 'Ad' },
  singular: { campaign: 'campaign', adset: 'ad group', ad: 'ad' },
  plural: { campaign: 'campaigns', adset: 'ad groups', ad: 'ads' },
} as const;

const LABELS: Record<CampaignPlatform, PlatformLabels> = {
  meta: META,
  google_search: {
    platform: 'google_search',
    chip: 'Google Search',
    ...AD_GROUP_WORDS,
    hasAds: true,
  },
  google_pmax: {
    platform: 'google_pmax',
    chip: 'Google PMax',
    level: { campaign: 'Campaign', adset: 'Asset group', ad: 'Assets' },
    singular: { campaign: 'campaign', adset: 'asset group', ad: 'assets' },
    plural: { campaign: 'campaigns', adset: 'asset groups', ad: 'assets' },
    hasAds: false,
  },
  tiktok: { platform: 'tiktok', chip: 'TikTok', ...AD_GROUP_WORDS, hasAds: true },
};

export const platformLabelsOf = (platform: CampaignPlatform): PlatformLabels => LABELS[platform];

/** "1 ad set", "3 asset groups". */
export const countOf = (labels: PlatformLabels, level: CampaignLevelWord, count: number): string =>
  `${count} ${count === 1 ? labels.singular[level] : labels.plural[level]}`;

const GOOGLE_PMAX_CHANNELS = new Set(['PERFORMANCE_MAX', 'PMAX', 'performance_max', 'pmax']);

/**
 * The platform a payload names. Every source is Meta today (scaffolds and live changes are
 * Meta-only); a payload may say otherwise with `platform` ('meta' | 'google' | 'tiktok') and,
 * for Google, `channel` / `advertisingChannelType` ('SEARCH' | 'PERFORMANCE_MAX'). Both ride the
 * contracts' passthrough, so a Backend that starts sending them needs no Frontend change.
 */
export const platformOfSource = (source: unknown): CampaignPlatform => {
  if (!source || typeof source !== 'object') return 'meta';
  const record = source as Record<string, unknown>;
  const platform = typeof record.platform === 'string' ? record.platform.toLowerCase() : null;
  const channel =
    typeof record.channel === 'string'
      ? record.channel
      : typeof record.advertisingChannelType === 'string'
        ? record.advertisingChannelType
        : null;
  if (platform === 'google' || platform === 'google_ads' || platform === 'google-ads') {
    return channel && GOOGLE_PMAX_CHANNELS.has(channel) ? 'google_pmax' : 'google_search';
  }
  if (platform === 'google_pmax') return 'google_pmax';
  if (platform === 'google_search') return 'google_search';
  if (platform === 'tiktok') return 'tiktok';
  return 'meta';
};

/**
 * A live change preview's platform: what it names, else the tool that proposed it
 * (`google_ads_*` / `tiktok_*` tools; every `*_meta_*` tool is Meta).
 */
export const platformOfLiveChange = (preview: {
  toolName: string;
  [key: string]: unknown;
}): CampaignPlatform => {
  const named = platformOfSource(preview);
  if (named !== 'meta' || (preview as Record<string, unknown>).platform) return named;
  const tool = preview.toolName.toLowerCase();
  if (tool.startsWith('google')) return platformOfSource({ ...preview, platform: 'google' });
  if (tool.startsWith('tiktok')) return 'tiktok';
  return 'meta';
};
