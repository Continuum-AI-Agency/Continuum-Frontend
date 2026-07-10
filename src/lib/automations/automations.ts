// Browser API + React Query hooks for Automations (scheduled agent prompts
// emailed as reports). Calls the agents-ts backend directly per the FE
// API-layer rule — no Next.js proxy route; every payload parses through
// @continuum/contracts schemas.

'use client';

import {
  type Automation,
  type AutomationResponse,
  type AutomationRun,
  type AutomationRunResponse,
  automationResponseSchema,
  automationRunResponseSchema,
  type CreateAutomationRequest,
  type ListAutomationRunsResponse,
  type ListAutomationsResponse,
  type ListRecipientCandidatesResponse,
  listAutomationRunsResponseSchema,
  listAutomationsResponseSchema,
  listRecipientCandidatesResponseSchema,
  type RecipientCandidate,
  type RunAutomationNowResponse,
  runAutomationNowResponseSchema,
  type UpdateAutomationRequest,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { http } from '@/lib/api/http';

export async function fetchAutomations(brandId: string): Promise<Automation[]> {
  const result = await http.request<ListAutomationsResponse>({
    path: `/api/automations?brandId=${encodeURIComponent(brandId)}`,
    method: 'GET',
    schema: listAutomationsResponseSchema,
  });
  return result.automations;
}

export async function fetchAutomation(automationId: string): Promise<Automation> {
  const result = await http.request<AutomationResponse>({
    path: `/api/automations/${encodeURIComponent(automationId)}`,
    method: 'GET',
    schema: automationResponseSchema,
  });
  return result.automation;
}

export async function createAutomation(input: CreateAutomationRequest): Promise<Automation> {
  const result = await http.request<AutomationResponse>({
    path: '/api/automations',
    method: 'POST',
    body: input,
    schema: automationResponseSchema,
  });
  return result.automation;
}

export async function updateAutomation(
  automationId: string,
  patch: UpdateAutomationRequest,
): Promise<Automation> {
  const result = await http.request<AutomationResponse>({
    path: `/api/automations/${encodeURIComponent(automationId)}`,
    method: 'PATCH',
    body: patch,
    schema: automationResponseSchema,
  });
  return result.automation;
}

export async function deleteAutomation(automationId: string): Promise<void> {
  await http.request({
    path: `/api/automations/${encodeURIComponent(automationId)}`,
    method: 'DELETE',
    schema: z.object({ ok: z.boolean() }),
  });
}

export async function runAutomationNow(automationId: string): Promise<string> {
  const result = await http.request<RunAutomationNowResponse>({
    path: `/api/automations/${encodeURIComponent(automationId)}/run-now`,
    method: 'POST',
    schema: runAutomationNowResponseSchema,
  });
  return result.runId;
}

export async function fetchAutomationRuns(automationId: string): Promise<AutomationRun[]> {
  const result = await http.request<ListAutomationRunsResponse>({
    path: `/api/automations/${encodeURIComponent(automationId)}/runs`,
    method: 'GET',
    schema: listAutomationRunsResponseSchema,
  });
  return result.runs;
}

export async function fetchAutomationRun(runId: string): Promise<AutomationRun> {
  const result = await http.request<AutomationRunResponse>({
    path: `/api/automations/runs/${encodeURIComponent(runId)}`,
    method: 'GET',
    schema: automationRunResponseSchema,
  });
  return result.run;
}

export async function fetchRecipientCandidates(brandId: string): Promise<RecipientCandidate[]> {
  const result = await http.request<ListRecipientCandidatesResponse>({
    path: `/api/automations/recipient-candidates?brandId=${encodeURIComponent(brandId)}`,
    method: 'GET',
    schema: listRecipientCandidatesResponseSchema,
  });
  return result.candidates;
}

export const automationsQueryKey = (brandId?: string) => ['automations', brandId] as const;
export const automationQueryKey = (automationId?: string) => ['automation', automationId] as const;
export const automationRunsQueryKey = (automationId?: string) =>
  ['automation-runs', automationId] as const;
export const automationRunQueryKey = (runId?: string) => ['automation-run', runId] as const;
export const recipientCandidatesQueryKey = (brandId?: string) =>
  ['automation-recipient-candidates', brandId] as const;

export function useAutomations(brandId?: string) {
  return useQuery({
    queryKey: automationsQueryKey(brandId),
    queryFn: () => (brandId ? fetchAutomations(brandId) : Promise.resolve([] as Automation[])),
    enabled: Boolean(brandId),
  });
}

export function useAutomation(automationId?: string) {
  return useQuery({
    queryKey: automationQueryKey(automationId),
    queryFn: () => fetchAutomation(automationId as string),
    enabled: Boolean(automationId),
  });
}

const hasActiveRun = (runs?: AutomationRun[]): boolean =>
  Boolean(runs?.some((run) => run.status === 'queued' || run.status === 'running'));

// Polls while a run is queued/running so status flips land without realtime
// wiring; goes quiet as soon as every run is terminal.
export function useAutomationRuns(automationId?: string) {
  return useQuery({
    queryKey: automationRunsQueryKey(automationId),
    queryFn: () => fetchAutomationRuns(automationId as string),
    enabled: Boolean(automationId),
    refetchInterval: (query) => (hasActiveRun(query.state.data) ? 5_000 : false),
  });
}

// The runs list omits report bodies (they can be large); the report is fetched
// per run when the user expands it.
export function useAutomationRun(runId?: string, enabled = true) {
  return useQuery({
    queryKey: automationRunQueryKey(runId),
    queryFn: () => fetchAutomationRun(runId as string),
    enabled: Boolean(runId) && enabled,
  });
}

export function useRecipientCandidates(brandId?: string) {
  return useQuery({
    queryKey: recipientCandidatesQueryKey(brandId),
    queryFn: () => fetchRecipientCandidates(brandId as string),
    enabled: Boolean(brandId),
  });
}

export function useCreateAutomation(brandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAutomation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: automationsQueryKey(brandId) });
    },
  });
}

export function useUpdateAutomation(brandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      automationId,
      patch,
    }: {
      automationId: string;
      patch: UpdateAutomationRequest;
    }) => updateAutomation(automationId, patch),
    // Optimistic only for the enabled toggle — it's the one high-frequency,
    // low-risk flip; everything else invalidates and refetches.
    onMutate: async ({ automationId, patch }) => {
      if (patch.enabled === undefined || Object.keys(patch).length !== 1) return {};
      await queryClient.cancelQueries({ queryKey: automationsQueryKey(brandId) });
      const previous = queryClient.getQueryData<Automation[]>(automationsQueryKey(brandId));
      queryClient.setQueryData<Automation[]>(automationsQueryKey(brandId), (list) =>
        list?.map((a) => (a.id === automationId ? { ...a, enabled: patch.enabled as boolean } : a)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(automationsQueryKey(brandId), context.previous);
      }
    },
    onSettled: (_data, _err, { automationId }) => {
      void queryClient.invalidateQueries({ queryKey: automationsQueryKey(brandId) });
      void queryClient.invalidateQueries({ queryKey: automationQueryKey(automationId) });
    },
  });
}

export function useDeleteAutomation(brandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAutomation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: automationsQueryKey(brandId) });
    },
  });
}

export function useRunAutomationNow(brandId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runAutomationNow,
    onSuccess: (_runId, automationId) => {
      void queryClient.invalidateQueries({ queryKey: automationRunsQueryKey(automationId) });
      void queryClient.invalidateQueries({ queryKey: automationsQueryKey(brandId) });
    },
  });
}
