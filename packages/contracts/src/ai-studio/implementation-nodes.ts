import { z } from 'zod';
import { actionOutputModality } from './action-registry';
import { pinFromNode, resolveApiRenderVariations } from './api-render-variables';
import {
  type ApiRenderPreflightRequest,
  type ApiRenderVariable,
  apiRenderPreflightRequestSchema,
  apiRenderVariableMapSchema,
} from './api-renders';
import {
  type CanvasPublishingAsset,
  canvasPublishingAssetSchema,
  organicCanvasDraftWriteRequestSchema,
  paidCanvasCreativeReplacementRequestSchema,
} from './canvas-publishing';
import {
  type GraphEdgeLike,
  type GraphNodeLike,
  isImageOutputNodeType,
  isVideoOutputNodeType,
  PLANNER_DRAFT_TEXT_INPUT_HANDLE,
} from './workflow-graph';

export const implementationRenderOutputSchema = z
  .object({
    jobId: z.string().min(1),
    outputId: z.string().min(1),
    kind: z.enum(['image', 'video']),
    fileName: z.string().min(1),
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    storageBucket: z.string().min(1).optional(),
    storagePath: z.string().min(1).optional(),
  })
  .strict();
export type ImplementationRenderOutput = z.infer<typeof implementationRenderOutputSchema>;

export const savedImplementationDraftSchema = z
  .object({
    draftId: z.string().uuid(),
    updatedAt: z.string().min(1),
    assets: z.array(canvasPublishingAssetSchema),
  })
  .strict();
export type SavedImplementationDraft = z.infer<typeof savedImplementationDraftSchema>;

export const canvasReviewHandoffSchema = z.discriminatedUnion('kind', [
  z
    .object({
      nodeId: z.string().min(1),
      kind: z.literal('organic'),
      state: z.literal('awaiting_review'),
      action: z.enum(['publish', 'schedule']),
      draftId: z.string().uuid(),
      expectedUpdatedAt: z.string().min(1),
    })
    .strict(),
  z
    .object({
      nodeId: z.string().min(1),
      kind: z.literal('render'),
      state: z.literal('awaiting_review'),
      requests: z.array(apiRenderPreflightRequestSchema).min(1).max(50),
    })
    .strict(),
  z
    .object({
      nodeId: z.string().min(1),
      kind: z.literal('paid'),
      state: z.literal('awaiting_review'),
      request: paidCanvasCreativeReplacementRequestSchema.options[0],
    })
    .strict(),
]);
export type CanvasReviewHandoff = z.infer<typeof canvasReviewHandoffSchema>;

export function renderOutputForHandle(
  node: GraphNodeLike,
  handle?: string | null,
): ImplementationRenderOutput | null {
  const parsed = z.array(implementationRenderOutputSchema).safeParse(node.data?.renderOutputs);
  if (!parsed.success) return null;
  const indexed = /^render-(image|video)-(\d+)$/.exec(handle ?? '');
  const kind = indexed?.[1] ?? handle;
  const outputs = parsed.data.filter((output) => output.kind === kind);
  if (indexed) return outputs[Number(indexed[2]) - 1] ?? null;
  // A scalar port cannot silently discard the rest of a batch.
  return outputs.length === 1 ? outputs[0] : null;
}

export function canvasPublishingAssets(args: {
  nodeId: string;
  data: Record<string, unknown>;
  nodes: readonly GraphNodeLike[];
  edges: readonly GraphEdgeLike[];
}): CanvasPublishingAsset[] {
  const slots = Array.isArray(args.data.assetSlots)
    ? z
        .array(z.object({ id: z.string().min(1), order: z.number().int().nonnegative() }))
        .parse(args.data.assetSlots)
    : [];
  const handles =
    args.data.format === 'carousel'
      ? [...slots].sort((a, b) => a.order - b.order).map((slot) => `asset-${slot.id}`)
      : [args.data.format === 'video' ? 'video-in' : 'image-in'];
  return handles.flatMap((handle, order): CanvasPublishingAsset[] => {
    const edge = args.edges.find(
      (candidate) => candidate.target === args.nodeId && candidate.targetHandle === handle,
    );
    const source = edge && args.nodes.find((candidate) => candidate.id === edge.source);
    if (!source) return [];
    const rendered =
      source.type === 'apiRender' ? renderOutputForHandle(source, edge?.sourceHandle) : null;
    const pin = source.type === 'apiRender' ? rendered : pinFromNode(source, edge?.sourceHandle);
    const modality =
      source.type === 'action' ? actionOutputModality(source.data?.actionId) : undefined;
    const kind =
      rendered?.kind ??
      (source.type === 'image' || isImageOutputNodeType(source.type) || modality === 'image'
        ? 'image'
        : source.type === 'video' ||
            source.type === 'hyperframesAgent' ||
            isVideoOutputNodeType(source.type) ||
            modality === 'video'
          ? 'video'
          : null);
    return pin && kind
      ? [
          {
            assetId: pin.assetId,
            ...(pin.versionId ? { versionId: pin.versionId } : {}),
            kind,
            order,
          },
        ]
      : [];
  });
}

export function plannerDraftRequest(args: {
  brandId: string;
  nodeId: string;
  data: Record<string, unknown>;
  nodes: readonly GraphNodeLike[];
  edges: readonly GraphEdgeLike[];
  clientKey: string;
  dayId: string;
}) {
  const { data } = args;
  if (data.targetDraftId && !data.targetUpdatedAt)
    throw new Error('Refresh the selected Planner draft before saving changes.');
  const wire = args.edges.find(
    (edge) => edge.target === args.nodeId && edge.targetHandle === PLANNER_DRAFT_TEXT_INPUT_HANDLE,
  );
  const source = wire && args.nodes.find((node) => node.id === wire.source);
  const wiredText = [source?.data?.value, source?.data?.text, source?.data?.generatedText].find(
    (value) => typeof value === 'string' && value.trim(),
  );
  const caption = wire ? wiredText : data.caption;
  if (wire && typeof caption !== 'string')
    throw new Error('The connected caption has no text yet.');
  const assets = canvasPublishingAssets(args);
  const expected =
    data.format === 'carousel' && Array.isArray(data.assetSlots) ? data.assetSlots.length : 1;
  const mediaEdges = args.edges.filter(
    (edge) => edge.target === args.nodeId && edge.targetHandle !== PLANNER_DRAFT_TEXT_INPUT_HANDLE,
  );
  if (mediaEdges.length > 0 && assets.length !== expected)
    throw new Error(
      `Connect ${expected} ready Library asset${expected === 1 ? '' : 's'} in the correct order.`,
    );
  if (assets.some((asset) => !asset.versionId))
    throw new Error('Wait for the connected media to have a saved Library version.');
  if (!assets.length && !(typeof caption === 'string' && caption.trim()))
    throw new Error('Add a caption or connect creative before saving a draft.');
  return organicCanvasDraftWriteRequestSchema.parse({
    brandId: args.brandId,
    ...(data.targetDraftId
      ? { draftId: data.targetDraftId, expectedUpdatedAt: data.targetUpdatedAt }
      : { platform: data.platform, platformAccountId: data.platformAccountId }),
    ...(typeof caption === 'string' ? { caption: caption.trim() } : {}),
    format: data.format ?? 'image',
    dayId: data.dayId ?? (data.targetDraftId ? undefined : args.dayId),
    timeOfDay: data.timeOfDay,
    ...(assets.length ? { assets } : {}),
    clientKey: args.clientKey,
  });
}

/** The same records, pins, presets and output selection on both execution surfaces. */
export function implementationRenderRequests(args: {
  brandId: string;
  nodeId: string;
  data: Record<string, unknown>;
  nodes: readonly GraphNodeLike[];
  edges: readonly GraphEdgeLike[];
  delivery?: boolean;
}): ApiRenderPreflightRequest[] {
  const { data } = args;
  const resolved = resolveApiRenderVariations({
    ...args,
    data: {
      variableDefinitions: (data.variableDefinitions ?? []) as ApiRenderVariable[],
      variables:
        data.variables === undefined ? undefined : apiRenderVariableMapSchema.parse(data.variables),
    },
  });
  const presets =
    Array.isArray(data.batchInputSetIds) && data.batchInputSetIds.length
      ? data.batchInputSetIds
      : data.inputSetId
        ? [data.inputSetId]
        : [];
  if (!presets.length && resolved.errors.length) throw new Error(resolved.errors.join(' · '));
  const records = presets.length
    ? presets.map((inputSetId) => ({ inputSetId }))
    : resolved.records.map((record) => ({ variables: record.variables }));
  if (!records.length || records.length > 50)
    throw new Error('A render needs 1 to 50 input records.');
  return records.map((record) =>
    apiRenderPreflightRequestSchema.parse({
      brandId: args.brandId,
      templateKey: data.templateKey,
      contractHash: data.contractHash,
      ...(data.bindingId ? { bindingId: data.bindingId } : {}),
      ...record,
      ...(Array.isArray(data.outputIds) && data.outputIds.length
        ? { outputIds: data.outputIds }
        : {}),
      ...(data.templateRef ? { templateRef: data.templateRef } : {}),
      ...(data.encode ? { encode: data.encode } : {}),
      ...(args.delivery ? { delivery: data.delivery } : {}),
    }),
  );
}
