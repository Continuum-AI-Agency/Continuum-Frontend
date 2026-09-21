'use client';

// Data layer for the comment rules surface. Every read and write goes through
// the shared backend client, so authorization and brand scoping are the
// server's business, not this file's. React Query owns the cache: one query key
// per brand, and every mutation invalidates it, so the list a person is looking
// at is never a stale version of what they just changed.

import {
  type CommentTriggerRule,
  type ListCommentTriggerRulesResponse,
  type SaveCommentTriggerRuleRequest,
  listCommentTriggerRulesResponseSchema,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/lib/api/http';

const RULES_KEY = (brandId: string) => ['comment-rules', brandId] as const;

/** Rules are edited by hand and rarely by anyone else, so a short window is enough. */
const STALE_TIME = 60_000;

export function useCommentRules(brandId: string | null) {
  return useQuery({
    queryKey: RULES_KEY(brandId ?? 'none'),
    enabled: brandId !== null,
    staleTime: STALE_TIME,
    retry: 1,
    queryFn: () =>
      http.request<ListCommentTriggerRulesResponse>({
        path: `/comment-rules?brandId=${brandId}`,
        schema: listCommentTriggerRulesResponseSchema,
      }),
  });
}

export function useSaveCommentRule(brandId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rule: SaveCommentTriggerRuleRequest) =>
      http.request<{ rule: CommentTriggerRule }>({
        path: '/comment-rules',
        method: 'POST',
        body: rule,
      }),
    onSuccess: () => {
      if (brandId) void queryClient.invalidateQueries({ queryKey: RULES_KEY(brandId) });
    },
  });
}

export function useDeleteCommentRule(brandId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) =>
      http.request<void>({
        path: `/comment-rules/${ruleId}?brandId=${brandId}`,
        method: 'DELETE',
      }),
    onSuccess: () => {
      if (brandId) void queryClient.invalidateQueries({ queryKey: RULES_KEY(brandId) });
    },
  });
}

/**
 * The panic button. These rules message strangers on the account owner's
 * behalf, so "stop everything" has to be one action rather than opening each
 * rule in turn.
 */
export function useDisableAllCommentRules(brandId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      http.request<{ disabled: number }>({
        path: '/comment-rules/disable-all',
        method: 'POST',
        body: { brandId },
      }),
    onSuccess: () => {
      if (brandId) void queryClient.invalidateQueries({ queryKey: RULES_KEY(brandId) });
    },
  });
}
