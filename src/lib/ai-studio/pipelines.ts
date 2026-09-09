'use client';

// A "Pipeline" is a saved canvas somebody PUBLISHED: declared input ports a
// machine may write, declared output ports it reads back, and a middle that is
// nobody's to touch.
//
// Same row as a Technique (`canvas_workflows`), same table, one different flag —
// and the flag is the whole difference. `metadata.technique` says "a person may
// drop this in and wire it up"; `metadata.pipeline` says "an unattended caller may
// run this against a live ad account". Only the second one belongs in an
// automation picker, so this module filters on `parsePipelineMetadata` and never
// on "has ports".
//
// Brand rows only. The Backend's `readPipeline` also falls back to the global
// library, and the picker's raw-id field keeps a global id editable, but nothing
// global has been published — listing an empty tier would be a promise, not a
// feature.

import {
  type CanvasTechniquePort,
  PIPELINE_CATALOG_ROUTE,
  PIPELINE_GUIDE_DRAFT_ROUTE,
  PIPELINE_MANIFEST_LIST_ROUTE,
  PIPELINE_PUBLICATIONS_ROUTE,
  PIPELINE_RUNS_ROUTE,
  type PipelineAgentGuideDraftResponse,
  type PipelineCapabilityListResponse,
  type PipelineCapabilityV2,
  type PipelineInvocationRequest,
  type PipelineManifest,
  type PipelineManifestListResponse,
  type PipelineRunReceipt,
  type PipelinePublicationResponse,
  parsePipelineMetadata,
  pipelineCapabilityListResponseSchema,
  pipelineAgentGuideDraftResponseSchema,
  pipelineManifestListResponseSchema,
  pipelinePublicationCandidateSchema,
  pipelinePublicationRequestSchema,
  pipelinePublicationResponseSchema,
  pipelineRunReceiptSchema,
  pipelineRunRoute,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { request } from '@/lib/api/http';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import { listAiStudioWorkflowsAction } from './workflowActions';

export type PipelineItem = {
  id: string;
  name: string;
  description?: string;
  inputPorts: CanvasTechniquePort[];
  outputPorts: CanvasTechniquePort[];
};

export function isPipeline(workflow: AiStudioWorkflow): boolean {
  return parsePipelineMetadata(workflow.metadata) !== undefined;
}

export function pipelineFromWorkflow(workflow: AiStudioWorkflow): PipelineItem | null {
  const pipeline = parsePipelineMetadata(workflow.metadata);
  if (!pipeline) return null;
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    inputPorts: pipeline.inputPorts,
    outputPorts: pipeline.outputPorts,
  };
}

export async function fetchBrandPipelines(brandProfileId: string): Promise<PipelineItem[]> {
  const workflows = await listAiStudioWorkflowsAction(brandProfileId);
  return workflows
    .map(pipelineFromWorkflow)
    .filter((item): item is PipelineItem => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Manifests — the ports PLUS whether the pipeline can actually run
// ---------------------------------------------------------------------------
//
// `pipelineFromWorkflow` above reads the declared contract straight off the row and needs no
// round trip. It cannot answer the question that actually bites: `handle_free`. The
// constraint is OCCUPANCY, not legality — a port declared on a handle the author already
// feeds is type-legal and permanently unwritable, and it refuses LATE, inside `runPipeline`,
// as "no compatible handle". Only the Backend's walker can settle that, so anything that
// tells a person whether a pipeline is usable has to ask.

export const brandPipelineManifestsQueryKey = (brandProfileId?: string) =>
  ['brand-pipeline-manifests', brandProfileId] as const;

export async function fetchBrandPipelineManifests(
  brandProfileId: string,
): Promise<PipelineManifest[]> {
  const { manifests } = await request<PipelineManifestListResponse>({
    path: `${PIPELINE_MANIFEST_LIST_ROUTE}?brandProfileId=${encodeURIComponent(brandProfileId)}`,
    schema: pipelineManifestListResponseSchema,
  });
  return manifests;
}

export function useBrandPipelineManifests(brandProfileId?: string) {
  return useQuery({
    queryKey: brandPipelineManifestsQueryKey(brandProfileId),
    queryFn: () => fetchBrandPipelineManifests(brandProfileId as string),
    enabled: Boolean(brandProfileId),
    staleTime: 60_000,
  });
}

export const pipelineCapabilitiesQueryKey = (brandProfileId?: string) =>
  ['pipeline-capabilities', brandProfileId] as const;

export async function fetchPipelineCapabilities(
  brandProfileId: string,
): Promise<PipelineCapabilityV2[]> {
  const response = await request<PipelineCapabilityListResponse>({
    path: `${PIPELINE_CATALOG_ROUTE}?brandProfileId=${encodeURIComponent(brandProfileId)}`,
    schema: pipelineCapabilityListResponseSchema,
    cache: 'no-store',
  });
  return response.capabilities;
}

export async function startPipelineRun(
  invocation: PipelineInvocationRequest,
): Promise<PipelineRunReceipt> {
  return request<PipelineRunReceipt>({
    path: PIPELINE_RUNS_ROUTE,
    method: 'POST',
    body: invocation,
    schema: pipelineRunReceiptSchema,
    cache: 'no-store',
  });
}

export async function draftPipelineGuide(
  input: unknown,
): Promise<PipelineAgentGuideDraftResponse> {
  const candidate = pipelinePublicationCandidateSchema.parse(input);
  return request<PipelineAgentGuideDraftResponse>({
    path: PIPELINE_GUIDE_DRAFT_ROUTE,
    method: 'POST',
    body: candidate,
    schema: pipelineAgentGuideDraftResponseSchema,
    cache: 'no-store',
  });
}

export async function publishPipeline(
  input: unknown,
): Promise<PipelinePublicationResponse> {
  const publication = pipelinePublicationRequestSchema.parse(input);
  return request<PipelinePublicationResponse>({
    path: PIPELINE_PUBLICATIONS_ROUTE,
    method: 'POST',
    body: publication,
    schema: pipelinePublicationResponseSchema,
    cache: 'no-store',
  });
}

export async function readPipelineRun(
  brandProfileId: string,
  runId: string,
): Promise<PipelineRunReceipt> {
  return request<PipelineRunReceipt>({
    path: `${pipelineRunRoute(runId)}?brandProfileId=${encodeURIComponent(brandProfileId)}`,
    schema: pipelineRunReceiptSchema,
    cache: 'no-store',
  });
}

const ACTIVE_PIPELINE_STATUSES = new Set<PipelineRunReceipt['status']>(['queued', 'running']);

export async function waitForPipelineRun(
  brandProfileId: string,
  runId: string,
  options: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<PipelineRunReceipt> {
  const intervalMs = options.intervalMs ?? 1_500;
  while (true) {
    if (options.signal?.aborted) throw options.signal.reason;
    const receipt = await readPipelineRun(brandProfileId, runId);
    if (!ACTIVE_PIPELINE_STATUSES.has(receipt.status)) return receipt;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, intervalMs);
      options.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(options.signal?.reason);
        },
        { once: true },
      );
    });
  }
}

export function usePipelineCapabilities(brandProfileId?: string) {
  return useQuery({
    queryKey: pipelineCapabilitiesQueryKey(brandProfileId),
    queryFn: () => fetchPipelineCapabilities(brandProfileId as string),
    enabled: Boolean(brandProfileId),
    staleTime: 60_000,
  });
}
