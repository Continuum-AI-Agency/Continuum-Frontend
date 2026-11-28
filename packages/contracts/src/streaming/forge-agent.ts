import { z } from 'zod';
import { templateRevisionEditsSchema } from '../media/template-revisions';
import { streamEnvelopeSchema } from './envelope';

/**
 * The Forge layer editor's agent: `POST /api/ai-studio/templates/:assetId/agent` streams these
 * frames as NDJSON. Its edits are authoring commands appended to the person's own private draft,
 * so they land in the editor as one undoable batch per tool call; publishing stays the person's.
 * A variant proposal is the other kind of write: nothing is saved until the person saves it, the
 * same preview-then-save as the MCP's forge_manage template_preview / template_save.
 */
export const FORGE_AGENT_TOOLS = [
  'read_template',
  'read_tool_result',
  'apply_commands',
  'propose_variant',
  'ask_user',
] as const;
export const forgeAgentToolSchema = z.enum(FORGE_AGENT_TOOLS);
export type ForgeAgentTool = z.infer<typeof forgeAgentToolSchema>;

export const forgeAgentRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    baseVersionId: z.string().uuid(),
    workingCopyId: z.string().uuid().optional(),
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
    /** The saved revision on screen. Variant proposals branch from it; without it there are none. */
    parentRevisionId: z.string().uuid().optional(),
  })
  .strict();
export type ForgeAgentRequest = z.infer<typeof forgeAgentRequestSchema>;

/** The layer properties a proposal's change list names, as the revision's layer edits spell them. */
export const FORGE_VARIANT_FIELDS = [
  'text',
  'font',
  'fontSize',
  'fillColor',
  'visible',
  'opacity',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'scale',
] as const;
const variantValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.number()),
  z.null(),
]);

/** One property of one layer, as the saved revision has it and as the variant would. */
export const forgeVariantChangeSchema = z
  .object({
    compId: z.number().int().positive(),
    layerId: z.number().int().positive(),
    layer: z.string(),
    field: z.enum(FORGE_VARIANT_FIELDS),
    /** Null when the preview did not list the layer. */
    from: variantValueSchema,
    to: variantValueSchema,
  })
  .strict();
export type ForgeVariantChange = z.infer<typeof forgeVariantChangeSchema>;

/** A layout preview is ~35 kB; this bounds what one proposal frame may carry to the browser. */
export const FORGE_VARIANT_SVG_MAX = 2_000_000;

export const forgeVariantProposalSchema = z
  .object({
    toolCallId: z.string(),
    proposalId: z.string().uuid(),
    name: z.string().min(1).max(120),
    rationale: z.string().max(300),
    parentRevisionId: z.string().uuid(),
    compId: z.number().int().positive().optional(),
    /** Exactly what saving sends: the forge previewed these against the parent revision. */
    edits: templateRevisionEditsSchema,
    changes: z.array(forgeVariantChangeSchema),
    /** The forge's layout preview of `edits`, drawn while proposing, so the card never asks twice. */
    svg: z.string().max(FORGE_VARIANT_SVG_MAX),
    warnings: z.array(z.string()),
  })
  .strict();
export type ForgeVariantProposal = z.infer<typeof forgeVariantProposalSchema>;

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
  /** A variant the person can save; nothing is written until they do. */
  frame('variant_proposal', forgeVariantProposalSchema),
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
