'use client';

// React Query data layer for the Paid Media Optimizer surface. Reads flow
// through the optimizer edge functions / authenticated RPCs; every read is
// wrapped so an unreachable/404 backend (the edge functions deploy later)
// resolves to an empty read model rather than throwing — the OptimizerTab then
// renders its onboarding/empty state. Writes go through the edge functions
// (enroll, run) and the authenticated RPCs (create portfolio, set rec status).
//
// All shapes come from @continuum/contracts (root entry) — no parallel unions.

import {
  type CpaSeriesPoint,
  CpaSeriesPointSchema,
  type CreatePortfolioRequest,
  type CycleRunReport,
  CycleRunReportSchema,
  type EnrollRequest,
  type PortfolioListItem,
  PortfolioListItemSchema,
  type RenewalTask,
  RenewalTaskSchema,
  type RunCycleResponse,
  RunCycleResponseSchema,
  type SetRecommendationStatusRequest,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// The optimizer RPCs/edge functions are not yet in the generated Supabase types
// (they deploy later), so the client is treated as loosely typed at this single
// boundary. Every response is re-validated with a contracts schema below.
type LooseSupabase = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  functions: {
    invoke: (
      name: string,
      options?: { body?: unknown; method?: string },
    ) => Promise<{ data: unknown; error: unknown }>;
  };
};

function getClient(): LooseSupabase {
  return createSupabaseBrowserClient() as unknown as LooseSupabase;
}

const OPTIMIZER_KEY = 'paid-optimizer';

export const optimizerQueryKeys = {
  portfolios: (brandId: string, adAccountId: string | null) =>
    [OPTIMIZER_KEY, 'portfolios', brandId, adAccountId] as const,
  performance: (portfolioId: string) => [OPTIMIZER_KEY, 'performance', portfolioId] as const,
  cpaSeries: (portfolioId: string) => [OPTIMIZER_KEY, 'cpa-series', portfolioId] as const,
  renewals: (brandId: string) => [OPTIMIZER_KEY, 'renewals', brandId] as const,
};

// ── Reads (graceful: any failure resolves to the empty read model) ───────────

async function fetchPortfolios(
  brandId: string,
  adAccountId: string | null,
): Promise<PortfolioListItem[]> {
  try {
    const { data, error } = await getClient().rpc('optimizer_list_portfolios', {
      p_brand_id: brandId,
    });
    if (error) return [];
    const rows = z
      .array(PortfolioListItemSchema)
      .catch([])
      .parse(data ?? []);
    if (!adAccountId) return rows;
    return rows.filter((row) => !row.ad_account_id || row.ad_account_id === adAccountId);
  } catch {
    return [];
  }
}

async function fetchPerformance(portfolioId: string): Promise<CycleRunReport | null> {
  try {
    const { data, error } = await getClient().functions.invoke('optimizer-status', {
      body: { portfolio_id: portfolioId },
    });
    if (error) return null;
    const parsed = CycleRunReportSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function fetchCpaSeries(portfolioId: string): Promise<CpaSeriesPoint[]> {
  try {
    const { data, error } = await getClient().rpc('optimizer_get_cpa_series', {
      p_portfolio_id: portfolioId,
      p_limit: 30,
    });
    if (error) return [];
    return z
      .array(CpaSeriesPointSchema)
      .catch([])
      .parse(data ?? []);
  } catch {
    return [];
  }
}

async function fetchRenewals(brandId: string): Promise<RenewalTask[]> {
  try {
    const { data, error } = await getClient().rpc('optimizer_list_renewal_tasks', {
      p_brand_id: brandId,
      p_status: 'open',
    });
    if (error) return [];
    return z
      .array(RenewalTaskSchema)
      .catch([])
      .parse(data ?? []);
  } catch {
    return [];
  }
}

// ── Writes (throw on failure so the mutation surfaces an error toast) ─────────

async function createPortfolio(request: CreatePortfolioRequest): Promise<{ portfolio_id: string }> {
  const { data, error } = await getClient().rpc('optimizer_create_portfolio', {
    p_brand_id: request.brand_id,
    p_ad_account_id: request.ad_account_id,
    p_config: request.config,
  });
  if (error) throw new Error('Failed to create portfolio');
  const parsed = z.string().uuid().safeParse(data);
  if (!parsed.success) throw new Error('Malformed create-portfolio response');
  return { portfolio_id: parsed.data };
}

async function enrollAdsets(request: EnrollRequest): Promise<{ enrolled: number }> {
  const { data, error } = await getClient().functions.invoke('optimizer-enroll', {
    body: request,
  });
  if (error) throw new Error('Failed to enroll ad sets');
  const parsed = z.object({ enrolled: z.number().int().nonnegative() }).safeParse(data);
  return { enrolled: parsed.success ? parsed.data.enrolled : 0 };
}

async function runCycle(portfolioId: string): Promise<RunCycleResponse | null> {
  const { data, error } = await getClient().functions.invoke('optimizer-run', {
    body: { portfolio_id: portfolioId },
  });
  if (error) throw new Error('Failed to run cycle');
  const parsed = RunCycleResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

async function setRecommendationStatus(request: SetRecommendationStatusRequest): Promise<void> {
  const { error } = await getClient().rpc('optimizer_set_recommendation_status', {
    p_recommendation_id: request.recommendation_id,
    p_status: request.status,
  });
  if (error) throw new Error('Failed to update recommendation');
}

async function setRenewalTaskStatus(taskId: string, status: string): Promise<void> {
  const { error } = await getClient().rpc('optimizer_set_renewal_task_status', {
    p_task_id: taskId,
    p_status: status,
  });
  if (error) throw new Error('Failed to update renewal task');
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useOptimizerPortfolios(brandId: string, adAccountId: string | null) {
  return useQuery({
    queryKey: optimizerQueryKeys.portfolios(brandId, adAccountId),
    queryFn: () => fetchPortfolios(brandId, adAccountId),
    enabled: Boolean(brandId),
  });
}

export function useOptimizerPerformance(portfolioId: string | null) {
  return useQuery({
    queryKey: optimizerQueryKeys.performance(portfolioId ?? 'none'),
    queryFn: () => fetchPerformance(portfolioId as string),
    enabled: Boolean(portfolioId),
  });
}

export function useOptimizerCpaSeries(portfolioId: string | null) {
  return useQuery({
    queryKey: optimizerQueryKeys.cpaSeries(portfolioId ?? 'none'),
    queryFn: () => fetchCpaSeries(portfolioId as string),
    enabled: Boolean(portfolioId),
  });
}

export function useOptimizerRenewals(brandId: string) {
  return useQuery({
    queryKey: optimizerQueryKeys.renewals(brandId),
    queryFn: () => fetchRenewals(brandId),
    enabled: Boolean(brandId),
  });
}

export function useOptimizerMutations(brandId: string, adAccountId: string | null) {
  const queryClient = useQueryClient();

  const invalidatePortfolios = () =>
    queryClient.invalidateQueries({
      queryKey: optimizerQueryKeys.portfolios(brandId, adAccountId),
    });

  const create = useMutation({
    mutationFn: createPortfolio,
    onSuccess: invalidatePortfolios,
  });

  const enroll = useMutation({
    mutationFn: enrollAdsets,
    onSuccess: invalidatePortfolios,
  });

  const run = useMutation({
    mutationFn: runCycle,
    onSuccess: (_data, portfolioId) => {
      void invalidatePortfolios();
      void queryClient.invalidateQueries({
        queryKey: optimizerQueryKeys.performance(portfolioId),
      });
    },
  });

  const setStatus = useMutation({
    mutationFn: setRecommendationStatus,
    onSuccess: () => {
      void invalidatePortfolios();
      void queryClient.invalidateQueries({ queryKey: optimizerQueryKeys.renewals(brandId) });
    },
  });

  const renewal = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      setRenewalTaskStatus(taskId, status),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: optimizerQueryKeys.renewals(brandId) }),
  });

  return { create, enroll, run, setStatus, renewal };
}
