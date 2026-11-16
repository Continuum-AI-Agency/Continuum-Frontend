'use client';

import {
  WATCHMAN_MANAGE_ROUTE,
  type WatchmanManageInput,
  watchmanPersonTaskViewSchema,
  watchmanProposalViewSchema,
  watchmanReportViewSchema,
  watchmanStatusViewSchema,
  watchmanWakeViewSchema,
} from '@continuum/contracts';
import { z } from 'zod';
import { request } from '@/lib/api/http';

// A brand admin's Watchman actions (plan 074 step 5). The Backend runs the same watchman_manage
// handler the MCP does, so the page gets the same admin gate and validation. Anyone else: 403.

export async function manageWatchman<T>(
  brandId: string,
  input: WatchmanManageInput,
  result: z.ZodType<T>,
): Promise<T> {
  return request({
    path: WATCHMAN_MANAGE_ROUTE,
    method: 'POST',
    body: { brandId, input },
    schema: z.object({ status: z.literal('ok'), result }).transform((out) => out.result),
  });
}

export const watchmanReads = {
  status: (brandId: string) =>
    manageWatchman(
      brandId,
      { action: 'status' },
      z.object({ watchmen: z.array(watchmanStatusViewSchema) }),
    ),
  tasks: (brandId: string, watchmanId: string) =>
    manageWatchman(
      brandId,
      { action: 'task_list', watchman_id: watchmanId },
      z.object({ tasks: z.array(watchmanPersonTaskViewSchema) }),
    ),
  reports: (brandId: string, watchmanId: string) =>
    manageWatchman(
      brandId,
      { action: 'report_list', watchman_id: watchmanId },
      z.object({ reports: z.array(watchmanReportViewSchema) }),
    ),
  proposals: (brandId: string, watchmanId: string) =>
    manageWatchman(
      brandId,
      { action: 'proposal_list', watchman_id: watchmanId },
      z.object({ proposals: z.array(watchmanProposalViewSchema) }),
    ),
  wakes: (brandId: string, watchmanId: string) =>
    manageWatchman(
      brandId,
      { action: 'wake_list', watchman_id: watchmanId },
      z.object({ wakes: z.array(watchmanWakeViewSchema) }),
    ),
};

export const watchmanQueryKeys = {
  all: (brandId: string) => ['watchman', brandId] as const,
  part: (brandId: string, part: string, watchmanId?: string) =>
    ['watchman', brandId, part, watchmanId ?? null] as const,
};
