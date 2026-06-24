// Browser API + React Query hook for the brand skill library. Calls the
// agents-ts backend directly (http.request attaches base URL + bearer) per the
// FE API-layer rule — no Next.js proxy route.

'use client';

import {
  type CreateSkillRequest,
  type ListSkillsResponse,
  listSkillsResponseSchema,
  type Skill,
  type SkillResponse,
  skillResponseSchema,
  type UpdateSkillRequest,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { http } from '@/lib/api/http';

// Includes the global first-party library (read-only templates) alongside the
// brand's own skills so the selector + wizard can show both; callers split on
// `isTemplate`.
export async function fetchBrandSkills(brandId: string): Promise<Skill[]> {
  const result = await http.request<ListSkillsResponse>({
    path: `/api/organic/skills?brandId=${encodeURIComponent(brandId)}&includeTemplates=true`,
    method: 'GET',
    schema: listSkillsResponseSchema,
  });
  return result.skills;
}

export async function createBrandSkill(input: CreateSkillRequest): Promise<Skill> {
  const result = await http.request<SkillResponse>({
    path: '/api/organic/skills',
    method: 'POST',
    body: input,
    schema: skillResponseSchema,
  });
  return result.skill;
}

export async function updateBrandSkill(id: string, patch: UpdateSkillRequest): Promise<Skill> {
  const result = await http.request<SkillResponse>({
    path: `/api/organic/skills/${encodeURIComponent(id)}`,
    method: 'PATCH',
    body: patch,
    schema: skillResponseSchema,
  });
  return result.skill;
}

export async function archiveBrandSkill(id: string): Promise<Skill> {
  const result = await http.request<SkillResponse>({
    path: `/api/organic/skills/${encodeURIComponent(id)}/archive`,
    method: 'POST',
    schema: skillResponseSchema,
  });
  return result.skill;
}

export const brandSkillsQueryKey = (brandId?: string) => ['brand-skills', brandId] as const;

export function useBrandSkills(brandId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: brandSkillsQueryKey(brandId),
    queryFn: () => (brandId ? fetchBrandSkills(brandId) : Promise.resolve([] as Skill[])),
    enabled: Boolean(brandId),
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const skills = useMemo(() => all.filter((s) => !s.isTemplate), [all]);
  const templates = useMemo(() => all.filter((s) => s.isTemplate), [all]);

  const refresh = () =>
    brandId
      ? queryClient.invalidateQueries({ queryKey: brandSkillsQueryKey(brandId) })
      : Promise.resolve();

  return {
    skills,
    templates,
    all,
    isLoading: query.isLoading,
    isError: query.isError,
    refresh,
  };
}
