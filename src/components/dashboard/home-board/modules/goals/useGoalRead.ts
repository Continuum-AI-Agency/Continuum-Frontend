'use client';

// One read of the Goal tile: each ad account's account_overview over a window of complete days,
// asked as an explicit custom range so the edge never counts today's half-written day. The tile
// reads the month so far, and the target's period when that is another window. Meta answers every
// result in one read; Google counts one business result per read, so a Google account is read once
// per result the Home has a goal for (leads, purchases) and put in the Home's words by
// googleOverviewForHome. An account whose read fails is left out; the read fails only when no
// account answers, and keeps every failure so the tile can say why.

import { useEffect, useMemo, useState } from 'react';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';
import {
  GOOGLE_HOME_RESULTS,
  type GoogleHomeResult,
  googleOverviewForHome,
  type HomeAccountOverview,
} from '@/lib/home/homeOverviewModel';
import { fetchPaidAccountOverview } from '@/lib/paid-media/paid-overview.client';
import type { GoalAccountRead, GoalLoad, GoalWindow } from './goalModel';

const IDLE: GoalLoad = { status: 'idle' };
const LOADING: GoalLoad = { status: 'loading' };

async function readGoalAccount(
  brandId: string,
  account: HomeAdAccount,
  readWindow: GoalWindow,
): Promise<HomeAccountOverview> {
  const range = { preset: 'custom' as const, ...readWindow };
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

/** `attempt` is Retry's counter: bumping it reads again with the same inputs. A null window reads
 *  nothing. An answer is kept with the read it answered, so a new window is never shown the last
 *  one's figures while it loads. */
export function useGoalRead(
  brandId: string,
  accounts: HomeAdAccount[],
  readWindow: GoalWindow | null,
  attempt = 0,
): GoalLoad {
  // The accounts as a stable value: a new array holding the same accounts does not read again.
  const accountsKey = JSON.stringify(accounts);
  const stable = useMemo(() => JSON.parse(accountsKey) as HomeAdAccount[], [accountsKey]);
  const since = readWindow?.since ?? null;
  const until = readWindow?.until ?? null;
  const readKey = `${brandId}|${accountsKey}|${since}|${until}|${attempt}`;
  const [settled, setSettled] = useState<{ key: string; load: GoalLoad } | null>(null);

  useEffect(() => {
    if (stable.length === 0 || since === null || until === null) return;
    let cancelled = false;
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
      setSettled({
        key: readKey,
        load:
          reads.length === 0 ? { status: 'error', failures } : { status: 'ready', reads, failures },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [brandId, stable, since, until, readKey]);

  if (stable.length === 0 || since === null || until === null) return IDLE;
  return settled?.key === readKey ? settled.load : LOADING;
}
