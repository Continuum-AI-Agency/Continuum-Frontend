import { z } from "zod";

export const ACTION_STATUSES = ["PENDING", "EXECUTED", "FAILED", "REJECTED", "EXPIRED"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const SCOPE_TYPES = ["ACCOUNT", "CAMPAIGN", "ADSET", "AD", "GLOBAL"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

const looseObject = z.record(z.string(), z.unknown());

const actionPayloadSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}, looseObject.default({}));

export const ruleActionSchema = z.object({
  id: z.string(),
  status: z.enum(ACTION_STATUSES),
  action_type: z.string(),
  scope_type: z.enum(SCOPE_TYPES),
  scope_id: z.string().nullable(),
  action_payload: actionPayloadSchema,
  rule_name: z.string().nullable().optional(),
  evaluation_facts: z.record(z.string(), z.number()).nullable().optional(),
  rule_id: z.string().nullable().optional(),
  evaluation_id: z.string().nullable().optional(),
  flow_run_id: z.string().nullable().optional(),
  decision_note: z.string().nullable().optional(),
  actor_id: z.string().nullable().optional(),
  decided_at: z.string().nullable().optional(),
  executed_at: z.string().nullable().optional(),
  result: looseObject.nullable().optional(),
  error: z.string().nullable().optional(),
  is_dry_run: z.boolean().optional(),
  created_at: z.string(),
});

export type RuleAction = z.infer<typeof ruleActionSchema>;

export const listResponseSchema = z.object({
  data: z.array(ruleActionSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type ListResponse = z.infer<typeof listResponseSchema>;

export const approveResponseSchema = z.object({
  ok: z.boolean(),
  alreadyExecuted: z.boolean().optional(),
  action: ruleActionSchema.nullable().optional(),
  error: z.string().optional(),
});

export type ApproveResponse = z.infer<typeof approveResponseSchema>;

export const rejectResponseSchema = z.object({
  ok: z.boolean(),
  action: ruleActionSchema.nullable().optional(),
  error: z.string().optional(),
});

export type RejectResponse = z.infer<typeof rejectResponseSchema>;

export const dryRunResponseSchema = z.object({
  enabled: z.boolean(),
});

export type DryRunResponse = z.infer<typeof dryRunResponseSchema>;

export const getResponseSchema = z.object({
  action: ruleActionSchema.nullable(),
});

export type GetResponse = z.infer<typeof getResponseSchema>;
