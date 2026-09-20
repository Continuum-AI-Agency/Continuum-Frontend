import { z } from 'zod';

// Output contract for the MCP `studio_workflow` tool — the lean, token-disciplined
// view of an AI Studio canvas workflow the agent reasons over. Strict: signed URLs,
// buckets, and storage paths are deliberately excluded (they ride the display card /
// structuredContent, never the agent's reasoning payload). The Backend validates
// exactly what it emits against this schema.

export const mcpWorkflowTargetSchema = z.enum(['library', 'canvas']);
export type McpWorkflowTarget = z.infer<typeof mcpWorkflowTargetSchema>;

export const mcpWorkflowMediaKindSchema = z.enum(['image', 'video', 'audio', 'document']);

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
    version_ref: z.string().optional(),
  })
  .strict();

const graphIssueSchema = z
  .object({
    code: z.enum(['unknown_node_type', 'dangling_edge', 'invalid_connection', 'missing_prompt']),
    message: z.string(),
    nodeId: z.string().optional(),
    edgeId: z.string().optional(),
    severity: z.enum(['error', 'warning']).optional(),
    phase: z.enum(['edit', 'run']).optional(),
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
    validation: z.object({ ok: z.boolean(), issues: z.array(graphIssueSchema) }).strict(),
    // Present only when the canvas exceeded the projection ceilings. node_count /
    // edge_count above still describe the whole graph.
    truncated: z
      .object({ nodes_omitted: z.number(), edges_omitted: z.number() })
      .strict()
      .optional(),
    change_summary: z.string().optional(),
    open_url: z.string().optional(),
  })
  .strict();

export type McpStudioWorkflow = z.infer<typeof mcpStudioWorkflowSchema>;

// Result of a collaborative `studio_workflow run`: the open canvas executes the
// requested nodes and writes this compact summary back to canvas_run_requests.result,
// which the agent reads via run_status. Deliberately media-free — node ids and output
// kinds only, never base64 or signed URLs (those stay on the canvas / display card).
export const canvasRunOutputKindSchema = z.enum(['image', 'video', 'text']);
export type CanvasRunOutputKind = z.infer<typeof canvasRunOutputKindSchema>;

export const canvasRunResultSchema = z
  .object({
    executed_node_ids: z.array(z.string()),
    outputs: z.array(z.object({ node_id: z.string(), kind: canvasRunOutputKindSchema }).strict()),
    failed: z.array(z.object({ node_id: z.string(), error: z.string() }).strict()).optional(),
  })
  .strict();

export type CanvasRunResult = z.infer<typeof canvasRunResultSchema>;

// ---------------------------------------------------------------------------
// Run telemetry — how long a canvas run took, and where the time went
// ---------------------------------------------------------------------------
//
// Lives here beside `canvasRunResultSchema` because it is written to the SAME row:
// brand_profiles.canvas_run_requests (see 20260917_canvas_run_timing.sql). Both sides
// of the FE/BE boundary touch that table — the Frontend executor writes these events,
// the Backend's rooms.ts reads and settles the row — so the shape is declared once.

/** Which surface issued a run. `canvas` = a human pressed Run Flow. */
export const canvasRunOriginSchema = z.enum(['mcp', 'canvas']);
export type CanvasRunOrigin = z.infer<typeof canvasRunOriginSchema>;

/**
 * One node's slice of a run. `running` means the executor recorded a start and never a
 * finish — a tab that closed mid-run, or a node still in flight at the last heartbeat.
 * Kept deliberately media-free, exactly like `canvasRunResultSchema`: ids and timings only.
 */
export const canvasRunNodeEventSchema = z
  .object({
    node_id: z.string(),
    node_type: z.string().nullable(),
    status: z.enum(['running', 'completed', 'failed', 'awaiting']),
    started_at: z.string(),
    finished_at: z.string().nullable(),
    duration_ms: z.number().nullable(),
    error: z.string().optional(),
  })
  .strict();

export type CanvasRunNodeEvent = z.infer<typeof canvasRunNodeEventSchema>;

export const canvasRunNodeEventsSchema = z.array(canvasRunNodeEventSchema);
