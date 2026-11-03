'use client';

// The Goal tile's one read: each ad account's account_overview over the month so far (the 1st
// through yesterday), asked as an explicit custom range so the edge never counts today's half-
// written day. Meta answers every result in one read; Google counts one business result per read,
// so a Google account is read once per result the Home has a goal for (leads, purchases) and put
// in the Home's words by googleOverviewForHome. An account whose read fails is left out; the read
// fails only when no account answers, and keeps every failure so the tile can say why.

import { useEffect, useMemo, useState } from 'react';
import {
  GOOGLE_HOME_RESULTS,
  type GoogleHomeResult,
  googleOverviewForHome,
  type HomeAccountOverview,
} from '@/lib/home/homeOverviewModel';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';
import { fetchPaidAccountOverview } from '@/lib/paid-media/paid-overview.client';
import type { GoalAccountRead, GoalLoad, GoalWindow } from './goalModel';

export async function readGoalAccount(
  brandId: string,
  account: HomeAdAccount,
  monthWindow: GoalWindow,
): Promise<HomeAccountOverview> {
  const range = { preset: 'custom' as const, ...monthWindow };
  if (account.platform === 'meta') {
    return fetchPaidAccountOverview({ brandId, adAccountId: account.id, platform: 'meta', range });
  }
  const [leads, purchases] = await Promise.all(
    GOOGLE_HOME_RESULTS.map((resultBucket: GoogleHomeResult) =>
      fetchPaidAccountOverview({
        brandId,
        adAccountId: account.id,
        platform: 'google-ads',
        range,
        resultBucket,
      }),
    ),
  );
  return googleOverviewForHome({ leads: leads ?? null, purchases: purchases ?? null });
}

/** `attempt` is Retry's counter: bumping it reads again with the same inputs. */
export function useGoalMonthToDate(
  brandId: string,
  accounts: HomeAdAccount[],
  monthWindow: GoalWindow | null,
  attempt = 0,
): GoalLoad {
  // The accounts as a stable value: a new array holding the same accounts does not read again.
  const key = JSON.stringify(accounts);
  const stable = useMemo(() => JSON.parse(key) as HomeAdAccount[], [key]);
  const since = monthWindow?.since ?? null;
  const until = monthWindow?.until ?? null;
  const idle = stable.length === 0 || since === null || until === null;
  const [state, setState] = useState<GoalLoad>(idle ? { status: 'idle' } : { status: 'loading' });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is Retry's counter; a new value is a new read.
  useEffect(() => {
    if (stable.length === 0 || since === null || until === null) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    Promise.allSettled(
      stable.map((account) => readGoalAccount(brandId, account, { since, until })),
    ).then((results) => {
      if (cancelled) return;
      const reads: GoalAccountRead[] = [];
      const failures: { account: HomeAdAccount; error: unknown }[] = [];
      results.forEach((result, index) => {
        const account = stable[index];
        if (!account) return;
        if (result.status === 'fulfilled') reads.push({ account, overview: result.value });
        else failures.push({ account, error: result.reason as unknown });
      });
      setState(
        reads.length === 0 ? { status: 'error', failures } : { status: 'ready', reads, failures },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [brandId, stable, since, until, attempt]);

  return state;
}
