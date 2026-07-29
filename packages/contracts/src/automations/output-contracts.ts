import { z } from 'zod';

const jsonSchemaRecord = z.record(z.string(), z.unknown());

export const automationReportDocumentSchema = z
  .object({
    title: z.string().min(1).max(300),
    summary: z.string().max(4_000),
    sections: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            heading: z.string().min(1).max(200),
            body: z.string().max(30_000),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    frontMatter: z.record(
      z.string().min(1).max(80),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
    markdown: z.string().max(500_000),
  })
  .strict();
export type AutomationReportDocument = z.infer<typeof automationReportDocumentSchema>;

/**
 * The connected-account platforms an automation action can address.
 *
 * Declared here rather than in `workflow.ts` because the planner draft contract
 * and the action node configs must speak the same vocabulary, and `workflow.ts`
 * already imports this module (the reverse edge would be a cycle).
 */
export const automationSocialPlatformSchema = z.enum([
  'instagram',
  'facebook',
  'linkedin',
  'tiktok',
  'youtube',
]);
export type AutomationSocialPlatform = z.infer<typeof automationSocialPlatformSchema>;

/**
 * One organic calendar draft, as an automation asks for it to be created.
 *
 * Field names are the organic domain's own, not new ones: `platform` and
 * `format` are the planner's (`organicPostFormatEnum` — post/reel/carousel/
 * story), `caption` + `hashtags` are what `buildPlatformCaption` assembles, and
 * `brief` is the creative direction the draft carries into generation. There is
 * deliberately no media field: this contract creates DRAFTS, and a draft's media
 * is realized later by the organic pipeline, not by the automation.
 *
 * `scheduledAt` is an absolute, offset-bearing instant because
 * `organic_calendar_drafts.scheduled_date` is a full `timestamptz` — a date-only
 * string would land at midnight UTC and arm the scheduled-publish poller in the
 * wrong hour.
 */
export const automationPlannerDraftItemSchema = z
  .object({
    platform: automationSocialPlatformSchema,
    scheduledAt: z.string().datetime({ offset: true }),
    format: z.enum(['post', 'reel', 'carousel', 'story']),
    caption: z.string().max(5_000),
    hashtags: z.array(z.string().min(1).max(80)).max(30),
    brief: z.string().max(4_000),
  })
  .strict();
export type AutomationPlannerDraftItem = z.infer<typeof automationPlannerDraftItemSchema>;

export const automationPlannerDraftPayloadSchema = z
  .object({
    items: z.array(automationPlannerDraftItemSchema).min(1).max(50),
  })
  .strict();
export type AutomationPlannerDraftPayload = z.infer<typeof automationPlannerDraftPayloadSchema>;

export const automationWebhookPayloadSchema = z
  .object({
    title: z.string().min(1).max(300),
    summary: z.string().max(4_000),
    items: z
      .array(
        z
          .object({
            label: z.string().min(1).max(160),
            value: z.string().max(8_000),
            detail: z.string().max(8_000).nullable(),
          })
          .strict(),
      )
      .max(100),
    metadata: z
      .array(
        z
          .object({
            key: z.string().min(1).max(120),
            value: z.string().max(2_000),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type AutomationWebhookPayload = z.infer<typeof automationWebhookPayloadSchema>;

export const automationNativeOutputContractIdSchema = z.enum([
  'report.document',
  'webhook.payload',
  'planner.draft',
  'library.asset',
  'organic.publish',
  'studio.brief',
  'paid.optimizer',
]);
export type AutomationNativeOutputContractId = z.infer<
  typeof automationNativeOutputContractIdSchema
>;

const nativeContractRefSchema = z
  .object({
    kind: z.literal('native'),
    contractId: automationNativeOutputContractIdSchema,
    version: z.literal(1),
  })
  .strict();

const customContractRefBaseSchema = z
  .object({
    kind: z.literal('custom'),
    contractId: z
      .string()
      .regex(/^custom\.[a-z0-9][a-z0-9._-]{2,119}$/)
      .max(120),
    version: z.number().int().positive().max(10_000),
    name: z.string().min(1).max(160),
    schema: jsonSchemaRecord,
  })
  .strict();

export type AutomationCustomOutputSchemaIssue = {
  path: string;
  message: string;
};

export type AutomationCustomOutputSchemaValidation =
  | { ok: true; issues: [] }
  | { ok: false; issues: AutomationCustomOutputSchemaIssue[] };

const ALLOWED_SCHEMA_KEYS = new Set([
  'type',
  'title',
  'description',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'format',
]);
const FORBIDDEN_SCHEMA_KEYS = new Set([
  '$ref',
  '$defs',
  'definitions',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
  'patternProperties',
  'unevaluatedProperties',
]);
const ALLOWED_TYPES = new Set([
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean',
  'null',
]);
const MAX_SCHEMA_DEPTH = 8;
const MAX_SCHEMA_PROPERTIES = 100;

export function validateAutomationCustomOutputSchema(
  input: unknown,
): AutomationCustomOutputSchemaValidation {
  const issues: AutomationCustomOutputSchemaIssue[] = [];
  let propertyCount = 0;

  const visit = (value: unknown, path: string, depth: number): void => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      issues.push({ path, message: 'Expected a JSON Schema object.' });
      return;
    }
    if (depth > MAX_SCHEMA_DEPTH) {
      issues.push({ path, message: `Schema nesting exceeds ${MAX_SCHEMA_DEPTH} levels.` });
      return;
    }

    const schema = value as Record<string, unknown>;
    for (const key of Object.keys(schema)) {
      if (FORBIDDEN_SCHEMA_KEYS.has(key)) {
        issues.push({ path: `${path}.${key}`, message: `${key} is not supported.` });
      } else if (!ALLOWED_SCHEMA_KEYS.has(key)) {
        issues.push({
          path: `${path}.${key}`,
          message: `${key} is not an allowed schema keyword.`,
        });
      }
    }

    if (typeof schema.type !== 'string' || !ALLOWED_TYPES.has(schema.type)) {
      issues.push({ path: `${path}.type`, message: 'A supported explicit type is required.' });
      return;
    }
    if (schema.title !== undefined && typeof schema.title !== 'string') {
      issues.push({ path: `${path}.title`, message: 'title must be a string.' });
    }
    if (schema.description !== undefined && typeof schema.description !== 'string') {
      issues.push({ path: `${path}.description`, message: 'description must be a string.' });
    }
    if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) {
      issues.push({ path: `${path}.enum`, message: 'enum must be a non-empty array.' });
    }
    for (const key of ['minimum', 'maximum'] as const) {
      if (schema[key] !== undefined && typeof schema[key] !== 'number') {
        issues.push({ path: `${path}.${key}`, message: `${key} must be a number.` });
      }
    }
    for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems'] as const) {
      if (
        schema[key] !== undefined &&
        (typeof schema[key] !== 'number' || !Number.isInteger(schema[key]) || schema[key] < 0)
      ) {
        issues.push({
          path: `${path}.${key}`,
          message: `${key} must be a non-negative integer.`,
        });
      }
    }
    if (schema.format !== undefined && typeof schema.format !== 'string') {
      issues.push({ path: `${path}.format`, message: 'format must be a string.' });
    }

    if (schema.type === 'object') {
      if (schema.additionalProperties !== false) {
        issues.push({
          path: `${path}.additionalProperties`,
          message: 'Objects must set additionalProperties to false.',
        });
      }
      if (
        !schema.properties ||
        typeof schema.properties !== 'object' ||
        Array.isArray(schema.properties)
      ) {
        issues.push({ path: `${path}.properties`, message: 'Objects require properties.' });
        return;
      }
      const properties = schema.properties as Record<string, unknown>;
      const propertyNames = Object.keys(properties);
      propertyCount += propertyNames.length;
      if (propertyCount > MAX_SCHEMA_PROPERTIES) {
        issues.push({
          path: `${path}.properties`,
          message: `Schemas may define at most ${MAX_SCHEMA_PROPERTIES} properties.`,
        });
      }
      const required = Array.isArray(schema.required)
        ? schema.required.filter((item): item is string => typeof item === 'string')
        : [];
      if (
        required.length !== propertyNames.length ||
        propertyNames.some((key) => !required.includes(key))
      ) {
        issues.push({
          path: `${path}.required`,
          message: 'Every object property must be required.',
        });
      }
      for (const [key, child] of Object.entries(properties)) {
        visit(child, `${path}.properties.${key}`, depth + 1);
      }
    }

    if (schema.type === 'array') {
      if (!schema.items) {
        issues.push({ path: `${path}.items`, message: 'Arrays require an items schema.' });
      } else {
        visit(schema.items, `${path}.items`, depth + 1);
      }
      if (typeof schema.maxItems !== 'number' || schema.maxItems > 100) {
        issues.push({
          path: `${path}.maxItems`,
          message: 'Arrays require maxItems no greater than 100.',
        });
      }
    }
  };

  visit(input, '$', 0);
  if (issues.length === 0) {
    try {
      z.fromJSONSchema(input as Record<string, unknown>);
    } catch (error) {
      issues.push({
        path: '$',
        message: `Schema cannot be compiled: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues };
}

const customContractRefSchema = customContractRefBaseSchema.superRefine((value, ctx) => {
  const validation = validateAutomationCustomOutputSchema(value.schema);
  if (!validation.ok) {
    for (const issue of validation.issues) {
      ctx.addIssue({
        code: 'custom',
        path: ['schema', issue.path],
        message: issue.message,
      });
    }
  }
});

export const automationOutputContractRefSchema = z.discriminatedUnion('kind', [
  nativeContractRefSchema,
  customContractRefSchema,
]);
export type AutomationOutputContractRef = z.infer<typeof automationOutputContractRefSchema>;

export const automationAgentArtifactSchema = z
  .object({
    artifactId: z.string().min(1).max(180),
    nodeId: z.string().min(1).max(120),
    agent: z.enum(['jaina', 'organic']),
    contractId: z.string().min(1).max(120),
    contractVersion: z.number().int().positive(),
    value: z.unknown(),
    evidenceRefs: z.array(z.string().min(1).max(240)).max(500),
    toolReceipts: z.array(z.string().min(1).max(240)).max(200),
    completedAt: z.string().datetime(),
  })
  .strict();
export type AutomationAgentArtifact = z.infer<typeof automationAgentArtifactSchema>;

export const automationStructuredArtifactSchema = z
  .object({
    artifactId: z.string().min(1).max(180),
    nodeId: z.string().min(1).max(120),
    contractId: z.string().min(1).max(120),
    contractVersion: z.number().int().positive(),
    value: z.unknown(),
    sourceArtifactIds: z.array(z.string().min(1).max(180)).max(500),
    completedAt: z.string().datetime(),
  })
  .strict();
export type AutomationStructuredArtifact = z.infer<typeof automationStructuredArtifactSchema>;

export const AUTOMATION_NATIVE_OUTPUT_CONTRACTS = {
  'report.document': {
    contractId: 'report.document',
    version: 1,
    schema: automationReportDocumentSchema,
    acceptedBy: ['report', 'action.email'],
  },
  'webhook.payload': {
    contractId: 'webhook.payload',
    version: 1,
    schema: automationWebhookPayloadSchema,
    acceptedBy: ['action.outbound_webhook'],
  },
  // Registered so a graph that formats into the planner can be published at all:
  // `planner.draft` was already a member of the native contract id enum, but an
  // unregistered id has no executable schema, which is exactly the state
  // `publishReadiness` reports as `invalid_output_schema`.
  'planner.draft': {
    contractId: 'planner.draft',
    version: 1,
    schema: automationPlannerDraftPayloadSchema,
    acceptedBy: ['action.planner_upsert'],
  },
} as const;
