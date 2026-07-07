'use client';

// Data layer for the Paid Media Optimizer surface. Reads flow through the
// authenticated optimizer RPCs / edge functions and are cached in the Zustand
// optimizer store with a 30-minute TTL (see optimizerStore.ts) — switching
// sub-tabs or re-mounting the tab serves the cached graph data instead of
// re-hitting the network. Every read is wrapped so an unreachable/404 backend
// (some edge functions deploy later) resolves to an empty read model rather than
// throwing — the OptimizerTab then renders its onboarding/empty state.
//
// Writes go through React Query mutations (enroll, run, create, set-status); on
// success they mark the affected cache keys stale so the next read refreshes.
// All shapes come from @continuum/contracts (root entry) — no parallel unions.

import {
  type AdAccount,
  AdAccountSchema,
  type AdSetSnapshot,
  AdSetSnapshotSchema,
  type AngleMatrixCell,
  AngleMatrixCellSchema,
  type CpaSeriesPoint,
  CpaSeriesPointSchema,
  type CreatePortfolioRequest,
  type CycleRunReport,
  CycleRunReportSchema,
  type EnrollRequest,
  type OptimizerLogRow,
  OptimizerLogsResponseSchema,
  type PortfolioListItem,
  PortfolioListItemSchema,
  type RenewalTask,
  RenewalTaskSchema,
  type RunCycleResponse,
  RunCycleResponseSchema,
  type SetRecommendationStatusRequest,
  type SuggestResult,
  SuggestResultSchema,
} from '@continuum/contracts';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { useCachedRead, useOptimizerStore } from '@/lib/paid-media/optimizerStore';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// The optimizer RPCs/edge functions are not yet in the generated Supabase types
// (they deploy later), so the client is treated as loosely typed at this single
// boundary. Every response is re-validated with a contracts schema below.
type LooseRpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};
type LooseSupabase = LooseRpc & {
  // Non-public RPCs (e.g. plugin_mcp.list_brand_ad_accounts) must be reached via
  // .schema(...) — calling them on the default public schema 404s in PostgREST.
  schema: (name: string) => LooseRpc;
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

/** A write RPC failure that preserves the Postgres error code so the UI can map
 *  specific failures (e.g. 42501 ownership) to a clean inline message. */
export class OptimizerRpcError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'OptimizerRpcError';
    this.code = code;
  }
}

function pgErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

// ── Cache keys (shared by the store reads and the mutation invalidations) ─────

export const cacheKeys = {
  portfolios: (brandId: string, adAccountId: string | null) =>
    `portfolios:${brandId}:${adAccountId ?? 'all'}`,
  adAccounts: (brandId: string) => `adAccounts:${brandId}`,
  performance: (portfolioId: string) => `performance:${portfolioId}`,
  cpaSeries: (portfolioId: string) => `cpaSeries:${portfolioId}`,
  angleMatrix: (portfolioId: string) => `angleMatrix:${portfolioId}`,
  renewals: (brandId: string) => `renewals:${brandId}`,
  logs: (brandId: string) => `logs:${brandId}`,
  suggestions: (brandId: string, adAccountId: string | null) =>
    `suggestions:${brandId}:${adAccountId ?? 'all'}`,
  accountSnapshots: (brandId: string, adAccountId: string | null) =>
    `snapshots:${brandId}:${adAccountId ?? 'all'}`,
};

// ── Reads ────────────────────────────────────────────────────────────────────
// These THROW when the backend is unreachable/errors (network failure, an
// unwired edge on a local stack, a hung request) so useCachedRead can record an
// error state and the surface can show an "optimizer offline" signal instead of
// an infinite skeleton. A successful-but-EMPTY read still resolves to the empty
// model (that's a legitimate "no data yet" state, not an outage), and malformed
// rows degrade to empty via `.catch([])` rather than tripping the offline path.

async function fetchPortfolios(
  brandId: string,
  adAccountId: string | null,
): Promise<PortfolioListItem[]> {
  const { data, error } = await getClient().rpc('optimizer_list_portfolios', {
    p_brand_id: brandId,
  });
  if (error) throw new Error('optimizer_list_portfolios unreachable');
  const rows = z
    .array(PortfolioListItemSchema)
    .catch([])
    .parse(data ?? []);
  if (!adAccountId) return rows;
  return rows.filter((row) => !row.ad_account_id || row.ad_account_id === adAccountId);
}

async function fetchAdAccounts(brandId: string): Promise<AdAccount[]> {
  // list_brand_ad_accounts lives in the plugin_mcp schema, not public — it must
  // be called via .schema('plugin_mcp') or PostgREST returns 404.
  const { data, error } = await getClient().schema('plugin_mcp').rpc('list_brand_ad_accounts', {
    p_brand_id: brandId,
  });
  if (error) throw new Error('list_brand_ad_accounts unreachable');
  return z
    .array(AdAccountSchema)
    .catch([])
    .parse(data ?? []);
}

async function fetchPerformance(portfolioId: string): Promise<CycleRunReport | null> {
  const { data, error } = await getClient().functions.invoke('optimizer-status', {
    body: { portfolio_id: portfolioId },
  });
  if (error) throw new Error('optimizer-status unreachable');
  const parsed = CycleRunReportSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

async function fetchCpaSeries(portfolioId: string): Promise<CpaSeriesPoint[]> {
  const { data, error } = await getClient().rpc('optimizer_get_cpa_series', {
    p_portfolio_id: portfolioId,
    p_limit: 30,
  });
  if (error) throw new Error('optimizer_get_cpa_series unreachable');
  return z
    .array(CpaSeriesPointSchema)
    .catch([])
    .parse(data ?? []);
}

async function fetchAngleMatrix(portfolioId: string): Promise<AngleMatrixCell[]> {
  const { data, error } = await getClient().rpc('optimizer_get_angle_matrix', {
    p_portfolio_id: portfolioId,
    p_window: 'd14',
  });
  if (error) throw new Error('optimizer_get_angle_matrix unreachable');
  return z
    .array(AngleMatrixCellSchema)
    .catch([])
    .parse(data ?? []);
}

async function fetchRenewals(brandId: string): Promise<RenewalTask[]> {
  const { data, error } = await getClient().rpc('optimizer_list_renewal_tasks', {
    p_brand_id: brandId,
    p_status: 'open',
  });
  if (error) throw new Error('optimizer_list_renewal_tasks unreachable');
  return z
    .array(RenewalTaskSchema)
    .catch([])
    .parse(data ?? []);
}

async function fetchLogs(brandId: string): Promise<OptimizerLogRow[]> {
  const { data, error } = await getClient().functions.invoke('optimizer-status', {
    body: { view: 'logs', brand_id: brandId, limit: 100 },
  });
  if (error) throw new Error('optimizer-status logs unreachable');
  const parsed = OptimizerLogsResponseSchema.safeParse(data);
  return parsed.success ? parsed.data.logs : [];
}

async function fetchSuggestions(
  brandId: string,
  adAccountId: string,
): Promise<SuggestResult | null> {
  const { data, error } = await getClient().functions.invoke('optimizer-suggest', {
    body: { brandId, accountId: adAccountId },
  });
  if (error) throw new Error('optimizer-suggest unreachable');
  const parsed = SuggestResultSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** The account's ad-set snapshots (engine input shape) via the SAME edge the
 *  optimizer service ingest uses — paid-media-metrics scope=adset_snapshots.
 *  It accepts a user JWT (web app), so this runs client-side with no service key.
 *  Feeds the client-side "what-if" dry-run (runs the pure engine in the browser). */
async function fetchAccountSnapshots(brandId: string, accountId: string): Promise<AdSetSnapshot[]> {
  const { data, error } = await getClient().functions.invoke('paid-media-metrics', {
    body: { platform: 'meta', scope: 'adset_snapshots', brandId, accountId },
  });
  if (error) throw new Error('paid-media-metrics adset_snapshots unreachable');
  const snapshots = (data as { snapshots?: unknown })?.snapshots ?? [];
  return z.array(AdSetSnapshotSchema).catch([]).parse(snapshots);
}

// ── Writes (throw on failure so the mutation surfaces an error) ───────────────

async function createPortfolio(request: CreatePortfolioRequest): Promise<{ portfolio_id: string }> {
  const { data, error } = await getClient().rpc('optimizer_create_portfolio', {
    p_brand_id: request.brand_id,
    p_ad_account_id: request.ad_account_id,
    p_config: request.config,
  });
  if (error) {
    const code = pgErrorCode(error);
    // 42501 = insufficient_privilege — the RPC raises it when the ad account is
    // not linked to this brand. Surface a clean inline message, not a stack.
    const message =
      code === '42501'
        ? "That ad account isn't connected to this brand."
        : 'Could not create the portfolio. The optimizer backend may not be reachable yet.';
    throw new OptimizerRpcError(message, code);
  }
  const parsed = z.string().uuid().safeParse(data);
  if (!parsed.success) throw new OptimizerRpcError('Malformed create-portfolio response.', null);
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

// ── Read hooks (cache-first, 30-minute TTL) ──────────────────────────────────

const EMPTY_PORTFOLIOS: PortfolioListItem[] = [];
const EMPTY_ACCOUNTS: AdAccount[] = [];
const EMPTY_CPA: CpaSeriesPoint[] = [];
const EMPTY_ANGLES: AngleMatrixCell[] = [];
const EMPTY_RENEWALS: RenewalTask[] = [];
const EMPTY_LOGS: OptimizerLogRow[] = [];
const EMPTY_SNAPSHOTS: AdSetSnapshot[] = [];

export function useOptimizerPortfolios(brandId: string, adAccountId: string | null) {
  return useCachedRead<PortfolioListItem[]>(
    brandId ? cacheKeys.portfolios(brandId, adAccountId) : null,
    () => fetchPortfolios(brandId, adAccountId),
    EMPTY_PORTFOLIOS,
  );
}

export function useOptimizerAdAccounts(brandId: string) {
  return useCachedRead<AdAccount[]>(
    brandId ? cacheKeys.adAccounts(brandId) : null,
    () => fetchAdAccounts(brandId),
    EMPTY_ACCOUNTS,
  );
}

/** Resolve the display currency for a specific ad account (falls back to USD in
 *  the formatter when the account row has no currency yet). */
export function useAdAccountCurrency(brandId: string, adAccountId: string | null): string | null {
  const { data } = useOptimizerAdAccounts(brandId);
  if (!adAccountId) return null;
  return data.find((account) => account.account_id === adAccountId)?.currency ?? null;
}

export function useOptimizerPerformance(portfolioId: string | null) {
  return useCachedRead<CycleRunReport | null>(
    portfolioId ? cacheKeys.performance(portfolioId) : null,
    () => fetchPerformance(portfolioId as string),
    null,
  );
}

export function useOptimizerCpaSeries(portfolioId: string | null) {
  return useCachedRead<CpaSeriesPoint[]>(
    portfolioId ? cacheKeys.cpaSeries(portfolioId) : null,
    () => fetchCpaSeries(portfolioId as string),
    EMPTY_CPA,
  );
}

export function useOptimizerAngleMatrix(portfolioId: string | null) {
  return useCachedRead<AngleMatrixCell[]>(
    portfolioId ? cacheKeys.angleMatrix(portfolioId) : null,
    () => fetchAngleMatrix(portfolioId as string),
    EMPTY_ANGLES,
  );
}

export function useOptimizerRenewals(brandId: string) {
  return useCachedRead<RenewalTask[]>(
    brandId ? cacheKeys.renewals(brandId) : null,
    () => fetchRenewals(brandId),
    EMPTY_RENEWALS,
  );
}

export function useOptimizerLogs(brandId: string) {
  return useCachedRead<OptimizerLogRow[]>(
    brandId ? cacheKeys.logs(brandId) : null,
    () => fetchLogs(brandId),
    EMPTY_LOGS,
  );
}

export function useOptimizerSuggestions(brandId: string, adAccountId: string | null) {
  return useCachedRead<SuggestResult | null>(
    brandId && adAccountId ? cacheKeys.suggestions(brandId, adAccountId) : null,
    () => fetchSuggestions(brandId, adAccountId as string),
    null,
  );
}

/** The account's ad-set snapshots (engine input) — powers the client-side
 *  "what-if" preview. Cached like every other read (30-min TTL). */
export function useOptimizerAccountSnapshots(brandId: string, adAccountId: string | null) {
  return useCachedRead<AdSetSnapshot[]>(
    brandId && adAccountId ? cacheKeys.accountSnapshots(brandId, adAccountId) : null,
    () => fetchAccountSnapshots(brandId, adAccountId as string),
    EMPTY_SNAPSHOTS,
  );
}

// ── Mutations (React Query for lifecycle; invalidate the store on success) ────

export function useOptimizerMutations(brandId: string, adAccountId: string | null) {
  const markStale = useOptimizerStore((state) => state.markStale);

  const invalidatePortfolios = () =>
    markStale((key) => key.startsWith('portfolios:') || key.startsWith(`suggestions:${brandId}`));

  const create = useMutation({
    mutationFn: createPortfolio,
    onSuccess: invalidatePortfolios,
  });

  const enroll = useMutation({
    mutationFn: enrollAdsets,
    onSuccess: (_data, request) =>
      markStale(
        (key) =>
          key.startsWith('portfolios:') || key === cacheKeys.performance(request.portfolio_id),
      ),
  });

  const run = useMutation({
    mutationFn: runCycle,
    onSuccess: (_data, portfolioId) =>
      markStale(
        (key) =>
          key.startsWith('portfolios:') ||
          key === cacheKeys.performance(portfolioId) ||
          key === cacheKeys.cpaSeries(portfolioId) ||
          key === cacheKeys.angleMatrix(portfolioId),
      ),
  });

  const setStatus = useMutation({
    mutationFn: setRecommendationStatus,
    onSuccess: () =>
      markStale(
        (key) =>
          key.startsWith('performance:') ||
          key.startsWith('portfolios:') ||
          key === cacheKeys.renewals(brandId),
      ),
  });

  const renewal = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      setRenewalTaskStatus(taskId, status),
    onSuccess: () => markStale((key) => key === cacheKeys.renewals(brandId)),
  });

  // adAccountId is retained in the signature for call-site symmetry with the
  // read hooks (create/enroll operate on the selected account).
  void adAccountId;

  return { create, enroll, run, setStatus, renewal };
}
