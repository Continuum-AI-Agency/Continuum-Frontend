'use client';

// The Google campaigns a portfolio holds, and the one way Manage changes them: the members read
// optimizer_list_portfolio_members (20261015204209), adds through optimizer_add_portfolio_members
// — the wizard's own path, all or nothing — and removals through optimizer_unenroll_entity.
// Meta ad sets keep their own read and save (useOptimizerEnrolledAdsets, optimizer-enroll).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { platformActionsQueryKey } from '../sections/platformActions/usePortfolioPlatformActions';
import { platformCapsQueryKey } from '../sections/platformCaps/usePortfolioPlatformCaps';
import { isMissingRpcError, MissingRpcError } from '../sections/platforms/multiplatformRead';

export const LIST_MEMBERS_RPC = 'optimizer_list_portfolio_members';
export const ADD_MEMBERS_RPC = 'optimizer_add_portfolio_members';
export const REMOVE_MEMBER_RPC = 'optimizer_unenroll_entity';

export const portfolioMembersQueryKey = (portfolioId: string) =>
  ['optimizer', 'portfolio-members', portfolioId] as const;

const MemberRowSchema = z.object({
  platform: z.string(),
  account_id: z.string(),
  entity_id: z.string(),
  level: z.string(),
  name: z.string().nullable(),
  channel_type: z.string().nullable(),
  missing_since: z.string().nullable(),
});

/** One campaign (or group) of another platform than Meta that the portfolio holds. */
export type PortfolioMember = {
  platform: string;
  accountId: string;
  entityId: string;
  level: string;
  name: string | null;
  channelType: string | null;
};

type LooseRpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const defaultClient = () => createSupabaseBrowserClient() as unknown as LooseRpc;

const messageOf = (error: unknown, fallback: string): string => {
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : fallback;
};

export async function fetchPortfolioMembers(
  portfolioId: string,
  client: LooseRpc = defaultClient(),
): Promise<PortfolioMember[]> {
  const { data, error } = await client.rpc(LIST_MEMBERS_RPC, { p_portfolio_id: portfolioId });
  if (error) {
    if (isMissingRpcError(error)) throw new MissingRpcError(LIST_MEMBERS_RPC);
    throw new Error("The portfolio's campaigns could not be read.");
  }
  const parsed = z.array(MemberRowSchema).safeParse(data ?? []);
  if (!parsed.success)
    throw new Error("The portfolio's campaigns came back in an unexpected shape.");
  return parsed.data.map((row) => ({
    platform: row.platform,
    accountId: row.account_id,
    entityId: row.entity_id,
    level: row.level,
    name: row.name,
    channelType: row.channel_type,
  }));
}

export type GoogleMembersChange = {
  accountId: string;
  add: { id: string; name: string }[];
  remove: string[];
};

/** Adds first, in one all-or-nothing call, then each removal; the first refusal stops the save
 *  and is thrown with the database's own words. */
export async function saveGoogleMembers(
  portfolioId: string,
  change: GoogleMembersChange,
  client: LooseRpc = defaultClient(),
): Promise<void> {
  if (change.add.length > 0) {
    const { error } = await client.rpc(ADD_MEMBERS_RPC, {
      p_portfolio_id: portfolioId,
      p_members: change.add.map((campaign) => ({
        platform: 'google_ads',
        account_id: change.accountId,
        entity_id: campaign.id,
        level: 'campaign',
        name: campaign.name,
      })),
    });
    if (error) throw new Error(messageOf(error, 'The campaigns could not be added.'));
  }
  for (const entityId of change.remove) {
    const { error } = await client.rpc(REMOVE_MEMBER_RPC, {
      p_portfolio_id: portfolioId,
      p_platform: 'google_ads',
      p_entity_id: entityId,
    });
    if (error) throw new Error(messageOf(error, 'A campaign could not be removed.'));
  }
}

export type PortfolioMembersState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; members: PortfolioMember[] };

export function usePortfolioMembers(portfolioId: string): PortfolioMembersState {
  const query = useQuery({
    queryKey: portfolioMembersQueryKey(portfolioId),
    queryFn: () => fetchPortfolioMembers(portfolioId),
    staleTime: 5 * 60 * 1000,
    retry: (count, error) => !(error instanceof MissingRpcError) && count < 2,
  });
  if (query.data) return { status: 'ready', members: query.data };
  if (query.error instanceof MissingRpcError) return { status: 'unavailable' };
  if (query.isError) return { status: 'error' };
  return { status: 'loading' };
}

export function useSaveGoogleMembers(portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: GoogleMembersChange) => saveGoogleMembers(portfolioId, change),
    // The list's platforms, the per-platform limits and actions all follow the members.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: portfolioMembersQueryKey(portfolioId) }),
        queryClient.invalidateQueries({ queryKey: ['optimizer', 'portfolios'] }),
        queryClient.invalidateQueries({ queryKey: platformCapsQueryKey(portfolioId) }),
        queryClient.invalidateQueries({ queryKey: platformActionsQueryKey(portfolioId) }),
      ]),
  });
}
