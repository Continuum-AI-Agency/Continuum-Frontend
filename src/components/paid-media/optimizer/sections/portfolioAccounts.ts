// Pure account-scoping logic for the optimizer's portfolio surfaces.
//
// optimizer_list_portfolios is BRAND-scoped server-side; the ad-account narrowing is a
// client-side filter. Everything the surface needs to explain or cross that filter —
// which account owns a portfolio, what to call it, and what opening it costs — is decided
// here as pure functions, so the decisions are testable without rendering. The render
// suites in this directory register process-wide partial mocks (bun's mock.module is
// process-wide), which is why the logic lives outside the components.
//
// Cross-BRAND portfolios stay invisible on purpose: that boundary is enforced by the RPC
// and this module never reads across it.

import type { AdAccount, PortfolioListItem } from '@continuum/contracts';

import { bareAccountId } from '@/lib/paid-media/accountId';

/** One ad account that owns portfolios. `accountId` is the id to switch TO — the picker's
 *  canonical id when the account is known, otherwise the value stored on the portfolio.
 *  `known` is false when no assigned ad account matches, in which case switching is not
 *  offered (the picker could not honor it). */
export type HiddenPortfolioAccount = {
  accountId: string;
  label: string;
  known: boolean;
};

/** Which empty state the optimizer should render. `other-account` is the case the notice
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

/** Resolve one stored ad-account id onto the brand's assigned accounts so a surface can name
 *  it the way the picker does. Ids are compared bare — a portfolio stored `act_123` is the
 *  account the picker lists as `123`. */
export function resolvePortfolioAccount(
  storedId: string,
  accounts: AdAccount[],
): HiddenPortfolioAccount {
  const match = accounts.find(
    (account) => bareAccountId(account.account_id) === bareAccountId(storedId),
  );
  if (!match) return { accountId: storedId, label: storedId, known: false };
  return { accountId: match.account_id, label: match.name ?? match.account_id, known: true };
}

export function resolveHiddenAccounts(
  otherAccountIds: string[],
  accounts: AdAccount[],
): HiddenPortfolioAccount[] {
  return otherAccountIds.map((storedId) => resolvePortfolioAccount(storedId, accounts));
}

/** The brand's portfolios bucketed by the ad account that owns them, selected account first. */
export type PortfolioAccountGroup = HiddenPortfolioAccount & {
  isSelected: boolean;
  portfolios: PortfolioListItem[];
};

export function groupPortfoliosByAccount({
  portfolios,
  accounts,
  selectedAdAccountId,
}: {
  portfolios: PortfolioListItem[];
  accounts: AdAccount[];
  selectedAdAccountId: string;
}): PortfolioAccountGroup[] {
  const selectedKey = bareAccountId(selectedAdAccountId);
  const buckets = new Map<string, { storedId: string; portfolios: PortfolioListItem[] }>();

  for (const portfolio of portfolios) {
    // A portfolio with no ad account belongs to EVERY account view — the same rule the
    // single-account filter applies — so it buckets under whichever account is selected.
    const storedId = portfolio.ad_account_id ?? selectedAdAccountId;
    const key = bareAccountId(storedId);
    const bucket = buckets.get(key);
    if (bucket) bucket.portfolios.push(portfolio);
    else buckets.set(key, { storedId, portfolios: [portfolio] });
  }

  const groups = Array.from(buckets.entries()).map(([key, bucket]) => ({
    ...resolvePortfolioAccount(bucket.storedId, accounts),
    isSelected: key === selectedKey,
    portfolios: bucket.portfolios,
  }));

  return groups.sort((left, right) => {
    if (left.isSelected !== right.isSelected) return left.isSelected ? -1 : 1;
    return left.label.localeCompare(right.label);
  });
}

/** What opening a portfolio from the cross-account browser costs.
 *
 *  This is the load-bearing decision. The detail workspace resolves `?portfolio=<id>` against
 *  the ACCOUNT-FILTERED list, so a portfolio on another ad account cannot simply be opened —
 *  the lookup misses and the surface falls through to an empty state. `switch-then-open` says
 *  the selected ad account must move FIRST; the portfolio id then survives the refetch because
 *  it lives in the URL while the account selection is React state. */
export type PortfolioOpenPlan =
  | { kind: 'open'; portfolioId: string }
  | { kind: 'switch-then-open'; portfolioId: string; accountId: string }
  | { kind: 'unavailable'; portfolioId: string; reason: 'unresolvable-account' };

export function planPortfolioOpen({
  portfolioId,
  portfolioAccountId,
  selectedAdAccountId,
  accounts,
}: {
  portfolioId: string;
  portfolioAccountId: string | null;
  selectedAdAccountId: string;
  accounts: AdAccount[];
}): PortfolioOpenPlan {
  if (!portfolioAccountId) return { kind: 'open', portfolioId };
  if (bareAccountId(portfolioAccountId) === bareAccountId(selectedAdAccountId)) {
    return { kind: 'open', portfolioId };
  }
  const owner = resolvePortfolioAccount(portfolioAccountId, accounts);
  // Never offer navigation to an account the picker cannot honor — switching to an id it does
  // not list would strand the user on a blank account instead of the portfolio they clicked.
  if (!owner.known) return { kind: 'unavailable', portfolioId, reason: 'unresolvable-account' };
  return { kind: 'switch-then-open', portfolioId, accountId: owner.accountId };
}
