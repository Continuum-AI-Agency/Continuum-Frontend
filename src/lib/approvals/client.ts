'use client';

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

async function invoke<T>(args: InvokeArgs): Promise<T> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke<T>('rule-actions', { body: args });
  if (error) {
    throw new Error(error.message ?? 'rule-actions edge function failed');
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
