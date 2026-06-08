// Browser API + React Query hook for the brand skill library. Calls the
// agents-ts backend directly (http.request attaches base URL + bearer) per the
// FE API-layer rule — no Next.js proxy route.

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listSkillsResponseSchema,
  skillResponseSchema,
  type CreateSkillRequest,
  type ListSkillsResponse,
  type Skill,
  type SkillResponse,
} from "@continuum/contracts";
import { http } from "@/lib/api/http";

export async function fetchBrandSkills(brandId: string): Promise<Skill[]> {
  const result = await http.request<ListSkillsResponse>({
    path: `/api/organic/skills?brandId=${encodeURIComponent(brandId)}`,
    method: "GET",
    schema: listSkillsResponseSchema,
  });
  return result.skills;
}

export async function createBrandSkill(input: CreateSkillRequest): Promise<Skill> {
  const result = await http.request<SkillResponse>({
    path: "/api/organic/skills",
    method: "POST",
    body: input,
    schema: skillResponseSchema,
  });
  return result.skill;
}

export const brandSkillsQueryKey = (brandId?: string) => ["brand-skills", brandId] as const;

export function useBrandSkills(brandId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: brandSkillsQueryKey(brandId),
    queryFn: () => (brandId ? fetchBrandSkills(brandId) : Promise.resolve([] as Skill[])),
    enabled: Boolean(brandId),
  });

  return {
    skills: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refresh: () =>
      brandId
        ? queryClient.invalidateQueries({ queryKey: brandSkillsQueryKey(brandId) })
        : Promise.resolve(),
  };
}
