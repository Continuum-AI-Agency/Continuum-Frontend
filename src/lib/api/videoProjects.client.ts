import {
  type ClientRenderJob,
  clientRenderMutationResponseSchema,
  type EditorCommandBatch,
  type EditorGenerationBatch,
  type EditorGenerationKind,
  type EditorProductionSummary,
  type EditorProjectBinding,
  type EditorProjectV2,
  editorGenerationBatchResponseSchema,
  editorProductionSummarySchema,
  editorProjectResponseSchema,
  listEditorGenerationJobsResponseSchema,
  type RestoreEditorTimelineRevisionRequest,
  resolveEditorProjectResponseSchema,
} from '@continuum/contracts';
import { http } from './http';

const base = (projectId?: string): string =>
  projectId
    ? `/api/ai-studio/video-projects/${encodeURIComponent(projectId)}`
    : '/api/ai-studio/video-projects';

export async function resolveVideoProject(input: {
  brandId: string;
  binding: EditorProjectBinding;
}): Promise<string | null> {
  const query = new URLSearchParams({
    brandId: input.brandId,
    bindingType: input.binding.bindingType,
    externalId: input.binding.externalId,
  });
  const response = await http.request<{ projectId: string | null }>({
    path: `${base()}/resolve?${query}`,
    schema: resolveEditorProjectResponseSchema,
    cache: 'no-store',
  });
  return response.projectId;
}

export async function createVideoProject(input: {
  brandId: string;
  title: string;
  width: number;
  height: number;
  binding?: EditorProjectBinding;
}): Promise<EditorProjectV2> {
  const response = await http.request<{ project: EditorProjectV2 }>({
    path: base(),
    method: 'POST',
    body: input,
    schema: editorProjectResponseSchema,
    cache: 'no-store',
  });
  return response.project;
}

export async function getVideoProject(projectId: string): Promise<EditorProjectV2> {
  const response = await http.request<{ project: EditorProjectV2 }>({
    path: base(projectId),
    schema: editorProjectResponseSchema,
    cache: 'no-store',
  });
  return response.project;
}

export function getVideoProjectSummary(projectId: string): Promise<EditorProductionSummary> {
  return http.request<EditorProductionSummary>({
    path: `${base(projectId)}/summary`,
    schema: editorProductionSummarySchema,
    cache: 'no-store',
  });
}

export async function applyVideoProjectCommands(
  batch: EditorCommandBatch,
): Promise<EditorProjectV2> {
  const response = await http.request<{ project: EditorProjectV2 }>({
    path: `${base(batch.projectId)}/commands`,
    method: 'POST',
    body: batch,
    schema: editorProjectResponseSchema,
    cache: 'no-store',
  });
  return response.project;
}

export async function restoreVideoProjectTimeline(
  projectId: string,
  input: RestoreEditorTimelineRevisionRequest,
): Promise<EditorProjectV2> {
  const response = await http.request<{ project: EditorProjectV2 }>({
    path: `${base(projectId)}/timeline/restore`,
    method: 'POST',
    body: input,
    schema: editorProjectResponseSchema,
    cache: 'no-store',
  });
  return response.project;
}

export async function generateVideoCandidates(input: {
  projectId: string;
  kind: EditorGenerationKind;
  shotId?: string;
}): Promise<EditorGenerationBatch> {
  const response = await http.request<{ batch: EditorGenerationBatch }>({
    path: `${base(input.projectId)}/generation-batches`,
    method: 'POST',
    body: { kind: input.kind, ...(input.shotId ? { shotId: input.shotId } : {}) },
    schema: editorGenerationBatchResponseSchema,
    cache: 'no-store',
  });
  return response.batch;
}

export async function listVideoGenerationBatches(
  projectId: string,
): Promise<EditorGenerationBatch[]> {
  const response = await http.request<{ batches: EditorGenerationBatch[] }>({
    path: `${base(projectId)}/jobs`,
    schema: listEditorGenerationJobsResponseSchema,
    cache: 'no-store',
  });
  return response.batches;
}

export async function enqueueVideoProjectRender(projectId: string): Promise<ClientRenderJob> {
  const response = await http.request<{ job: ClientRenderJob }>({
    path: `${base(projectId)}/render`,
    method: 'POST',
    schema: clientRenderMutationResponseSchema,
    cache: 'no-store',
  });
  return response.job;
}
