'use client';

// Shown when the selected ad account has no portfolios but the brand DOES have them on
// another ad account. That state used to fall into "Set up the Optimizer" onboarding,
// which told the user their work did not exist. It exists — it is one account switch
// away — so this names the owning account(s), offers the switch, and (when more than the
// single-switch shortcut is useful) hands off to the cross-account browser.
//
// The account-resolution logic lives in ./portfolioAccounts so it stays testable without
// rendering; this file is presentation only.

import { ArrowRightLeftIcon, FolderSearchIcon, LibraryIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { HiddenPortfolioAccount } from './portfolioAccounts';

type OptimizerOtherAccountNoticeProps = {
  /** How many portfolios the brand has that this account view is hiding. */
  hiddenCount: number;
  accounts: HiddenPortfolioAccount[];
  onSwitchAccount?: (accountId: string) => void;
  /** Open the cross-account browser. This is the only path into it when the selected
   *  account has no portfolios, because the tabbed view never renders in that state. */
  onBrowseAll?: () => void;
};

export function OptimizerOtherAccountNotice({
  hiddenCount,
  accounts,
  onSwitchAccount,
  onBrowseAll,
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

      {onBrowseAll ? (
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={onBrowseAll}>
          <LibraryIcon className="size-3.5" aria-hidden="true" />
          Browse all {hiddenCount} portfolios
        </Button>
      ) : null}
    </div>
  );
}
