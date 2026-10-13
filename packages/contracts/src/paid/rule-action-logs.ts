// The fetch-rule-action-logs edge response, validated at the client boundary.
//
// useDCOActionLogs set the payload unvalidated and CampaignAdSetWorkspace mapped it, so one
// missing key in one row took the whole /scale route to its error boundary
// (PP-L1-partial-rule-logs-payload-crashes-scale-route). The envelope is checked as a whole
// (no `data` array is a failed read, named as such); each row is checked on its own, so a
// malformed row costs that row, never the page. The vocabularies mirror
// supabase/functions/fetch-rule-action-logs and the FE's dco types.

import { z } from 'zod';

export const RULE_ACTION_STATUSES = [
  'APPROVED',
  'FAILED',
  'PENDING',
  'SUCCESS',
  'EXECUTED',
  'REJECTED',
] as const;
export const ruleActionStatusSchema = z.enum(RULE_ACTION_STATUSES);
export type RuleActionStatus = z.infer<typeof ruleActionStatusSchema>;

export const RULE_ACTION_TYPES = [
  'PAUSE_CAMPAIGN',
  'PAUSE_AD',
  'ALERT_ACCOUNT',
  'NOOP',
  'PAUSE_ENTITY',
  'SWITCH_CREATIVE',
  'CREATIVE_SWITCH_EXTERNAL',
  'UPDATE_COPY',
  'ADJUST_BUDGET',
  'SCALE_BUDGET',
  'SCALE_CAMPAIGN',
  'SCALE_AD',
  'CREATE_VARIANT',
  'ARCHIVE_ENTITY',
] as const;
export const ruleActionTypeSchema = z.enum(RULE_ACTION_TYPES);
export type RuleActionType = z.infer<typeof ruleActionTypeSchema>;

export const RULE_ACTION_SCOPE_TYPES = ['GLOBAL', 'ACCOUNT', 'CAMPAIGN', 'ADSET', 'AD'] as const;
export const ruleActionScopeTypeSchema = z.enum(RULE_ACTION_SCOPE_TYPES);
export type RuleActionScopeType = z.infer<typeof ruleActionScopeTypeSchema>;

const jsonObject = z.record(z.string(), z.unknown());

/** One action log row as the edge function spells it (camelCase). */
export const ruleActionLogSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string(),
    metaAccountId: z.string(),
    metaCampaignId: z.string().nullable().optional(),
    metaAdsetId: z.string().nullable().optional(),
    metaAdId: z.string().nullable().optional(),
    actionType: ruleActionTypeSchema,
    status: ruleActionStatusSchema,
    scopeType: ruleActionScopeTypeSchema,
    scopeId: z.string().nullable(),
    occurredAt: z.string().min(1),
    actionPayload: jsonObject
      .nullable()
      .catch({})
      .transform((value) => value ?? {}),
    paramsChanged: jsonObject
      .nullable()
      .catch({})
      .transform((value) => value ?? {}),
    result: jsonObject
      .nullable()
      .catch({})
      .transform((value) => value ?? {}),
    decisionNote: z.string().nullable().optional().default(null),
    error: z.string().nullable().optional().default(null),
  })
  .loose();
export type RuleActionLog = z.infer<typeof ruleActionLogSchema>;

export const ruleActionLogPaginationSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalCount: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
    hasPrevPage: z.boolean(),
  })
  .loose();
export type RuleActionLogPagination = z.infer<typeof ruleActionLogPaginationSchema>;

/** The envelope. Rows stay unknown here: `parseRuleActionLogResponse` checks them one by one. */
export const ruleActionLogResponseSchema = z
  .object({
    data: z.array(z.unknown()),
    pagination: ruleActionLogPaginationSchema.optional(),
  })
  .loose();

export type RuleActionLogRead = {
  logs: RuleActionLog[];
  pagination: RuleActionLogPagination | null;
  /** Rows the edge sent that did not match the row schema, with the first issue of each. */
  dropped: Array<{ index: number; issue: string }>;
};

export type RuleActionLogParse =
  | { ok: true; read: RuleActionLogRead }
  | { ok: false; issue: string };

/** The whole response, honestly: a bad envelope is a failed read; a bad row is a dropped row. */
export function parseRuleActionLogResponse(payload: unknown): RuleActionLogParse {
  const envelope = ruleActionLogResponseSchema.safeParse(payload);
  if (!envelope.success) {
    const first = envelope.error.issues[0];
    return {
      ok: false,
      issue: first ? `${first.path.join('.') || 'response'}: ${first.message}` : 'invalid response',
    };
  }
  const logs: RuleActionLog[] = [];
  const dropped: RuleActionLogRead['dropped'] = [];
  envelope.data.data.forEach((row, index) => {
    const parsed = ruleActionLogSchema.safeParse(row);
    if (parsed.success) {
      logs.push(parsed.data);
      return;
    }
    const first = parsed.error.issues[0];
    dropped.push({
      index,
      issue: first ? `${first.path.join('.') || 'row'}: ${first.message}` : 'invalid row',
    });
  });
  return { ok: true, read: { logs, pagination: envelope.data.pagination ?? null, dropped } };
}
