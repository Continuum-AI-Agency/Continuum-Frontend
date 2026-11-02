'use client';

// The setter behind the "use this goal as the cost cap on the ad platforms" checkbox:
// optimizer_set_portfolio_goal_as_platform_cost_cap (20261031120000). It writes the flag and,
// with it, set_bid_target on the bid-capable platforms' allowed actions, so a success
// invalidates every optimizer read (the portfolio list and the allowed-actions field alike).

import {
  type PortfolioGoalAsCostCapResult,
  PortfolioGoalAsCostCapResultSchema,
} from '@continuum/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { optimizerQueryKeys } from '../../useOptimizerData';
import { goalCostCapErrorMessage } from './goalCostCapModel';

export const SET_GOAL_AS_COST_CAP_RPC = 'optimizer_set_portfolio_goal_as_platform_cost_cap';

type LooseRpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const defaultClient = () => createSupabaseBrowserClient() as unknown as LooseRpc;

/** Resolves to what the database stored; rejects with a sentence a person can read. */
export async function saveGoalAsCostCap(
  portfolioId: string,
  enabled: boolean,
  client: LooseRpc = defaultClient(),
): Promise<PortfolioGoalAsCostCapResult> {
  const { data, error } = await client.rpc(SET_GOAL_AS_COST_CAP_RPC, {
    p_portfolio_id: portfolioId,
    p_enabled: enabled,
  });
  if (error) throw new Error(goalCostCapErrorMessage(error));
  const parsed = PortfolioGoalAsCostCapResultSchema.safeParse(data);
  if (!parsed.success) throw new Error(goalCostCapErrorMessage(null));
  return parsed.data;
}

export function useSetGoalAsCostCap(portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => saveGoalAsCostCap(portfolioId, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: optimizerQueryKeys.root }),
  });
}
