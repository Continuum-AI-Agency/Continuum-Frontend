'use client';

// Which action kinds a portfolio may execute on each platform: optimizer_get_portfolio_platform_
// actions and optimizer_set_portfolio_platform_actions (20261008180000), over
// optimizer.portfolio_platforms.allowed_actions — the list optimizer_reserve_action checks on
// every leg the executor writes. Meta's writes do not go through that executor (its apply path
// never reads the list), so only the platforms that do are offered: a Meta row would be a
// control that changes nothing.

import type { OptimizerActionKind } from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isMissingRpcError, MissingRpcError } from '../platforms/multiplatformRead';
import { type AdPlatform, readAdPlatform } from '../platforms/platformTabsModel';

export const GET_PLATFORM_ACTIONS_RPC = 'optimizer_get_portfolio_platform_actions';
export const SET_PLATFORM_ACTIONS_RPC = 'optimizer_set_portfolio_platform_actions';

/** A kind one leg writes; a budget_move is legs of set_budget, so it is never offered alone. */
export type ActionKind = Exclude<OptimizerActionKind, 'budget_move'>;

/** What each kind does, in the words the control shows beside its box. */
export const ACTION_KIND_COPY: Record<ActionKind, { label: string; explanation: string }> = {
  set_status: {
    label: 'Pause or enable',
    explanation: 'Pause a campaign that spends without results, or turn one back on.',
  },
  set_budget: {
    label: 'Change budgets',
    explanation: "Raise or cut a campaign's daily budget, within this portfolio's change cap.",
  },
  set_bid_target: {
    label: 'Change bid targets',
    explanation:
      "Move a campaign's target CPA or target ROAS — the platform's own bidding goal, not this portfolio's target.",
  },
  add_negatives: {
    label: 'Add negative keywords',
    explanation: 'Stop search terms that spend without converting from showing your ads.',
  },
  add_keyword: {
    label: 'Add keywords',
    explanation: 'Add a search term that converts as a keyword of its own.',
  },
};

/** The kinds each platform's applier can write, in the order the control lists them. Meta is
 *  absent: its writes never cross the executor that reads this list. */
const PLATFORM_KINDS: Partial<Record<AdPlatform, readonly ActionKind[]>> = {
  google_ads: ['set_status', 'set_budget', 'set_bid_target', 'add_negatives', 'add_keyword'],
  tiktok_ads: ['set_status', 'set_budget'],
};

/** Every portfolio starts with these on each platform (the column's default). */
export const DEFAULT_ALLOWED_ACTIONS: readonly ActionKind[] = ['set_status', 'set_budget'];

export function platformActionKinds(platform: AdPlatform): readonly ActionKind[] {
  return PLATFORM_KINDS[platform] ?? [];
}

export const platformActionsQueryKey = (portfolioId: string) =>
  ['optimizer', 'platform-actions', portfolioId] as const;

/** One platform among the portfolio's members. `allowed` is null when its accounts disagree
 *  (only the service can write them apart), so no one list can be shown for them. */
export type PlatformActions = {
  platform: AdPlatform;
  allowed: string[] | null;
  accounts: number;
};

const PlatformActionsRowSchema = z.object({
  platform: z.string(),
  allowed_actions: z.array(z.string()).nullable(),
  accounts: z.number().int().positive(),
});

type LooseRpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const defaultClient = () => createSupabaseBrowserClient() as unknown as LooseRpc;

/** The rows of the platforms this control governs; Meta and unknown platforms are dropped. */
export async function fetchPlatformActions(
  portfolioId: string,
  client: LooseRpc = defaultClient(),
): Promise<PlatformActions[]> {
  const { data, error } = await client.rpc(GET_PLATFORM_ACTIONS_RPC, {
    p_portfolio_id: portfolioId,
  });
  if (error) {
    if (isMissingRpcError(error)) throw new MissingRpcError(GET_PLATFORM_ACTIONS_RPC);
    throw new Error('The allowed actions could not be read.');
  }
  const parsed = z.array(PlatformActionsRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new Error('The allowed actions read returned an unexpected shape.');
  return parsed.data.flatMap((row) => {
    const platform = readAdPlatform(row.platform);
    return platform && platformActionKinds(platform).length > 0
      ? [{ platform, allowed: row.allowed_actions, accounts: row.accounts }]
      : [];
  });
}

/** Write one platform's whole list. Resolves to the stored list (de-duplicated and sorted by
 *  the database); throws the database's own message so the field can show why it refused. */
export async function savePlatformActions(
  portfolioId: string,
  platform: AdPlatform,
  allowed: readonly ActionKind[],
  client: LooseRpc = defaultClient(),
): Promise<string[]> {
  const { data, error } = await client.rpc(SET_PLATFORM_ACTIONS_RPC, {
    p_portfolio_id: portfolioId,
    p_platform: platform,
    p_allowed_actions: allowed,
  });
  if (error) {
    if (isMissingRpcError(error)) throw new MissingRpcError(SET_PLATFORM_ACTIONS_RPC);
    const message = (error as { message?: unknown }).message;
    throw new Error(typeof message === 'string' ? message : 'The actions could not be saved.');
  }
  return z.array(z.string()).catch([]).parse(data);
}

export type PlatformActionsState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; platforms: PlatformActions[] };

export function usePortfolioPlatformActions(portfolioId: string): PlatformActionsState {
  const query = useQuery({
    queryKey: platformActionsQueryKey(portfolioId),
    queryFn: () => fetchPlatformActions(portfolioId),
    staleTime: 5 * 60 * 1000,
    retry: (count, error) => !(error instanceof MissingRpcError) && count < 2,
  });
  if (query.data) return { status: 'ready', platforms: query.data };
  if (query.error instanceof MissingRpcError) return { status: 'unavailable' };
  if (query.isError) return { status: 'error' };
  return { status: 'loading' };
}

export function useSetPortfolioPlatformActions(portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ platform, allowed }: { platform: AdPlatform; allowed: readonly ActionKind[] }) =>
      savePlatformActions(portfolioId, platform, allowed),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: platformActionsQueryKey(portfolioId) }),
  });
}
