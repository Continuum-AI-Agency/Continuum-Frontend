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
  type AdDailyTrend,
  AdDailyTrendsResponseSchema,
  type AdSetSnapshot,
  AdSetSnapshotSchema,
  type AdsetAd,
  AdsetAdsResponseSchema,
  type AngleMatrixCell,
  AngleMatrixCellSchema,
  type ApplyRunRequest,
  type ApplyRunResponse,
  ApplyRunResponseSchema,
  type ConvertCboRequest,
  type ConvertCboResponse,
  ConvertCboResponseSchema,
  type CpaSeriesPoint,
  CpaSeriesPointSchema,
  type CreatePortfolioRequest,
  type CycleRunReport,
  CycleRunReportSchema,
  type EnrollRequest,
  type OptimizerInsightRequest,
  type OptimizerInsightResponse,
  OptimizerInsightResponseSchema,
  type OptimizerLogRow,
  OptimizerLogsResponseSchema,
  type PortfolioAdset,
  PortfolioAdsetSchema,
  type PortfolioLevel,
  type PortfolioListItem,
  PortfolioListItemSchema,
  type RenewalTask,
  RenewalTaskSchema,
  type RunCycleResponse,
  RunCycleResponseSchema,
  type SetRecommendationStatusRequest,
  type SuggestResult,
  SuggestResultSchema,
  type UpdatePortfolioPatch,
} from '@continuum/contracts';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { useCachedRead, useOptimizerStore } from '@/lib/paid-media/optimizerStore';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { recommendationInsightKey } from './insightKey';

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
  suggestions: (brandId: string, adAccountId: string | null, level: PortfolioLevel = 'adset') =>
    `suggestions:${brandId}:${adAccountId ?? 'all'}:${level}`,
  accountSnapshots: (
    brandId: string,
    adAccountId: string | null,
    level: PortfolioLevel = 'adset',
  ) => `snapshots:${brandId}:${adAccountId ?? 'all'}:${level}`,
  enrolledAdsets: (portfolioId: string) => `enrolledAdsets:${portfolioId}`,
  archivedPortfolios: (brandId: string, adAccountId: string | null) =>
    `archived:${brandId}:${adAccountId ?? 'all'}`,
  adsetAds: (adsetId: string) => `adsetAds:${adsetId}`,
  adDailyTrends: (adsetId: string) => `adDailyTrends:${adsetId}`,
  insight: (insightKey: string) => `insight:${insightKey}`,
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
  level: PortfolioLevel = 'adset',
): Promise<SuggestResult | null> {
  const { data, error } = await getClient().functions.invoke('optimizer-suggest', {
    body: { brandId, accountId: adAccountId, level },
  });
  if (error) throw new Error('optimizer-suggest unreachable');
  const parsed = SuggestResultSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** The account's snapshots (engine input shape) via the SAME edge the optimizer
 *  service ingest uses — paid-media-metrics. `scope` selects the level: ad sets
 *  (`adset_snapshots`, default) or campaigns (`campaign_snapshots`, where each
 *  snapshot's id is the campaign id and campaignId is self-referential). The edge
 *  accepts a user JWT (web app), so this runs client-side with no service key.
 *  Feeds the client-side "what-if" dry-run (runs the pure engine in the browser). */
async function fetchAccountSnapshots(
  brandId: string,
  accountId: string,
  scope: 'adset_snapshots' | 'campaign_snapshots' = 'adset_snapshots',
): Promise<AdSetSnapshot[]> {
  const { data, error } = await getClient().functions.invoke('paid-media-metrics', {
    body: { platform: 'meta', scope, brandId, accountId },
  });
  if (error) throw new Error(`paid-media-metrics ${scope} unreachable`);
  const snapshots = (data as { snapshots?: unknown })?.snapshots ?? [];
  return z.array(AdSetSnapshotSchema).catch([]).parse(snapshots);
}

/** The active ad sets currently enrolled in a portfolio (id + name) — reads the
 *  enrolled roster so the manage panel can pre-select the picker and diff on save.
 *  Names are stored at enroll time, so this shows enrolled ad sets even when they
 *  fall outside the current snapshot window. */
async function fetchEnrolledAdsets(portfolioId: string): Promise<PortfolioAdset[]> {
  const { data, error } = await getClient().rpc('optimizer_list_portfolio_adsets', {
    p_portfolio_id: portfolioId,
  });
  if (error) throw new Error('optimizer_list_portfolio_adsets unreachable');
  return z
    .array(PortfolioAdsetSchema)
    .catch([])
    .parse(data ?? []);
}

/** Archived portfolios for the "Archived" view (optimizer_list_portfolios hides
 *  them). Same shape + client-side account filter as the active list. */
async function fetchArchivedPortfolios(
  brandId: string,
  adAccountId: string | null,
): Promise<PortfolioListItem[]> {
  const { data, error } = await getClient().rpc('optimizer_list_archived_portfolios', {
    p_brand_id: brandId,
  });
  if (error) throw new Error('optimizer_list_archived_portfolios unreachable');
  const rows = z
    .array(PortfolioListItemSchema)
    .catch([])
    .parse(data ?? []);
  if (!adAccountId) return rows;
  return rows.filter((row) => !row.ad_account_id || row.ad_account_id === adAccountId);
}

/** The ads inside one ad set (provenance only) — lazy-loaded when an ad-set node
 *  is expanded in the picker. Same edge as the snapshots, scope=adset_ads. */
async function fetchAdsetAds(
  brandId: string,
  accountId: string,
  adsetId: string,
): Promise<AdsetAd[]> {
  const { data, error } = await getClient().functions.invoke('paid-media-metrics', {
    body: { platform: 'meta', scope: 'adset_ads', brandId, accountId, adsetId },
  });
  if (error) throw new Error('paid-media-metrics adset_ads unreachable');
  const parsed = AdsetAdsResponseSchema.safeParse(data);
  return parsed.success ? parsed.data.ads : [];
}

/** Per-ad DAILY trends for one ad set — the finest paid grain (spend/CPA/ROAS/CTR
 *  per day per creative). Powers the creative HoverCard sparkline + charting an
 *  individual creative onto the ad-set timeline. Same edge as the snapshots,
 *  scope=ad_daily_trends. Lazy: reads only when an ad set is in focus. */
async function fetchAdDailyTrends(
  brandId: string,
  accountId: string,
  adsetId: string,
): Promise<AdDailyTrend[]> {
  const { data, error } = await getClient().functions.invoke('paid-media-metrics', {
    body: { platform: 'meta', scope: 'ad_daily_trends', brandId, accountId, adsetId },
  });
  if (error) throw new Error('paid-media-metrics ad_daily_trends unreachable');
  const parsed = AdDailyTrendsResponseSchema.safeParse(data);
  return parsed.success ? parsed.data.ads : [];
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

async function runCycle(
  portfolioId: string,
  brandId?: string,
  accountId?: string | null,
): Promise<RunCycleResponse | null> {
  // brandId + accountId scope the run to a brand/account the caller can access —
  // the optimizer-run edge verifies them (mirrors optimizer-suggest). Omitted keys
  // keep the request backward-compatible with the portfolio_id-only shape.
  const { data, error } = await getClient().functions.invoke('optimizer-run', {
    body: {
      portfolio_id: portfolioId,
      ...(brandId ? { brandId } : {}),
      ...(accountId ? { accountId } : {}),
    },
  });
  if (error) throw new Error('Failed to run cycle');
  const parsed = RunCycleResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Convert a CBO ("Advantage Campaign Budget") campaign to ad-set (ABO) budgets via
 *  the optimizer-convert-cbo edge. `dryRun` (default true) returns the per-ad-set
 *  budgets that WOULD be set with ZERO writes to Meta — the FE previews them before
 *  the real convert is un-gated. Returns null when the response is malformed. */
async function convertCbo(request: ConvertCboRequest): Promise<ConvertCboResponse | null> {
  const { data, error } = await getClient().functions.invoke('optimizer-convert-cbo', {
    body: {
      brandId: request.brandId,
      accountId: request.accountId,
      campaignId: request.campaignId,
      dryRun: request.dryRun ?? true,
    },
  });
  if (error) throw new Error('optimizer-convert-cbo unreachable');
  const parsed = ConvertCboResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Apply (or preview) a scored run's proposed ad-set budgets on Meta via the
 *  optimizer-apply-run edge. `dryRun` (default true) returns the would-write set with ZERO
 *  writes — the FE previews them; the real apply (`dryRun:false`) stays gated in the UI
 *  until the sandbox-apply bench passes. Returns null when the response is malformed. */
async function applyRunBudgets(request: ApplyRunRequest): Promise<ApplyRunResponse | null> {
  const { data, error } = await getClient().functions.invoke('optimizer-apply-run', {
    body: {
      portfolio_id: request.portfolio_id,
      ...(request.brandId ? { brandId: request.brandId } : {}),
      ...(request.accountId ? { accountId: request.accountId } : {}),
      ...(request.run_id ? { run_id: request.run_id } : {}),
      dryRun: request.dryRun ?? true,
    },
  });
  if (error) throw new Error('optimizer-apply-run unreachable');
  const parsed = ApplyRunResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

async function setRecommendationStatus(request: SetRecommendationStatusRequest): Promise<void> {
  // The RPC parameter is p_rec_id — p_recommendation_id does not exist and PostgREST
  // rejects the call with PGRST202 (function not found in the schema cache).
  const { error } = await getClient().rpc('optimizer_set_recommendation_status', {
    p_rec_id: request.recommendation_id,
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

async function updatePortfolio(input: {
  portfolio_id: string;
  patch: UpdatePortfolioPatch;
}): Promise<void> {
  const { error } = await getClient().rpc('optimizer_update_portfolio', {
    p_portfolio_id: input.portfolio_id,
    p_patch: input.patch,
  });
  if (error) {
    const code = pgErrorCode(error);
    // 23505 = unique_violation on (brand, account, name) among non-archived rows.
    const message =
      code === '23505'
        ? 'A portfolio with that name already exists for this ad account.'
        : 'Could not update the portfolio. The optimizer backend may not be reachable yet.';
    throw new OptimizerRpcError(message, code);
  }
}

async function unenrollAdset(input: { portfolio_id: string; adset_id: string }): Promise<void> {
  const { error } = await getClient().rpc('optimizer_unenroll_adset', {
    p_portfolio_id: input.portfolio_id,
    p_adset_id: input.adset_id,
  });
  if (error) throw new Error('Failed to remove ad set from the portfolio');
}

/** The autopilot kill-switch — instantly halt (or resume) this portfolio's autonomous
 *  budget writes without losing its apply_mode. Audited server-side (portfolio_audits). */
async function setAutopilotPaused(input: {
  portfolio_id: string;
  paused: boolean;
  reason?: string;
}): Promise<void> {
  const { error } = await getClient().rpc('optimizer_set_autopilot_paused', {
    p_portfolio_id: input.portfolio_id,
    p_paused: input.paused,
    p_reason: input.reason ?? null,
  });
  if (error) throw new Error('Could not update the autopilot kill-switch.');
}

/** Approve one proposed budget change (per-item apply). Records the approval intent +
 *  the approver server-side; the optimizer service then executes it through the same
 *  ledger-guarded, audited write path. */
async function requestApplyItem(input: { run_id: string; adset_id: string }): Promise<void> {
  const { error } = await getClient().rpc('optimizer_request_apply_item', {
    p_run_id: input.run_id,
    p_adset_id: input.adset_id,
  });
  if (error) throw new Error('Could not approve this budget change.');
}

async function archivePortfolio(portfolioId: string): Promise<void> {
  const { error } = await getClient().rpc('optimizer_archive_portfolio', {
    p_portfolio_id: portfolioId,
  });
  if (error) throw new Error('Failed to archive the portfolio');
}

/** Restore = flip status back to active. Surfaces the name-collision case (an
 *  active portfolio already owns this name) as a clean, actionable message. */
async function restorePortfolio(input: { portfolio_id: string; name: string }): Promise<void> {
  try {
    await updatePortfolio({ portfolio_id: input.portfolio_id, patch: { status: 'active' } });
  } catch (err) {
    if (err instanceof OptimizerRpcError && err.code === '23505') {
      throw new OptimizerRpcError(
        `A portfolio named "${input.name}" already exists — rename it before restoring.`,
        '23505',
      );
    }
    throw err;
  }
}

// ── Read hooks (cache-first, 30-minute TTL) ──────────────────────────────────

const EMPTY_PORTFOLIOS: PortfolioListItem[] = [];
const EMPTY_ACCOUNTS: AdAccount[] = [];
const EMPTY_CPA: CpaSeriesPoint[] = [];
const EMPTY_ANGLES: AngleMatrixCell[] = [];
const EMPTY_RENEWALS: RenewalTask[] = [];
const EMPTY_LOGS: OptimizerLogRow[] = [];
const EMPTY_SNAPSHOTS: AdSetSnapshot[] = [];
const EMPTY_ENROLLED: PortfolioAdset[] = [];
const EMPTY_ADS: AdsetAd[] = [];
const EMPTY_AD_TRENDS: AdDailyTrend[] = [];

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

export function useOptimizerSuggestions(
  brandId: string,
  adAccountId: string | null,
  level: PortfolioLevel = 'adset',
) {
  return useCachedRead<SuggestResult | null>(
    brandId && adAccountId ? cacheKeys.suggestions(brandId, adAccountId, level) : null,
    () => fetchSuggestions(brandId, adAccountId as string, level),
    null,
  );
}

/** The account's snapshots (engine input) — powers the client-side "what-if"
 *  preview. `level` selects ad sets (default) or campaigns; campaign mode reads
 *  the campaign_snapshots scope. Cached like every other read (30-min TTL). */
export function useOptimizerAccountSnapshots(
  brandId: string,
  adAccountId: string | null,
  level: PortfolioLevel = 'adset',
) {
  const scope = level === 'campaign' ? 'campaign_snapshots' : 'adset_snapshots';
  return useCachedRead<AdSetSnapshot[]>(
    brandId && adAccountId ? cacheKeys.accountSnapshots(brandId, adAccountId, level) : null,
    () => fetchAccountSnapshots(brandId, adAccountId as string, scope),
    EMPTY_SNAPSHOTS,
  );
}

/** The ad sets enrolled in a portfolio — powers the manage panel's pre-selection
 *  and add/remove diff. */
export function useOptimizerEnrolledAdsets(portfolioId: string | null) {
  return useCachedRead<PortfolioAdset[]>(
    portfolioId ? cacheKeys.enrolledAdsets(portfolioId) : null,
    () => fetchEnrolledAdsets(portfolioId as string),
    EMPTY_ENROLLED,
  );
}

/** Archived portfolios for the "Archived" view. */
export function useOptimizerArchivedPortfolios(brandId: string, adAccountId: string | null) {
  return useCachedRead<PortfolioListItem[]>(
    brandId ? cacheKeys.archivedPortfolios(brandId, adAccountId) : null,
    () => fetchArchivedPortfolios(brandId, adAccountId),
    EMPTY_PORTFOLIOS,
  );
}

/** The ads inside one ad set — lazy: pass adsetId=null to keep the read disabled
 *  until the ad-set node is expanded. */
export function useOptimizerAdsetAds(
  brandId: string,
  accountId: string | null,
  adsetId: string | null,
) {
  return useCachedRead<AdsetAd[]>(
    brandId && accountId && adsetId ? cacheKeys.adsetAds(adsetId) : null,
    () => fetchAdsetAds(brandId, accountId as string, adsetId as string),
    EMPTY_ADS,
  );
}

/** Per-ad daily trends for one ad set — lazy: pass adsetId=null to keep the read
 *  disabled until an ad set is in focus. Returns [] when the scope isn't deployed
 *  yet (graceful — the creative HoverCard then shows aggregate only). */
export function useOptimizerAdDailyTrends(
  brandId: string,
  accountId: string | null,
  adsetId: string | null,
) {
  return useCachedRead<AdDailyTrend[]>(
    brandId && accountId && adsetId ? cacheKeys.adDailyTrends(adsetId) : null,
    () => fetchAdDailyTrends(brandId, accountId as string, adsetId as string),
    EMPTY_AD_TRENDS,
  );
}

/** Generate/fetch a plain-language insight for one recommendation via the
 *  optimizer-insight edge fn (durable read-through cache → Gemini on miss).
 *  Throws only on a transport failure — the edge never 500s on a Gemini problem
 *  (it returns the deterministic reason), so the tooltip always resolves. */
async function fetchOptimizerInsight(
  request: OptimizerInsightRequest,
): Promise<OptimizerInsightResponse | null> {
  const { data, error } = await getClient().functions.invoke('optimizer-insight', {
    body: request,
  });
  if (error) throw new Error('optimizer-insight unreachable');
  const parsed = OptimizerInsightResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** One recommendation's insight — lazy: pass enabled=false to keep the read
 *  disabled until the tooltip opens; the result is then cached (30-min TTL) so a
 *  re-hover is instant and never re-generates. Serves enrolled recs (DB id) and
 *  what-if recs (content hash) uniformly via recommendationInsightKey. */
export function useOptimizerInsight(
  input: {
    brandId: string;
    id?: string | null;
    adsetId: string;
    kind: string;
    trigger: string;
    severity?: string | null;
    reason: string;
  },
  enabled: boolean,
) {
  const insightKey = recommendationInsightKey(input);
  return useCachedRead<OptimizerInsightResponse | null>(
    enabled && input.brandId && input.reason ? cacheKeys.insight(insightKey) : null,
    () =>
      fetchOptimizerInsight({
        brandId: input.brandId,
        insightKey,
        adsetId: input.adsetId,
        reason: input.reason,
        kind: input.kind,
        trigger: input.trigger,
        severity: input.severity ?? null,
      }),
    null,
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
          key.startsWith('portfolios:') ||
          key === cacheKeys.performance(request.portfolio_id) ||
          key === cacheKeys.enrolledAdsets(request.portfolio_id),
      ),
  });

  const update = useMutation({
    mutationFn: updatePortfolio,
    onSuccess: (_data, input) =>
      markStale(
        (key) =>
          key.startsWith('portfolios:') ||
          key.startsWith('archived:') ||
          key === cacheKeys.performance(input.portfolio_id),
      ),
  });

  const unenroll = useMutation({
    mutationFn: unenrollAdset,
    onSuccess: (_data, input) =>
      markStale(
        (key) =>
          key.startsWith('portfolios:') ||
          key === cacheKeys.performance(input.portfolio_id) ||
          key === cacheKeys.enrolledAdsets(input.portfolio_id),
      ),
  });

  const archive = useMutation({
    mutationFn: archivePortfolio,
    onSuccess: () =>
      markStale((key) => key.startsWith('portfolios:') || key.startsWith('archived:')),
  });

  const restore = useMutation({
    mutationFn: restorePortfolio,
    onSuccess: () =>
      markStale((key) => key.startsWith('portfolios:') || key.startsWith('archived:')),
  });

  const run = useMutation({
    mutationFn: (portfolioId: string) => runCycle(portfolioId, brandId, adAccountId),
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

  const setPaused = useMutation({
    mutationFn: setAutopilotPaused,
    onSuccess: (_data, input) =>
      markStale(
        (key) => key.startsWith('portfolios:') || key === cacheKeys.performance(input.portfolio_id),
      ),
  });

  const requestApply = useMutation({
    mutationFn: requestApplyItem,
    onSuccess: () => markStale((key) => key.startsWith('performance:')),
  });

  return {
    create,
    enroll,
    update,
    unenroll,
    archive,
    restore,
    run,
    setStatus,
    renewal,
    setPaused,
    requestApply,
  };
}

/** Preview or apply a CBO→ABO conversion for one campaign. Instantiated PER CBO
 *  campaign row so each keeps its own pending/preview/error state. The FE only ever
 *  calls it with `dryRun:true` today (a working preview); a real conversion
 *  (`dryRun:false`, un-gated after the sandbox bench) makes the campaign's ad sets
 *  ABO — so a real success marks the account snapshots + suggestions stale so the
 *  now-optimizable ad sets reappear. A dry-run preview writes nothing and skips it. */
export function useConvertCbo(brandId: string) {
  const markStale = useOptimizerStore((state) => state.markStale);
  return useMutation({
    mutationFn: convertCbo,
    onSuccess: (data) => {
      if (data?.ok && data.dryRun !== true) {
        markStale(
          (key) =>
            key.startsWith(`snapshots:${brandId}`) || key.startsWith(`suggestions:${brandId}`),
        );
      }
    },
  });
}

/** Preview or apply a portfolio's proposed reallocation. Instantiated per portfolio so
 *  each keeps its own pending/preview/error state. The FE calls it with `dryRun:true` for
 *  the preview; a real apply (`dryRun:false`, un-gated after the sandbox bench) changed
 *  budgets on Meta, so it marks that portfolio's performance report stale. */
export function useApplyRun() {
  const markStale = useOptimizerStore((state) => state.markStale);
  return useMutation({
    mutationFn: applyRunBudgets,
    onSuccess: (data, request) => {
      if (data?.ok && data.dryRun !== true) {
        markStale((key) => key === cacheKeys.performance(request.portfolio_id));
      }
    },
  });
}
