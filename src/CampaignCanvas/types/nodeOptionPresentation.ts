import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

type ScaleText = ReturnType<typeof useTranslations<'scale'>>;

// Only source-owned option copy enters this map. Authored names and creative text stay separate.
const optionKeys = {
  Awareness: 'canvasOption_0',
  'Awareness optimization prioritizes people likely to remember your ad.':
    'awareness_optimization_prioritizes_people_lik_3429abb',
  Traffic: 'traffic_4876efb',
  'Traffic optimization favors people likely to click through to your destination.':
    'traffic_optimization_favors_people_likely_to__0da251d',
  Engagement: 'canvasOption_1',
  'Engagement optimization prioritizes likes, comments, shares, and similar interactions.':
    'engagement_optimization_prioritizes_likes_com_c2abc1d',
  Leads: 'leads_2f10a26',
  'Leads optimization targets users likely to submit forms or inquiries.':
    'leads_optimization_targets_users_likely_to_su_47c53b6',
  'App Promotion': 'app_promotion_e9426ab',
  'App Promotion optimization focuses on installs and in-app actions.':
    'app_promotion_optimization_focuses_on_install_3101bc3',
  Sales: 'canvasOption_2',
  'Sales optimization prioritizes users likely to complete purchases.':
    'sales_optimization_prioritizes_users_likely_t_6a5e450',
  Housing: 'canvasOption_3',
  'Housing covers ads related to homes, rentals, or mortgage opportunities.':
    'housing_covers_ads_related_to_homes_rentals_o_aa2d27a',
  Employment: 'canvasOption_4',
  'Employment covers job listings, recruiting, and hiring-related ads.':
    'employment_covers_job_listings_recruiting_and_2b1e799',
  Credit: 'canvasOption_5',
  'Credit covers lending, financing, and related credit offers.':
    'credit_covers_lending_financing_and_related_c_67dc001',
  'Issues, Elections or Politics': 'issues_elections_or_politics_15e7044',
  'This category flags social issue, election, or political content.':
    'this_category_flags_social_issue_election_or__20e6f7c',
  'Financial products': 'financial_products_5c0b98c',
  'Financial products and services such as banking, insurance or investing.':
    'financial_products_and_services_such_as_banki_79fb411',
  'Gambling and gaming': 'gambling_and_gaming_07b3af4',
  'Online gambling and real-money gaming.': 'online_gambling_and_real_money_gaming_7d99c13',
  'Website conversions': 'website_conversions_e2a6698',
  'Optimizes for people likely to complete a conversion event on your site.':
    'optimizes_for_people_likely_to_complete_a_con_df96e14',
  'Conversion value': 'conversion_value_221e277',
  'Optimizes for the highest purchase value rather than the most purchases.':
    'optimizes_for_the_highest_purchase_value_rath_787a7e1',
  'Landing page views': 'optimizer_metricLandingPageViews',
  'Optimizes for people likely to click through and fully load your page.':
    'optimizes_for_people_likely_to_click_through__28b4634',
  'Link clicks': 'optimizer_metricLinkClicks',
  'Optimizes for people likely to click your ad link.':
    'optimizes_for_people_likely_to_click_your_ad__b390762',
  'Optimizes for people likely to submit an instant form.':
    'optimizes_for_people_likely_to_submit_an_inst_5c68b09',
  'Quality leads': 'quality_leads_a274caf',
  'Optimizes for leads likely to convert further down the funnel.':
    'optimizes_for_leads_likely_to_convert_further_68084ff',
  Conversations: 'conversations_1d432f5',
  'Optimizes for people likely to start a message thread.':
    'optimizes_for_people_likely_to_start_a_messag_0fd9dd7',
  'Post engagement': 'post_engagement_8889aeb',
  'Optimizes for likes, comments and shares.': 'optimizes_for_likes_comments_and_shares_a283e85',
  'Page likes': 'page_likes_125e96d',
  'Optimizes for people likely to like your Page.':
    'optimizes_for_people_likely_to_like_your_page_761c7ad',
  'Event responses': 'event_responses_1139ac0',
  'Optimizes for people likely to respond to your event.':
    'optimizes_for_people_likely_to_respond_to_you_e3db5c1',
  ThruPlays: 'optimizer_nounThruplays',
  'Optimizes for video plays to completion or at least 15 seconds.':
    'optimizes_for_video_plays_to_completion_or_at_22bda3c',
  'Ad recall lift': 'ad_recall_lift_805abc3',
  'Optimizes for people likely to remember your ad.':
    'optimizes_for_people_likely_to_remember_your__ac4dd11',
  Reach: 'funnel_reach',
  'Optimizes for the most unique people seeing the ad.':
    'optimizes_for_the_most_unique_people_seeing_t_2d279c8',
  Impressions: 'optimizer_metricImpressions',
  'Optimizes for showing the ad as often as possible.':
    'optimizes_for_showing_the_ad_as_often_as_poss_9b02c08',
  'Single Image': 'single_image_8fd6bdf',
  'Single Image uses one static visual for each impression.':
    'single_image_uses_one_static_visual_for_each__4eacc06',
  'Single Video': 'single_video_71274c9',
  'Single Video uses one motion creative with optional audio.':
    'single_video_uses_one_motion_creative_with_op_4c1cd64',
  Carousel: 'carousel_37219fb',
  'Carousel presents multiple swipeable cards in one ad unit.':
    'carousel_presents_multiple_swipeable_cards_in_9091523',
  Collection: 'canvasOption_6',
  'Collection combines a hero asset with product-style follow-up cards.':
    'collection_combines_a_hero_asset_with_product_4814ab6',
  'Learn More': 'learn_more_8d8cd54',
  'Learn More invites users to explore details before deciding.':
    'learn_more_invites_users_to_explore_details_b_3277bdd',
  'Shop Now': 'shop_now_6edcd4e',
  'Shop Now emphasizes immediate product browsing or purchase intent.':
    'shop_now_emphasizes_immediate_product_browsin_b7b5ebc',
  'Sign Up': 'sign_up_47de235',
  'Sign Up prompts users to register or create an account.':
    'sign_up_prompts_users_to_register_or_create_a_1b85c6a',
  'Book Now': 'book_now_67be793',
  'Book Now directs users toward scheduling or reservation actions.':
    'book_now_directs_users_toward_scheduling_or_r_973dd6d',
  'Contact Us': 'contact_us_98b6706',
  'Contact Us encourages direct outreach through message or form.':
    'contact_us_encourages_direct_outreach_through_d31ebfd',
  Download: 'download_d6eafe8',
  'Download prompts users to save a file or install an asset.':
    'download_prompts_users_to_save_a_file_or_inst_7538cde',
  'Mexico targeting restricts delivery to users located in Mexico.':
    'mexico_targeting_restricts_delivery_to_users__8b9e31f',
  'Brazil targeting restricts delivery to users located in Brazil.':
    'brazil_targeting_restricts_delivery_to_users__6f0223e',
  'Argentina targeting restricts delivery to users located in Argentina.':
    'argentina_targeting_restricts_delivery_to_use_d51cba6',
  'Colombia targeting restricts delivery to users located in Colombia.':
    'colombia_targeting_restricts_delivery_to_user_55b3fb1',
  'Chile targeting restricts delivery to users located in Chile.':
    'chile_targeting_restricts_delivery_to_users_l_b9200c9',
  'Peru targeting restricts delivery to users located in Peru.':
    'peru_targeting_restricts_delivery_to_users_lo_ed90e3b',
  'Ecuador targeting restricts delivery to users located in Ecuador.':
    'ecuador_targeting_restricts_delivery_to_users_e44c667',
  'Uruguay targeting restricts delivery to users located in Uruguay.':
    'uruguay_targeting_restricts_delivery_to_users_785b077',
  'Paraguay targeting restricts delivery to users located in Paraguay.':
    'paraguay_targeting_restricts_delivery_to_user_4d246dc',
  'Bolivia targeting restricts delivery to users located in Bolivia.':
    'bolivia_targeting_restricts_delivery_to_users_9eff106',
  'Costa Rica targeting restricts delivery to users located in Costa Rica.':
    'costa_rica_targeting_restricts_delivery_to_us_6193939',
  'Panama targeting restricts delivery to users located in Panama.':
    'panama_targeting_restricts_delivery_to_users__b76c301',
  'Dominican Republic': 'dominican_republic_81e884c',
  'Dominican Republic targeting restricts delivery to users located in the Dominican Republic.':
    'dominican_republic_targeting_restricts_delive_d29f92e',
  'Targets adults between ages 18 and 24.': 'targets_adults_between_ages_18_and_24_bdb67b2',
  'Targets adults between ages 25 and 34.': 'targets_adults_between_ages_25_and_34_40df119',
  'Targets adults between ages 35 and 44.': 'targets_adults_between_ages_35_and_44_62522d4',
  'Targets adults between ages 45 and 54.': 'targets_adults_between_ages_45_and_54_a7e852b',
  'Targets adults between ages 55 and 64.': 'targets_adults_between_ages_55_and_64_2be05a6',
  'Targets adults age 65 and older.': 'targets_adults_age_65_and_older_b98a459',
  Stories: 'canvasOption_7',
  'Video feeds': 'video_feeds_f9dafb0',
  Explore: 'canvasOption_8',
  Mobile: 'canvasOption_9',
  Desktop: 'canvasOption_10',
  All: 'all_a52ace4',
  Men: 'canvasOption_15',
  Women: 'canvasOption_16',
  Manual: 'canvasOption_19',
  'None listed': 'canvasOption_11',
  'From the members': 'canvasOption_12',
  Ages: 'canvasOption_13',
  'Any age': 'canvasOption_14',
} as const;

export function localizeNodeOptionCopy(source: string, translate: ScaleText): string {
  return Object.hasOwn(optionKeys, source)
    ? translate(optionKeys[source as keyof typeof optionKeys])
    : source;
}

type Option = { label: string; description?: string };
const optionsByLocale = new WeakMap<readonly Option[], Map<string, readonly Option[]>>();
const countriesByLocale = new Map<UiLocale, Intl.DisplayNames>();
const listsByLocale = new Map<UiLocale, Intl.ListFormat>();

export function countryName(code: string, locale: UiLocale): string {
  if (!/^[A-Z]{2}$/.test(code) || code === 'ZZ') return code;
  let names = countriesByLocale.get(locale);
  if (!names) {
    names = new Intl.DisplayNames(locale, { type: 'region' });
    countriesByLocale.set(locale, names);
  }
  return names.of(code) ?? code;
}

export function countryList(codes: readonly string[], locale: UiLocale): string {
  let formatter = listsByLocale.get(locale);
  if (!formatter) {
    formatter = new Intl.ListFormat(locale, {
      style: 'short',
      type: 'conjunction',
    });
    listsByLocale.set(locale, formatter);
  }
  return formatter.format(codes.map((code) => countryName(code, locale)));
}

/** Static bundled catalogs make a locale-keyed cache safe across nodes and account changes. */
export function localizedNodeOptions<T extends Option>(
  source: readonly T[],
  translate: ScaleText,
  locale: UiLocale,
  countries = false,
): readonly T[] {
  let cache = optionsByLocale.get(source);
  if (!cache) {
    cache = new Map();
    optionsByLocale.set(source, cache);
  }
  const key = `${locale}:${countries}`;
  const existing = cache.get(key);
  if (existing) return existing as readonly T[];
  const localized = source.map((option) =>
    Object.freeze({
      ...option,
      label:
        countries && 'value' in option && typeof option.value === 'string'
          ? countryName(option.value, locale)
          : localizeNodeOptionCopy(option.label, translate),
      ...(option.description
        ? { description: localizeNodeOptionCopy(option.description, translate) }
        : {}),
    }),
  );
  Object.freeze(localized);
  cache.set(key, localized);
  return localized;
}
