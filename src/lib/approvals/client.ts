'use client';

import { READ_TIMEOUT_MS } from '@/lib/api/timeout';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  type ActionStatus,
  type ApproveResponse,
  approveResponseSchema,
  type DryRunResponse,
  dryRunResponseSchema,
  type GetResponse,
  getResponseSchema,
  type ListResponse,
  listResponseSchema,
  type RejectResponse,
  rejectResponseSchema,
} from './types';

type InvokeArgs = Record<string, unknown> & { action: string };

/** Actions that only read. `rule-actions` is one edge function for the queue AND the approvals
 *  that execute against the platform, so the client's bound by URL is the long one; a read
 *  carries its own read bound here so a hung queue ends as a named state, not a skeleton. */
const READ_ACTIONS: ReadonlySet<string> = new Set(['list', 'get', 'dryRun']);

async function invoke<T>(args: InvokeArgs): Promise<T> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke<T>('rule-actions', {
    body: args,
    ...(READ_ACTIONS.has(args.action) ? { signal: AbortSignal.timeout(READ_TIMEOUT_MS) } : {}),
  });
  if (error) {
    // The library's own error rides along as the cause, so the surface can say why in words
    // (loadFailureMessage) instead of printing "Edge Function returned a non-2xx status code".
    throw new Error(error.message ?? 'rule-actions edge function failed', { cause: error });
  }
  if (!data) {
    throw new Error('rule-actions edge function returned no data');
  }
  return data;
}

export async function listActions(args: {
  brandId: string;
  status?: ActionStatus;
  limit?: number;
  offset?: number;
}): Promise<ListResponse> {
  const raw = await invoke<unknown>({
    action: 'list',
    brandId: args.brandId,
    status: args.status,
    limit: args.limit,
    offset: args.offset,
  });
  return listResponseSchema.parse(raw);
}

export async function getAction(args: {
  brandId: string;
  ruleActionId: string;
}): Promise<GetResponse> {
  const raw = await invoke<unknown>({
    action: 'get',
    brandId: args.brandId,
    ruleActionId: args.ruleActionId,
  });
  return getResponseSchema.parse(raw);
}

export async function approveAction(args: {
  brandId: string;
  ruleActionId: string;
  note?: string;
}): Promise<ApproveResponse> {
  const raw = await invoke<unknown>({
    action: 'approve',
    brandId: args.brandId,
    ruleActionId: args.ruleActionId,
    note: args.note,
  });
  return approveResponseSchema.parse(raw);
}

export async function rejectAction(args: {
  brandId: string;
  ruleActionId: string;
  reason: string;
}): Promise<RejectResponse> {
  const raw = await invoke<unknown>({
    action: 'reject',
    brandId: args.brandId,
    ruleActionId: args.ruleActionId,
    reason: args.reason,
  });
  return rejectResponseSchema.parse(raw);
}

export async function getDryRunMode(): Promise<DryRunResponse> {
  const raw = await invoke<unknown>({ action: 'dryRun' });
  return dryRunResponseSchema.parse(raw);
}
