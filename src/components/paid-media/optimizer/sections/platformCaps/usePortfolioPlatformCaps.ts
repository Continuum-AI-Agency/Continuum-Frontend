'use client';

// The per-platform daily cap of one portfolio: optimizer_get_portfolio_platform_caps and
// optimizer_set_portfolio_platform_cap (20261007120000), over
// optimizer.portfolio_platforms.daily_cap_minor — the cap optimizer_reserve_action already
// enforces on every executed action. Three honest read outcomes, as usePortfolioMetrics: the
// rows, "not available yet" (the migration is not applied — a known state, never retried), and
// an error.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isMissingRpcError, MissingRpcError } from '../platforms/multiplatformRead';
import { type AdPlatform, readAdPlatform } from '../platforms/platformTabsModel';

export const GET_PLATFORM_CAPS_RPC = 'optimizer_get_portfolio_platform_caps';
export const SET_PLATFORM_CAP_RPC = 'optimizer_set_portfolio_platform_cap';

export const platformCapsQueryKey = (portfolioId: string) =>
  ['optimizer', 'platform-caps', portfolioId] as const;

/** One platform among the portfolio's members. `currency` is null when its accounts disagree
 *  (no single unit to type a cap in); `dailyCapMinor` is null when it has no platform cap. */
export type PlatformCap = {
  platform: AdPlatform;
  currency: string | null;
  dailyCapMinor: number | null;
  accounts: number;
};

const PlatformCapRowSchema = z.object({
  platform: z.string(),
  currency: z.string().nullable(),
  daily_cap_minor: z.number().int().nonnegative().nullable(),
  accounts: z.number().int().positive(),
});

type LooseRpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const defaultClient = () => createSupabaseBrowserClient() as unknown as LooseRpc;

/** The rows, with any platform the Frontend does not know dropped rather than mislabeled. */
export async function fetchPlatformCaps(
  portfolioId: string,
  client: LooseRpc = defaultClient(),
): Promise<PlatformCap[]> {
  const { data, error } = await client.rpc(GET_PLATFORM_CAPS_RPC, { p_portfolio_id: portfolioId });
  if (error) {
    if (isMissingRpcError(error)) throw new MissingRpcError(GET_PLATFORM_CAPS_RPC);
    throw new Error('The platform limits could not be read.');
  }
  const parsed = z.array(PlatformCapRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new Error('The platform limits read returned an unexpected shape.');
  return parsed.data.flatMap((row) => {
    const platform = readAdPlatform(row.platform);
    return platform
      ? [
          {
            platform,
            currency: row.currency,
            dailyCapMinor: row.daily_cap_minor,
            accounts: row.accounts,
          },
        ]
      : [];
  });
}

/** Set (or clear, with null) one platform's cap. Resolves to the stored cap; throws the
 *  database's own message so the field can show why a save was refused. */
export async function savePlatformCap(
  portfolioId: string,
  platform: AdPlatform,
  dailyCapMinor: number | null,
  client: LooseRpc = defaultClient(),
): Promise<number | null> {
  const { data, error } = await client.rpc(SET_PLATFORM_CAP_RPC, {
    p_portfolio_id: portfolioId,
    p_platform: platform,
    p_daily_cap_minor: dailyCapMinor,
  });
  if (error) {
    if (isMissingRpcError(error)) throw new MissingRpcError(SET_PLATFORM_CAP_RPC);
    const message = (error as { message?: unknown }).message;
    throw new Error(typeof message === 'string' ? message : 'The limit could not be saved.');
  }
  return typeof data === 'number' ? data : null;
}

export type PlatformCapsState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; caps: PlatformCap[] };

/** Whether the portfolio is known to hold a member off Meta. Until a read names its platforms
 *  the portfolio is on Meta — the platform every portfolio the engine runs is on today — so a
 *  missing or failed read never turns a Meta-only portfolio into a multi-platform one. */
export function capsHoldNonMetaMember(state: PlatformCapsState): boolean {
  return state.status === 'ready' && state.caps.some((cap) => cap.platform !== 'meta');
}

export function usePortfolioPlatformCaps(portfolioId: string): PlatformCapsState {
  const query = useQuery({
    queryKey: platformCapsQueryKey(portfolioId),
    queryFn: () => fetchPlatformCaps(portfolioId),
    staleTime: 5 * 60 * 1000,
    retry: (count, error) => !(error instanceof MissingRpcError) && count < 2,
  });
  if (query.data) return { status: 'ready', caps: query.data };
  if (query.error instanceof MissingRpcError) return { status: 'unavailable' };
  if (query.isError) return { status: 'error' };
  return { status: 'loading' };
}

export type SetPlatformCapInput = { platform: AdPlatform; dailyCapMinor: number | null };

export function useSetPortfolioPlatformCap(portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ platform, dailyCapMinor }: SetPlatformCapInput) =>
      savePlatformCap(portfolioId, platform, dailyCapMinor),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformCapsQueryKey(portfolioId) }),
  });
}
