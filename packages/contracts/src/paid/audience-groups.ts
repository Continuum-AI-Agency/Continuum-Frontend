import { z } from 'zod';

export const metaWebsiteAudienceEventSchema = z.enum([
  'PageView',
  'ViewContent',
  'Search',
  'AddToCart',
  'InitiateCheckout',
  'Purchase',
  'Lead',
  'CompleteRegistration',
]);

export const metaEngagementSourceTypeSchema = z.enum(['page', 'ig_business', 'video']);

export const metaEngagementEventSchema = z.enum([
  'page_engaged',
  'page_visited',
  'page_liked',
  'ig_business_profile_all',
  'ig_business_profile_visit',
  'video_watched',
  'video_view_10s',
  'video_completed',
]);

const audienceMemberBaseSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1_000).optional(),
});

export const metaWebsiteAudienceMemberSchema = audienceMemberBaseSchema.extend({
  kind: z.literal('website'),
  pixel_id: z.string().trim().min(1),
  event: metaWebsiteAudienceEventSchema,
  retention_days: z.number().int().min(1).max(180),
  prefill: z.boolean().default(true),
});

export const metaEngagementAudienceMemberSchema = audienceMemberBaseSchema
  .extend({
    kind: z.literal('engagement'),
    source_type: metaEngagementSourceTypeSchema,
    source_id: z.string().trim().min(1),
    event: metaEngagementEventSchema,
    retention_days: z.number().int().min(1).max(365),
    prefill: z.boolean().default(true),
  })
  .superRefine((member, ctx) => {
    const eventMatchesSource =
      (member.source_type === 'page' && member.event.startsWith('page_')) ||
      (member.source_type === 'ig_business' && member.event.startsWith('ig_business_')) ||
      (member.source_type === 'video' && member.event.startsWith('video_'));
    if (!eventMatchesSource) {
      ctx.addIssue({
        code: 'custom',
        path: ['event'],
        message: `Event ${member.event} is not valid for ${member.source_type}`,
      });
    }
    if (member.event === 'page_liked' && member.retention_days !== 365) {
      ctx.addIssue({
        code: 'custom',
        path: ['retention_days'],
        message: 'page_liked audiences use the maximum 365-day retained window',
      });
    }
  });

export const metaLookalikeAudienceMemberSchema = audienceMemberBaseSchema
  .extend({
    kind: z.literal('lookalike'),
    seed_member_key: z.string().min(1).max(80).optional(),
    seed_audience_id: z.string().min(1).optional(),
    country: z
      .string()
      .length(2)
      .transform((value) => value.toUpperCase()),
    ratio: z.number().min(0.01).max(0.2),
    lookalike_type: z.enum(['similarity', 'reach']).default('similarity'),
  })
  .superRefine((member, ctx) => {
    const seeds =
      Number(Boolean(member.seed_member_key)) + Number(Boolean(member.seed_audience_id));
    if (seeds !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['seed_member_key'],
        message: 'Provide exactly one seed_member_key or seed_audience_id',
      });
    }
  });

export const metaAudienceGroupMemberSchema = z.discriminatedUnion('kind', [
  metaWebsiteAudienceMemberSchema,
  metaEngagementAudienceMemberSchema,
  metaLookalikeAudienceMemberSchema,
]);

const metaTargetingOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
});

export const metaAudienceGroupTargetingSchema = z
  .object({
    age_min: z.number().int().min(13).max(65).optional(),
    age_max: z.number().int().min(13).max(65).optional(),
    genders: z
      .array(z.union([z.literal(1), z.literal(2)]))
      .max(2)
      .optional(),
    geo_locations: z
      .object({
        countries: z
          .array(
            z
              .string()
              .length(2)
              .transform((value) => value.toUpperCase()),
          )
          .max(25)
          .optional(),
        regions: z
          .array(z.object({ key: z.string().min(1) }))
          .max(100)
          .optional(),
        cities: z
          .array(z.object({ key: z.string().min(1) }))
          .max(100)
          .optional(),
      })
      .optional(),
    interests: z.array(metaTargetingOptionSchema).max(100).optional(),
    behaviors: z.array(metaTargetingOptionSchema).max(100).optional(),
    locales: z.array(z.number().int().positive()).max(50).optional(),
  })
  .superRefine((targeting, ctx) => {
    if (
      targeting.age_min !== undefined &&
      targeting.age_max !== undefined &&
      targeting.age_min > targeting.age_max
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['age_max'],
        message: 'age_max must be greater than or equal to age_min',
      });
    }
  });

export const audienceGroupManifestSchema = z
  .object({
    schema_version: z.literal(1).default(1),
    name: z.string().trim().min(1).max(255),
    ad_account_id: z.string().trim().min(1),
    members: z.array(metaAudienceGroupMemberSchema).min(1).max(25),
    include_member_keys: z.array(z.string().min(1)).max(25),
    exclude_member_keys: z.array(z.string().min(1)).max(25).default([]),
    targeting: metaAudienceGroupTargetingSchema.default({}),
    rationale: z.string().trim().min(1).max(4_000),
    evidence: z.array(z.string().trim().min(1).max(1_000)).max(25).default([]),
  })
  .superRefine((manifest, ctx) => {
    const keys = manifest.members.map((member) => member.key);
    const keySet = new Set(keys);
    if (keySet.size !== keys.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['members'],
        message: 'Audience member keys must be unique',
      });
    }

    for (const [field, references] of [
      ['include_member_keys', manifest.include_member_keys],
      ['exclude_member_keys', manifest.exclude_member_keys],
    ] as const) {
      references.forEach((key, index) => {
        if (!keySet.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: [field, index],
            message: `Unknown audience member key: ${key}`,
          });
        }
      });
    }

    const excluded = new Set(manifest.exclude_member_keys);
    manifest.include_member_keys.forEach((key, index) => {
      if (excluded.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['include_member_keys', index],
          message: `Audience member ${key} cannot be both included and excluded`,
        });
      }
    });

    const membersByKey = new Map(manifest.members.map((member) => [member.key, member]));
    manifest.members.forEach((member, index) => {
      if (member.kind !== 'lookalike' || !member.seed_member_key) return;
      const seed = membersByKey.get(member.seed_member_key);
      if (!seed) {
        ctx.addIssue({
          code: 'custom',
          path: ['members', index, 'seed_member_key'],
          message: `Unknown seed audience member: ${member.seed_member_key}`,
        });
      } else if (seed.kind === 'lookalike') {
        ctx.addIssue({
          code: 'custom',
          path: ['members', index, 'seed_member_key'],
          message: 'A lookalike member cannot seed another lookalike member',
        });
      }
    });
  });

export const metaAdSetTargetingSpecSchema = metaAudienceGroupTargetingSchema.extend({
  custom_audiences: z
    .array(z.object({ id: z.string().min(1) }))
    .max(25)
    .optional(),
  excluded_custom_audiences: z
    .array(z.object({ id: z.string().min(1) }))
    .max(25)
    .optional(),
});

export const audienceGroupVersionStatusSchema = z.enum([
  'awaiting_approval',
  'publishing',
  'ready',
  'partial',
  'failed',
]);

export const audienceGroupMemberStatusSchema = z.enum([
  'pending',
  'publishing',
  'ready',
  'failed_retryable',
  'failed_terminal',
  'indeterminate',
]);

export const audienceGroupMemberResultSchema = z.object({
  member_key: z.string().min(1),
  kind: z.enum(['website', 'engagement', 'lookalike']),
  status: audienceGroupMemberStatusSchema,
  meta_audience_id: z.string().min(1).nullable(),
  error: z.string().nullable(),
});

export const audienceGroupPreviewSchema = z.object({
  group_id: z.string().uuid(),
  group_version_id: z.string().uuid(),
  version: z.number().int().positive(),
  content_hash: z.string().min(32),
  expires_at: z.string().datetime(),
  manifest: audienceGroupManifestSchema,
  estimated_reach: z.record(z.string(), z.unknown()).nullable().default(null),
  creates_ad_set: z.literal(false),
  changes_budget: z.literal(false),
});

export const audienceGroupPublishStatusSchema = z.object({
  group_id: z.string().uuid(),
  group_version_id: z.string().uuid(),
  version: z.number().int().positive(),
  status: audienceGroupVersionStatusSchema,
  operation_id: z.string().min(1).nullable(),
  manifest: audienceGroupManifestSchema,
  members: z.array(audienceGroupMemberResultSchema),
  targeting_spec: metaAdSetTargetingSpecSchema.nullable(),
  replayed: z.boolean().default(false),
});

export const audienceGroupManageInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('draft'),
    group_id: z.string().uuid().optional(),
    manifest: audienceGroupManifestSchema,
  }),
  z.object({
    action: z.literal('preview'),
    group_version_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('status'),
    group_version_id: z.string().uuid(),
  }),
]);

// The publish tool lives on the strategist behind the human approval gate; the
// approval token never appears on the wire, so the model passes only the version
// and the hash it saw at draft time.
export const audienceGroupPublishInputSchema = z.object({
  group_version_id: z.string().uuid(),
  content_hash: z.string().regex(/^[0-9a-f]{64}$/),
});

export const metaAudienceVerificationInputSchema = z.object({
  audience_id: z.string().trim().min(1).optional(),
  inventory_limit: z.number().int().min(1).max(100).default(25),
});

export const metaAudienceVerificationCheckSchema = z.object({
  check: z.enum([
    'token_debug',
    'permissions',
    'ad_account_access',
    'audience_inventory',
    'audience_read',
  ]),
  status: z.enum(['passed', 'warning', 'failed', 'skipped']),
  detail: z.string().min(1).max(1_000),
});

export const metaAudienceVerificationReportSchema = z.object({
  status: z.enum(['verified', 'warning', 'failed']),
  api_version: z.string().min(1),
  verified_at: z.string().datetime(),
  read_only: z.literal(true),
  checks: z.array(metaAudienceVerificationCheckSchema).min(4).max(5),
  token: z
    .object({
      app_id: z.string().nullable(),
      user_id: z.string().nullable(),
      is_valid: z.boolean().nullable(),
      expires_at: z.string().datetime().nullable(),
      data_access_expires_at: z.string().datetime().nullable(),
    })
    .nullable(),
  permissions: z.object({
    granted: z.array(z.string()),
    declined: z.array(z.string()),
    required_for_audience_write: z.array(z.literal('ads_management')),
    missing_for_audience_write: z.array(z.literal('ads_management')),
  }),
  ad_account: z
    .object({
      id: z.string().min(1),
      name: z.string().nullable(),
      account_status: z.number().int().nullable(),
      disable_reason: z.number().int().nullable(),
      business_id: z.string().nullable(),
      currency: z.string().nullable(),
      timezone_name: z.string().nullable(),
    })
    .nullable(),
  audiences: z.object({
    returned: z.number().int().nonnegative(),
    has_more: z.boolean(),
    items: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().nullable(),
        subtype: z.string().nullable(),
        operation_status: z.unknown().nullable(),
        approximate_count_lower_bound: z.number().nullable(),
        approximate_count_upper_bound: z.number().nullable(),
      }),
    ),
    inspected: z
      .object({
        id: z.string().min(1),
        name: z.string().nullable(),
        subtype: z.string().nullable(),
        operation_status: z.unknown().nullable(),
      })
      .nullable(),
  }),
});

export type MetaWebsiteAudienceEvent = z.infer<typeof metaWebsiteAudienceEventSchema>;
export type MetaEngagementSourceType = z.infer<typeof metaEngagementSourceTypeSchema>;
export type MetaEngagementEvent = z.infer<typeof metaEngagementEventSchema>;
export type MetaWebsiteAudienceMember = z.infer<typeof metaWebsiteAudienceMemberSchema>;
export type MetaEngagementAudienceMember = z.infer<typeof metaEngagementAudienceMemberSchema>;
export type MetaLookalikeAudienceMember = z.infer<typeof metaLookalikeAudienceMemberSchema>;
export type MetaAudienceGroupMember = z.infer<typeof metaAudienceGroupMemberSchema>;
export type MetaAudienceGroupTargeting = z.infer<typeof metaAudienceGroupTargetingSchema>;
export type AudienceGroupManifest = z.infer<typeof audienceGroupManifestSchema>;
export type MetaAdSetTargetingSpec = z.infer<typeof metaAdSetTargetingSpecSchema>;
export type AudienceGroupVersionStatus = z.infer<typeof audienceGroupVersionStatusSchema>;
export type AudienceGroupMemberStatus = z.infer<typeof audienceGroupMemberStatusSchema>;
export type AudienceGroupMemberResult = z.infer<typeof audienceGroupMemberResultSchema>;
export type AudienceGroupPreview = z.infer<typeof audienceGroupPreviewSchema>;
export type AudienceGroupPublishStatus = z.infer<typeof audienceGroupPublishStatusSchema>;
export type AudienceGroupManageInput = z.infer<typeof audienceGroupManageInputSchema>;
export type AudienceGroupPublishInput = z.infer<typeof audienceGroupPublishInputSchema>;
export type MetaAudienceVerificationInput = z.infer<typeof metaAudienceVerificationInputSchema>;
export type MetaAudienceVerificationCheck = z.infer<typeof metaAudienceVerificationCheckSchema>;
export type MetaAudienceVerificationReport = z.infer<typeof metaAudienceVerificationReportSchema>;
