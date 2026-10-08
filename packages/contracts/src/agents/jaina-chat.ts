// The Jaina chat request envelope — the ONE definition, imported by the Backend route and
// the Frontend dispatcher alike.
//
// This previously lived in Continuum-Backend/App/agents-ts/Jaina/src/runtime/server.ts with a
// hand-rolled mirror in Continuum-Frontend/src/lib/jaina/schemas.ts. That mirror is a
// STRIPPING z.object parsed before JSON.stringify, so any field the Frontend added without
// also adding it there vanished silently — no type error, no runtime error, no log, and the
// Next route is a pure passthrough that would not catch it either. That trap is the reason
// this file exists; do not reintroduce a parallel copy.

import { z } from 'zod';
// Ad-account identity is a paid-domain concept and is defined once there. Redefining it
// here would export two `normalizeAdAccountId` symbols from the root barrel.
import { normalizeAdAccountId } from '../paid/multi-account';
import {
  agentAttachmentSchema,
  agentDocumentAttachmentSchema,
  agentMentionMetadataSchema,
  agentMentionReferenceSchema,
} from '../streaming/agent-references';
import { jainaScaffoldActionSchema, jainaToolActionSchema } from '../streaming/jaina-scaffold';
import {
  type ConversationDataScopeV1,
  conversationDataScopeV1Schema,
} from './conversation-data-scope';
import { crossAgentProvenanceSchema } from './cross-agent';

/**
 * Hard ceiling on a single turn's account fan-out. The largest real assigned set is 9
 * accounts (one brand, mostly read-only), so 10 covers production with no headroom to spare
 * for an accidental "select everything" on a brand that later links more.
 */
export const JAINA_MAX_AD_ACCOUNTS = 10;

export const jainaChatOriginSchema = z.object({
  platform: z.enum(['slack', 'teams', 'whatsapp']),
  channelId: z.string().min(1),
  threadId: z.string().min(1),
  platformUserId: z.string().min(1),
});
export type JainaChatOrigin = z.infer<typeof jainaChatOriginSchema>;

export const jainaChatContextSchema = z
  .object({
    /**
     * PRIMARY ad account. Stamps the session/run/memory row and is the scope for any tool
     * that takes exactly one account. ALWAYS a member of adAccountIds when that is present.
     */
    adAccountId: z.string().min(1, 'context.adAccountId is required'),
    /**
     * Full selected scope, primary FIRST. Omitted means a single-account turn — equivalent
     * to [adAccountId]. Never empty when present.
     *
     * Additive rather than a replacement for the scalar: every non-browser caller (Slack,
     * Teams, WhatsApp, MCP agent_ask, cross-agent, scheduled reports) sends exactly one
     * account, and the scalar remains the well-defined primary that a bare array could not
     * express without every consumer inventing `[0]`.
     */
    adAccountIds: z.array(z.string().min(1)).min(1).max(JAINA_MAX_AD_ACCOUNTS).optional(),
    dataScope: conversationDataScopeV1Schema.optional(),
    brandId: z.string().min(1, 'context.brandId is required'),
    /**
     * OPTIONAL sub-brand scope. The brand still identifies who this is; the project narrows
     * the EVIDENCE the turn reads — the ad-account set is intersected with the project's
     * declared accounts, and document retrieval filters to the documents tagged into it.
     *
     * Absent means brand scope, i.e. exactly the behaviour that shipped before projects.
     * Never trusted on its own: the Backend re-reads the project and drops it unless the row
     * belongs to `brandId`, so naming another brand's project id buys nothing.
     */
    projectId: z.string().uuid().optional(),
    sessionId: z.string().min(1).optional(),
    canvas: z.boolean().optional(),
    // The browser's IANA zone. Absent for non-browser callers (Slack, MCP, cross-agent),
    // which fall back to the brand's zone at the route.
    timezone: z.string().min(1).max(64).optional(),
    references: z.array(agentMentionReferenceSchema).optional(),
    // Composer attachments, already uploaded and signed by the Frontend. Persisted on the
    // user turn so a resumed transcript still shows what was attached to it.
    // IMAGES ONLY — a document here reaches the media resolver, which emits an
    // unsupported_media_kind warning rather than any content.
    images: z.array(agentAttachmentSchema).optional(),
    // Documents attached to the composer. Resolved to chunks server-side rather than
    // inlined, so the text never travels in the request and stays reachable on later turns.
    documents: z.array(agentDocumentAttachmentSchema).optional(),
    // Scopes which ephemeral (one-off) documents this turn may resolve. SERVER-DERIVED
    // from the conversation; the retrieval predicate fails closed without it.
    documentScopeKey: z.string().min(1).max(200).optional(),
  })
  .superRefine((value, ctx) => {
    // TikTok is a paid platform Jaina has no data for yet: the Backend states it to the model
    // rather than reading it, which is only possible if the pick reaches the Backend at all.
    if (
      value.dataScope?.accounts.some(
        ({ platform }) => !['meta', 'google_ads', 'tiktok'].includes(platform),
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dataScope', 'accounts'],
        message: 'Jaina dataScope accepts only paid account platforms: meta, google_ads and tiktok',
      });
    }
    if (!value.adAccountIds) return;
    const bare = value.adAccountIds.map(normalizeAdAccountId);
    if (new Set(bare).size !== bare.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adAccountIds'],
        message: 'context.adAccountIds must be unique (act_ prefix insensitive)',
      });
    }
    if (!bare.includes(normalizeAdAccountId(value.adAccountId))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adAccountIds'],
        message: 'context.adAccountIds must contain context.adAccountId',
      });
    }
  });
export type JainaChatContext = z.infer<typeof jainaChatContextSchema>;

export const jainaPlanActionSchema = z.object({
  type: z.enum(['approve', 'refine', 'abandon']),
  plan_id: z.string().min(1),
  edits: z.string().optional(),
});
export type JainaPlanAction = z.infer<typeof jainaPlanActionSchema>;

/**
 * OPERATOR ACTIONS — a button that opens a Jaina approval gate with no model turn.
 *
 * The runtime scripts exactly ONE tool call from `{tool, input}`, so the SDK pauses on
 * the tool's approval exactly as it would for a model's call: the gate row and resume
 * transcript are persisted and the ordinary `tool.approval_required` frame (with its
 * before → after `preview`) goes out. Approve / deny is the ordinary `tool_action`
 * resume, keyed by that frame's `approvalId`. Zero LLM calls open the gate.
 *
 * Only these three tools are reachable this way. The input is validated here AND by the
 * tool's own schema when it executes; nothing a client sends here is an approval.
 */
export const JAINA_OPERATOR_ACTION_TOOLS = [
  'paid_scaffold_deploy',
  'pause_meta_entity',
  'activate_meta_entity',
] as const;
export const jainaOperatorActionToolSchema = z.enum(JAINA_OPERATOR_ACTION_TOOLS);
export type JainaOperatorActionTool = z.infer<typeof jainaOperatorActionToolSchema>;

/**
 * Deploy one scaffold version PAUSED: build + populate + optimizer enrollment, one
 * approval. The server expands this into the tool's full input (every entity, budget,
 * audience and creative the preview lists) from the stored version, so what the person
 * approves is read off the database, never off the client.
 */
export const jainaScaffoldDeployOperatorInputSchema = z
  .object({
    scaffold_version_id: z.string().uuid(),
    content_hash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type JainaScaffoldDeployOperatorInput = z.infer<
  typeof jainaScaffoldDeployOperatorInputSchema
>;

const metaEntityStatusOperatorInputShape = {
  /** The Meta campaign / ad set / ad id. */
  entity_id: z.string().min(1),
  level: z.enum(['campaign', 'adset', 'ad']),
  /** The person's reason, recorded on the write. */
  reason: z.string().trim().min(1).max(500),
  /** An operator action always writes; a preview is the approval card itself. */
  dry_run: z.literal(false),
};

/** Pause one live entity. `expected_status` is the status the row showed the person. */
export const jainaPauseMetaEntityOperatorInputSchema = z
  .object({ ...metaEntityStatusOperatorInputShape, expected_status: z.literal('ACTIVE') })
  .strict();
export type JainaPauseMetaEntityOperatorInput = z.infer<
  typeof jainaPauseMetaEntityOperatorInputSchema
>;

/** Unpause one paused entity — the ONLY way a scaffold-built campaign goes live. */
export const jainaActivateMetaEntityOperatorInputSchema = z
  .object({ ...metaEntityStatusOperatorInputShape, expected_status: z.literal('PAUSED') })
  .strict();
export type JainaActivateMetaEntityOperatorInput = z.infer<
  typeof jainaActivateMetaEntityOperatorInputSchema
>;

export const jainaOperatorActionSchema = z.discriminatedUnion('tool', [
  z.object({
    tool: z.literal('paid_scaffold_deploy'),
    input: jainaScaffoldDeployOperatorInputSchema,
  }),
  z.object({
    tool: z.literal('pause_meta_entity'),
    input: jainaPauseMetaEntityOperatorInputSchema,
  }),
  z.object({
    tool: z.literal('activate_meta_entity'),
    input: jainaActivateMetaEntityOperatorInputSchema,
  }),
]);
export type JainaOperatorAction = z.infer<typeof jainaOperatorActionSchema>;

/**
 * What `pause_meta_entity` / `activate_meta_entity` read back from Meta AFTER a
 * successful write, carried on their tool result as `read_back`. A row shows this, not
 * the status it asked for.
 */
export const jainaMetaEntityStatusReadBackSchema = z.object({
  entity_id: z.string(),
  level: z.enum(['campaign', 'adset', 'ad']),
  status: z.string(),
  effective_status: z.string().nullable(),
});
export type JainaMetaEntityStatusReadBack = z.infer<typeof jainaMetaEntityStatusReadBackSchema>;

/**
 * What an `operator_action` may not travel with. The orchestrator answers `scaffold_action`
 * and `tool_action` BEFORE it dispatches an operator action, and on the operator path
 * `plan_action` and a `clarification` answer are never read — so each would either steal
 * the button's turn or be silently dropped.
 */
const OPERATOR_ACTION_EXCLUSIVE_WITH = [
  'scaffold_action',
  'tool_action',
  'plan_action',
  'clarification',
] as const;

export const jainaChatRequestSchema = z
  .object({
    query: z.string().min(1, 'query is required'),
    userId: z.string().optional(),
    include_thoughts: z.boolean().optional(),
    force_report_artifact: z.boolean().optional(),
    canvas: z.boolean().optional(),
    clarification: z.object({ id: z.string().min(1) }).optional(),
    plan_action: jainaPlanActionSchema.optional(),
    /**
     * A human's answer to a paid-scaffold approval gate. Sibling of `plan_action`,
     * deliberately on this endpoint rather than a fifth one — the decision resumes the same
     * conversation and must reach the same orchestrator.
     */
    scaffold_action: jainaScaffoldActionSchema.optional(),
    /**
     * A human's answer to any OTHER approval gate (audience publish, pipeline runs, the
     * optimizer's approve / budget-apply / pause acts). Sibling of `scaffold_action`, same
     * security posture: no token, no hash, no signature travels — the gate row is re-read
     * server-side by `approval_id`.
     */
    tool_action: jainaToolActionSchema.optional(),
    /**
     * Open one approval gate from a button, with no model turn. Sibling of `tool_action`;
     * mutually exclusive with every field in `OPERATOR_ACTION_EXCLUSIVE_WITH` (enforced
     * below). The answer to the gate it opens is an ordinary `tool_action`.
     */
    operator_action: jainaOperatorActionSchema.optional(),
    message_metadata: agentMentionMetadataSchema.optional(),
    /**
     * Origin metadata when this turn was initiated from the chat layer (Slack/Teams/WhatsApp).
     * Stashed on JainaRunContext so tools that enqueue downstream artifacts can attach the
     * origin and the chat deliverer can post results back into the originating thread.
     */
    chatOrigin: jainaChatOriginSchema.optional(),
    /** Present when this turn was initiated by another agent (cross-agent call). */
    provenance: crossAgentProvenanceSchema.optional(),
    context: jainaChatContextSchema,
  })
  .superRefine((value, ctx) => {
    if (!value.operator_action) return;
    const alongside = OPERATOR_ACTION_EXCLUSIVE_WITH.filter((field) => value[field] !== undefined);
    if (alongside.length === 0) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['operator_action'],
      message: `operator_action_not_exclusive: operator_action cannot be sent with ${alongside.join(', ')}`,
    });
  });
export type JainaChatRequest = z.infer<typeof jainaChatRequestSchema>;

/**
 * The account set a turn actually covers. One place both sides resolve the fallback, so a
 * single-account turn and a one-element selection cannot diverge.
 */
export const resolveJainaAdAccountIds = (context: JainaChatContext): string[] =>
  context.adAccountIds ?? [context.adAccountId];

/** Explicit scope wins; legacy Jaina account fields are the same selection on Meta. */
export const resolveJainaDataScope = (context: JainaChatContext): ConversationDataScopeV1 =>
  context.dataScope ?? {
    schemaVersion: 1,
    accounts: resolveJainaAdAccountIds(context).map((accountId) => ({
      platform: 'meta',
      accountId,
    })),
  };
