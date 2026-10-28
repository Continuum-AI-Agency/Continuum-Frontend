'use client';

// The Google tab's reads: one parser per paid-media-metrics `google-ads` scope, and one hook per
// read the tab's own views use. Every shape is a contract (@continuum/contracts paid/google-tab,
// google-change-history). A payload that does not parse is an error the view names, never zeros.

import {
  type GoogleAccountOverview,
  GoogleAccountOverviewSchema,
  type GoogleBreakdownDimension,
  type GoogleBreakdownRead,
  GoogleBreakdownReadSchema,
  type GoogleCampaignFields,
  type GoogleCampaignRow,
  type GoogleChangeHistory,
  GoogleChangeHistorySchema,
  type GoogleKeywordQualityRead,
  GoogleKeywordQualityReadSchema,
  type GoogleSignalBlock,
  type GoogleSignalsRead,
  GoogleSignalsReadSchema,
  type GoogleTopCampaigns,
  GoogleTopCampaignsSchema,
} from '@continuum/contracts';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { readEdgeErrorMessage } from '@/lib/supabase/edgeErrorMessage';

const FIVE_MINUTES = 5 * 60 * 1000;
/** Every spending campaign of any account this product serves fits in one page; also the
 *  edge's ceiling for keyword_quality (the 50 keywords that spent most). */
const ROW_LIMIT = 50;

/** The window a read covers, as ISO dates. */
export type GoogleReadWindow = { since: string; until: string };
/** The account a read is for: the brand and its granted Google Ads customer. */
export type GoogleReadTarget = { brandId: string; customerId: string };

export async function invokeGoogleMetrics(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createSupabaseBrowserClient().functions.invoke(
    'paid-media-metrics',
    { body: { platform: 'google-ads', ...body } },
  );
  if (error) {
    throw new Error(await readEdgeErrorMessage(error, 'The Google Ads read did not answer.'));
  }
  return data;
}

export const rangeOf = (window: GoogleReadWindow) => ({
  preset: 'custom',
  since: window.since,
  until: window.until,
});

function parserFor<T>(schema: z.ZodType<T>, read: string) {
  return (raw: unknown): T => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`The Google Ads ${read} read came back in a shape this page does not know.`);
    }
    return parsed.data;
  };
}

export const parseGoogleAccountOverview = parserFor<GoogleAccountOverview>(
  GoogleAccountOverviewSchema,
  'account',
);
export const parseGoogleCampaigns = parserFor<GoogleTopCampaigns>(
  GoogleTopCampaignsSchema,
  'campaign',
);
export const parseGoogleSignals = parserFor<GoogleSignalsRead>(GoogleSignalsReadSchema, 'signals');
export const parseGoogleKeywordQuality = parserFor<GoogleKeywordQualityRead>(
  GoogleKeywordQualityReadSchema,
  'Quality Score',
);
export const parseGoogleChangeHistory = parserFor<GoogleChangeHistory>(
  GoogleChangeHistorySchema,
  'change history',
);
export const parseGoogleBreakdown = parserFor<GoogleBreakdownRead>(
  GoogleBreakdownReadSchema,
  'breakdown',
);

function useGoogleRead<T>(
  target: GoogleReadTarget,
  key: readonly unknown[],
  read: () => Promise<T>,
): UseQueryResult<T> {
  return useQuery({
    queryKey: ['optimizer', 'google', target.brandId, target.customerId, ...key],
    queryFn: read,
    enabled: Boolean(target.brandId && target.customerId),
    staleTime: FIVE_MINUTES,
    retry: 1,
  });
}

const account = (target: GoogleReadTarget) => ({
  brandId: target.brandId,
  accountId: target.customerId,
});

/** Every campaign that spent in the window, by spend, with E1's `google` block when the edge
 *  read it (absent on a payload cached before it did: see campaignField). */
export function useGoogleCampaigns(
  args: GoogleReadTarget & { window: GoogleReadWindow },
): UseQueryResult<GoogleTopCampaigns> {
  return useGoogleRead(args, ['top_campaigns', args.window.since, args.window.until], async () =>
    parseGoogleCampaigns(
      await invokeGoogleMetrics({
        ...account(args),
        scope: 'top_campaigns',
        kpi: 'spend',
        limit: ROW_LIMIT,
        range: rangeOf(args.window),
      }),
    ),
  );
}

/** google_signals (E2): the engine's platform reads over Google's own 30 complete days. Ask for
 *  the blocks a view needs: Vivo 47's search terms alone are ~27k rows. Cached 12h per person. */
export function useGoogleSignals(
  args: GoogleReadTarget & { blocks: readonly GoogleSignalBlock[] },
): UseQueryResult<GoogleSignalsRead> {
  const blocks = [...new Set(args.blocks)].sort();
  return useGoogleRead(args, ['google_signals', blocks.join(',')], async () =>
    parseGoogleSignals(
      await invokeGoogleMetrics({ ...account(args), scope: 'google_signals', blocks }),
    ),
  );
}

/** Quality Score and its three components for the 50 keywords that spent most in the window. */
export function useGoogleKeywordQuality(
  args: GoogleReadTarget & { window: GoogleReadWindow; campaignId?: string },
): UseQueryResult<GoogleKeywordQualityRead> {
  return useGoogleRead(
    args,
    ['keyword_quality', args.window.since, args.window.until, args.campaignId ?? 'account'],
    async () =>
      parseGoogleKeywordQuality(
        await invokeGoogleMetrics({
          ...account(args),
          scope: 'keyword_quality',
          limit: ROW_LIMIT,
          range: rangeOf(args.window),
          ...(args.campaignId ? { campaignId: args.campaignId } : {}),
        }),
      ),
  );
}

/** What changed, newest first. Never cached by the edge; at most 30 days back (`coverage`). */
export function useGoogleChangeHistory(
  args: GoogleReadTarget & { window: GoogleReadWindow; campaignId?: string },
): UseQueryResult<GoogleChangeHistory> {
  return useGoogleRead(
    args,
    ['change_history', args.window.since, args.window.until, args.campaignId ?? 'account'],
    async () =>
      parseGoogleChangeHistory(
        await invokeGoogleMetrics({
          ...account(args),
          scope: 'change_history',
          range: rangeOf(args.window),
          ...(args.campaignId ? { campaignId: args.campaignId } : {}),
        }),
      ),
  );
}

/** Spend and results by device, ad network or country (criterion id) over the window. */
export function useGoogleBreakdown(
  args: GoogleReadTarget & {
    window: GoogleReadWindow;
    dimensions: readonly GoogleBreakdownDimension[];
    campaignId?: string;
  },
): UseQueryResult<GoogleBreakdownRead> {
  const dimensions = [...new Set(args.dimensions)].sort();
  return useGoogleRead(
    args,
    [
      'breakdown',
      args.window.since,
      args.window.until,
      dimensions.join(','),
      args.campaignId ?? 'account',
    ],
    async () =>
      parseGoogleBreakdown(
        await invokeGoogleMetrics({
          ...account(args),
          scope: 'breakdown',
          dimensions,
          range: rangeOf(args.window),
          ...(args.campaignId ? { campaignId: args.campaignId } : {}),
        }),
      ),
  );
}

/** Said under a "—" when the read predates E1: the edge's cache holds top_campaigns for 12h. */
export const NOT_IN_THIS_READ =
  'Not in this read yet: it was cached before Google bidding and impression share were read, and refreshes within 12 hours';

/** The channel types Google reports a Search impression share for. */
const SERVES_ON_SEARCH = new Set(['SEARCH', 'PERFORMANCE_MAX']);
const IMPRESSION_SHARES = new Set<keyof GoogleCampaignFields>([
  'search_impression_share',
  'search_budget_lost_impression_share',
  'search_rank_lost_impression_share',
]);

/**
 * One E1 field of a campaign, or why it reads "—": never a zero standing in for "not reported".
 */
export function campaignField<K extends keyof GoogleCampaignFields>(
  row: GoogleCampaignRow,
  key: K,
): { value: NonNullable<GoogleCampaignFields[K]>; reason: null } | { value: null; reason: string } {
  if (!row.google) return { value: null, reason: NOT_IN_THIS_READ };
  const value = row.google[key];
  if (value !== null) return { value: value as NonNullable<GoogleCampaignFields[K]>, reason: null };
  if (IMPRESSION_SHARES.has(key)) {
    return {
      value: null,
      reason: SERVES_ON_SEARCH.has(row.labels?.channel_type ?? '')
        ? 'Google reported no impression share for this window'
        : 'Google reports impression share only for campaigns that serve on Search',
    };
  }
  if (key === 'target_cpa' || key === 'target_roas') {
    return {
      value: null,
      reason: 'No target on the campaign itself: none is set, or a portfolio bid strategy holds it',
    };
  }
  return { value: null, reason: 'Google did not report it for this campaign' };
}
