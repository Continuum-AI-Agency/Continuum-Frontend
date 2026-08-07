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
import { jainaScaffoldActionSchema } from '../streaming/jaina-scaffold';
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
    brandId: z.string().min(1, 'context.brandId is required'),
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

export const jainaChatRequestSchema = z.object({
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
});
export type JainaChatRequest = z.infer<typeof jainaChatRequestSchema>;

/**
 * The account set a turn actually covers. One place both sides resolve the fallback, so a
 * single-account turn and a one-element selection cannot diverge.
 */
export const resolveJainaAdAccountIds = (context: JainaChatContext): string[] =>
  context.adAccountIds ?? [context.adAccountId];
