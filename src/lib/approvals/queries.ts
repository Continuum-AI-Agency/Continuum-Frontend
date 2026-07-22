'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { approveAction, getAction, getDryRunMode, listActions, rejectAction } from './client';
import type { ActionStatus } from './types';

const LIST_REFRESH_MS = 30_000;
const DRY_RUN_REFRESH_MS = 60_000;

export function approvalsListKey(brandId: string, status: ActionStatus) {
  return ['rule-actions', 'list', brandId, status] as const;
}

export function approvalRowKey(brandId: string, id: string) {
  return ['rule-actions', 'row', brandId, id] as const;
}

export function usePendingActions(brandId: string, status: ActionStatus = 'PENDING') {
  return useQuery({
    queryKey: approvalsListKey(brandId, status),
    queryFn: () => listActions({ brandId, status, limit: 200 }),
    refetchInterval: LIST_REFRESH_MS,
    staleTime: 0,
    enabled: Boolean(brandId),
  });
}

export function useDryRunMode() {
  return useQuery({
    queryKey: ['rule-actions', 'dry-run'],
    queryFn: getDryRunMode,
    refetchInterval: DRY_RUN_REFRESH_MS,
    staleTime: DRY_RUN_REFRESH_MS,
  });
}

export function useApprove(brandId: string, status: ActionStatus = 'PENDING') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { ruleActionId: string; note?: string }) =>
      approveAction({ brandId, ...args }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: approvalsListKey(brandId, status) });
    },
  });
}

export function useReject(brandId: string, status: ActionStatus = 'PENDING') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { ruleActionId: string; reason: string }) =>
      rejectAction({ brandId, ...args }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: approvalsListKey(brandId, status) });
    },
  });
}

export function useActionRefresh(brandId: string) {
  return useMutation({
    mutationFn: (ruleActionId: string) => getAction({ brandId, ruleActionId }),
  });
}
