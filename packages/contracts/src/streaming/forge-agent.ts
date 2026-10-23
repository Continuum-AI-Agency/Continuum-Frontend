import { z } from 'zod';
import { streamEnvelopeSchema } from './envelope';

/**
 * The Forge layer editor's agent: `POST /api/ai-studio/templates/:assetId/agent` streams these
 * frames as NDJSON. Its edits are authoring commands appended to the person's own private draft,
 * so they land in the editor as one undoable batch per tool call; publishing stays the person's.
 */
export const FORGE_AGENT_TOOLS = [
  'read_template',
  'read_tool_result',
  'apply_commands',
  'ask_user',
] as const;
export const forgeAgentToolSchema = z.enum(FORGE_AGENT_TOOLS);
export type ForgeAgentTool = z.infer<typeof forgeAgentToolSchema>;

export const forgeAgentRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    baseVersionId: z.string().uuid(),
    prompt: z.string().trim().min(1).max(8_000),
    /** Prior exchanges, most recent last. An answer to `ask_user` is the next prompt. */
    history: z
      .array(
        z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(8_000) }).strict(),
      )
      .max(20)
      .optional(),
    /** The layers the person had selected: the subject of "this", "these". */
    selection: z
      .object({ nodeIds: z.array(z.string().min(1)).max(200) })
      .strict()
      .optional(),
    /** The composition on screen. */
    compId: z.number().int().positive().optional(),
    /** The draft revision the person was looking at. */
    baseDraftRevision: z.number().int().nonnegative(),
  })
  .strict();
export type ForgeAgentRequest = z.infer<typeof forgeAgentRequestSchema>;

const frame = <T extends string, D extends z.ZodTypeAny>(type: T, data: D) =>
  streamEnvelopeSchema.extend({ type: z.literal(type), data });

export const forgeAgentFrameSchema = z.discriminatedUnion('type', [
  frame(
    'turn_start',
    z.object({ turnId: z.string(), baseDraftRevision: z.number().int() }).strict(),
  ),
  frame('text_delta', z.object({ text: z.string() }).strict()),
  frame('tool_start', z.object({ toolCallId: z.string(), tool: forgeAgentToolSchema }).strict()),
  frame(
    'tool_result',
    z
      .object({
        toolCallId: z.string(),
        tool: forgeAgentToolSchema,
        ok: z.boolean(),
        /** One human line, e.g. "Changed Headline (text) · CTA Pill (color)". */
        summary: z.string().max(500),
      })
      .strict(),
  ),
  /** The draft moved: the editor reloads it and records one undo step. */
  frame(
    'draft',
    z
      .object({
        revision: z.number().int().positive(),
        changedNodeIds: z.array(z.string()),
        createdNodeIds: z.array(z.string()),
        deletedNodeIds: z.array(z.string()),
      })
      .strict(),
  ),
  /** The turn stopped on a question; the person's choice is the next turn's prompt. */
  frame(
    'question',
    z
      .object({
        toolCallId: z.string(),
        question: z.string(),
        options: z.array(
          z.object({ label: z.string(), description: z.string().optional() }).strict(),
        ),
      })
      .strict(),
  ),
  frame(
    'done',
    z
      .object({
        turnId: z.string(),
        baseDraftRevision: z.number().int(),
        finalDraftRevision: z.number().int(),
        steps: z.number().int().nonnegative(),
        inputTokens: z.number().int().nonnegative().nullable(),
        outputTokens: z.number().int().nonnegative().nullable(),
      })
      .strict(),
  ),
  frame('error', z.object({ message: z.string(), code: z.string().optional() }).strict()),
]);
export type ForgeAgentFrame = z.infer<typeof forgeAgentFrameSchema>;
