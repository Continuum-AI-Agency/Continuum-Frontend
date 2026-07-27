import { z } from 'zod';
import { crossAgentProvenanceSchema } from '../agents/cross-agent';

// Request envelope for the in-app Canvas Composer — POST /api/ai-studio/canvas/compose.
// The response is an NDJSON stream of aiStudioComposerFrameSchema frames.
//
// `roomId` is required and comes from the open canvas, not from canvas_active_view:
// the browser already knows which room it is rendering, and depending on the
// heartbeat here would let a second tab's room win the race.

/**
 * One prior exchange line, when the user opts into memory.
 *
 * Memory is CLIENT-CARRIED: the server holds no conversation state. The
 * collapsed composer bar sends no history (every prompt is an independent
 * one-shot turn); the expanded chat sends its visible transcript back with the
 * next prompt. The caps are context discipline, not storage limits — a long
 * conversation degrades into "the last few exchanges", which is what a
 * lightweight chat box should remember anyway.
 */
export const composerHistoryMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(2000),
  })
  .strict();

export type ComposerHistoryMessage = z.infer<typeof composerHistoryMessageSchema>;

export const COMPOSER_HISTORY_MAX_MESSAGES = 12;
export const CANVAS_COMPOSER_MAX_REFERENCES = 20;

/**
 * Reference kinds the canvas `@` grabber can send.
 *
 * A subset of `agentMentionReferenceTypeSchema` — the canvas composer resolves
 * exactly these server-side, so widening the wire without a resolver would
 * silently drop the grab. Signals (trend / event / question) are here because
 * "compose a canvas from this week's trend" is the same grounding move the
 * organic agent already supports.
 */
export const canvasComposerReferenceTypeSchema = z.enum([
  'skill',
  'media_asset',
  'trend',
  'event',
  'question',
]);

export type CanvasComposerReferenceType = z.infer<typeof canvasComposerReferenceTypeSchema>;

export const canvasComposerReferenceSchema = z
  .object({
    type: canvasComposerReferenceTypeSchema,
    id: z.string().min(1),
    label: z.string().min(1).max(160),
  })
  .strict();

export type CanvasComposerReference = z.infer<typeof canvasComposerReferenceSchema>;

export const canvasComposeRequestSchema = z
  .object({
    brandProfileId: z.string().min(1),
    roomId: z.string().min(1),
    /** Stable per submitted turn; retries must reuse it instead of starting duplicate work. */
    idempotencyKey: z.string().min(1).max(128).optional(),
    prompt: z.string().min(1).max(4000),
    /** Enables the model's maximum supported thinking level for this turn. */
    thinking: z.boolean().optional(),
    /** Nodes the user had selected — the composer treats them as the subject of the ask. */
    selectedNodeIds: z.array(z.string()).max(50).optional(),
    /** Exact skill/media selections from the canvas context grabber. */
    references: z
      .array(canvasComposerReferenceSchema)
      .max(CANVAS_COMPOSER_MAX_REFERENCES)
      .optional(),
    /** Prior exchanges, most recent last. Absent = the default, memory-less turn. */
    history: z.array(composerHistoryMessageSchema).max(COMPOSER_HISTORY_MAX_MESSAGES).optional(),
    /** Present when this turn was initiated by another agent (cross-agent call). */
    provenance: crossAgentProvenanceSchema.optional(),
  })
  .strict();

export type CanvasComposeRequest = z.infer<typeof canvasComposeRequestSchema>;

const canvasComposerModelCallSchema = z.object({
  agent: z.string().nullable(),
  model: z.string(),
  call_id: z.string(),
  step_number: z.number().int().nonnegative(),
  finish_reason: z.string().nullable(),
  response_time_ms: z.number().nonnegative().nullable(),
  step_time_ms: z.number().nonnegative().nullable(),
  time_to_first_output_ms: z.number().nonnegative().nullable(),
  max_inter_chunk_ms: z.number().nonnegative().nullable(),
  input_tokens: z.number().nonnegative().nullable(),
  output_tokens: z.number().nonnegative().nullable(),
  reasoning_tokens: z.number().nonnegative().nullable(),
  cached_input_tokens: z.number().nonnegative().nullable(),
  ts: z.number().int().nonnegative(),
});

const canvasComposerStallEventSchema = z.object({
  runner: z.string(),
  agent: z.string().nullable(),
  ts: z.number().int().nonnegative(),
});

export const canvasComposerForensicsSchema = z.object({
  run_id: z.string().min(1),
  owner_id: z.string().min(1),
  brand_id: z.string().min(1),
  room_id: z.string().min(1),
  step_count: z.number().int().nonnegative(),
  tool_calls: z.record(z.string(), z.number().int().nonnegative()),
  mutation_count: z.number().int().nonnegative(),
  model_calls: z.array(canvasComposerModelCallSchema),
  stall_events: z.array(canvasComposerStallEventSchema),
  usage_totals: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    reasoning_tokens: z.number().int().nonnegative(),
    cached_input_tokens: z.number().int().nonnegative(),
  }),
});

export type CanvasComposerForensics = z.infer<typeof canvasComposerForensicsSchema>;
