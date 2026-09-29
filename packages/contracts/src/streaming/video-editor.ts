// The in-editor agent's turn: the request the Video Studio posts and the NDJSON frames
// the Backend streams back (`POST /api/ai-studio/video-projects/:projectId/agent`).
// Frames ride the shared envelope (`serializeFrame` / `parseFrame`).
//
// The frames narrate; the edits themselves are committed revisions of the project. A
// `project_revision` frame tells the open editor to refetch, and the realtime revision
// subscription does the same for edits that arrive from MCP instead of this stream.

import { z } from 'zod';
import { videoEditorOpNameSchema } from '../ai-studio/video-editor';
import { streamEnvelopeSchema } from './envelope';

export const VIDEO_EDITOR_AGENT_MAX_FRAME_BASE64 = 400_000;

export const videoEditorAgentRequestSchema = z
  .object({
    prompt: z.string().min(1).max(8_000),
    /** Prior exchanges, most recent last. */
    history: z
      .array(
        z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(8_000) }).strict(),
      )
      .max(20)
      .optional(),
    /** What the person had selected — the subject of "this", "these", "here". */
    selection: z
      .object({
        clipIds: z.array(z.string()).max(100),
        rangeSec: z.tuple([z.number().nonnegative(), z.number().nonnegative()]).optional(),
      })
      .strict()
      .optional(),
    playheadSec: z.number().finite().nonnegative().optional(),
    /** Composited frames the browser grabbed from the stage, for "look at this". */
    frames: z
      .array(
        z
          .object({
            timeSec: z.number().finite().nonnegative(),
            mediaType: z.enum(['image/jpeg', 'image/webp']),
            base64: z.string().min(1).max(VIDEO_EDITOR_AGENT_MAX_FRAME_BASE64),
          })
          .strict(),
      )
      .max(3)
      .optional(),
    /** The revision the person was looking at; the turn's "undo" restores to it. */
    baseRevision: z.number().int().nonnegative(),
  })
  .strict();
export type VideoEditorAgentRequest = z.infer<typeof videoEditorAgentRequestSchema>;

const frame = <T extends string, D extends z.ZodTypeAny>(type: T, data: D) =>
  streamEnvelopeSchema.extend({ type: z.literal(type), data });

export const videoEditorAgentFrameSchema = z.discriminatedUnion('type', [
  frame('turn_start', z.object({ turnId: z.string(), baseRevision: z.number().int() }).strict()),
  frame('text_delta', z.object({ text: z.string() }).strict()),
  frame('tool_start', z.object({ toolCallId: z.string(), op: videoEditorOpNameSchema }).strict()),
  frame(
    'tool_result',
    z
      .object({
        toolCallId: z.string(),
        op: videoEditorOpNameSchema,
        ok: z.boolean(),
        /** One human line, e.g. "Cut 7 pauses · −4.2 s". */
        summary: z.string().max(500),
        revision: z.number().int().optional(),
      })
      .strict(),
  ),
  frame(
    'project_revision',
    z.object({ revision: z.number().int(), fingerprint: z.string() }).strict(),
  ),
  frame(
    'done',
    z
      .object({
        turnId: z.string(),
        baseRevision: z.number().int(),
        finalRevision: z.number().int(),
      })
      .strict(),
  ),
  frame('error', z.object({ message: z.string(), code: z.string().optional() }).strict()),
]);
export type VideoEditorAgentFrame = z.infer<typeof videoEditorAgentFrameSchema>;
