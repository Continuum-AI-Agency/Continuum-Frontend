import { z } from 'zod';
import type { GraphEdgeLike, GraphNodeLike } from './workflow-graph';
import { TIMELINE_MEDIA_INPUT_HANDLE } from './workflow-graph';

export const CANVAS_RENDER_COMPLETE_ROUTE = '/api/ai-studio/canvas/renders/complete';
export const CANVAS_RENDER_CONTINUATION_CLAIM_ROUTE =
  '/api/ai-studio/canvas/renders/continuation/claim';
export const CANVAS_RENDER_CONTINUATION_FINISH_ROUTE =
  '/api/ai-studio/canvas/renders/continuation/finish';

const renderOriginSchema = z.object({
  jobId: z.string().uuid(),
  brandProfileId: z.string().uuid(),
  roomId: z.string().uuid(),
  nodeId: z.string().min(1),
});

export const canvasRenderOutputSchema = z.object({
  assetId: z.string().uuid(),
  bucket: z.string().min(1),
  storagePath: z.string().min(1),
  signedUrl: z.string().url(),
  mimeType: z.string().min(1).default('video/mp4'),
  durationSec: z.number().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type CanvasRenderOutput = z.infer<typeof canvasRenderOutputSchema>;

export const canvasRenderCompleteRequestSchema = renderOriginSchema.extend({
  inputFingerprint: z.string().min(1),
  output: canvasRenderOutputSchema,
});
export type CanvasRenderCompleteRequest = z.infer<typeof canvasRenderCompleteRequestSchema>;

export const canvasRenderCompleteResponseSchema = z.object({
  outcome: z.enum(['committed', 'stale', 'missing']),
  downstreamLeafIds: z.array(z.string()),
});
export type CanvasRenderCompleteResponse = z.infer<typeof canvasRenderCompleteResponseSchema>;

export const canvasRenderContinuationClaimRequestSchema = renderOriginSchema;
export type CanvasRenderContinuationClaimRequest = z.infer<
  typeof canvasRenderContinuationClaimRequestSchema
>;

export const canvasRenderContinuationClaimResponseSchema = z.object({
  claimed: z.boolean(),
  downstreamLeafIds: z.array(z.string()),
});
export type CanvasRenderContinuationClaimResponse = z.infer<
  typeof canvasRenderContinuationClaimResponseSchema
>;

export const canvasRenderContinuationFinishRequestSchema = renderOriginSchema.extend({
  status: z.enum(['done', 'error']),
  error: z.string().min(1).optional(),
});
export type CanvasRenderContinuationFinishRequest = z.infer<
  typeof canvasRenderContinuationFinishRequestSchema
>;

export const canvasRenderContinuationFinishResponseSchema = z.object({ updated: z.boolean() });
export type CanvasRenderContinuationFinishResponse = z.infer<
  typeof canvasRenderContinuationFinishResponseSchema
>;

export const canvasRenderContinuationSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(['pending', 'running', 'done', 'error']),
  downstreamLeafIds: z.array(z.string()),
  error: z.string().optional(),
});
export type CanvasRenderContinuation = z.infer<typeof canvasRenderContinuationSchema>;

export interface TimelineRenderFingerprintGraph {
  nodes: GraphNodeLike[];
  edges: GraphEdgeLike[];
}

const TIMELINE_RENDER_FIELDS = [
  'items',
  'overlayTracks',
  'exportPresetId',
  'captionsEnabled',
  'captionCues',
  'captionWords',
  'captionStyle',
] as const;

const SOURCE_IDENTITY_FIELDS = [
  'generatedVideoStoragePath',
  'generatedVideoBucket',
  'generatedImageStoragePath',
  'generatedImageBucket',
  'sourcePath',
  'bucket',
  'generationSignature',
  'generatedVideoUrl',
  'generatedVideo',
  'video',
  'generatedImageUrl',
  'generatedImage',
  'image',
] as const;

const DURABLE_SOURCE_IDENTITY_FIELDS = [
  'generatedVideoStoragePath',
  'generatedVideoBucket',
  'generatedImageStoragePath',
  'generatedImageBucket',
  'sourcePath',
  'bucket',
] as const;

function picked(data: Record<string, unknown> | undefined, keys: readonly string[]) {
  const source = data ?? {};
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

function sourceIdentity(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const durable = picked(data, DURABLE_SOURCE_IDENTITY_FIELDS);
  const generationSignature = data?.generationSignature;
  if (Object.keys(durable).length > 0) {
    return generationSignature === undefined ? durable : { ...durable, generationSignature };
  }
  return picked(data, SOURCE_IDENTITY_FIELDS);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function compactHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

export function timelineRenderFingerprint(
  graph: TimelineRenderFingerprintGraph,
  nodeId: string,
): string | null {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.type !== 'timelineEditor') return null;

  const nodeById = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  const sources = graph.edges
    .filter(
      (edge) => edge.target === nodeId && (edge.targetHandle ?? '') === TIMELINE_MEDIA_INPUT_HANDLE,
    )
    .map((edge) => {
      const source = nodeById.get(edge.source);
      return {
        sourceId: edge.source,
        sourceType: source?.type ?? null,
        identity: sourceIdentity(source?.data),
      };
    })
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));

  return compactHash(
    stableStringify({
      document: picked(node.data, TIMELINE_RENDER_FIELDS),
      sources,
    }),
  );
}
