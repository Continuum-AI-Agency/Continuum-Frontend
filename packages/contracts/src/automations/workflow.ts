import { z } from 'zod';
import {
  agentTargetSchema,
  automationRecipientsSchema,
  automationScheduleSchema,
} from './automation';
import {
  type AutomationSocialPlatform,
  automationOutputContractRefSchema,
  automationReportDocumentSchema,
  automationSocialPlatformSchema,
} from './output-contracts';
import {
  automationMetricOperatorSchema,
  automationMetricWindowSchema,
  automationNativeEventTypeSchema,
} from './trigger-bindings';

export const AUTOMATION_WORKFLOW_SCHEMA_VERSION = 3 as const;

// Definitions persisted before the workflow workspace shipped v2 remain
// readable. Parsing is the compatibility boundary: callers always receive the
// current shape and the next draft save upgrades the stored JSON naturally.
export const automationWorkflowSchemaVersionSchema = z
  .union([z.literal(1), z.literal(2), z.literal(AUTOMATION_WORKFLOW_SCHEMA_VERSION)])
  .transform(() => AUTOMATION_WORKFLOW_SCHEMA_VERSION);

export const automationPortTypeSchema = z.enum([
  'any',
  'artifact',
  'boolean',
  'control',
  'media',
  'records',
  'report',
  'structured',
  'text',
]);
export type AutomationPortType = z.infer<typeof automationPortTypeSchema>;

export const automationNodePositionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

const nodeBaseShape = {
  id: z.string().min(1).max(120),
  position: automationNodePositionSchema,
  label: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  disabled: z.boolean().default(false),
  continueOnError: z.boolean().default(false),
};

const manualTriggerNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('trigger.manual'),
    config: z
      .object({
        inputSchema: z.record(z.string(), z.unknown()).default({}),
      })
      .strict()
      .default({ inputSchema: {} }),
  })
  .strict();

const scheduleTriggerNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('trigger.schedule'),
    config: z.object({ schedule: automationScheduleSchema }).strict(),
  })
  .strict();

const eventTriggerNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('trigger.event'),
    config: z
      .object({
        eventType: automationNativeEventTypeSchema,
        filters: z.record(z.string(), z.unknown()).default({}),
      })
      .strict(),
  })
  .strict();

const metricTriggerNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('trigger.metric'),
    config: z
      .object({
        metric: z.string().min(1).max(120),
        operator: automationMetricOperatorSchema,
        value: z.number().finite(),
        window: automationMetricWindowSchema,
        cooldownMinutes: z.number().int().min(15).max(43_200).default(60),
      })
      .strict(),
  })
  .strict();

const webhookTriggerNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('trigger.webhook'),
    config: z
      .object({
        hookId: z.string().min(8).max(120).optional(),
        endpointId: z.string().min(1).max(180).optional(),
        payloadSchema: z.record(z.string(), z.unknown()).default({}),
      })
      .strict(),
  })
  .strict();

export const automationSourceKindSchema = z.enum([
  'brand_knowledge',
  'library',
  'saved_prompt',
  'saved_skill',
  'paid_analytics',
  'organic_analytics',
  'planner',
  'trends',
  'competitors',
  'connected_platform',
  'live_web',
  'previous_run',
  'optimizer',
  'whats_working',
  'audience',
]);
export type AutomationSourceKind = z.infer<typeof automationSourceKindSchema>;

const boundedSourceLimitSchema = z.number().int().min(1).max(100).default(20);
const sourceTextQuerySchema = z.string().trim().max(500).default('');

export const automationSourceQuerySchemas = {
  brand_knowledge: z
    .object({
      sections: z
        .array(
          z.enum([
            'identity',
            'positioning',
            'audience',
            'voice',
            'visual',
            'offers',
            'competitors',
          ]),
        )
        .default([]),
      search: sourceTextQuerySchema,
      limit: boundedSourceLimitSchema,
    })
    .strict(),
  library: z
    .object({
      search: sourceTextQuerySchema,
      kinds: z.array(z.enum(['image', 'video', 'file'])).default([]),
      tags: z.array(z.string().min(1).max(80)).max(20).default([]),
      reviewStatus: z.enum(['none', 'draft', 'in_review', 'needs_changes', 'approved']).optional(),
      limit: boundedSourceLimitSchema,
    })
    .strict(),
  saved_prompt: z
    .object({
      search: sourceTextQuerySchema,
      ids: z.array(z.string().min(1)).max(100).default([]),
      limit: boundedSourceLimitSchema,
    })
    .strict(),
  saved_skill: z
    .object({
      search: sourceTextQuerySchema,
      ids: z.array(z.string().min(1)).max(100).default([]),
      limit: boundedSourceLimitSchema,
    })
    .strict(),
  paid_analytics: z
    .object({
      provider: z.literal('meta').default('meta'),
      adAccountId: z.string().min(1).max(120).default('auto'),
      datePreset: z.enum(['last_7d', 'last_14d', 'last_30d']).default('last_7d'),
      level: z.enum(['account', 'campaign', 'adset', 'ad']).default('account'),
      /**
       * @deprecated Single-entity scope. Kept, not removed: this object is
       * `.strict()` and every stored graph carries the key, so dropping it would
       * fail every saved definition at parse. Read it through
       * `resolveAutomationPaidAnalyticsScope`, never directly.
       */
      objectId: z.string().min(1).max(120).default('auto'),
      /**
       * A saved `brand_profiles.paid_media_campaign_indexes` row — the user's own
       * named group of campaign ids, authored in Paid Media. Campaign level only;
       * the refine below enforces that at SAVE time, where it is still fixable.
       */
      campaignIndexId: z.string().uuid().nullable().default(null),
      metrics: z.array(z.string().min(1).max(80)).max(40).default([]),
      includeTopAds: z.boolean().default(false),
      topAdsLimit: z.number().int().min(1).max(25).default(5),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.campaignIndexId !== null && value.level !== 'campaign') {
        ctx.addIssue({
          code: 'custom',
          path: ['campaignIndexId'],
          message: 'A saved campaign index only scopes a campaign-level read.',
        });
      }
    }),
  organic_analytics: z
    .object({
      platforms: z
        .array(z.enum(['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube']))
        .default([]),
      dateRange: z.enum(['7d', '14d', '30d', '90d']).default('30d'),
      includeInsights: z.boolean().default(true),
      limit: boundedSourceLimitSchema,
    })
    .strict(),
  planner: z
    .object({
      platforms: z
        .array(z.enum(['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube']))
        .default([]),
      statuses: z.array(z.string().min(1).max(80)).max(20).default([]),
      limit: boundedSourceLimitSchema,
    })
    .strict(),
  trends: z
    .object({
      search: sourceTextQuerySchema,
      limit: boundedSourceLimitSchema,
    })
    .strict(),
  // Widened, not replaced: a stored `{search, limit}` config still parses.
  // `instagram_posts` and `smart_search` are deliberately absent — both do a live
  // per-competitor Instagram fetch, which is the wrong thing to put on a timer
  // with nobody watching.
  competitors: z
    .object({
      views: z
        .array(
          z.enum(['competitors', 'timeline', 'boards', 'board_items', 'awareness', 'gap_report']),
        )
        .max(6)
        .default(['competitors']),
      competitorId: z.string().trim().max(80).default(''),
      boardId: z.string().trim().max(80).default(''),
      status: z.enum(['any', 'active', 'paused']).default('any'),
      sinceDays: z.number().int().min(1).max(365).default(30),
      search: sourceTextQuerySchema,
      limit: boundedSourceLimitSchema,
    })
    .strict(),
  connected_platform: z
    .object({
      provider: z.string().trim().max(80).default(''),
      resource: z.string().trim().max(120).default(''),
      limit: boundedSourceLimitSchema,
    })
    .strict(),
  live_web: z
    .object({ search: z.string().trim().min(1).max(500), limit: boundedSourceLimitSchema })
    .strict(),
  previous_run: z
    .object({
      automationId: z.string().min(1).optional(),
      selection: z.enum(['latest', 'last_successful']).default('last_successful'),
      outputPath: z.string().trim().max(240).default('output.text'),
      limit: z.number().int().min(1).max(20).default(1),
    })
    .strict(),
  // `views` omits `suggest`, `insight`, `logs` and `status`: all four are
  // edge-backed, and the automation MCP context carries no user access token, so
  // they would fail on every scheduled run. `suggest`/`insight` are also an LLM
  // plus Meta fan-out — not something to fire unattended on a schedule.
  optimizer: z
    .object({
      // '' means every portfolio the brand owns, capped by `limit`.
      portfolioId: z.string().trim().max(120).default(''),
      views: z
        .array(
          z.enum([
            'portfolios',
            'performance',
            'adsets',
            'cpa_series',
            'angle_matrix',
            'renewal_tasks',
          ]),
        )
        .max(6)
        .default(['portfolios', 'performance']),
      window: z.enum(['d7', 'd14', 'd30']).default('d14'),
      historyLimit: z.number().int().min(1).max(30).default(10),
      pendingRecommendationsOnly: z.boolean().default(true),
      limit: boundedSourceLimitSchema,
    })
    .strict(),
  whats_working: z
    .object({
      views: z
        .array(z.enum(['summary', 'verdicts', 'win_rates', 'adset_win_rates']))
        .max(4)
        .default(['verdicts', 'win_rates']),
      funnel: z.enum(['all', 'tof', 'mof', 'bof']).default('all'),
      /** Empty means every verdict kind. */
      verdicts: z
        .array(z.enum(['kill', 'scale', 'iterate', 'watch']))
        .max(4)
        .default([]),
      /** Empty means every dimension. */
      dimensions: z
        .array(
          z.enum([
            'hook_archetype',
            'angle',
            'asset_type',
            'theme',
            'funnel_stage',
            'visual_style',
          ]),
        )
        .max(6)
        .default([]),
      window: z.enum(['d7', 'd14', 'd30']).default('d30'),
      hideThinEvidence: z.boolean().default(true),
      limit: boundedSourceLimitSchema,
    })
    .strict(),
  // No `forceRefresh` field, deliberately. This read is cached and shared; an
  // unattended run must never be able to bust it.
  audience: z
    .object({
      platform: z.enum(['instagram', 'facebook', 'linkedin']).default('instagram'),
      /** 'auto' resolves the brand's single linked account for the platform. */
      integrationAccountId: z.string().trim().max(120).default('auto'),
      dateRange: z.enum(['last_7d', 'last_14d', 'last_30d', 'last_90d']).default('last_30d'),
      includeReachSplit: z.boolean().default(true),
      includeDigest: z.boolean().default(true),
    })
    .strict(),
} satisfies Record<AutomationSourceKind, z.ZodType>;

export type AutomationSourceQuery = {
  [Kind in AutomationSourceKind]: z.infer<(typeof automationSourceQuerySchemas)[Kind]>;
};

export const parseAutomationSourceQuery = <Kind extends AutomationSourceKind>(
  source: Kind,
  query: unknown,
): AutomationSourceQuery[Kind] =>
  automationSourceQuerySchemas[source].parse(query) as AutomationSourceQuery[Kind];

/** What a paid-analytics source is actually pointed at, after precedence. */
export type AutomationPaidAnalyticsSelection =
  | { kind: 'account' }
  | { kind: 'explicit'; objectIds: string[]; origin: 'pinned' | 'object_id' }
  | { kind: 'campaign_index'; campaignIndexId: string };

export type AutomationPaidAnalyticsScope = {
  provider: 'meta';
  /** 'auto' or an explicit id. The RESOLVER proves ownership, not this function. */
  adAccountId: string;
  datePreset: AutomationSourceQuery['paid_analytics']['datePreset'];
  level: AutomationSourceQuery['paid_analytics']['level'];
  selection: AutomationPaidAnalyticsSelection;
  metrics: string[];
  includeTopAds: boolean;
  topAdsLimit: number;
  /**
   * Non-empty when more than one scoping shape was authored. Surfaced in the run
   * envelope so a hand-edited config is visible rather than silently reinterpreted.
   */
  ambiguity: string[];
};

/**
 * The one place paid scoping precedence is decided.
 *
 * Four shapes can express "which entities": a saved campaign index, node-level
 * pinned ids, the legacy single `objectId`, or nothing (whole account). The
 * editor and the `superRefine` above prevent authoring two at once, so only
 * hand-edited JSON reaches a conflict — and when it does this still returns ONE
 * deterministic answer and names the loser in `ambiguity`. Refusing at run time
 * would brick a scheduled automation; picking silently is how a report ends up
 * describing something other than what it claims.
 */
export const resolveAutomationPaidAnalyticsScope = (config: {
  mode: 'live' | 'pinned';
  pinnedIds: string[];
  query: AutomationSourceQuery['paid_analytics'];
}): AutomationPaidAnalyticsScope => {
  const { query } = config;
  const pinned = config.mode === 'pinned' ? config.pinnedIds.filter(Boolean) : [];
  const hasIndex = typeof query.campaignIndexId === 'string' && query.campaignIndexId.length > 0;
  const hasObjectId = query.objectId !== 'auto' && query.objectId.length > 0;
  const ambiguity: string[] = [];

  let selection: AutomationPaidAnalyticsSelection;
  if (hasIndex) {
    if (pinned.length > 0) ambiguity.push('Ignored pinned campaign ids: a saved index was set.');
    if (hasObjectId) ambiguity.push('Ignored objectId: a saved index was set.');
    selection = { kind: 'campaign_index', campaignIndexId: query.campaignIndexId as string };
  } else if (pinned.length > 0) {
    if (hasObjectId) ambiguity.push('Ignored objectId: pinned campaign ids were set.');
    selection = { kind: 'explicit', objectIds: pinned, origin: 'pinned' };
  } else if (hasObjectId) {
    selection = { kind: 'explicit', objectIds: [query.objectId], origin: 'object_id' };
  } else {
    selection = { kind: 'account' };
  }

  return {
    provider: query.provider,
    adAccountId: query.adAccountId,
    datePreset: query.datePreset,
    level: query.level,
    selection,
    metrics: query.metrics,
    includeTopAds: query.includeTopAds,
    topAdsLimit: query.topAdsLimit,
    ambiguity,
  };
};

const sourceNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('source'),
    config: z
      .object({
        source: automationSourceKindSchema,
        mode: z.enum(['live', 'pinned']).default('live'),
        query: z.record(z.string(), z.unknown()).default({}),
        pinnedIds: z.array(z.string().min(1)).max(100).default([]),
      })
      .strict()
      .superRefine((value, ctx) => {
        if (value.mode === 'pinned' && value.pinnedIds.length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['pinnedIds'],
            message: 'Pinned sources require at least one record id.',
          });
        }
        // Two ways to say "these campaigns" is one too many. Caught here, at
        // save time, because this is the only place that sees both the node-level
        // pins and the query. Nothing stored today carries `campaignIndexId`, so
        // this cannot fail an existing definition.
        if (
          value.source === 'paid_analytics' &&
          value.mode === 'pinned' &&
          value.pinnedIds.length > 0 &&
          typeof (value.query as { campaignIndexId?: unknown }).campaignIndexId === 'string'
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['query', 'campaignIndexId'],
            message: 'Choose either a saved campaign index or specific pinned campaigns, not both.',
          });
        }
        const parsedQuery = automationSourceQuerySchemas[value.source].safeParse(value.query);
        if (!parsedQuery.success) {
          for (const issue of parsedQuery.error.issues) {
            ctx.addIssue({
              code: 'custom',
              path: ['query', ...issue.path],
              message: issue.message,
            });
          }
        }
      }),
  })
  .strict();

const integrationQueryNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('integration.query'),
    config: z
      .object({
        provider: z.enum(['meta', 'google', 'linkedin', 'tiktok', 'youtube']),
        operation: z.string().min(1).max(160),
        connectionId: z.string().min(1).max(180),
        parameters: z.record(z.string(), z.unknown()).default({}),
        schemaHash: z.string().min(16).max(160),
        timeoutSeconds: z.number().int().min(5).max(300).default(60),
      })
      .strict(),
  })
  .strict();

const mcpReadNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('mcp.read'),
    config: z
      .object({
        toolName: z.string().min(1).max(160),
        arguments: z.record(z.string(), z.unknown()).default({}),
        schemaHash: z.string().min(16).max(160),
        timeoutSeconds: z.number().int().min(5).max(300).default(60),
      })
      .strict(),
  })
  .strict();

const instructionNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('instruction'),
    config: z.object({ text: z.string().min(1).max(20_000) }).strict(),
  })
  .strict();

export const automationAgentCapabilitySchema = z.enum([
  'brand.read',
  'library.read',
  'paid.performance_overview',
  'paid.top_creatives',
  'paid.competitive_analysis',
  'organic.performance_overview',
  'organic.content_planning',
  'organic.draft_creation',
  'planner.read',
  'trends.read',
  'report.synthesis',
]);
export type AutomationAgentCapability = z.infer<typeof automationAgentCapabilitySchema>;

export const automationAgentPolicySchema = z
  .object({
    capabilities: z.array(automationAgentCapabilitySchema).max(20).default([]),
    toolMode: z.enum(['auto', 'required']).default('auto'),
    requiredTools: z.array(z.string().min(1).max(160)).max(30).default([]),
    allowedTools: z.array(z.string().min(1).max(160)).max(100).default([]),
    maxSteps: z.number().int().min(1).max(40).default(8),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.toolMode === 'required' && value.requiredTools.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['requiredTools'],
        message: 'Required tool mode needs at least one required tool.',
      });
    }
  });
export type AutomationAgentPolicy = z.infer<typeof automationAgentPolicySchema>;

export const automationOutcomeRequirementsSchema = z
  .object({
    requireSchema: z.boolean().default(false),
    minimumEvidence: z.number().int().min(0).max(100).default(0),
    requiredTools: z.array(z.string().min(1).max(160)).max(30).default([]),
    requiredReportSections: z.array(z.string().min(1).max(80)).max(24).default([]),
    requireActionReceipt: z.boolean().default(false),
  })
  .strict();
export type AutomationOutcomeRequirements = z.infer<typeof automationOutcomeRequirementsSchema>;

const agentNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('agent'),
    config: z
      .object({
        agent: agentTargetSchema,
        instructions: z.string().max(20_000).default(''),
        outputFormat: z.enum(['text', 'records', 'report']).default('text'),
        timeoutSeconds: z.number().int().min(10).max(900).default(300),
        policy: automationAgentPolicySchema.default({
          capabilities: [],
          toolMode: 'auto',
          requiredTools: [],
          allowedTools: [],
          maxSteps: 8,
        }),
        validation: automationOutcomeRequirementsSchema.default({
          requireSchema: false,
          minimumEvidence: 0,
          requiredTools: [],
          requiredReportSections: [],
          requireActionReceipt: false,
        }),
      })
      .strict(),
  })
  .strict();

const reportSectionSchema = z
  .object({
    id: z.string().min(1).max(80),
    heading: z.string().min(1).max(160),
    guidance: z.string().max(2_000).default(''),
    required: z.boolean().default(true),
  })
  .strict();

export const reportDocumentSchema = automationReportDocumentSchema;
export type ReportDocument = z.infer<typeof reportDocumentSchema>;

const outputFormatterNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('output.formatter'),
    config: z
      .object({
        contract: automationOutputContractRefSchema,
        instructions: z.string().max(20_000).default(''),
        timeoutSeconds: z.number().int().min(10).max(900).default(180),
        maxAttempts: z.literal(2).default(2),
      })
      .strict(),
  })
  .strict();

const reportNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('report'),
    config: z
      .object({
        title: z.string().min(1).max(200),
        objective: z.string().min(1).max(2_000),
        audience: z.string().min(1).max(500),
        templateId: z.string().min(1).max(120).default('continuum-report'),
        sections: z.array(reportSectionSchema).min(1).max(24),
        frontMatter: z.record(z.string(), z.unknown()).default({}),
      })
      .strict(),
  })
  .strict();

export const automationConditionSchema = z
  .object({
    path: z.string().min(1).max(240),
    operator: z.enum(['exists', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains']),
    value: z.unknown().optional(),
  })
  .strict();
export type AutomationCondition = z.infer<typeof automationConditionSchema>;

const conditionNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('logic.if'),
    config: z.object({ condition: automationConditionSchema }).strict(),
  })
  .strict();

const switchNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('logic.switch'),
    config: z
      .object({
        path: z.string().min(1).max(240),
        cases: z
          .array(
            z
              .object({
                id: z.string().min(1).max(80),
                label: z.string().min(1).max(120),
                value: z.union([z.string(), z.number(), z.boolean()]),
              })
              .strict(),
          )
          .min(1)
          .max(20),
      })
      .strict(),
  })
  .strict();

const parallelNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('logic.parallel'),
    config: z.object({}).strict().default({}),
  })
  .strict();

const joinNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('logic.join'),
    config: z.object({ mode: z.enum(['all', 'any']).default('all') }).strict(),
  })
  .strict();

const repeatNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('logic.repeat_until'),
    config: z
      .union([
        z.object({ iterations: z.number().int().min(1).max(50) }).strict(),
        // Compatibility for drafts created while Repeat was a preview-only
        // condition node. The condition was never executed; retain its bounded
        // count and normalize the draft to the real fixed-count contract.
        z
          .object({
            condition: automationConditionSchema,
            maxIterations: z.number().int().min(1).max(50),
          })
          .strict(),
      ])
      .transform((config) => ({
        iterations: 'iterations' in config ? config.iterations : config.maxIterations,
      })),
  })
  .strict();

const emailActionNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('action.email'),
    config: z
      .object({
        recipients: automationRecipientsSchema,
        subject: z.string().min(1).max(300),
      })
      .strict(),
  })
  .strict();

/**
 * How the five modelled action configs stay backward compatible.
 *
 * Parsing is the compatibility boundary (see the schema-version note at the top
 * of this file), and every one of these configs is `.strict()`, so a retired key
 * cannot simply be deleted from the schema — a stored draft carrying it would
 * stop parsing, which 404s `GET /workflow` and bricks the workspace.
 *
 * The shape each of them takes is therefore the same:
 *
 *  - canonical fields that every run needs, required where a value must be
 *    authored and OPTIONAL where a sane bound exists;
 *  - retired keys retained as optional and documented as ignored, so old JSON
 *    (and every checked-in literal that still constructs it) keeps parsing and
 *    keeps type-checking;
 *  - one exported `resolveAutomation<Action>Config` that turns either shape into
 *    the single fully-defaulted record an adapter acts on.
 *
 * Adapters must read configs THROUGH the resolver, never field by field: the
 * resolver is where the legacy alias, the retired key, and the default bound are
 * decided once. `logic.repeat_until` above is the same idea expressed as a
 * union+transform; it can drop its legacy keys because nothing constructs that
 * config as a TypeScript literal.
 */

const libraryActionNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('action.library_save'),
    config: z
      .object({
        // The Library's domain object is a COLLECTION (`media.collections`).
        // There is no folder entity anywhere in the product; `folderId` was a
        // misnomer. `null`/absent means the library root.
        collectionId: z.string().min(1).nullable().optional(),
        /** @deprecated Legacy alias for `collectionId`. Parsed, never authored. */
        folderId: z.string().min(1).nullable().optional(),
        titleTemplate: z.string().min(1).max(300),
      })
      .strict()
      .superRefine((value, ctx) => {
        if (
          value.collectionId !== undefined &&
          value.folderId !== undefined &&
          (value.collectionId ?? null) !== (value.folderId ?? null)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['collectionId'],
            message: 'collectionId and the legacy folderId disagree. Keep collectionId only.',
          });
        }
      }),
  })
  .strict();

export type AutomationLibrarySaveConfig = z.infer<typeof libraryActionNodeSchema>['config'];

export type AutomationLibrarySaveTarget = {
  /** `null` = the library root. */
  collectionId: string | null;
  titleTemplate: string;
};

export const resolveAutomationLibrarySaveConfig = (
  config: AutomationLibrarySaveConfig,
): AutomationLibrarySaveTarget => ({
  collectionId: config.collectionId ?? config.folderId ?? null,
  titleTemplate: config.titleTemplate,
});

export const AUTOMATION_PLANNER_UPSERT_DEFAULTS = {
  itemsPath: 'items',
  maxDrafts: 10,
} as const;

const plannerActionNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('action.planner_upsert'),
    config: z
      .object({
        /** Fallback for a `planner.draft` item that omits its own platform. */
        platform: automationSocialPlatformSchema,
        /**
         * The connected account the created drafts belong to. Required to RUN —
         * optional only so drafts saved before it existed keep parsing; the
         * adapter's preflight rejects a null, which is what stops publication
         * (publishing requires a passing test run, and preflight runs in one).
         */
        accountId: z.string().min(1).max(180).nullable().optional(),
        /** Where the draft array lives inside the upstream structured value. */
        itemsPath: z.string().trim().min(1).max(240).optional(),
        maxDrafts: z.number().int().min(1).max(50).optional(),
        /** @deprecated Retired — each item now carries its own `scheduledAt`. */
        scheduledAtPath: z.string().max(240).optional(),
      })
      .strict(),
  })
  .strict();

export type AutomationPlannerUpsertConfig = z.infer<typeof plannerActionNodeSchema>['config'];

export type AutomationPlannerUpsertTarget = {
  platform: AutomationSocialPlatform;
  accountId: string | null;
  itemsPath: string;
  maxDrafts: number;
};

export const resolveAutomationPlannerUpsertConfig = (
  config: AutomationPlannerUpsertConfig,
): AutomationPlannerUpsertTarget => ({
  platform: config.platform,
  accountId: config.accountId ?? null,
  itemsPath: config.itemsPath ?? AUTOMATION_PLANNER_UPSERT_DEFAULTS.itemsPath,
  maxDrafts: config.maxDrafts ?? AUTOMATION_PLANNER_UPSERT_DEFAULTS.maxDrafts,
});

export const AUTOMATION_ORGANIC_PUBLISH_DEFAULTS = {
  lookaheadHours: 24,
  maxPosts: 5,
} as const;

const publishActionNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('action.organic_publish'),
    config: z
      .object({
        platform: automationSocialPlatformSchema,
        accountId: z.string().min(1).max(180),
        /**
         * How far ahead of the run instant a draft may be scheduled and still be
         * published now. There is no lower bound on purpose: a past-due approved
         * draft is exactly what this node exists to catch up.
         */
        lookaheadHours: z.number().int().min(1).max(168).optional(),
        maxPosts: z.number().int().min(1).max(25).optional(),
      })
      .strict(),
  })
  .strict();

export type AutomationOrganicPublishConfig = z.infer<typeof publishActionNodeSchema>['config'];

export type AutomationOrganicPublishSelector = {
  platform: AutomationSocialPlatform;
  accountId: string;
  lookaheadHours: number;
  maxPosts: number;
};

export const resolveAutomationOrganicPublishConfig = (
  config: AutomationOrganicPublishConfig,
): AutomationOrganicPublishSelector => ({
  platform: config.platform,
  accountId: config.accountId,
  lookaheadHours: config.lookaheadHours ?? AUTOMATION_ORGANIC_PUBLISH_DEFAULTS.lookaheadHours,
  maxPosts: config.maxPosts ?? AUTOMATION_ORGANIC_PUBLISH_DEFAULTS.maxPosts,
});

/**
 * The generation families AI Studio exposes as SERVER endpoints. The canvas
 * engine is the browser, so a headless automation may only reach the two routes
 * that already run without one: `image` is `POST /api/ai-studio/generate`
 * (`nanoGen`) and `video` is `POST /api/ai-studio/generate-video` (`veo-3.1`).
 * Nothing here names a "workflow": a saved Studio workflow is replayed by the
 * canvas, and there is no headless runner for one to point at.
 */
export const automationAiStudioGeneratorSchema = z.enum(['image', 'video']);
export type AutomationAiStudioGenerator = z.infer<typeof automationAiStudioGeneratorSchema>;

export const AUTOMATION_AI_STUDIO_GENERATE_DEFAULTS = {
  generator: 'image',
  maxOutputs: 1,
} as const satisfies { generator: AutomationAiStudioGenerator; maxOutputs: number };

const studioActionNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('action.ai_studio_generate'),
    config: z
      .object({
        /** `brand_profiles.canvas_rooms.id` the output is attributed to; null = none. */
        roomId: z.string().min(1).nullable().default(null),
        generator: automationAiStudioGeneratorSchema.optional(),
        instructions: z.string().min(1).max(20_000),
        maxOutputs: z.number().int().min(1).max(4).optional(),
      })
      .strict(),
  })
  .strict();

export type AutomationAiStudioGenerateConfig = z.infer<typeof studioActionNodeSchema>['config'];

export type AutomationAiStudioGenerateRequest = {
  roomId: string | null;
  generator: AutomationAiStudioGenerator;
  instructions: string;
  maxOutputs: number;
};

export const resolveAutomationAiStudioGenerateConfig = (
  config: AutomationAiStudioGenerateConfig,
): AutomationAiStudioGenerateRequest => ({
  roomId: config.roomId,
  generator: config.generator ?? AUTOMATION_AI_STUDIO_GENERATE_DEFAULTS.generator,
  instructions: config.instructions,
  maxOutputs: config.maxOutputs ?? AUTOMATION_AI_STUDIO_GENERATE_DEFAULTS.maxOutputs,
});

/**
 * What the optimizer actually exposes to a caller that is not a human at the
 * dashboard.
 *
 * `pause`, `resume`, `set_budget` and `replace_creative` never existed as writes:
 * ad pause is human-only, entity-addressed budget writes are not offered, and the
 * real creative convert is disabled (`REAL_CONVERT_ENABLED = false`). Every one of
 * them, if it happens at all, happens by a human approving a recommendation and the
 * optimizer applying it — so all four normalize to `apply_approved` rather than
 * being dropped, which would stop a stored config from parsing.
 */
export const automationPaidOptimizerOperationSchema = z.preprocess(
  (value) =>
    value === 'pause' ||
    value === 'resume' ||
    value === 'set_budget' ||
    value === 'replace_creative'
      ? 'apply_approved'
      : value,
  z.enum(['apply_approved', 'run_cycle']),
);
export type AutomationPaidOptimizerOperation = z.infer<
  typeof automationPaidOptimizerOperationSchema
>;

const optimizerActionNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('action.paid_optimizer'),
    config: z
      .object({
        /**
         * The optimizer portfolio to act on. Required to RUN — optional only so
         * entity-addressed configs saved before the retarget keep parsing.
         */
        portfolioId: z.string().uuid().nullable().optional(),
        operation: automationPaidOptimizerOperationSchema,
        maxBudgetDeltaPct: z.number().min(0).max(100).nullable().default(null),
        /** @deprecated Retired — the optimizer has no entity-addressed write surface. */
        targetType: z.enum(['campaign', 'adset', 'ad']).optional(),
        /** @deprecated Retired — see `targetType`. */
        targetId: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export type AutomationPaidOptimizerConfig = z.infer<typeof optimizerActionNodeSchema>['config'];

export type AutomationPaidOptimizerTarget = {
  portfolioId: string | null;
  operation: AutomationPaidOptimizerOperation;
  maxBudgetDeltaPct: number | null;
};

export const resolveAutomationPaidOptimizerConfig = (
  config: AutomationPaidOptimizerConfig,
): AutomationPaidOptimizerTarget => ({
  portfolioId: config.portfolioId ?? null,
  operation: config.operation,
  maxBudgetDeltaPct: config.maxBudgetDeltaPct,
});

const outboundWebhookActionNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('action.outbound_webhook'),
    config: z
      .object({
        destinationId: z.string().min(1).max(180).optional(),
        url: z.string().url().optional(),
        method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
        secretRef: z.string().min(1).nullable().default(null),
      })
      .strict(),
  })
  .strict();

export const automationWorkflowNodeSchema = z.discriminatedUnion('type', [
  manualTriggerNodeSchema,
  scheduleTriggerNodeSchema,
  eventTriggerNodeSchema,
  metricTriggerNodeSchema,
  webhookTriggerNodeSchema,
  sourceNodeSchema,
  integrationQueryNodeSchema,
  mcpReadNodeSchema,
  instructionNodeSchema,
  agentNodeSchema,
  outputFormatterNodeSchema,
  reportNodeSchema,
  conditionNodeSchema,
  switchNodeSchema,
  parallelNodeSchema,
  joinNodeSchema,
  repeatNodeSchema,
  emailActionNodeSchema,
  libraryActionNodeSchema,
  plannerActionNodeSchema,
  publishActionNodeSchema,
  studioActionNodeSchema,
  optimizerActionNodeSchema,
  outboundWebhookActionNodeSchema,
]);
export type AutomationWorkflowNode = z.infer<typeof automationWorkflowNodeSchema>;
export type AutomationWorkflowNodeType = AutomationWorkflowNode['type'];

export const automationWorkflowEdgeSchema = z
  .object({
    id: z.string().min(1).max(180),
    source: z.string().min(1),
    sourceHandle: z.string().min(1).default('output'),
    target: z.string().min(1),
    targetHandle: z.string().min(1).default('input'),
  })
  .strict();
export type AutomationWorkflowEdge = z.infer<typeof automationWorkflowEdgeSchema>;

export const automationViewportSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().min(0.1).max(4),
  })
  .strict();

export const automationExecutionPolicySchema = z
  .object({
    maxRunSeconds: z.number().int().min(60).max(7_200).default(900),
    maxParallelNodes: z.number().int().min(1).max(12).default(4),
  })
  .strict();

export const automationWorkflowDefinitionSchema = z
  .object({
    schemaVersion: automationWorkflowSchemaVersionSchema,
    nodes: z.array(automationWorkflowNodeSchema).min(1).max(250),
    edges: z.array(automationWorkflowEdgeSchema).max(500),
    execution: automationExecutionPolicySchema.default({
      maxRunSeconds: 900,
      maxParallelNodes: 4,
    }),
    viewport: automationViewportSchema.optional(),
  })
  .strict();
export type AutomationWorkflowDefinition = z.infer<typeof automationWorkflowDefinitionSchema>;

export const automationValidationIssueSchema = z
  .object({
    severity: z.enum(['error', 'warning']),
    code: z.enum([
      'duplicate_node_id',
      'duplicate_edge_id',
      'dangling_edge',
      'self_connection',
      'incompatible_ports',
      'cycle',
      'missing_trigger',
      'missing_outcome',
      'unreachable_node',
      'dead_end',
      'missing_input',
      'invalid_branch_handle',
      'unsafe_webhook',
      'invalid_action',
      'contract_mismatch',
      'invalid_output_schema',
      'schema_drift',
      'validation_stale',
    ]),
    message: z.string(),
    nodeId: z.string().optional(),
    edgeId: z.string().optional(),
  })
  .strict();
export type AutomationValidationIssue = z.infer<typeof automationValidationIssueSchema>;

export const automationWorkflowValidationSchema = z
  .object({
    ok: z.boolean(),
    issues: z.array(automationValidationIssueSchema),
    topologicalOrder: z.array(z.string()),
  })
  .strict();
export type AutomationWorkflowValidation = z.infer<typeof automationWorkflowValidationSchema>;

export const automationWorkflowStatusSchema = z.enum(['legacy', 'draft', 'published']);
export type AutomationWorkflowStatus = z.infer<typeof automationWorkflowStatusSchema>;

export const automationWorkflowVersionSchema = z
  .object({
    id: z.string().min(1),
    automationId: z.string().min(1),
    version: z.number().int().positive(),
    state: z.enum(['draft', 'published', 'archived']),
    definition: automationWorkflowDefinitionSchema,
    definitionHash: z.string().min(1),
    revision: z.number().int().min(0),
    createdBy: z.string().nullable(),
    publishedBy: z.string().nullable(),
    createdAt: z.string(),
    publishedAt: z.string().nullable(),
  })
  .strict();
export type AutomationWorkflowVersion = z.infer<typeof automationWorkflowVersionSchema>;

export const automationNodeRunStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);
export type AutomationNodeRunStatus = z.infer<typeof automationNodeRunStatusSchema>;

export const automationNodeRunSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    nodeId: z.string().min(1),
    nodeType: z.string().min(1),
    attempt: z.number().int().positive(),
    status: automationNodeRunStatusSchema,
    selectedHandle: z.string().min(1).max(120).nullable().default(null),
    input: z.unknown().nullable(),
    output: z.unknown().nullable(),
    errorMessage: z.string().nullable(),
    durationMs: z.number().int().nonnegative().default(0),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
  })
  .strict();
export type AutomationNodeRun = z.infer<typeof automationNodeRunSchema>;

export const automationEvidenceEventSchema = z
  .object({
    seq: z.number().int().positive(),
    nodeId: z.string().min(1),
    eventType: z.enum([
      'source.read',
      'tool.call',
      'tool.result',
      'agent.output',
      'formatter.output',
      'mcp.tool.result',
      'trigger.received',
      'report.assembled',
      'validation.check',
      'delivery.attempt',
      'action.receipt',
    ]),
    status: z.enum(['running', 'completed', 'failed']),
    toolName: z.string().min(1).max(160).optional(),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    errorMessage: z.string().nullable().optional(),
    occurredAt: z.string(),
    expiresAt: z.string().nullable().optional(),
    redacted: z.literal(true),
  })
  .strict();
export type AutomationEvidenceEvent = z.infer<typeof automationEvidenceEventSchema>;

export const automationDeterministicCheckSchema = z
  .object({
    id: z.string().min(1).max(160),
    name: z.string().min(1).max(240),
    status: z.enum(['pass', 'fail']),
    detail: z.string().max(2_000),
    nodeId: z.string().optional(),
  })
  .strict();
export type AutomationDeterministicCheck = z.infer<typeof automationDeterministicCheckSchema>;

export const automationActionReceiptSchema = z
  .object({
    nodeId: z.string().min(1),
    actionKind: z.string().min(1),
    effect: z.enum(['live', 'simulated']),
    status: z.enum(['completed', 'failed']),
    summary: z.string().min(1).max(2_000),
    externalId: z.string().nullable().optional(),
  })
  .strict();
export type AutomationActionReceipt = z.infer<typeof automationActionReceiptSchema>;

export const automationContextEnvelopeSchema = z
  .object({
    source: automationSourceKindSchema,
    resolverId: z.string().min(1).max(160),
    retrievedAt: z.string(),
    records: z.array(z.unknown()),
    recordCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    provenance: z.array(
      z
        .object({
          kind: z.string().min(1).max(80),
          ref: z.string().min(1).max(500),
          label: z.string().max(240).nullable().optional(),
        })
        .strict(),
    ),
    warnings: z.array(z.string().max(500)),
  })
  .strict();
export type AutomationContextEnvelope = z.infer<typeof automationContextEnvelopeSchema>;

export const automationActionGrantSchema = z
  .object({
    versionId: z.string().min(1),
    definitionHash: z.string().min(1),
    actionNodeIds: z.array(z.string().min(1)),
    grantedBy: z.string().min(1),
    grantedAt: z.string(),
  })
  .strict();
export type AutomationActionGrant = z.infer<typeof automationActionGrantSchema>;
