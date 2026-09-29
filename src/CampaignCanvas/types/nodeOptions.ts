import type { AdFormat, CampaignData, PlacementMode } from './index';

/*
 * The option vocabularies the nodes' context menus and the inspector both offer. One
 * list per field: a CTA the menu calls "Shop Now" and the inspector calls "Buy" would
 * be two products.
 */

export const OBJECTIVES: Array<{ value: CampaignData['objective']; label: string; description: string }> =
  [
    {
      value: 'OUTCOME_AWARENESS',
      label: 'Awareness',
      description: 'Awareness optimization prioritizes people likely to remember your ad.',
    },
    {
      value: 'OUTCOME_TRAFFIC',
      label: 'Traffic',
      description:
        'Traffic optimization favors people likely to click through to your destination.',
    },
    {
      value: 'OUTCOME_ENGAGEMENT',
      label: 'Engagement',
      description:
        'Engagement optimization prioritizes likes, comments, shares, and similar interactions.',
    },
    {
      value: 'OUTCOME_LEADS',
      label: 'Leads',
      description: 'Leads optimization targets users likely to submit forms or inquiries.',
    },
    {
      value: 'OUTCOME_APP_PROMOTION',
      label: 'App Promotion',
      description: 'App Promotion optimization focuses on installs and in-app actions.',
    },
    {
      value: 'OUTCOME_SALES',
      label: 'Sales',
      description: 'Sales optimization prioritizes users likely to complete purchases.',
    },
  ];

export const SPECIAL_CATEGORIES = [
  {
    value: 'HOUSING',
    label: 'Housing',
    description: 'Housing covers ads related to homes, rentals, or mortgage opportunities.',
  },
  {
    value: 'EMPLOYMENT',
    label: 'Employment',
    description: 'Employment covers job listings, recruiting, and hiring-related ads.',
  },
  {
    value: 'CREDIT',
    label: 'Credit',
    description: 'Credit covers lending, financing, and related credit offers.',
  },
  {
    value: 'ISSUES_ELECTIONS_POLITICS',
    label: 'Issues, Elections or Politics',
    description: 'This category flags social issue, election, or political content.',
  },
  {
    value: 'FINANCIAL_PRODUCTS_SERVICES',
    label: 'Financial products',
    description: 'Financial products and services such as banking, insurance or investing.',
  },
  {
    value: 'ONLINE_GAMBLING_AND_GAMING',
    label: 'Gambling and gaming',
    description: 'Online gambling and real-money gaming.',
  },
];

/**
 * The goals a scaffold can write — the Backend's `META_OPTIMIZATION_GOALS`
 * (Continuum-Backend/App/shared/meta/scaffoldVocabulary.ts). A goal outside it is
 * refused at save, so it is not offered.
 */
export const OPTIMIZATION_GOALS = [
  {
    value: 'OFFSITE_CONVERSIONS',
    label: 'Website conversions',
    description: 'Optimizes for people likely to complete a conversion event on your site.',
  },
  {
    value: 'VALUE',
    label: 'Conversion value',
    description: 'Optimizes for the highest purchase value rather than the most purchases.',
  },
  {
    value: 'LANDING_PAGE_VIEWS',
    label: 'Landing page views',
    description: 'Optimizes for people likely to click through and fully load your page.',
  },
  {
    value: 'LINK_CLICKS',
    label: 'Link clicks',
    description: 'Optimizes for people likely to click your ad link.',
  },
  {
    value: 'LEAD_GENERATION',
    label: 'Leads',
    description: 'Optimizes for people likely to submit an instant form.',
  },
  {
    value: 'QUALITY_LEAD',
    label: 'Quality leads',
    description: 'Optimizes for leads likely to convert further down the funnel.',
  },
  {
    value: 'CONVERSATIONS',
    label: 'Conversations',
    description: 'Optimizes for people likely to start a message thread.',
  },
  {
    value: 'POST_ENGAGEMENT',
    label: 'Post engagement',
    description: 'Optimizes for likes, comments and shares.',
  },
  {
    value: 'PAGE_LIKES',
    label: 'Page likes',
    description: 'Optimizes for people likely to like your Page.',
  },
  {
    value: 'EVENT_RESPONSES',
    label: 'Event responses',
    description: 'Optimizes for people likely to respond to your event.',
  },
  {
    value: 'THRUPLAY',
    label: 'ThruPlays',
    description: 'Optimizes for video plays to completion or at least 15 seconds.',
  },
  {
    value: 'AD_RECALL_LIFT',
    label: 'Ad recall lift',
    description: 'Optimizes for people likely to remember your ad.',
  },
  {
    value: 'REACH',
    label: 'Reach',
    description: 'Optimizes for the most unique people seeing the ad.',
  },
  {
    value: 'IMPRESSIONS',
    label: 'Impressions',
    description: 'Optimizes for showing the ad as often as possible.',
  },
];

export const DEFAULT_OPTIMIZATION_GOAL = 'OFFSITE_CONVERSIONS';

/**
 * Billing is COMPUTED from the goal, never chosen: Meta refuses a goal/billing pair it
 * does not allow, and the Backend derives exactly one per goal. Video goals bill per
 * ThruPlay; everything else bills on impressions.
 */
export const billingEventForGoal = (goal: string | undefined): string =>
  goal === 'THRUPLAY' ? 'THRUPLAY' : 'IMPRESSIONS';

export const AD_FORMATS: Array<{ value: AdFormat; label: string; description: string }> = [
  {
    value: 'IMAGE',
    label: 'Single Image',
    description: 'Single Image uses one static visual for each impression.',
  },
  {
    value: 'VIDEO',
    label: 'Single Video',
    description: 'Single Video uses one motion creative with optional audio.',
  },
  {
    value: 'CAROUSEL',
    label: 'Carousel',
    description: 'Carousel presents multiple swipeable cards in one ad unit.',
  },
  {
    value: 'COLLECTION',
    label: 'Collection',
    description: 'Collection combines a hero asset with product-style follow-up cards.',
  },
];

export const CALL_TO_ACTIONS = [
  {
    value: 'LEARN_MORE',
    label: 'Learn More',
    description: 'Learn More invites users to explore details before deciding.',
  },
  {
    value: 'SHOP_NOW',
    label: 'Shop Now',
    description: 'Shop Now emphasizes immediate product browsing or purchase intent.',
  },
  {
    value: 'SIGN_UP',
    label: 'Sign Up',
    description: 'Sign Up prompts users to register or create an account.',
  },
  {
    value: 'BOOK_NOW',
    label: 'Book Now',
    description: 'Book Now directs users toward scheduling or reservation actions.',
  },
  {
    value: 'CONTACT_US',
    label: 'Contact Us',
    description: 'Contact Us encourages direct outreach through message or form.',
  },
  {
    value: 'DOWNLOAD',
    label: 'Download',
    description: 'Download prompts users to save a file or install an asset.',
  },
];

export const LOCATIONS = [
  {
    value: 'MX',
    label: 'Mexico',
    description: 'Mexico targeting restricts delivery to users located in Mexico.',
  },
  {
    value: 'BR',
    label: 'Brazil',
    description: 'Brazil targeting restricts delivery to users located in Brazil.',
  },
  {
    value: 'AR',
    label: 'Argentina',
    description: 'Argentina targeting restricts delivery to users located in Argentina.',
  },
  {
    value: 'CO',
    label: 'Colombia',
    description: 'Colombia targeting restricts delivery to users located in Colombia.',
  },
  {
    value: 'CL',
    label: 'Chile',
    description: 'Chile targeting restricts delivery to users located in Chile.',
  },
  {
    value: 'PE',
    label: 'Peru',
    description: 'Peru targeting restricts delivery to users located in Peru.',
  },
  {
    value: 'EC',
    label: 'Ecuador',
    description: 'Ecuador targeting restricts delivery to users located in Ecuador.',
  },
  {
    value: 'UY',
    label: 'Uruguay',
    description: 'Uruguay targeting restricts delivery to users located in Uruguay.',
  },
  {
    value: 'PY',
    label: 'Paraguay',
    description: 'Paraguay targeting restricts delivery to users located in Paraguay.',
  },
  {
    value: 'BO',
    label: 'Bolivia',
    description: 'Bolivia targeting restricts delivery to users located in Bolivia.',
  },
  {
    value: 'CR',
    label: 'Costa Rica',
    description: 'Costa Rica targeting restricts delivery to users located in Costa Rica.',
  },
  {
    value: 'PA',
    label: 'Panama',
    description: 'Panama targeting restricts delivery to users located in Panama.',
  },
  {
    value: 'DO',
    label: 'Dominican Republic',
    description:
      'Dominican Republic targeting restricts delivery to users located in the Dominican Republic.',
  },
];

export const AGE_RANGES = [
  { min: 18, max: 24, label: '18-24', description: 'Targets adults between ages 18 and 24.' },
  { min: 25, max: 34, label: '25-34', description: 'Targets adults between ages 25 and 34.' },
  { min: 35, max: 44, label: '35-44', description: 'Targets adults between ages 35 and 44.' },
  { min: 45, max: 54, label: '45-54', description: 'Targets adults between ages 45 and 54.' },
  { min: 55, max: 64, label: '55-64', description: 'Targets adults between ages 55 and 64.' },
  { min: 65, max: 65, label: '65+', description: 'Targets adults age 65 and older.' },
];

/** Meta's age bounds for broad targeting; 65 means "65 and older". */
export const AUDIENCE_AGE_MIN = 18;
export const AUDIENCE_AGE_MAX = 65;
/** Broad targeting names 1 to 25 countries. */
export const AUDIENCE_MAX_COUNTRIES = 25;

/** The surfaces a scaffold can place on — the Backend's placement vocabulary. */
export const PUBLISHER_PLATFORMS = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
];

export const FACEBOOK_POSITIONS = [
  { value: 'feed', label: 'Feed' },
  { value: 'facebook_reels', label: 'Reels' },
  { value: 'story', label: 'Stories' },
  { value: 'video_feeds', label: 'Video feeds' },
];

export const INSTAGRAM_POSITIONS = [
  { value: 'stream', label: 'Feed' },
  { value: 'story', label: 'Stories' },
  { value: 'reels', label: 'Reels' },
  { value: 'explore', label: 'Explore' },
];

export const DEVICE_PLATFORMS = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'desktop', label: 'Desktop' },
];

/**
 * The display labels of a placement choice — the same flattening `scaffoldTree.ts`
 * applies to a row's `payload.placement`, so an edited ad set and a hydrated one read
 * alike ('Advantage+', 'facebook', 'fb:feed', 'mobile').
 */
export function placementLabels(placement: {
  placementMode?: PlacementMode;
  publisherPlatforms?: string[];
  facebookPositions?: string[];
  instagramPositions?: string[];
  devicePlatforms?: string[];
}): string[] {
  if (placement.placementMode === 'advantage_plus') return ['Advantage+'];
  if (placement.placementMode !== 'manual') return [];
  return [
    ...(placement.publisherPlatforms ?? []),
    ...(placement.facebookPositions ?? []).map((entry) => `fb:${entry}`),
    ...(placement.instagramPositions ?? []).map((entry) => `ig:${entry}`),
    ...(placement.devicePlatforms ?? []),
  ];
}
