import { z } from 'zod';
import { studioEdgeSchema, studioNodeSchema } from './workflow-graph';

export const CANVAS_GRAPH_CHANGE_DECISION_ROUTE =
  '/api/ai-studio/canvas/graph-changes/:changeSetId/decision';
export const CANVAS_GRAPH_CHANGE_LIST_ROUTE = '/api/ai-studio/canvas/graph-changes';

export const canvasGraphChangeStatusSchema = z.enum(['pending', 'accepted', 'rejected', 'stale']);
export type CanvasGraphChangeStatus = z.infer<typeof canvasGraphChangeStatusSchema>;

const nodeChangeSchema = z.object({
  kind: z.enum(['add_node', 'update_node', 'remove_node', 'move_node']),
  nodeId: z.string().min(1),
});
const edgeChangeSchema = z.object({
  kind: z.enum(['add_edge', 'remove_edge', 'reconnect_edge']),
  edgeId: z.string().min(1),
});
export const canvasGraphChangeOperationSchema = z.discriminatedUnion('kind', [
  nodeChangeSchema.extend({ kind: z.literal('add_node') }),
  nodeChangeSchema.extend({ kind: z.literal('update_node') }),
  nodeChangeSchema.extend({ kind: z.literal('remove_node') }),
  nodeChangeSchema.extend({ kind: z.literal('move_node') }),
  edgeChangeSchema.extend({ kind: z.literal('add_edge') }),
  edgeChangeSchema.extend({ kind: z.literal('remove_edge') }),
  edgeChangeSchema.extend({ kind: z.literal('reconnect_edge') }),
]);
export type CanvasGraphChangeOperation = z.infer<typeof canvasGraphChangeOperationSchema>;

export const canvasGraphChangeSetSchema = z
  .object({
    id: z.string().uuid(),
    runId: z.string().min(1),
    brandProfileId: z.string().uuid(),
    roomId: z.string().uuid(),
    baseRevision: z.number().int().nonnegative().nullable(),
    summary: z.string().min(1).max(500),
    status: canvasGraphChangeStatusSchema,
    operations: z.array(canvasGraphChangeOperationSchema).min(1).max(500),
    affectedNodeIds: z.array(z.string()),
    affectedEdgeIds: z.array(z.string()),
    proposedNodes: z.array(studioNodeSchema),
    proposedEdges: z.array(studioEdgeSchema),
    createdAt: z.iso.datetime({ offset: true }),
    decidedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict();
export type CanvasGraphChangeSet = z.infer<typeof canvasGraphChangeSetSchema>;

export const canvasGraphChangeListResponseSchema = z
  .object({ changeSets: z.array(canvasGraphChangeSetSchema) })
  .strict();
export type CanvasGraphChangeListResponse = z.infer<typeof canvasGraphChangeListResponseSchema>;

export const canvasGraphChangeDecisionSchema = z.enum(['accept', 'reject']);
export type CanvasGraphChangeDecision = z.infer<typeof canvasGraphChangeDecisionSchema>;

export const canvasGraphChangeDecisionRequestSchema = z
  .object({
    brandProfileId: z.string().uuid(),
    roomId: z.string().uuid(),
    decision: canvasGraphChangeDecisionSchema,
  })
  .strict();
export type CanvasGraphChangeDecisionRequest = z.infer<
  typeof canvasGraphChangeDecisionRequestSchema
>;

export const canvasGraphChangeDecisionResponseSchema = z
  .object({
    outcome: z.enum(['accepted', 'rejected', 'stale', 'missing']),
    changeSet: canvasGraphChangeSetSchema.optional(),
  })
  .strict();
export type CanvasGraphChangeDecisionResponse = z.infer<
  typeof canvasGraphChangeDecisionResponseSchema
>;
