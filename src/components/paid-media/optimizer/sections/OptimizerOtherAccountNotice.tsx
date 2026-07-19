'use client';

// Shown when the selected ad account has no portfolios but the brand DOES have them on
// another ad account. That state used to fall into "Set up the Optimizer" onboarding,
// which told the user their work did not exist. It exists — it is one account switch
// away — so this names the owning account(s) and offers the switch.
//
// Cross-BRAND portfolios stay invisible on purpose: optimizer_list_portfolios is
// brand-scoped server-side, and this surface never reads across that boundary.

import type { AdAccount } from '@continuum/contracts';
import { ArrowRightLeftIcon, FolderSearchIcon } from 'lucide-react';

import { bareAccountId } from '@/lib/paid-media/accountId';
import { Button } from '@/components/ui/button';

/** One ad account that owns portfolios hidden by the current selection. `accountId` is the
 *  id to switch TO — the picker's canonical id when the account is known, otherwise the
 *  value stored on the portfolio. `known` is false when no assigned ad account matches,
 *  in which case switching is not offered (the picker could not honor it). */
export type HiddenPortfolioAccount = {
  accountId: string;
  label: string;
  known: boolean;
};

/** Which empty state the optimizer should render. `other-account` is the case this module
 *  exists for; `onboarding` means the brand genuinely has no portfolios. */
export type EmptyPortfolioState = 'onboarding' | 'other-account';

export function resolveEmptyPortfolioState(scope: {
  brandPortfolioCount: number;
  otherAccountIds: string[];
}): EmptyPortfolioState {
  return scope.brandPortfolioCount > 0 && scope.otherAccountIds.length > 0
    ? 'other-account'
    : 'onboarding';
}

/** Resolve the stored ad-account ids onto the brand's assigned accounts so the notice can
 *  name them the way the picker does. Ids are compared bare — a portfolio stored `act_123`
 *  is the account the picker lists as `123`. */
export function resolveHiddenAccounts(
  otherAccountIds: string[],
  accounts: AdAccount[],
): HiddenPortfolioAccount[] {
  return otherAccountIds.map((storedId) => {
    const match = accounts.find(
      (account) => bareAccountId(account.account_id) === bareAccountId(storedId),
    );
    if (!match) return { accountId: storedId, label: storedId, known: false };
    return {
      accountId: match.account_id,
      label: match.name ?? match.account_id,
      known: true,
    };
  });
}

type OptimizerOtherAccountNoticeProps = {
  /** How many portfolios the brand has that this account view is hiding. */
  hiddenCount: number;
  accounts: HiddenPortfolioAccount[];
  onSwitchAccount?: (accountId: string) => void;
};

export function OptimizerOtherAccountNotice({
  hiddenCount,
  accounts,
  onSwitchAccount,
}: OptimizerOtherAccountNoticeProps) {
  const portfolioLabel = hiddenCount === 1 ? '1 portfolio' : `${hiddenCount} portfolios`;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
      <span className="grid size-10 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground">
        <FolderSearchIcon className="size-4" aria-hidden="true" />
      </span>
      <div className="space-y-1.5">
        <h2 className="font-semibold text-sm tracking-tight">No portfolios on this ad account</h2>
        <p className="text-muted-foreground text-xs">
          This brand has {portfolioLabel} on{' '}
          {accounts.length === 1 ? 'another ad account' : `${accounts.length} other ad accounts`}.
          Switch accounts to see {accounts.length === 1 ? 'it' : 'them'}, or create a portfolio for
          this account.
        </p>
      </div>

      <ul className="flex w-full flex-col gap-2">
        {accounts.map((account) => (
          <li
            key={account.accountId}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-3 py-2 text-left"
          >
            <span className="min-w-0 truncate font-medium text-xs">{account.label}</span>
            {account.known && onSwitchAccount ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1.5 text-xs"
                onClick={() => onSwitchAccount(account.accountId)}
              >
                <ArrowRightLeftIcon className="size-3.5" aria-hidden="true" />
                Switch
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
