// OpenAI Ads (ChatGPT Ads) — the shapes that cross FE <-> BE for the Advertiser API.
//
// Two halves with deliberately different strictness. REQUEST schemas (what we send to
// api.ads.openai.com) are strict: an out-of-range enum or a budget under the documented
// minimum is a 400 we can refuse locally instead of paying a round trip for. RESPONSE
// schemas are permissive where the docs do not enumerate a field's values, because an
// upstream adding a status must not blank a user's dashboard.
//
// Money is ALWAYS micros on the wire (millionths of the account currency). Dollars exist
// only at the render edge; a float never enters these types.

import { z } from 'zod';

export const OPENAI_ADS_BASE_URL = 'https://api.ads.openai.com/v1';

/** Minimum lifetime budget the API accepts, in micros ($1.00 for a USD account). */
export const OPENAI_ADS_MIN_LIFETIME_BUDGET_MICROS = 1_000_000;

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The status an object may be CREATED with. `archived` is not creatable. */
export const openAiAdsCreateStatusSchema = z.enum(['active', 'paused']);
export type OpenAiAdsCreateStatus = z.infer<typeof openAiAdsCreateStatusSchema>;

/** The status an object may be UPDATED to. Archiving is irreversible. */
export const openAiAdsMutableStatusSchema = z.enum(['active', 'paused', 'archived']);
export type OpenAiAdsMutableStatus = z.infer<typeof openAiAdsMutableStatusSchema>;

/** The dedicated state-transition endpoints: POST /{kind}/{id}/{action}. */
export const openAiAdsStateActionSchema = z.enum(['activate', 'pause', 'archive']);
export type OpenAiAdsStateAction = z.infer<typeof openAiAdsStateActionSchema>;

/** Which object a state action targets. */
export const openAiAdsEntityKindSchema = z.enum(['campaign', 'ad_group', 'ad']);
export type OpenAiAdsEntityKind = z.infer<typeof openAiAdsEntityKindSchema>;

/**
 * Campaign goal. `conversions` is oCPC and requires exactly one active standard
 * conversion event setting, plus conversion bidding enabled on the account.
 */
export const openAiAdsBiddingTypeSchema = z.enum(['impressions', 'clicks', 'conversions']);
export type OpenAiAdsBiddingType = z.infer<typeof openAiAdsBiddingTypeSchema>;

/**
 * Ad-group billing event. `impression` for impression campaigns; `click` for BOTH click
 * and conversion campaigns — under oCPC `max_bid_micros` is the CPA bid even though the
 * billing event stays a click.
 */
export const openAiAdsBillingEventTypeSchema = z.enum(['impression', 'click']);
export type OpenAiAdsBillingEventType = z.infer<typeof openAiAdsBillingEventTypeSchema>;

export const openAiAdsCreativeTypeSchema = z.enum(['chat_card', 'product_ad_template']);
export type OpenAiAdsCreativeType = z.infer<typeof openAiAdsCreativeTypeSchema>;

/** Ad review outcome. Enumerated exhaustively in the Ads reference. */
export const openAiAdsReviewStatusSchema = z.enum(['in_review', 'rejected', 'approved']);
export type OpenAiAdsReviewStatus = z.infer<typeof openAiAdsReviewStatusSchema>;

/** Upload purposes. Omitted purpose = an ad creative image. */
export const openAiAdsUploadPurposeSchema = z.enum(['account_favicon', 'custom_audience']);
export type OpenAiAdsUploadPurpose = z.infer<typeof openAiAdsUploadPurposeSchema>;

// ---------------------------------------------------------------------------
// Ad account
// ---------------------------------------------------------------------------

/**
 * Brand review. An account whose `status` is anything but `approved` CANNOT serve ads —
 * `reason: 'missing_favicon'` is the one the partner guide tells us to fix ourselves.
 * `status` is a bare string because the reference documents only two of its values.
 */
export const openAiAdsAccountReviewSchema = z.object({
  status: z.string(),
  reason: z.string().nullish(),
});
export type OpenAiAdsAccountReview = z.infer<typeof openAiAdsAccountReviewSchema>;

export const openAiAdAccountSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  url: z.string().nullish(),
  preview_url: z.string().nullish(),
  status: z.string().nullish(),
  timezone: z.string().nullish(),
  currency_code: z.string().nullish(),
  review: openAiAdsAccountReviewSchema.nullish(),
});
export type OpenAiAdAccount = z.infer<typeof openAiAdAccountSchema>;

/** The single question the launch flow asks of an account before it lets anything serve. */
export const isOpenAiAccountServable = (account: OpenAiAdAccount): boolean =>
  account.review?.status === 'approved';

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

/**
 * A location the campaign may deliver in. Only `id` is sent; the API expands the rest
 * onto the saved campaign, which is why every other field is read-side only.
 */
export const openAiAdsLocationSchema = z.object({
  id: z.string(),
  type: z.string().nullish(),
  name: z.string().nullish(),
  country_code: z.string().nullish(),
  region_code: z.string().nullish(),
  canonical_name: z.string().nullish(),
});
export type OpenAiAdsLocation = z.infer<typeof openAiAdsLocationSchema>;

export const openAiAdsTargetingSchema = z.object({
  locations: z.object({ include: z.array(openAiAdsLocationSchema).default([]) }).nullish(),
  custom_audiences: z.object({ ids: z.array(z.string()).default([]) }).nullish(),
  excluded_custom_audiences: z.object({ ids: z.array(z.string()).default([]) }).nullish(),
});
export type OpenAiAdsTargeting = z.infer<typeof openAiAdsTargetingSchema>;

/** Write side: an included location needs nothing but its id. */
export const openAiAdsTargetingInputSchema = z.object({
  locations: z.object({ include: z.array(z.object({ id: z.string().min(1) })) }).optional(),
  custom_audiences: z.object({ ids: z.array(z.string().min(1)) }).optional(),
  excluded_custom_audiences: z.object({ ids: z.array(z.string().min(1)) }).optional(),
});
export type OpenAiAdsTargetingInput = z.infer<typeof openAiAdsTargetingInputSchema>;

export const openAiAdsGeoSearchResponseSchema = z.object({
  count: z.number().nullish(),
  query: z.string().nullish(),
  results: z.array(openAiAdsLocationSchema).default([]),
});
export type OpenAiAdsGeoSearchResponse = z.infer<typeof openAiAdsGeoSearchResponseSchema>;

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

export const openAiAdsBudgetSchema = z.object({
  lifetime_spend_limit_micros: z.number().int(),
});
export type OpenAiAdsBudget = z.infer<typeof openAiAdsBudgetSchema>;

export const openAiAdsCampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  status: z.string(),
  created_at: z.number().nullish(),
  updated_at: z.number().nullish(),
  start_time: z.number().nullish(),
  end_time: z.number().nullish(),
  budget: openAiAdsBudgetSchema.nullish(),
  bidding_type: z.string().nullish(),
  conversion_event_setting_ids: z.array(z.string()).nullish(),
  mode: z.string().nullish(),
  product_feed_id: z.string().nullish(),
  targeting: openAiAdsTargetingSchema.nullish(),
});
export type OpenAiAdsCampaign = z.infer<typeof openAiAdsCampaignSchema>;

/**
 * `name` is 3..1000 chars and must contain a non-space character. `status` is capped at
 * the CREATE vocabulary: the client forces `paused` anyway, but a caller that asks for
 * `archived` at creation is a bug worth naming here rather than at the API.
 */
export const openAiAdsCampaignCreateRequestSchema = z.object({
  name: z.string().trim().min(3).max(1000),
  description: z.string().max(1000).optional(),
  status: openAiAdsCreateStatusSchema.default('paused'),
  start_time: z.number().int().min(946684800).max(4102444800).optional(),
  end_time: z.number().int().min(946684800).max(4102444800).optional(),
  budget: z.object({
    lifetime_spend_limit_micros: z.number().int().min(OPENAI_ADS_MIN_LIFETIME_BUDGET_MICROS),
  }),
  bidding_type: openAiAdsBiddingTypeSchema.optional(),
  conversion_event_setting_ids: z.array(z.string().min(1)).max(1).optional(),
  mode: z.literal('product_feed').optional(),
  product_feed_id: z.string().min(1).optional(),
  targeting: openAiAdsTargetingInputSchema.optional(),
});
export type OpenAiAdsCampaignCreateRequest = z.infer<typeof openAiAdsCampaignCreateRequestSchema>;

/**
 * `bidding_type` and `conversion_event_setting_ids` are absent on purpose: the API
 * refuses to change either after creation, so offering them here would build a control
 * whose only outcome is an error.
 */
export const openAiAdsCampaignUpdateRequestSchema = z.object({
  name: z.string().trim().min(3).max(1000).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: openAiAdsMutableStatusSchema.optional(),
  start_time: z.number().int().nullable().optional(),
  end_time: z.number().int().nullable().optional(),
  budget: z
    .object({
      lifetime_spend_limit_micros: z.number().int().min(OPENAI_ADS_MIN_LIFETIME_BUDGET_MICROS),
    })
    .optional(),
  targeting: openAiAdsTargetingInputSchema.nullable().optional(),
});
export type OpenAiAdsCampaignUpdateRequest = z.infer<typeof openAiAdsCampaignUpdateRequestSchema>;

// ---------------------------------------------------------------------------
// Ad group
// ---------------------------------------------------------------------------

export const openAiAdsBidMultiplierSchema = z.object({
  custom_audience_id: z.string(),
  bid_multiplier_micros: z.number().int(),
});

export const openAiAdsBiddingConfigSchema = z.object({
  billing_event_type: z.string(),
  max_bid_micros: z.number().int(),
  custom_audience_bid_multipliers: z.array(openAiAdsBidMultiplierSchema).nullish(),
});
export type OpenAiAdsBiddingConfig = z.infer<typeof openAiAdsBiddingConfigSchema>;

export const openAiAdsAdGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  status: z.string(),
  created_at: z.number().nullish(),
  updated_at: z.number().nullish(),
  context_hints: z.array(z.string()).nullish(),
  bidding_config: openAiAdsBiddingConfigSchema.nullish(),
});
export type OpenAiAdsAdGroup = z.infer<typeof openAiAdsAdGroupSchema>;

export const openAiAdsAdGroupCreateRequestSchema = z.object({
  campaign_id: z.string().min(1),
  name: z.string().trim().min(3).max(1000),
  description: z.string().max(1000).optional(),
  status: openAiAdsCreateStatusSchema.default('paused'),
  context_hints: z.array(z.string().min(1)).optional(),
  bidding_config: z.object({
    billing_event_type: openAiAdsBillingEventTypeSchema,
    max_bid_micros: z.number().int().min(1),
    custom_audience_bid_multipliers: z
      .array(
        z.object({
          custom_audience_id: z.string().min(1),
          bid_multiplier_micros: z.number().int().min(100000).max(10000000),
        }),
      )
      .optional(),
  }),
});
export type OpenAiAdsAdGroupCreateRequest = z.infer<typeof openAiAdsAdGroupCreateRequestSchema>;

export const openAiAdsAdGroupUpdateRequestSchema = z.object({
  name: z.string().trim().min(3).max(1000).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: openAiAdsMutableStatusSchema.optional(),
  context_hints: z.array(z.string().min(1)).nullable().optional(),
  bidding_config: z
    .object({
      billing_event_type: openAiAdsBillingEventTypeSchema,
      max_bid_micros: z.number().int().min(1),
    })
    .optional(),
});
export type OpenAiAdsAdGroupUpdateRequest = z.infer<typeof openAiAdsAdGroupUpdateRequestSchema>;

// ---------------------------------------------------------------------------
// Ad
// ---------------------------------------------------------------------------

export const openAiAdsCreativeSchema = z.object({
  type: z.string(),
  title: z.string().nullish(),
  body: z.string().nullish(),
  price: z.string().nullish(),
  target_url: z.string().nullish(),
  file_id: z.string().nullish(),
  image_url: z.string().nullish(),
});
export type OpenAiAdsCreative = z.infer<typeof openAiAdsCreativeSchema>;

export const openAiAdsAdSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  review_status: z.string().nullish(),
  created_at: z.number().nullish(),
  updated_at: z.number().nullish(),
  creative: openAiAdsCreativeSchema.nullish(),
});
export type OpenAiAdsAd = z.infer<typeof openAiAdsAdSchema>;

/**
 * A `chat_card` needs `target_url` and `file_id`; a `product_ad_template` takes both from
 * the selected feed item. The refinement is what keeps a half-filled chat card from
 * reaching the API as a 400 the user has to decode.
 */
export const openAiAdsCreativeInputSchema = z
  .object({
    type: openAiAdsCreativeTypeSchema.default('chat_card'),
    title: z.string().trim().min(3).max(50),
    body: z.string().trim().min(1).max(100),
    price: z.string().max(50).optional(),
    target_url: z.string().url().optional(),
    file_id: z.string().min(1).optional(),
  })
  .refine((creative) => creative.type !== 'chat_card' || Boolean(creative.target_url), {
    message: 'target_url is required for a chat_card creative',
    path: ['target_url'],
  })
  .refine((creative) => creative.type !== 'chat_card' || Boolean(creative.file_id), {
    message: 'file_id is required for a chat_card creative',
    path: ['file_id'],
  });
export type OpenAiAdsCreativeInput = z.infer<typeof openAiAdsCreativeInputSchema>;

export const openAiAdsAdCreateRequestSchema = z.object({
  ad_group_id: z.string().min(1),
  name: z.string().trim().min(3).max(1000),
  status: openAiAdsCreateStatusSchema.default('paused'),
  creative: openAiAdsCreativeInputSchema,
});
export type OpenAiAdsAdCreateRequest = z.infer<typeof openAiAdsAdCreateRequestSchema>;

export const openAiAdsAdUpdateRequestSchema = z.object({
  name: z.string().trim().min(3).max(1000).optional(),
  status: openAiAdsMutableStatusSchema.optional(),
  creative: openAiAdsCreativeInputSchema.optional(),
});
export type OpenAiAdsAdUpdateRequest = z.infer<typeof openAiAdsAdUpdateRequestSchema>;

export const openAiAdsAdPreviewResponseSchema = z.object({
  preview_url: z.string().nullish(),
  expires_at: z.number().nullish(),
});
export type OpenAiAdsAdPreviewResponse = z.infer<typeof openAiAdsAdPreviewResponseSchema>;

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const openAiAdsUploadRequestSchema = z.object({
  image_url: z.string().url(),
  purpose: openAiAdsUploadPurposeSchema.optional(),
});
export type OpenAiAdsUploadRequest = z.infer<typeof openAiAdsUploadRequestSchema>;

export const openAiAdsUploadResponseSchema = z.object({ file_id: z.string() });
export type OpenAiAdsUploadResponse = z.infer<typeof openAiAdsUploadResponseSchema>;

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export const openAiAdsInsightRowSchema = z.object({
  id: z.string().nullish(),
  readable_time: z.string().nullish(),
  timezone: z.string().nullish(),
  impressions: z.number().nullish(),
  clicks: z.number().nullish(),
  spend: z.number().nullish(),
  ctr: z.number().nullish(),
  cpc: z.number().nullish(),
  cpm: z.number().nullish(),
  start_time: z.number().nullish(),
  end_time: z.number().nullish(),
});
export type OpenAiAdsInsightRow = z.infer<typeof openAiAdsInsightRowSchema>;

export const openAiAdsInsightsScopeSchema = z.enum(['ad_account', 'campaign', 'ad_group', 'ad']);
export type OpenAiAdsInsightsScope = z.infer<typeof openAiAdsInsightsScopeSchema>;

export const openAiAdsTimeGranularitySchema = z.enum(['hourly', 'daily', 'monthly', 'none']);
export type OpenAiAdsTimeGranularity = z.infer<typeof openAiAdsTimeGranularitySchema>;

// ---------------------------------------------------------------------------
// List envelope
// ---------------------------------------------------------------------------

/**
 * Every list endpoint returns the same cursor-paged envelope. Built as a factory rather
 * than duplicated per resource so `has_more` / `last_id` cannot drift between them.
 */
export const openAiAdsListSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    object: z.string().nullish(),
    count: z.number().nullish(),
    data: z.array(item).default([]),
    first_id: z.string().nullish(),
    last_id: z.string().nullish(),
    has_more: z.boolean().nullish(),
  });

export const openAiAdsCampaignListSchema = openAiAdsListSchema(openAiAdsCampaignSchema);
export const openAiAdsAdGroupListSchema = openAiAdsListSchema(openAiAdsAdGroupSchema);
export const openAiAdsAdListSchema = openAiAdsListSchema(openAiAdsAdSchema);
export const openAiAdsInsightListSchema = openAiAdsListSchema(openAiAdsInsightRowSchema);

// ---------------------------------------------------------------------------
// The canvas read: one campaign and everything under it
// ---------------------------------------------------------------------------

/**
 * What "open this campaign in the canvas" reads. One request rather than 1 + N + N*M,
 * because a canvas that hydrates in three waterfalls shows a half-drawn graph the user
 * can already edit.
 */
export const openAiAdsCampaignTreeSchema = z.object({
  campaign: openAiAdsCampaignSchema,
  ad_groups: z
    .array(
      z.object({
        ad_group: openAiAdsAdGroupSchema,
        ads: z.array(openAiAdsAdSchema).default([]),
      }),
    )
    .default([]),
});
export type OpenAiAdsCampaignTree = z.infer<typeof openAiAdsCampaignTreeSchema>;

// ---------------------------------------------------------------------------
// Continuum's own HTTP envelopes (FE <-> BE)
// ---------------------------------------------------------------------------

/**
 * Why a connect attempt failed, in terms the UI can act on. `partner_not_configured` is
 * the one that needs a human: OpenAI has to enable the capability for that ad account,
 * and the only fix is to contact the partner representative.
 */
export const openAiAdsErrorCodeSchema = z.enum([
  'invalid_key',
  'partner_not_configured',
  'conversions_not_enabled',
  'ocpc_not_enabled',
  'rate_limited',
  'account_not_connected',
  'upstream_error',
]);
export type OpenAiAdsErrorCode = z.infer<typeof openAiAdsErrorCodeSchema>;

export const openAiAdsErrorSchema = z.object({
  error: openAiAdsErrorCodeSchema,
  message: z.string(),
  hint: z.string().optional(),
});
export type OpenAiAdsError = z.infer<typeof openAiAdsErrorSchema>;

export const openAiAdsConnectRequestSchema = z.object({
  apiKey: z.string().trim().min(8),
  brandId: z.string().uuid(),
});
export type OpenAiAdsConnectRequest = z.infer<typeof openAiAdsConnectRequestSchema>;

/** No echo of the key. The account is the whole receipt a connect needs to return. */
export const openAiAdsConnectResponseSchema = z.object({
  integrationId: z.string(),
  account: openAiAdAccountSchema,
});
export type OpenAiAdsConnectResponse = z.infer<typeof openAiAdsConnectResponseSchema>;

export const openAiAdsAccountResponseSchema = z.object({
  account: openAiAdAccountSchema,
  servable: z.boolean(),
});
export type OpenAiAdsAccountResponse = z.infer<typeof openAiAdsAccountResponseSchema>;

/** Every write route names the ad account it acts on; the token is resolved from it. */
export const openAiAdsScopeSchema = z.object({
  brandId: z.string().uuid(),
  adAccountId: z.string().min(1),
});
export type OpenAiAdsScope = z.infer<typeof openAiAdsScopeSchema>;
