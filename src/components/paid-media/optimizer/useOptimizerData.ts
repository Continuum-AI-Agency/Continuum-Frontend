'use client';

// Data layer for the Paid Media Optimizer surface. Every authenticated RPC and
// Edge read is owned by React Query: the cache has deliberate freshness windows,
// errors remain visible, and mutations invalidate the same query keys. There is
// no second client cache, so account/brand changes cannot show stale optimizer
// data from a previous workspace.

import {
  type AccountEnrollment,
  AccountEnrollmentSchema,
  type AdAccount,
  AdAccountSchema,
  type AdDailyTrend,
  AdDailyTrendsResponseSchema,
  type AdSetSnapshot,
  type AdsetAd,
  AdsetAdsResponseSchema,
  type AdsetCreativeWinRateRow,
  type ApplyAdsetStatusRequest,
  type ApplyAdsetStatusResponse,
  ApplyAdsetStatusResponseSchema,
  type ApplyRevertRequest,
  type ApplyRevertResponse,
  ApplyRevertResponseSchema,
  type ApplyRunRequest,
  type ApplyRunResponse,
  ApplyRunResponseSchema,
  adsetCreativeWinRateRowSchema,
  type ConvertCboRequest,
  type ConvertCboResponse,
  ConvertCboResponseSchema,
  type CpaSeriesPoint,
  CpaSeriesPointSchema,
  type CreatePortfolioRequest,
  type CyclePreviewRequest,
  type CyclePreviewResponse,
  CyclePreviewResponseSchema,
  type CycleRunReport,
  CycleRunReportSchema,
  type CycleSkipReason,
  type EnrollRequest,
  type EnrollResult,
  EnrollResultSchema,
  OptimizerAdsetInventoryEnvelopeSchema,
  type OptimizerAdsetInventoryItem,
  type OptimizerInsightRequest,
  type OptimizerInsightResponse,
  OptimizerInsightResponseSchema,
  type OptimizerLogRow,
  OptimizerLogsResponseSchema,
  type PaidAdAngle,
  PaidAdAngleSchema,
  type PortfolioAdset,
  PortfolioAdsetSchema,
  type PortfolioLevel,
  type PortfolioListItem,
  PortfolioListItemSchema,
  type RecommendationStatus,
  type RenewalTask,
  RenewalTaskSchema,
  type RequestApplyItemsRequest,
  type RunCycleResponse,
  RunCycleResponseSchema,
  type SetRecommendationStatusRequest,
  type SuggestResult,
  SuggestResultSchema,
  type TimelineEvent,
  TimelineEventSchema,
  type UpdatePortfolioPatch,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { bareAccountId } from '@/lib/paid-media/accountId';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { recommendationInsightKey } from './insightKey';
import { pendingActionCount } from './reportModel';
import { type AccountSnapshotsResult, parseOptimizerSnapshotEnvelope } from './snapshotEnvelope';

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

/** The reason an edge function actually gave.
 *
 *  supabase-js rejects any non-2xx with FunctionsHttpError, and its `.message` is the constant
 *  "Edge Function returned a non-2xx status code" — the server's `{ error }` body lives on
 *  `.context`, the undrained Response. Reading `.message` therefore reduces every distinct
 *  failure (a dead Meta token, a portfolio that is not yours, ad sets held by a brand you
 *  cannot edit) to one indistinguishable sentence. Falls back to `.message` when there is no
 *  context to read, so a genuine network error still says something. */
async function readEdgeErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: unknown };
      if (typeof body?.error === 'string' && body.error.trim().length > 0) return body.error;
    } catch {
      // Not JSON, or already consumed — fall through to the generic message.
    }
  }
  const message = (error as { message?: unknown })?.message;
  return typeof message === 'string' ? message : '';
}

// ── Query keys ──────────────────────────────────────────────────────────────

export const optimizerQueryKeys = {
  root: ['optimizer'] as const,
  portfoliosRoot: ['optimizer', 'portfolios'] as const,
  portfolios: (brandId: string, adAccountId: string | null) =>
    ['optimizer', 'portfolios', brandId, adAccountId ?? 'all'] as const,
  adAccounts: (brandId: string) => ['optimizer', 'ad-accounts', brandId] as const,
  performance: (portfolioId: string) => ['optimizer', 'performance', portfolioId] as const,
  cpaSeries: (portfolioId: string) => ['optimizer', 'efficiency-series', portfolioId] as const,
  renewals: (brandId: string) => ['optimizer', 'renewals', brandId] as const,
  logs: (brandId: string) => ['optimizer', 'logs', brandId] as const,
  suggestions: (brandId: string, adAccountId: string | null, level: PortfolioLevel = 'adset') =>
    ['optimizer', 'suggestions', brandId, adAccountId ?? 'all', level] as const,
  accountSnapshots: (
    brandId: string,
    adAccountId: string | null,
    level: PortfolioLevel = 'adset',
  ) => ['optimizer', 'snapshots', brandId, adAccountId ?? 'all', level] as const,
  adsetInventory: (brandId: string, adAccountId: string | null) =>
    ['optimizer', 'adset-inventory', brandId, adAccountId ?? 'all'] as const,
  enrolledAdsets: (portfolioId: string) => ['optimizer', 'enrolled-adsets', portfolioId] as const,
  accountEnrollments: (brandId: string, accountId: string) =>
    ['optimizer', 'account-enrollments', brandId, accountId] as const,
  timelineEvents: (portfolioId: string) => ['optimizer', 'timeline-events', portfolioId] as const,
  adsetWinrates: (brandId: string, window: string, dimension: string) =>
    ['optimizer', 'adset-winrates', brandId, window, dimension] as const,
  archivedPortfolios: (brandId: string, adAccountId: string | null) =>
    ['optimizer', 'archived', brandId, adAccountId ?? 'all'] as const,
  adsetAds: (adsetId: string) => ['optimizer', 'adset-ads', adsetId] as const,
  adDailyTrends: (adsetId: string) => ['optimizer', 'ad-daily-trends', adsetId] as const,
  adAngles: (adsetId: string) => ['optimizer', 'ad-angles', adsetId] as const,
  insight: (insightKey: string) => ['optimizer', 'insight', insightKey] as const,
};

// ── Reads ────────────────────────────────────────────────────────────────────
// These THROW when the backend is unreachable/errors (network failure, an
// unwired edge on a local stack, a hung request) so React Query can record an
// error state and the surface can show an "optimizer offline" signal instead of
// an infinite skeleton. A successful-but-EMPTY read still resolves to the empty
// model (that's a legitimate "no data yet" state, not an outage). Malformed rows
// degrade to empty via `.catch([])` — EXCEPT for portfolios, where an empty list is
// a load-bearing UI decision (onboarding), so drift is parsed per row and a wholly
// undecodable list surfaces as an error rather than a silent "no portfolios".

/** A portfolio list narrowed to the selected ad account, plus the evidence needed to
 *  explain an empty result. `portfolios.length === 0` alone cannot distinguish "this
 *  brand has none" from "they all live on another ad account" — the surface has to
 *  render those two states differently, so the counts travel with the list. */
export type PortfolioScope = {
  /** Portfolios owned by the selected ad account (or all of them when none is selected). */
  portfolios: PortfolioListItem[];
  /** EVERY portfolio the brand owns, before the account filter. The RPC is brand-scoped, so
   *  this list is already in hand — the cross-account browser renders it with no second read.
   *  Cross-BRAND portfolios are not here and never will be: that boundary is server-side. */
  brandPortfolios: PortfolioListItem[];
  /** How many portfolios the brand has in total, before the account filter. */
  brandPortfolioCount: number;
  /** The ad accounts (verbatim, as stored) that own the portfolios the filter excluded. */
  otherAccountIds: string[];
  /** Rows the RPC returned that no longer match the contract and were skipped. */
  droppedRowCount: number;
};

const EMPTY_PORTFOLIO_SCOPE: PortfolioScope = {
  portfolios: [],
  brandPortfolios: [],
  brandPortfolioCount: 0,
  otherAccountIds: [],
  droppedRowCount: 0,
};

/** Meta's ad account id is not canonical — the create RPC stores whatever the caller
 *  sent (`act_123` or `123`) while the account picker normalizes to the bare form.
 *  Compare bare on BOTH sides, or a real portfolio silently disappears from its own
 *  account. A portfolio with no ad account belongs to every account view. */
function ownsPortfolio(rowAccountId: string | null, selectedAccountId: string): boolean {
  if (!rowAccountId) return true;
  return bareAccountId(rowAccountId) === bareAccountId(selectedAccountId);
}

/** Parse portfolio rows ONE AT A TIME. An array-level `.catch([])` collapses the whole
 *  list when a single row drifts, which the surface then renders as "no portfolios" —
 *  real portfolios vanishing with no signal. Per-row parsing keeps the good rows; a
 *  read where EVERY row drifted is schema drift, not an empty account, so it throws
 *  and the offline/retry path renders instead of a lie. */
function parsePortfolioRows(
  rpcName: string,
  data: unknown,
): { rows: PortfolioListItem[]; dropped: number } {
  const raw = Array.isArray(data) ? data : [];
  const rows: PortfolioListItem[] = [];
  let dropped = 0;

  for (const row of raw) {
    const parsed = PortfolioListItemSchema.safeParse(row);
    if (parsed.success) {
      rows.push(parsed.data);
      continue;
    }
    dropped += 1;
    console.error(`${rpcName} returned a row that does not match PortfolioListItemSchema`, {
      issues: parsed.error.issues,
    });
  }

  if (raw.length > 0 && rows.length === 0) {
    throw new Error(`${rpcName} returned ${raw.length} row(s) that no longer match the contract`);
  }
  return { rows, dropped };
}

function scopeToAccount(
  rows: PortfolioListItem[],
  adAccountId: string | null,
  dropped: number,
): PortfolioScope {
  if (!adAccountId) {
    return {
      portfolios: rows,
      brandPortfolios: rows,
      brandPortfolioCount: rows.length,
      otherAccountIds: [],
      droppedRowCount: dropped,
    };
  }
  const portfolios = rows.filter((row) => ownsPortfolio(row.ad_account_id, adAccountId));
  const otherAccountIds = Array.from(
    new Set(
      rows
        .filter((row) => !ownsPortfolio(row.ad_account_id, adAccountId))
        .map((row) => row.ad_account_id)
        .filter((accountId): accountId is string => Boolean(accountId)),
    ),
  );
  return {
    portfolios,
    brandPortfolios: rows,
    brandPortfolioCount: rows.length,
    otherAccountIds,
    droppedRowCount: dropped,
  };
}

async function fetchPortfolios(
  brandId: string,
  adAccountId: string | null,
): Promise<PortfolioScope> {
  const { data, error } = await getClient().rpc('optimizer_list_portfolios', {
    p_brand_id: brandId,
  });
  if (error) throw new Error('optimizer_list_portfolios unreachable');
  const { rows, dropped } = parsePortfolioRows('optimizer_list_portfolios', data ?? []);
  return scopeToAccount(rows, adAccountId, dropped);
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
  // Returning null on a shape mismatch used to be silent, and the Performance tab reads a
  // null report as "no cycle has run yet" — so schema drift presented as "Scoring your
  // first cycle…" forever on a portfolio with five months of runs. Throw: React Query
  // owns the error and the surface renders a retry.
  if (!parsed.success) {
    console.error('optimizer-status: unexpected report shape', parsed.error.issues);
    throw new Error('optimizer-status returned an unexpected report shape');
  }
  return parsed.data;
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
  // Same reason as fetchPerformance: an empty array is indistinguishable from "this brand
  // has never run a cycle", so a malformed response has to be an error, not a blank feed.
  if (!parsed.success) {
    console.error('optimizer-status logs: unexpected shape', parsed.error.issues);
    throw new Error('optimizer-status returned an unexpected logs shape');
  }
  return parsed.data.logs;
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
/** The snapshot fleet plus observational metadata: `fetchedAt` is the ISO instant Meta was
 * read, and `budgetSummary` is the account/per-campaign ABO daily total. The summary stays
 * beside the snapshots and is never passed into the preview engine.
 *
 *  (baked into the reporting_cache payload, so a cache HIT still reports the ORIGINAL
 *  read time). Older cache rows written before either metadata field resolve to null. */
async function fetchAccountSnapshots(
  brandId: string,
  accountId: string,
  scope: 'adset_snapshots' | 'campaign_snapshots' = 'adset_snapshots',
  forceRefresh = false,
): Promise<AccountSnapshotsResult> {
  const { data, error } = await getClient().functions.invoke('paid-media-metrics', {
    body: { platform: 'meta', scope, brandId, accountId, forceRefresh },
  });
  if (error) throw new Error(`paid-media-metrics ${scope} unreachable`);
  return parseOptimizerSnapshotEnvelope(data ?? {});
}

async function fetchAdsetInventory(brandId: string, accountId: string, forceRefresh = false) {
  const { data, error } = await getClient().functions.invoke('paid-media-metrics', {
    body: { platform: 'meta', scope: 'adset_inventory', brandId, accountId, forceRefresh },
  });
  if (error) throw new Error('paid-media-metrics adset_inventory unreachable');
  return OptimizerAdsetInventoryEnvelopeSchema.parse(data ?? {});
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
): Promise<PortfolioScope> {
  const { data, error } = await getClient().rpc('optimizer_list_archived_portfolios', {
    p_brand_id: brandId,
  });
  if (error) throw new Error('optimizer_list_archived_portfolios unreachable');
  const { rows, dropped } = parsePortfolioRows('optimizer_list_archived_portfolios', data ?? []);
  return scopeToAccount(rows, adAccountId, dropped);
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
    // not assigned to this brand. Surface a clean inline message, not a stack.
    const message =
      code === '42501'
        ? "This ad account isn't assigned to this brand. Assign it in Settings → Integrations."
        : 'Could not create the portfolio. The optimizer backend may not be reachable yet.';
    throw new OptimizerRpcError(message, code);
  }
  const parsed = z.string().uuid().safeParse(data);
  if (!parsed.success) throw new OptimizerRpcError('Malformed create-portfolio response.', null);
  return { portfolio_id: parsed.data };
}

async function enrollAdsets(request: EnrollRequest): Promise<EnrollResult> {
  const { data, error } = await getClient().functions.invoke('optimizer-enroll', {
    body: request,
  });
  if (error) {
    // supabase-js rejects a non-2xx edge response with FunctionsHttpError, whose `.message` is
    // ALWAYS the fixed string "Edge Function returned a non-2xx status code". The server's real
    // reason — which ad sets are held, and that you lack edit access where they live — is only
    // in the response body, reachable via error.context. Reading `.message` here is what made
    // every enrollment failure read as one generic sentence no matter what actually happened.
    const detail = await readEdgeErrorMessage(error);
    throw new OptimizerRpcError(
      detail.trim().length > 0 ? detail : 'Could not enroll these ad sets.',
      pgErrorCode(error),
    );
  }
  const parsed = EnrollResultSchema.safeParse(data);
  return parsed.success ? parsed.data : { enrolled: 0, moved: [], first_cycle: 'queued' };
}

/** Which portfolio already claims each ad set on this account. An ad set may hold exactly
 *  ONE active enrollment, so the picker needs this to warn before save and the confirm step
 *  needs it to name what will move. */
async function fetchAccountEnrollments(
  brandId: string,
  accountId: string,
): Promise<AccountEnrollment[]> {
  const { data, error } = await getClient().rpc('optimizer_list_account_enrollments', {
    p_brand_id: brandId,
    p_ad_account_id: accountId,
  });
  if (error) throw new Error('optimizer_list_account_enrollments unreachable');
  return z
    .array(AccountEnrollmentSchema)
    .catch([])
    .parse(data ?? []);
}

/** Within-ad-set creative win rates for ONE label dimension. The cohort is a single ad set,
 *  so audience/budget/placement are held roughly constant — the closest thing to a
 *  controlled creative test the account gives away. Deployed and contract-typed since the
 *  paid-creative-intel foundation; this is its first frontend caller. */
async function fetchAdsetCreativeWinrates(
  brandId: string,
  window: string,
  dimension: string,
): Promise<AdsetCreativeWinRateRow[]> {
  const { data, error } = await getClient().rpc('paid_media_get_adset_creative_winrates', {
    p_brand_id: brandId,
    p_window: window,
    p_dimension: dimension,
  });
  if (error) throw new Error('paid_media_get_adset_creative_winrates unreachable');
  // Row-wise parse: a contract lag drops the offending row rather than blanking the panel.
  const rows = Array.isArray(data) ? data : [];
  const out: AdsetCreativeWinRateRow[] = [];
  for (const raw of rows) {
    const parsed = adsetCreativeWinRateRowSchema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Observed events (cycles, applied budgets, pauses, config changes) plotted as flags on
 *  the cost timeline. */
async function fetchTimelineEvents(portfolioId: string): Promise<TimelineEvent[]> {
  const { data, error } = await getClient().rpc('optimizer_get_timeline_events', {
    p_portfolio_id: portfolioId,
    p_limit: 200,
  });
  if (error) throw new Error('optimizer_get_timeline_events unreachable');
  return z
    .array(TimelineEventSchema)
    .catch([])
    .parse(data ?? []);
}

/** Why a "Run now" click could not reach a working service. */
export type RunUnavailableKind =
  | 'not_configured' // 501 — OPTIMIZER_SERVICE_URL is unset on the edge
  | 'timeout' // 504 — the edge gave up waiting on the service
  | 'forbidden' // 403 — the ad account is not connected to this brand
  | 'malformed' // 200, but the body did not match the contract → drift
  | 'unknown';

/** The three honest outcomes of a "Run now" click.
 *
 *  `skipped` is the one that matters: the cycle RAN and correctly did nothing, which is
 *  actionable ("nothing is enrolled") and NOT an outage. runCycle used to return
 *  `RunCycleResponse | null`, and that `null` was the poison — at the call site it was
 *  indistinguishable from an unreachable service, so all three outcomes collapsed into one
 *  message: "Optimizer service not live yet". It was true in none of them. */
export type RunCycleOutcome =
  | { status: 'ran'; run: RunCycleResponse }
  | { status: 'skipped'; reason: CycleSkipReason; run: RunCycleResponse }
  | { status: 'unavailable'; kind: RunUnavailableKind };

/** Map an edge-invoke failure to a reason we can actually explain to the user. */
function unavailableFromError(error: unknown): RunCycleOutcome {
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  const kind: RunUnavailableKind =
    status === 501
      ? 'not_configured'
      : status === 504
        ? 'timeout'
        : status === 403
          ? 'forbidden'
          : 'unknown';
  return { status: 'unavailable', kind };
}

/** Trigger a cycle now. NEVER throws: every failure is a described outcome, because the
 *  caller has to render the difference between "we did nothing, and here is why" and "we
 *  could not reach the service". */
async function runCycle(
  portfolioId: string,
  brandId?: string,
  accountId?: string | null,
): Promise<RunCycleOutcome> {
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
  if (error) return unavailableFromError(error);

  const parsed = RunCycleResponseSchema.safeParse(data);
  if (!parsed.success) {
    // A malformed body is contract drift between this app and the optimizer service. Say so
    // LOUDLY: swallowing it into a silent null is what hid this exact bug for weeks.
    console.error('optimizer-run returned a body that does not match RunCycleResponseSchema', {
      issues: parsed.error.issues,
    });
    return { status: 'unavailable', kind: 'malformed' };
  }

  const run = parsed.data;
  if (run.skipped) return { status: 'skipped', reason: run.skipped, run };
  if (run.runId === null) {
    // The service's invariant is runId === null ⟺ skipped. A null runId with no reason is a
    // shape we do not understand, and guessing "it worked" would be a lie.
    console.error('optimizer-run returned runId:null with no skip reason', { run });
    return { status: 'unavailable', kind: 'malformed' };
  }
  return { status: 'ran', run };
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

/** The FE input to a cycle preview — the service-shaped engine inputs plus the brand +
 *  account the edge scopes the request to. */
export type CyclePreviewInput = CyclePreviewRequest & { brandId: string; accountId: string };

/** The three honest outcomes of an as-if-converted preview. `unavailable` is the one that
 *  matters: the optimizer-cycle-preview edge (or the service behind it) is not deployed yet
 *  (404/501), which the dialog renders as a quiet "not available yet" line rather than an
 *  error wall — the feature ships ahead of the service and must degrade gracefully. */
export type CyclePreviewOutcome =
  | { status: 'ready'; preview: CyclePreviewResponse }
  | { status: 'unavailable' }
  | { status: 'error' };

/** Run the read-only "as-if-converted" full preview via the optimizer-cycle-preview edge.
 *  NEVER throws: a not-yet-deployed edge (404/501) is a described `unavailable` outcome, not
 *  an exception, because the dialog renders that difference. Reads only — zero writes. */
async function fetchCyclePreview(input: CyclePreviewInput): Promise<CyclePreviewOutcome> {
  const { data, error } = await getClient().functions.invoke('optimizer-cycle-preview', {
    body: {
      brandId: input.brandId,
      accountId: input.accountId,
      snapshots: input.snapshots,
      objective: input.objective,
      mode: input.mode,
      total: input.total,
    },
  });
  if (error) {
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    if (status === 404 || status === 501) return { status: 'unavailable' };
    return { status: 'error' };
  }
  const parsed = CyclePreviewResponseSchema.safeParse(data);
  if (!parsed.success) return { status: 'error' };
  return { status: 'ready', preview: parsed.data };
}

/** Apply (or preview) a scored run's proposed ad-set budgets on Meta via the
 *  optimizer-apply-run edge. `dryRun:true` (default) returns the would-write set with
 *  ZERO writes; `dryRun:false` performs the real Meta write (recommend-mode human apply).
 *  Observe portfolios hard-refuse on the service (`reason: observe_mode`). */
async function applyRunBudgets(request: ApplyRunRequest): Promise<ApplyRunResponse | null> {
  const { data, error } = await getClient().functions.invoke('optimizer-apply-run', {
    body: {
      portfolio_id: request.portfolio_id,
      ...(request.brandId ? { brandId: request.brandId } : {}),
      ...(request.accountId ? { accountId: request.accountId } : {}),
      ...(request.run_id ? { run_id: request.run_id } : {}),
      dryRun: request.dryRun ?? true,
      ...(request.authorized_by ? { authorized_by: request.authorized_by } : {}),
    },
  });
  if (error) throw new Error('optimizer-apply-run unreachable');
  const parsed = ApplyRunResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Revert one prior ad-set budget write to its pre-write value via the
 *  optimizer-apply-revert edge. `dryRun:true` (default) returns the single would-write with
 *  ZERO writes; `dryRun:false` performs the real Meta write back to the recorded prior.
 *  Observe portfolios hard-refuse on the service (`reason: observe_mode`). */
async function revertApplyBudget(request: ApplyRevertRequest): Promise<ApplyRevertResponse | null> {
  const { data, error } = await getClient().functions.invoke('optimizer-apply-revert', {
    body: {
      audit_id: request.audit_id,
      portfolio_id: request.portfolio_id,
      ...(request.brandId ? { brandId: request.brandId } : {}),
      ...(request.accountId ? { accountId: request.accountId } : {}),
      dryRun: request.dryRun ?? true,
    },
  });
  if (error) throw new Error('optimizer-apply-revert unreachable');
  const parsed = ApplyRevertResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Execute cycle items marked approved_pending (held → human approved) via
 *  optimizer-apply-approved → service /apply/approved. Same response envelope as apply-run. */
async function applyApprovedBudgets(request: ApplyRunRequest): Promise<ApplyRunResponse | null> {
  const { data, error } = await getClient().functions.invoke('optimizer-apply-approved', {
    body: {
      portfolio_id: request.portfolio_id,
      ...(request.brandId ? { brandId: request.brandId } : {}),
      ...(request.accountId ? { accountId: request.accountId } : {}),
      dryRun: request.dryRun ?? true,
    },
  });
  if (error) throw new Error('optimizer-apply-approved unreachable');
  const parsed = ApplyRunResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** The single-rec status flip. Only the rec id, the target status, and (for creative kinds)
 *  the fulfilment route reach the RPC — portfolio_id / expected_status on the full request
 *  schema are for the MCP surface, not this write. `route` chooses task vs generation for an
 *  approved creative recommendation; omit it to let the backend follow the portfolio's autogen
 *  config. */
type SetRecommendationStatusInput = Pick<
  SetRecommendationStatusRequest,
  'recommendation_id' | 'status' | 'route'
>;

async function setRecommendationStatus(request: SetRecommendationStatusInput): Promise<void> {
  // The RPC parameter is p_rec_id — p_recommendation_id does not exist and PostgREST
  // rejects the call with PGRST202 (function not found in the schema cache).
  const { error } = await getClient().rpc('optimizer_set_recommendation_status', {
    p_rec_id: request.recommendation_id,
    p_status: request.status,
    ...(request.route ? { p_route: request.route } : {}),
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

/** Persist plain-text ad-set names onto the enrolled roster, filling blanks only
 *  (the RPC never clobbers a real name). Used by the workspace self-heal: rows
 *  enrolled before names were forwarded render raw Meta ids until this fills them
 *  from the account-snapshot read the workspace already loads. Returns rows filled. */
async function backfillAdsetNames(input: {
  portfolio_id: string;
  names: Record<string, string>;
}): Promise<number> {
  const { data, error } = await getClient().rpc('optimizer_backfill_adset_names', {
    p_portfolio_id: input.portfolio_id,
    p_names: input.names,
  });
  if (error) throw new Error('Failed to backfill ad-set names');
  return Number(data ?? 0);
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

/** Approve MANY proposed budget changes in ONE round-trip (the Action Log's multi-select
 *  "Approve selected"). Flips every named cycle item to approved_pending; the drain
 *  (optimizer-apply-approved) then writes them as a single batch. Returns how many rows
 *  the RPC actually flipped. */
async function requestApplyItemsBatch(
  input: RequestApplyItemsRequest,
): Promise<{ approved: number }> {
  const { data, error } = await getClient().rpc('optimizer_request_apply_items', {
    p_run_id: input.run_id,
    p_adset_ids: input.adset_ids,
  });
  if (error) throw new Error('Could not approve these budget changes.');
  const parsed = z.number().int().nonnegative().safeParse(data);
  return { approved: parsed.success ? parsed.data : 0 };
}

/** Set the status of MANY recommendations at once (the Action Log's multi-select approve
 *  of pause / fatigue recs). Approving a pause rec is what a later "Pause N ad sets" drain
 *  reads back via optimizer_get_approved_pause_recs. Returns the number of rows updated. */
async function setRecommendationStatuses(input: {
  rec_ids: string[];
  status: RecommendationStatus;
}): Promise<{ updated: number }> {
  const { data, error } = await getClient().rpc('optimizer_set_recommendation_statuses', {
    p_rec_ids: input.rec_ids,
    p_status: input.status,
  });
  if (error) throw new Error('Could not update these recommendations.');
  const parsed = z.number().int().nonnegative().safeParse(data);
  return { updated: parsed.success ? parsed.data : 0 };
}

/** Drain APPROVED ad-set pause recommendations into real Meta pauses via
 *  optimizer-apply-adset-status → service /apply/adset-status. `dryRun:true` (default)
 *  returns the would-pause set with ZERO writes; `dryRun:false` performs the real,
 *  ledger-guarded, audited pause. Pause is HUMAN-ONLY in every tier and observe portfolios
 *  hard-refuse on the service (`reason: observe_mode`). Returns null on a malformed body. */
async function applyAdsetStatusDrain(
  request: ApplyAdsetStatusRequest,
): Promise<ApplyAdsetStatusResponse | null> {
  const { data, error } = await getClient().functions.invoke('optimizer-apply-adset-status', {
    body: {
      portfolio_id: request.portfolio_id,
      ...(request.brandId ? { brandId: request.brandId } : {}),
      ...(request.accountId ? { accountId: request.accountId } : {}),
      dryRun: request.dryRun ?? true,
      ...(request.authorized_by ? { authorized_by: request.authorized_by } : {}),
    },
  });
  if (error) throw new Error('optimizer-apply-adset-status unreachable');
  const parsed = ApplyAdsetStatusResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
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

// ── Read hooks (React Query) ─────────────────────────────────────────────────

const EMPTY_ACCOUNTS: AdAccount[] = [];
const EMPTY_CPA: CpaSeriesPoint[] = [];
const EMPTY_RENEWALS: RenewalTask[] = [];
const EMPTY_LOGS: OptimizerLogRow[] = [];
const EMPTY_SNAPSHOTS: AdSetSnapshot[] = [];
const EMPTY_ENROLLED: PortfolioAdset[] = [];
const EMPTY_ACCOUNT_ENROLLMENTS: AccountEnrollment[] = [];
const EMPTY_TIMELINE_EVENTS: TimelineEvent[] = [];
const EMPTY_WINRATES: AdsetCreativeWinRateRow[] = [];
const EMPTY_ADS: AdsetAd[] = [];
const EMPTY_AD_TRENDS: AdDailyTrend[] = [];
const EMPTY_AD_ANGLES: PaidAdAngle[] = [];

const FIVE_MINUTES = 5 * 60 * 1_000;
const TEN_MINUTES = 10 * 60 * 1_000;
const THIRTY_MINUTES = 30 * 60 * 1_000;
const READ_TIMEOUT_MS = 8_000;
// Meta throttles on repeated snapshot reads, so a manual refresh is gated behind a
// client-side cooldown. In-memory only (per hook instance) — a page reload clears it.
const SNAPSHOTS_REFRESH_COOLDOWN_MS = 120_000;

/** Supabase can hold a socket open without resolving when a locally-unwired Edge
 * function is selected. Bound the read so a panel reaches its retry state instead
 * of presenting an infinite skeleton. */
function withReadTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => reject(new Error('optimizer_read_timeout')),
      READ_TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type OptimizerReadOptions<T> = {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
  empty: T;
  enabled: boolean;
  staleTime: number;
  gcTime?: number;
  refetchInterval?: number | false;
};

/** A small query adapter keeps the existing surface ergonomics (`data` is always
 * a renderable model) while React Query owns request lifecycle, retries and cache. */
function useOptimizerRead<T>({
  queryKey,
  queryFn,
  empty,
  enabled,
  staleTime,
  gcTime = THIRTY_MINUTES,
  refetchInterval = false,
}: OptimizerReadOptions<T>) {
  const query = useQuery({
    queryKey,
    queryFn: () => withReadTimeout(queryFn()),
    enabled,
    staleTime,
    gcTime,
    refetchInterval,
    retry: 1,
  });

  return { ...query, data: query.data ?? empty };
}

/** The selected account's portfolios. `data` stays the PortfolioListItem[] every
 *  consumer already renders; the scope counts ride alongside so the surface can tell
 *  "this brand has no portfolios" (onboarding) apart from "they are all on another ad
 *  account" (a notice naming that account). */
export function useOptimizerPortfolios(brandId: string, adAccountId: string | null) {
  const query = useOptimizerRead({
    queryKey: optimizerQueryKeys.portfolios(brandId, adAccountId),
    queryFn: () => fetchPortfolios(brandId, adAccountId),
    empty: EMPTY_PORTFOLIO_SCOPE,
    enabled: Boolean(brandId),
    staleTime: FIVE_MINUTES,
  });

  return {
    ...query,
    data: query.data.portfolios,
    brandPortfolios: query.data.brandPortfolios,
    brandPortfolioCount: query.data.brandPortfolioCount,
    otherAccountIds: query.data.otherAccountIds,
    droppedRowCount: query.data.droppedRowCount,
  };
}

export function useOptimizerAdAccounts(brandId: string) {
  return useOptimizerRead({
    queryKey: optimizerQueryKeys.adAccounts(brandId),
    queryFn: () => fetchAdAccounts(brandId),
    empty: EMPTY_ACCOUNTS,
    enabled: Boolean(brandId),
    staleTime: FIVE_MINUTES,
  });
}

/** Resolve the display currency for a specific ad account (falls back to USD in
 *  the formatter when the account row has no currency yet). */
export function useAdAccountCurrency(brandId: string, adAccountId: string | null): string | null {
  const { data } = useOptimizerAdAccounts(brandId);
  if (!adAccountId) return null;
  return data.find((account) => account.account_id === adAccountId)?.currency ?? null;
}

export function useOptimizerPerformance(portfolioId: string | null) {
  return useOptimizerRead({
    queryKey: optimizerQueryKeys.performance(portfolioId ?? 'none'),
    queryFn: () => fetchPerformance(portfolioId as string),
    empty: null,
    enabled: Boolean(portfolioId),
    staleTime: FIVE_MINUTES,
  });
}

export function useOptimizerCpaSeries(portfolioId: string | null) {
  return useOptimizerRead({
    queryKey: optimizerQueryKeys.cpaSeries(portfolioId ?? 'none'),
    queryFn: () => fetchCpaSeries(portfolioId as string),
    empty: EMPTY_CPA,
    enabled: Boolean(portfolioId),
    staleTime: FIVE_MINUTES,
  });
}

export function useOptimizerRenewals(brandId: string) {
  return useOptimizerRead({
    queryKey: optimizerQueryKeys.renewals(brandId),
    queryFn: () => fetchRenewals(brandId),
    empty: EMPTY_RENEWALS,
    enabled: Boolean(brandId),
    staleTime: FIVE_MINUTES,
  });
}

export function useOptimizerLogs(brandId: string) {
  return useOptimizerRead({
    queryKey: optimizerQueryKeys.logs(brandId),
    queryFn: () => fetchLogs(brandId),
    empty: EMPTY_LOGS,
    enabled: Boolean(brandId),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useOptimizerSuggestions(
  brandId: string,
  adAccountId: string | null,
  level: PortfolioLevel = 'adset',
) {
  return useOptimizerRead({
    queryKey: optimizerQueryKeys.suggestions(brandId, adAccountId, level),
    queryFn: () => fetchSuggestions(brandId, adAccountId as string, level),
    empty: null,
    enabled: Boolean(brandId && adAccountId),
    staleTime: TEN_MINUTES,
  });
}

/** The account's snapshots (engine input) — powers the client-side "what-if"
 *  preview. `level` selects ad sets (default) or campaigns; campaign mode reads
 *  the campaign_snapshots scope. Cached like every other read (30-min TTL).
 *
 *  `data` stays the AdSetSnapshot[] every existing consumer reads. Added on top:
 *  `fetchedAt` (the edge's real Meta read time, for the freshness chip) and a
 *  cooldown-gated `refresh()` that forces a fresh (uncached) edge read. Multiple
 *  observers of the same account/level share one React Query entry, so the picker's
 *  chip and the parent panel read the same cache with no extra network fetch. */
export function useOptimizerAccountSnapshots(
  brandId: string,
  adAccountId: string | null,
  level: PortfolioLevel = 'adset',
) {
  const scope = level === 'campaign' ? 'campaign_snapshots' : 'adset_snapshots';
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => optimizerQueryKeys.accountSnapshots(brandId, adAccountId, level),
    [brandId, adAccountId, level],
  );
  const enabled = Boolean(brandId && adAccountId);

  const query = useQuery({
    queryKey,
    queryFn: () =>
      withReadTimeout(fetchAccountSnapshots(brandId, adAccountId as string, scope, false)),
    enabled,
    staleTime: TEN_MINUTES,
    gcTime: THIRTY_MINUTES,
    retry: 1,
  });

  const [cooldownUntil, setCooldownUntil] = useState(0);
  // Re-render exactly once when the cooldown lapses so the refresh control re-enables
  // without the user having to interact. In-memory; nothing persists across reloads.
  const [, forceCooldownTick] = useState(0);
  useEffect(() => {
    const remaining = cooldownUntil - Date.now();
    if (remaining <= 0) return;
    const timer = globalThis.setTimeout(() => forceCooldownTick((n) => n + 1), remaining + 50);
    return () => globalThis.clearTimeout(timer);
  }, [cooldownUntil]);

  const inCooldown = Date.now() < cooldownUntil;
  const canRefresh = enabled && !inCooldown && !query.isFetching;

  const refresh = useCallback(() => {
    if (!brandId || !adAccountId || Date.now() < cooldownUntil) return;
    setCooldownUntil(Date.now() + SNAPSHOTS_REFRESH_COOLDOWN_MS);
    // fetchQuery on the shared key forces a fresh (forceRefresh:true) edge read and
    // writes the result into the same cache both observers render from.
    void queryClient.fetchQuery({
      queryKey,
      queryFn: () => withReadTimeout(fetchAccountSnapshots(brandId, adAccountId, scope, true)),
      staleTime: 0,
    });
  }, [brandId, adAccountId, scope, cooldownUntil, queryClient, queryKey]);

  return {
    ...query,
    data: query.data?.snapshots ?? EMPTY_SNAPSHOTS,
    fetchedAt: query.data?.fetchedAt ?? null,
    budgetSummary: query.data?.budgetSummary ?? null,
    refresh,
    canRefresh,
    isRefreshing: query.isFetching,
  };
}

/** Account-wide Meta membership inventory. Separate from snapshots so paused/terminal rows
 * can power portfolio editing without ever becoming engine input. */
export function useOptimizerAdsetInventory(
  brandId: string,
  adAccountId: string | null,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => optimizerQueryKeys.adsetInventory(brandId, adAccountId),
    [brandId, adAccountId],
  );
  const canQuery = enabled && Boolean(brandId && adAccountId);
  const query = useQuery({
    queryKey,
    queryFn: () => withReadTimeout(fetchAdsetInventory(brandId, adAccountId as string, false)),
    enabled: canQuery,
    staleTime: TEN_MINUTES,
    gcTime: THIRTY_MINUTES,
    retry: 1,
  });

  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [, forceCooldownTick] = useState(0);
  useEffect(() => {
    const remaining = cooldownUntil - Date.now();
    if (remaining <= 0) return;
    const timer = globalThis.setTimeout(
      () => forceCooldownTick((value) => value + 1),
      remaining + 50,
    );
    return () => globalThis.clearTimeout(timer);
  }, [cooldownUntil]);

  const inCooldown = Date.now() < cooldownUntil;
  const canRefresh = canQuery && !inCooldown && !query.isFetching;
  const refresh = useCallback(() => {
    if (!canQuery || !adAccountId || Date.now() < cooldownUntil) return;
    setCooldownUntil(Date.now() + SNAPSHOTS_REFRESH_COOLDOWN_MS);
    void queryClient.fetchQuery({
      queryKey,
      queryFn: () => withReadTimeout(fetchAdsetInventory(brandId, adAccountId, true)),
      staleTime: 0,
    });
  }, [adAccountId, brandId, canQuery, cooldownUntil, queryClient, queryKey]);

  return {
    ...query,
    data: (query.data?.adsets ?? []) as OptimizerAdsetInventoryItem[],
    fetchedAt: query.data?.fetchedAt ?? null,
    partial: query.data?.partial ?? false,
    truncated: query.data?.truncated ?? false,
    refresh,
    canRefresh,
    isRefreshing: query.isFetching,
  };
}

/** The ad sets enrolled in a portfolio — powers the manage panel's pre-selection
 *  and add/remove diff. */
export function useOptimizerEnrolledAdsets(portfolioId: string | null) {
  return useOptimizerRead({
    queryKey: optimizerQueryKeys.enrolledAdsets(portfolioId ?? 'none'),
    queryFn: () => fetchEnrolledAdsets(portfolioId as string),
    empty: EMPTY_ENROLLED,
    enabled: Boolean(portfolioId),
    staleTime: TEN_MINUTES,
  });
}

/** Account-wide ad-set → owning-portfolio map. Backs the picker's "already in X" badge and
 *  the move disclosure on save. */
export function useOptimizerAccountEnrollments(brandId: string | null, accountId: string | null) {
  return useOptimizerRead({
    queryKey: optimizerQueryKeys.accountEnrollments(brandId ?? 'none', accountId ?? 'none'),
    queryFn: () => fetchAccountEnrollments(brandId as string, accountId as string),
    empty: EMPTY_ACCOUNT_ENROLLMENTS,
    enabled: Boolean(brandId && accountId),
    staleTime: FIVE_MINUTES,
  });
}

export function useOptimizerAdsetCreativeWinrates(
  brandId: string | null,
  window: string,
  dimension: string,
) {
  return useOptimizerRead({
    queryKey: optimizerQueryKeys.adsetWinrates(brandId ?? 'none', window, dimension),
    queryFn: () => fetchAdsetCreativeWinrates(brandId as string, window, dimension),
    empty: EMPTY_WINRATES,
    enabled: Boolean(brandId),
    staleTime: FIVE_MINUTES,
  });
}

export function useOptimizerTimelineEvents(portfolioId: string | null) {
  return useOptimizerRead({
    queryKey: optimizerQueryKeys.timelineEvents(portfolioId ?? 'none'),
    queryFn: () => fetchTimelineEvents(portfolioId as string),
    empty: EMPTY_TIMELINE_EVENTS,
    enabled: Boolean(portfolioId),
    staleTime: FIVE_MINUTES,
  });
}

/** Self-heal for missing ad-set names: fills blank roster names from the names the
 *  caller already has (the account-snapshot read), then re-reads the roster so the
 *  labels update. No-ops when nothing was filled. */
export function useOptimizerBackfillAdsetNames(portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (names: Record<string, string>) =>
      backfillAdsetNames({ portfolio_id: portfolioId, names }),
    onSuccess: (filled) => {
      if (filled > 0) {
        queryClient.invalidateQueries({
          queryKey: optimizerQueryKeys.enrolledAdsets(portfolioId),
        });
      }
    },
  });
}

/** Archived portfolios for the "Archived" view — same account scoping as the active list. */
export function useOptimizerArchivedPortfolios(brandId: string, adAccountId: string | null) {
  const query = useOptimizerRead({
    queryKey: optimizerQueryKeys.archivedPortfolios(brandId, adAccountId),
    queryFn: () => fetchArchivedPortfolios(brandId, adAccountId),
    empty: EMPTY_PORTFOLIO_SCOPE,
    enabled: Boolean(brandId),
    staleTime: FIVE_MINUTES,
  });

  return {
    ...query,
    data: query.data.portfolios,
    brandPortfolios: query.data.brandPortfolios,
    brandPortfolioCount: query.data.brandPortfolioCount,
    otherAccountIds: query.data.otherAccountIds,
    droppedRowCount: query.data.droppedRowCount,
  };
}

/** The ads inside one ad set — lazy: pass adsetId=null to keep the read disabled
 *  until the ad-set node is expanded. */
export function useOptimizerAdsetAds(
  brandId: string,
  accountId: string | null,
  adsetId: string | null,
) {
  return useOptimizerRead({
    queryKey: optimizerQueryKeys.adsetAds(adsetId ?? 'none'),
    queryFn: () => fetchAdsetAds(brandId, accountId as string, adsetId as string),
    empty: EMPTY_ADS,
    enabled: Boolean(brandId && accountId && adsetId),
    staleTime: TEN_MINUTES,
  });
}

/** Per-ad daily trends for one ad set — lazy: pass adsetId=null to keep the read
 *  disabled until an ad set is in focus. Returns [] when the scope isn't deployed
 *  yet (graceful — the creative HoverCard then shows aggregate only). */
export function useOptimizerAdDailyTrends(
  brandId: string,
  accountId: string | null,
  adsetId: string | null,
) {
  return useOptimizerRead({
    queryKey: optimizerQueryKeys.adDailyTrends(adsetId ?? 'none'),
    queryFn: () => fetchAdDailyTrends(brandId, accountId as string, adsetId as string),
    empty: EMPTY_AD_TRENDS,
    enabled: Boolean(brandId && accountId && adsetId),
    staleTime: TEN_MINUTES,
  });
}

/** The creative angle labels for one ad set's ads (paid-creative-intel), read
 *  under RLS via the brand-asserting RPC. Empty until the labeling worker has
 *  processed the brand — the HoverCard then simply omits the angle line. */
async function fetchAdAngles(brandId: string, adsetId: string): Promise<PaidAdAngle[]> {
  const { data, error } = await getClient().rpc('paid_media_get_ad_angles', {
    p_brand_id: brandId,
    p_adset_ids: [adsetId],
  });
  if (error) throw new Error('paid_media_get_ad_angles unreachable');
  return z
    .array(PaidAdAngleSchema)
    .catch([])
    .parse(data ?? []);
}

/** Angle labels for the focused ad set — lazy like the other per-adset reads. */
export function useOptimizerAdAngles(
  brandId: string,
  accountId: string | null,
  adsetId: string | null,
) {
  return useOptimizerRead({
    queryKey: optimizerQueryKeys.adAngles(adsetId ?? 'none'),
    queryFn: () => fetchAdAngles(brandId, adsetId as string),
    empty: EMPTY_AD_ANGLES,
    enabled: Boolean(brandId && accountId && adsetId),
    staleTime: TEN_MINUTES,
  });
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
  return useOptimizerRead({
    queryKey: optimizerQueryKeys.insight(insightKey),
    queryFn: () =>
      fetchOptimizerInsight({
        brandId: input.brandId,
        insightKey,
        adsetId: input.adsetId,
        reason: input.reason,
        kind: input.kind,
        trigger: input.trigger,
        severity: input.severity ?? null,
      }),
    empty: null,
    enabled: Boolean(enabled && input.brandId && input.reason),
    staleTime: THIRTY_MINUTES,
  });
}

/** Poll a freshly-enrolled portfolio every five seconds for at most two minutes.
 * The scheduler remains the source of truth; polling only removes the manual
 * refresh tax while its first real cycle lands.
 *
 * Returns whether that two-minute window has LAPSED with the wait still on. The caller
 * needs it because the spinner outlives the poll: past 120s nothing is refreshing, so an
 * animation is a lie about work in progress. Report the stall and offer a retry instead. */
export function useOptimizerFirstRunPoll(active: boolean, refetch: () => unknown): boolean {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!active) {
      setExpired(false);
      return;
    }
    const interval = window.setInterval(() => {
      void refetchRef.current();
    }, 5_000);
    const stop = window.setTimeout(() => {
      window.clearInterval(interval);
      setExpired(true);
    }, 120_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stop);
    };
  }, [active]);

  return expired;
}

/** Warm the lightweight overview reads before the Optimization tab mounts. */
export function usePrefetchOptimizerOverview(brandId: string, adAccountId: string | null) {
  const queryClient = useQueryClient();

  return useCallback(() => {
    if (!brandId) return;
    void queryClient.prefetchQuery({
      queryKey: optimizerQueryKeys.portfolios(brandId, adAccountId),
      queryFn: () => withReadTimeout(fetchPortfolios(brandId, adAccountId)),
      staleTime: FIVE_MINUTES,
    });
    void queryClient.prefetchQuery({
      queryKey: optimizerQueryKeys.renewals(brandId),
      queryFn: () => withReadTimeout(fetchRenewals(brandId)),
      staleTime: FIVE_MINUTES,
    });
  }, [adAccountId, brandId, queryClient]);
}

/** Warm a portfolio's detail-workspace reads before it opens — fired from a card's
 *  hover/focus so the workspace paints from cache instead of running its read fan-out
 *  on click. Uses the SAME query keys + staleTimes the detail hooks use, so the
 *  prefetch and the real read share one cache entry (no duplicate fetch). */
export function usePrefetchPortfolioDetail(brandId: string) {
  const queryClient = useQueryClient();

  return useCallback(
    (portfolioId: string) => {
      if (!brandId || !portfolioId) return;
      void queryClient.prefetchQuery({
        queryKey: optimizerQueryKeys.performance(portfolioId),
        queryFn: () => withReadTimeout(fetchPerformance(portfolioId)),
        staleTime: FIVE_MINUTES,
      });
      void queryClient.prefetchQuery({
        queryKey: optimizerQueryKeys.cpaSeries(portfolioId),
        queryFn: () => withReadTimeout(fetchCpaSeries(portfolioId)),
        staleTime: FIVE_MINUTES,
      });
      void queryClient.prefetchQuery({
        queryKey: optimizerQueryKeys.timelineEvents(portfolioId),
        queryFn: () => withReadTimeout(fetchTimelineEvents(portfolioId)),
        staleTime: FIVE_MINUTES,
      });
      void queryClient.prefetchQuery({
        queryKey: optimizerQueryKeys.enrolledAdsets(portfolioId),
        queryFn: () => withReadTimeout(fetchEnrolledAdsets(portfolioId)),
        staleTime: TEN_MINUTES,
      });
    },
    [brandId, queryClient],
  );
}

/** Warm the performance read for every portfolio with pending work, so the Actions queue
 *  lands from cache instead of firing one optimizer-status invoke per portfolio on tab
 *  entry. Fired from the Actions tab trigger's hover/focus. The gate must match the one
 *  OptimizerActions renders on, or the portfolios it newly shows are exactly the ones
 *  that never get warmed. */
export function useWarmActionsQueue(brandId: string) {
  const queryClient = useQueryClient();

  return useCallback(
    (portfolios: PortfolioListItem[]) => {
      if (!brandId) return;
      for (const portfolio of portfolios) {
        if (pendingActionCount(portfolio) <= 0) continue;
        void queryClient.prefetchQuery({
          queryKey: optimizerQueryKeys.performance(portfolio.id),
          queryFn: () => withReadTimeout(fetchPerformance(portfolio.id)),
          staleTime: FIVE_MINUTES,
        });
      }
    },
    [brandId, queryClient],
  );
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useOptimizerMutations(brandId: string, adAccountId: string | null) {
  const queryClient = useQueryClient();
  const invalidateOptimizer = () =>
    queryClient.invalidateQueries({ queryKey: optimizerQueryKeys.root });

  const create = useMutation({
    mutationFn: createPortfolio,
    onSuccess: invalidateOptimizer,
  });

  const enroll = useMutation({
    mutationFn: enrollAdsets,
    onSuccess: invalidateOptimizer,
  });

  const update = useMutation({
    mutationFn: updatePortfolio,
    onSuccess: invalidateOptimizer,
  });

  const unenroll = useMutation({
    mutationFn: unenrollAdset,
    onSuccess: invalidateOptimizer,
  });

  const archive = useMutation({
    mutationFn: archivePortfolio,
    onSuccess: invalidateOptimizer,
  });

  const restore = useMutation({
    mutationFn: restorePortfolio,
    onSuccess: invalidateOptimizer,
  });

  const run = useMutation({
    mutationFn: (portfolioId: string) => runCycle(portfolioId, brandId, adAccountId),
    // Only a cycle that actually persisted a run changed anything worth re-reading. A skip
    // wrote nothing, and an unreachable service wrote nothing either.
    onSuccess: (outcome) => {
      if (outcome.status === 'ran') invalidateOptimizer();
    },
  });

  const setStatus = useMutation({
    mutationFn: setRecommendationStatus,
    onSuccess: invalidateOptimizer,
  });

  const renewal = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      setRenewalTaskStatus(taskId, status),
    onSuccess: invalidateOptimizer,
  });

  const setPaused = useMutation({
    mutationFn: setAutopilotPaused,
    onSuccess: invalidateOptimizer,
  });

  const requestApply = useMutation({
    mutationFn: requestApplyItem,
    onSuccess: invalidateOptimizer,
  });

  // The Action Log's multi-select budget approve (one round-trip for N ad sets).
  const requestApplyItems = useMutation({
    mutationFn: requestApplyItemsBatch,
    onSuccess: invalidateOptimizer,
  });

  // The Action Log's multi-select rec approve (pause / fatigue recs in one round-trip).
  const setStatuses = useMutation({
    mutationFn: setRecommendationStatuses,
    onSuccess: invalidateOptimizer,
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
    setStatuses,
    renewal,
    setPaused,
    requestApply,
    requestApplyItems,
  };
}

/** Preview or apply a CBO→ABO conversion for one campaign. Instantiated PER CBO
 *  campaign row so each keeps its own pending/preview/error state. The FE only ever
 *  calls it with `dryRun:true` today (a working preview); a real conversion
 *  (`dryRun:false`, un-gated after the sandbox bench) makes the campaign's ad sets
 *  ABO — so a real success marks the account snapshots + suggestions stale so the
 *  now-optimizable ad sets reappear. A dry-run preview writes nothing and skips it. */
export function useConvertCbo(_brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: convertCbo,
    onSuccess: (data) => {
      if (data?.ok && data.dryRun !== true) {
        void queryClient.invalidateQueries({ queryKey: optimizerQueryKeys.root });
      }
    },
  });
}

/** The read-only "as-if-converted" full preview — run the ACTUAL optimizer engine over
 *  the synthesized post-convert ad sets and see what it WOULD reallocate. Instantiated per
 *  CBO campaign row, lazily on expander open. Writes nothing (no invalidation): it is a
 *  pure preview and never throws — the outcome carries `unavailable` when the service is
 *  not yet deployed so the dialog degrades quietly. */
export function useCyclePreview() {
  return useMutation({ mutationFn: fetchCyclePreview });
}

/** Preview or apply a portfolio's proposed reallocation. Instantiated per dialog so
 *  each keeps its own pending/preview/error state. dryRun:true = preview; dryRun:false
 *  writes budgets on Meta and invalidates the performance report. */
export function useApplyRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: applyRunBudgets,
    onSuccess: (data, request) => {
      if (data?.ok && data.dryRun !== true) {
        void queryClient.invalidateQueries({
          queryKey: optimizerQueryKeys.performance(request.portfolio_id),
        });
        void queryClient.invalidateQueries({ queryKey: optimizerQueryKeys.root });
      }
    },
  });
}

/** Revert one prior ad-set budget write to its recorded pre-write value. Instantiated per
 *  money log row so each keeps its own pending/preview/error state. dryRun:true = preview;
 *  dryRun:false writes the prior budget on Meta and invalidates the performance report. */
export function useRevertApply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revertApplyBudget,
    onSuccess: (data, request) => {
      if (data?.ok && data.dryRun !== true) {
        void queryClient.invalidateQueries({
          queryKey: optimizerQueryKeys.performance(request.portfolio_id),
        });
        void queryClient.invalidateQueries({ queryKey: optimizerQueryKeys.root });
      }
    },
  });
}

/** Apply human-approved held budget changes (approved_pending → Meta). */
export function useApplyApproved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: applyApprovedBudgets,
    onSuccess: (data, request) => {
      if (data?.ok && data.dryRun !== true) {
        void queryClient.invalidateQueries({
          queryKey: optimizerQueryKeys.performance(request.portfolio_id),
        });
        void queryClient.invalidateQueries({ queryKey: optimizerQueryKeys.root });
      }
    },
  });
}

/** Drain approved ad-set pause recommendations into real Meta pauses. Mirrors
 *  useApplyApproved: dryRun:true previews (0 writes), dryRun:false performs the audited
 *  pause and invalidates the portfolio's performance + the whole optimizer tree so the
 *  paused ad sets and their recs re-read. */
export function useApplyAdsetStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: applyAdsetStatusDrain,
    onSuccess: (data, request) => {
      if (data?.ok && data.dryRun !== true) {
        void queryClient.invalidateQueries({
          queryKey: optimizerQueryKeys.performance(request.portfolio_id),
        });
        void queryClient.invalidateQueries({ queryKey: optimizerQueryKeys.root });
      }
    },
  });
}
