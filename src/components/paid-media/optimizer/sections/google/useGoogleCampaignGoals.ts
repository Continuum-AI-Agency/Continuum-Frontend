'use client';

// Which portfolio holds each Google campaign, and so which CPA goal it is priced against: the
// brand's Google portfolios (optimizer_list_portfolios) and each one's members
// (optimizer_list_portfolio_members, the same cache Manage reads). A members read that failed
// leaves its campaigns unknown, never "in no portfolio".

import { useQueries } from '@tanstack/react-query';
import {
  fetchPortfolioMembers,
  type PortfolioMember,
  portfolioMembersQueryKey,
} from '../../picker/usePortfolioPlatformMembers';
import { useOptimizerPlatformPortfolios } from '../../useOptimizerData';
import { type CampaignGoal, campaignGoals } from './campaignExplorerModel';

export type CampaignGoalsRead =
  | { status: 'loading' }
  /** `unknown` names why a campaign without a goal may still sit in a portfolio. */
  | { status: 'ready'; goals: Map<string, CampaignGoal>; unknown: string | null };

export const MEMBERS_UNREAD =
  "Some portfolios' campaigns could not be read, so its goal is unknown";

export function useGoogleCampaignGoals(brandId: string): CampaignGoalsRead {
  const portfolios = useOptimizerPlatformPortfolios(brandId, 'google_ads');
  const members = useQueries({
    queries: portfolios.data.map((portfolio) => ({
      queryKey: portfolioMembersQueryKey(portfolio.id),
      queryFn: () => fetchPortfolioMembers(portfolio.id),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });
  if (portfolios.isPending || members.some((query) => query.isPending))
    return { status: 'loading' };
  const byPortfolio = new Map<string, PortfolioMember[]>();
  portfolios.data.forEach((portfolio, index) => {
    byPortfolio.set(portfolio.id, members[index]?.data ?? []);
  });
  return {
    status: 'ready',
    goals: campaignGoals(portfolios.data, byPortfolio),
    unknown: portfolios.isError || members.some((query) => query.isError) ? MEMBERS_UNREAD : null,
  };
}
