import { z } from 'zod';

import {
  PUBLISH_VIDEO_INPUT_HANDLE,
  type StudioGraphEdge,
  type StudioGraphNode,
  TIMELINE_MEDIA_INPUT_HANDLE,
} from '../ai-studio/workflow-graph';

export const plannerCompositionStatusSchema = z.enum([
  'preparing',
  'clips_ready',
  'editing',
  'rendering',
  'ready',
  'failed',
]);

export type PlannerCompositionStatus = z.infer<typeof plannerCompositionStatusSchema>;

export const plannerCompositionClipSchema = z
  .object({
    index: z.number().int().nonnegative(),
    role: z.enum(['hook', 'body', 'cta']),
    durationSec: z.number().positive(),
    bucket: z.string().min(1),
    storagePath: z.string().min(1),
    signedUrl: z.string().url().optional(),
    mimeType: z.string().min(1).optional(),
    captionText: z.string().nullable().optional(),
  })
  .strict();

export type PlannerCompositionClip = z.infer<typeof plannerCompositionClipSchema>;

export const signedPlannerCompositionClipSchema = plannerCompositionClipSchema.extend({
  signedUrl: z.string().url(),
});

export type SignedPlannerCompositionClip = z.infer<typeof signedPlannerCompositionClipSchema>;

export const plannerCompositionSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    draftId: z.string().min(1),
    roomId: z.string().min(1),
    timelineNodeId: z.string().min(1),
    publishNodeId: z.string().min(1),
    revision: z.number().int().positive(),
    status: plannerCompositionStatusSchema,
    isCurrent: z.boolean(),
    sourceFingerprint: z.string().min(1),
    resultAssetId: z.string().min(1).nullable().optional(),
    error: z.string().nullable().optional(),
    openHref: z.string().min(1),
    returnHref: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export type PlannerComposition = z.infer<typeof plannerCompositionSchema>;

export const preparePlannerCompositionRequestSchema = z
  .object({
    brandId: z.string().min(1),
    draftId: z.string().min(1),
  })
  .strict();

export type PreparePlannerCompositionRequest = z.infer<
  typeof preparePlannerCompositionRequestSchema
>;

export const preparePlannerCompositionResponseSchema = z
  .object({
    composition: plannerCompositionSchema,
    revisions: z.array(plannerCompositionSchema),
    clips: z.array(signedPlannerCompositionClipSchema).min(1),
    created: z.boolean(),
  })
  .strict();

export type PreparePlannerCompositionResponse = z.infer<
  typeof preparePlannerCompositionResponseSchema
>;

export const plannerCompositionListResponseSchema = z
  .object({
    current: plannerCompositionSchema.nullable(),
    revisions: z.array(plannerCompositionSchema),
  })
  .strict();

export type PlannerCompositionListResponse = z.infer<typeof plannerCompositionListResponseSchema>;

export type PlannerCompositionCluster = {
  nodes: StudioGraphNode[];
  edges: StudioGraphEdge[];
  timelineNodeId: string;
  publishNodeId: string;
};

export type BuildPlannerReelCompositionClusterInput = {
  compositionId: string;
  draftId: string;
  weekStartId?: string;
  platform?: string;
  scheduledAt?: string;
  caption?: string;
  clips: PlannerCompositionClip[];
  origin?: { x: number; y: number };
};

const roleLabel = (role: PlannerCompositionClip['role']): string =>
  role.charAt(0).toUpperCase() + role.slice(1);

export function buildPlannerReelCompositionCluster(
  input: BuildPlannerReelCompositionClusterInput,
): PlannerCompositionCluster {
  const origin = input.origin ?? { x: 120, y: 120 };
  const prefix = `planner-composition:${input.compositionId}`;
  const timelineNodeId = `${prefix}:timeline`;
  const publishNodeId = `${prefix}:publish`;
  const clips = [...input.clips].sort((left, right) => left.index - right.index);

  const clipNodes: StudioGraphNode[] = clips.map((clip, order) => ({
    id: `${prefix}:clip:${clip.index}`,
    type: 'video',
    position: { x: origin.x, y: origin.y + order * 232 },
    data: {
      label: `Scene ${order + 1} · ${roleLabel(clip.role)}`,
      fileName: `scene-${order + 1}.mp4`,
      bucket: clip.bucket,
      sourcePath: clip.storagePath,
      sourceUrl: clip.signedUrl,
      video: clip.signedUrl,
      durationSec: clip.durationSec,
      mimeType: clip.mimeType ?? 'video/mp4',
      captionText: clip.captionText ?? undefined,
      plannerCompositionId: input.compositionId,
    },
    style: { width: 192, height: 192 },
  }));

  const timelineNode: StudioGraphNode = {
    id: timelineNodeId,
    type: 'timelineEditor',
    position: { x: origin.x + 360, y: origin.y },
    data: {
      label: 'Reel composition',
      plannerCompositionId: input.compositionId,
      items: clips.map((clip, order) => ({
        id: `${prefix}:item:${order}`,
        order,
        sourceNodeId: `${prefix}:clip:${clip.index}`,
        kind: 'video',
        durationSec: clip.durationSec,
        ...(order > 0 ? { transition: { type: 'cut', durationSec: 0 } } : {}),
      })),
      outputFormat: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      committed: false,
    },
    style: { width: 320, height: 260 },
  };

  const publishNode: StudioGraphNode = {
    id: publishNodeId,
    type: 'organicPublisher',
    position: { x: origin.x + 840, y: origin.y + 20 },
    data: {
      label: 'Attach to Planner',
      plannerCompositionId: input.compositionId,
      format: 'video',
      targetDraftId: input.draftId,
      weekStartId: input.weekStartId,
      platform: input.platform ?? 'instagram',
      assetSlots: [],
    },
    style: { width: 300, height: 220 },
  };

  const clipEdges: StudioGraphEdge[] = clipNodes.map((node, order) => ({
    id: `${prefix}:edge:clip:${order}`,
    source: node.id,
    sourceHandle: 'video',
    target: timelineNodeId,
    targetHandle: TIMELINE_MEDIA_INPUT_HANDLE,
    type: 'dataType',
    data: { dataType: 'video', pathType: 'bezier' },
  }));
  const publishEdge: StudioGraphEdge = {
    id: `${prefix}:edge:publish`,
    source: timelineNodeId,
    sourceHandle: 'video',
    target: publishNodeId,
      targetHandle: PUBLISH_VIDEO_INPUT_HANDLE,
    type: 'dataType',
    data: { dataType: 'video', pathType: 'bezier' },
  };

  return {
    nodes: [...clipNodes, timelineNode, publishNode],
    edges: [...clipEdges, publishEdge],
    timelineNodeId,
    publishNodeId,
  };
}
