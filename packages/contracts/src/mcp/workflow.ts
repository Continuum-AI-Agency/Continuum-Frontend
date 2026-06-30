import { z } from "zod";

// Output contract for the MCP `studio_workflow` tool — the lean, token-disciplined
// view of an AI Studio canvas workflow the agent reasons over. Strict: signed URLs,
// buckets, and storage paths are deliberately excluded (they ride the display card /
// structuredContent, never the agent's reasoning payload). The Backend validates
// exactly what it emits against this schema.

export const mcpWorkflowTargetSchema = z.enum(["library", "canvas"]);
export type McpWorkflowTarget = z.infer<typeof mcpWorkflowTargetSchema>;

export const mcpWorkflowMediaKindSchema = z.enum(["image", "video", "audio", "document"]);

const projectedNodeSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    label: z.string().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const projectedAttachmentSchema = z
  .object({
    node_id: z.string(),
    handle: z.string(),
    media_kind: mcpWorkflowMediaKindSchema,
    file_name: z.string().optional(),
    asset_ref: z.string().optional(),
  })
  .strict();

const graphIssueSchema = z
  .object({
    code: z.enum(["unknown_node_type", "dangling_edge", "invalid_connection"]),
    message: z.string(),
    nodeId: z.string().optional(),
    edgeId: z.string().optional(),
  })
  .strict();

export const mcpStudioWorkflowSchema = z
  .object({
    workflow_id: z.string().optional(),
    room_id: z.string().optional(),
    name: z.string(),
    target: mcpWorkflowTargetSchema,
    node_count: z.number(),
    edge_count: z.number(),
    node_types: z.record(z.string(), z.number()),
    nodes: z.array(projectedNodeSchema),
    wiring: z.array(z.string()),
    attachments: z.array(projectedAttachmentSchema),
    validation: z
      .object({ ok: z.boolean(), issues: z.array(graphIssueSchema) })
      .strict(),
    change_summary: z.string().optional(),
    open_url: z.string().optional(),
  })
  .strict();

export type McpStudioWorkflow = z.infer<typeof mcpStudioWorkflowSchema>;

// Result of a collaborative `studio_workflow run`: the open canvas executes the
// requested nodes and writes this compact summary back to canvas_run_requests.result,
// which the agent reads via run_status. Deliberately media-free — node ids and output
// kinds only, never base64 or signed URLs (those stay on the canvas / display card).
export const canvasRunOutputKindSchema = z.enum(["image", "video", "text"]);
export type CanvasRunOutputKind = z.infer<typeof canvasRunOutputKindSchema>;

export const canvasRunResultSchema = z
  .object({
    executed_node_ids: z.array(z.string()),
    outputs: z.array(
      z.object({ node_id: z.string(), kind: canvasRunOutputKindSchema }).strict(),
    ),
    failed: z
      .array(z.object({ node_id: z.string(), error: z.string() }).strict())
      .optional(),
  })
  .strict();

export type CanvasRunResult = z.infer<typeof canvasRunResultSchema>;
