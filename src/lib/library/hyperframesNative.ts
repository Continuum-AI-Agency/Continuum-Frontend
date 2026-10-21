import {
  type HyperframesOrderView,
  type HyperframesSceneRenderHistory,
  type HyperframesSceneRenderRequest,
  type HyperframesSceneRenderStatus,
  type HyperframesSceneView,
  hyperframesOrderViewSchema,
  hyperframesSceneRenderHistorySchema,
  hyperframesSceneRenderRequestSchema,
  hyperframesSceneRenderStatusSchema,
  hyperframesSceneViewSchema,
  type NativeTemplateUploadCursor,
  type NativeTemplateUploadHistory,
  nativeTemplateUploadHistorySchema,
  type SaveHyperframesRevisionRequest,
  saveHyperframesRevisionRequestSchema,
  type TemplateRevision,
  type TemplateRevisionVariant,
  templateRevisionSchema,
  templateRevisionVariantsResponseSchema,
} from '@continuum/contracts';
import { request } from '@/lib/api/http';

const path = (assetId: string) => `/api/ai-studio/templates/${encodeURIComponent(assetId)}`;
const query = (brandId: string, revisionId?: string) =>
  new URLSearchParams({
    brandId,
    family: 'hyperframes',
    ...(revisionId ? { revisionId } : {}),
  }).toString();

export function fetchNativeHyperframesUploads(
  brandId: string,
  assetId: string,
  options: {
    cursor?: NativeTemplateUploadCursor;
    jobId?: string;
    signal?: AbortSignal;
  } = {},
) {
  const params = new URLSearchParams({
    brandId,
    ...(!options.jobId && options.cursor
      ? { before: options.cursor.createdAt, beforeJob: options.cursor.jobId }
      : {}),
  });
  return request<NativeTemplateUploadHistory>({
    path: `${path(assetId)}/scene/uploads${options.jobId ? `/${encodeURIComponent(options.jobId)}` : ''}?${params}`,
    schema: nativeTemplateUploadHistorySchema.refine(
      (history) =>
        history.brandId === brandId &&
        history.templateId === assetId &&
        (!options.jobId ||
          (history.items.length === 1 && history.items[0]?.jobId === options.jobId)),
      'Native upload status differs from its requested identity',
    ),
    signal: options.signal,
  });
}

/** Exact saved revision or compiled Original; no AE bindings, draft head or renderer fallback. */
export function fetchNativeHyperframesScene(
  brandId: string,
  assetId: string,
  revisionId?: string,
  signal?: AbortSignal,
) {
  return request<HyperframesSceneView>({
    path: `${path(assetId)}/scene?${query(brandId, revisionId)}`,
    schema: hyperframesSceneViewSchema.refine(
      (scene) =>
        scene.brandId === brandId &&
        scene.assetId === assetId &&
        (!revisionId || scene.revision.revisionId === revisionId),
      'The saved native scene identity differs from the requested pin',
    ),
    signal,
  });
}

export function fetchNativeHyperframesOrder(view: HyperframesSceneView, signal?: AbortSignal) {
  return request<HyperframesOrderView>({
    path: `${path(view.assetId)}/scene/order?${query(view.brandId, view.revision.revisionId)}`,
    schema: hyperframesOrderViewSchema.refine(
      (order) =>
        order.brandId === view.brandId &&
        order.assetId === view.assetId &&
        order.revisionId === view.revision.revisionId &&
        order.sceneSha256 === view.sceneSha256 &&
        order.sourceVersionId === view.sourceVersionId &&
        order.sourceSceneSha256 === view.sourceSceneSha256 &&
        order.sourceSha256 === view.edits.sourceSha256,
      'The source element order differs from the saved revision',
    ),
    signal,
  });
}

export async function fetchNativeHyperframesVariants(
  brandId: string,
  assetId: string,
  signal?: AbortSignal,
) {
  const result = await request<{ items: TemplateRevisionVariant[] }>({
    path: `${path(assetId)}/revision-variants?${new URLSearchParams({ brandId })}`,
    schema: templateRevisionVariantsResponseSchema.refine(
      (catalog) =>
        catalog.items.every(
          (variant) =>
            variant.templateId === assetId &&
            variant.revisions.every(
              (revision) =>
                revision.templateId === assetId &&
                revision.variantId === variant.variantId &&
                revision.native?.family === 'hyperframes',
            ),
        ),
      'Expected native revisions under this template parent',
    ),
    signal,
  });
  return result.items;
}

export async function saveNativeHyperframesRevision(
  assetId: string,
  body: SaveHyperframesRevisionRequest,
  signal?: AbortSignal,
) {
  return request<TemplateRevision>({
    path: `${path(assetId)}/revisions`,
    method: 'POST',
    body: saveHyperframesRevisionRequestSchema.parse(body),
    schema: templateRevisionSchema.refine(
      (revision) =>
        revision.native?.family === 'hyperframes' &&
        revision.templateId === assetId &&
        revision.parentRevisionId === body.parentRevisionId &&
        (!body.variantId || revision.variantId === body.variantId),
      'Expected a saved native Hyperframes revision',
    ),
    signal,
  });
}

/** Caller retains submissionId across retries; starting a new job requires a new intent identity. */
export async function requestNativeHyperframesRender(
  assetId: string,
  body: HyperframesSceneRenderRequest,
  signal?: AbortSignal,
) {
  return request<HyperframesSceneRenderStatus>({
    path: `${path(assetId)}/scene/renders`,
    method: 'POST',
    body: hyperframesSceneRenderRequestSchema.parse(body),
    schema: hyperframesSceneRenderStatusSchema.refine(
      (job) =>
        job.brandId === body.brandId &&
        job.assetId === assetId &&
        job.revision.revisionId === body.revisionId,
      'Native render accepted a different source revision',
    ),
    signal,
  });
}

export async function requestNativeHyperframesPreview(
  assetId: string,
  body: HyperframesSceneRenderRequest,
  signal?: AbortSignal,
) {
  const parsed = hyperframesSceneRenderRequestSchema.parse(body);
  if (parsed.outputs.length !== 1 || parsed.outputs[0]?.file !== 'png')
    throw Error('Choose exactly one frame for a native preview');
  return request<HyperframesSceneRenderStatus>({
    path: `${path(assetId)}/scene/previews`,
    method: 'POST',
    body: parsed,
    schema: hyperframesSceneRenderStatusSchema.refine(
      (job) =>
        job.brandId === parsed.brandId &&
        job.assetId === assetId &&
        job.revision.revisionId === parsed.revisionId,
      'Native preview accepted a different source revision',
    ),
    signal,
  });
}

export function fetchNativeHyperframesRender(
  brandId: string,
  assetId: string,
  jobId: string,
  signal?: AbortSignal,
) {
  return request<HyperframesSceneRenderStatus>({
    path: `${path(assetId)}/scene/renders/${encodeURIComponent(jobId)}?${query(brandId)}`,
    schema: hyperframesSceneRenderStatusSchema.refine(
      (job) => job.brandId === brandId && job.assetId === assetId && job.jobId === jobId,
      'The native job identity differs from the requested job',
    ),
    signal,
  });
}

export function listNativeHyperframesRenders(
  brandId: string,
  assetId: string,
  signal?: AbortSignal,
) {
  return request<HyperframesSceneRenderHistory>({
    path: `${path(assetId)}/scene/renders?${query(brandId)}`,
    schema: hyperframesSceneRenderHistorySchema.refine(
      (history) => history.jobs.every((job) => job.brandId === brandId && job.assetId === assetId),
      'Native history contains a job from another template or brand',
    ),
    signal,
  });
}

export function cancelNativeHyperframesRender(
  brandId: string,
  assetId: string,
  jobId: string,
  signal?: AbortSignal,
) {
  return request<HyperframesSceneRenderStatus>({
    path: `${path(assetId)}/scene/renders/${encodeURIComponent(jobId)}/cancel`,
    method: 'POST',
    body: { brandId },
    schema: hyperframesSceneRenderStatusSchema.refine(
      (job) => job.brandId === brandId && job.assetId === assetId && job.jobId === jobId,
      'Cancellation returned a different native job',
    ),
    signal,
  });
}
