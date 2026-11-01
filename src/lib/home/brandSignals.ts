// Turns what the Frontend already reads about a brand into the signals the Home's reading takes
// (`readBrand` in @continuum/contracts). Pure, so the server loader, the e2e bench and the tests
// all build the same signals from the same rows.

import {
  HOME_PROFILE_BRAND_SCOPE,
  type HomeBrandSignals,
  type HomeObjective,
  type HomePortfolioSignal,
  type HomeProfileRow,
  homePortfolioSignalSchema,
} from '@continuum/contracts';
import type { PlatformKey } from '@/components/onboarding/platforms';
import { platformWritable } from '@/components/paid-media/optimizer/platformWrites';

/** The part of a brand's integration summary the counts read; BrandIntegrationSummary fits it. */
export type AccountBuckets = Partial<
  Record<PlatformKey | 'tiktokAds', { accounts: { type: string | null; status: string | null }[] }>
>;

// Paid buckets hold only ad accounts; the facebook and linkedin buckets mix Pages or
// organisations with ad accounts, so the asset type decides there. Google Analytics is neither.
const PAID_BUCKETS = ['googleAds', 'amazonAds', 'dv360', 'openai', 'tiktokAds'] as const;
const ORGANIC_BUCKETS = ['instagram', 'youtube', 'tiktok', 'x', 'threads'] as const;
const AD_ACCOUNT_TYPES = new Set(['meta_ad_account', 'linkedin_ad_account']);

/** Assigned ad accounts and organic profiles. A Google Ads manager (MCC) runs no ads itself. */
export function accountCountsFrom(summary: AccountBuckets): HomeBrandSignals['accounts'] {
  let ads = 0;
  let organic = 0;
  for (const bucket of PAID_BUCKETS) {
    ads += (summary[bucket]?.accounts ?? []).filter(
      (account) => account.status !== 'manager',
    ).length;
  }
  for (const bucket of ORGANIC_BUCKETS) organic += summary[bucket]?.accounts.length ?? 0;
  for (const bucket of ['facebook', 'linkedin'] as const) {
    for (const account of summary[bucket]?.accounts ?? []) {
      if (AD_ACCOUNT_TYPES.has(account.type ?? '')) ads += 1;
      else organic += 1;
    }
  }
  return { ads, organic };
}

const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const count = (value: unknown): number => Math.max(0, Math.trunc(finiteOrNull(value) ?? 0));

/** Whether Continuum may write any platform the portfolio is on: the Optimizer's own rule
 *  (platformWritable: Meta unless switched off, any other platform only when switched on). A row
 *  that lists no platform predates the projection, and every such portfolio is Meta. */
function canWriteFrom(raw: Record<string, unknown>): boolean {
  const writes =
    raw.platform_writes &&
    typeof raw.platform_writes === 'object' &&
    !Array.isArray(raw.platform_writes)
      ? (raw.platform_writes as Record<string, boolean>)
      : {};
  const platforms = Array.isArray(raw.platforms)
    ? raw.platforms.filter((platform): platform is string => typeof platform === 'string')
    : [];
  return (platforms.length > 0 ? platforms : ['meta']).some((platform) =>
    platformWritable({ platform_writes: writes }, platform),
  );
}

/** optimizer_list_portfolios rows, keeping the ones that parse. */
export function portfolioSignalsFrom(rows: unknown): HomePortfolioSignal[] {
  if (!Array.isArray(rows)) return [];
  const portfolios: HomePortfolioSignal[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const raw = row as Record<string, unknown>;
    const parsed = homePortfolioSignalSchema.safeParse({
      id: raw.id,
      name: raw.name,
      applyMode: raw.apply_mode,
      status: raw.status,
      autopilotPaused: raw.autopilot_paused === true,
      pendingRecommendations: count(raw.pending_recommendations),
      pendingBudgetMoves: count(raw.pending_budget_moves),
      staleForDays: finiteOrNull(raw.stale_for_days),
      rosterAbsent: raw.roster_state === 'absent',
      canWrite: canWriteFrom(raw),
    });
    if (parsed.success) portfolios.push(parsed.data);
  }
  return portfolios;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const texts = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap((item) => text(item) ?? []) : [];

/**
 * What onboarding learned about the business: the Brand Book's structured business section
 * (its call to action first) and the descriptions on the brand row. Null when there is nothing.
 */
export function businessFrom(input: {
  structuredBusiness: unknown;
  headline: unknown;
  brandDescription: unknown;
}): HomeBrandSignals['business'] {
  const business =
    input.structuredBusiness && typeof input.structuredBusiness === 'object'
      ? (input.structuredBusiness as Record<string, unknown>)
      : {};
  const calls = [text(business.business_cta), ...texts(business.alt_ctas)].flatMap(
    (call) => call ?? [],
  );
  const descriptions = [
    text(business.business_description),
    text(input.headline),
    text(input.brandDescription),
  ].flatMap((description) => description ?? []);
  return calls.length + descriptions.length > 0 ? { calls, descriptions } : null;
}

/** The primary goal of the brand-wide saved row. */
export function savedGoalFrom(rows: HomeProfileRow[]): HomeObjective | null {
  const row = rows.find((candidate) => candidate.scope === HOME_PROFILE_BRAND_SCOPE);
  return row?.objectives.find((objective) => objective.role === 'primary') ?? null;
}
