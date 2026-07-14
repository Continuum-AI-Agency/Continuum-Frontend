// Browser API + React Query hook for the brand prompt library. Calls the agents-ts
// backend directly (http.request attaches base URL + bearer) per the FE API-layer rule
// — no Next.js proxy route.
//
// Named prompts-api.ts, not prompts.ts: `src/lib/organic/prompts.ts` is already taken
// by the legacy localStorage preset list that hangs off the unmounted OrganicExperience.
// That one is dead; this one is the library.

'use client';

import {
  type CreatePromptRequest,
  type ListPromptsResponse,
  listPromptsResponseSchema,
  type Prompt,
  type PromptResponse,
  promptResponseSchema,
  type UpdatePromptRequest,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { http } from '@/lib/api/http';

export async function fetchBrandPrompts(brandId: string): Promise<Prompt[]> {
  const result = await http.request<ListPromptsResponse>({
    path: `/api/organic/prompts?brandId=${encodeURIComponent(brandId)}`,
    method: 'GET',
    schema: listPromptsResponseSchema,
  });
  return result.prompts;
}

export async function createBrandPrompt(input: CreatePromptRequest): Promise<Prompt> {
  const result = await http.request<PromptResponse>({
    path: '/api/organic/prompts',
    method: 'POST',
    body: input,
    schema: promptResponseSchema,
  });
  return result.prompt;
}

export async function updateBrandPrompt(id: string, patch: UpdatePromptRequest): Promise<Prompt> {
  const result = await http.request<PromptResponse>({
    path: `/api/organic/prompts/${encodeURIComponent(id)}`,
    method: 'PATCH',
    body: patch,
    schema: promptResponseSchema,
  });
  return result.prompt;
}

export async function archiveBrandPrompt(id: string): Promise<Prompt> {
  const result = await http.request<PromptResponse>({
    path: `/api/organic/prompts/${encodeURIComponent(id)}/archive`,
    method: 'POST',
    schema: promptResponseSchema,
  });
  return result.prompt;
}

export const brandPromptsQueryKey = (brandId?: string) => ['brand-prompts', brandId] as const;

export function useBrandPrompts(brandId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: brandPromptsQueryKey(brandId),
    queryFn: () => (brandId ? fetchBrandPrompts(brandId) : Promise.resolve([] as Prompt[])),
    enabled: Boolean(brandId),
  });

  const prompts = useMemo(() => query.data ?? [], [query.data]);

  const refresh = () =>
    brandId
      ? queryClient.invalidateQueries({ queryKey: brandPromptsQueryKey(brandId) })
      : Promise.resolve();

  return {
    prompts,
    isLoading: query.isLoading,
    isError: query.isError,
    refresh,
  };
}
