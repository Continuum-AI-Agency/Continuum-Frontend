import { z } from 'zod';

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

export const canvasComposeRequestSchema = z
  .object({
    brandProfileId: z.string().min(1),
    roomId: z.string().min(1),
    prompt: z.string().min(1).max(4000),
    /** Nodes the user had selected — the composer treats them as the subject of the ask. */
    selectedNodeIds: z.array(z.string()).max(50).optional(),
    /** Prior exchanges, most recent last. Absent = the default, memory-less turn. */
    history: z.array(composerHistoryMessageSchema).max(COMPOSER_HISTORY_MAX_MESSAGES).optional(),
  })
  .strict();

export type CanvasComposeRequest = z.infer<typeof canvasComposeRequestSchema>;
