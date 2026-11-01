// The currency a portfolio's own figures are in.
//
// A portfolio is stamped with its currency when it is created (optimizer_create_portfolio and
// optimizer_create_platform_portfolio), and every figure the Optimizer computes for it is in that
// currency. The account list (plugin_mcp.list_brand_ad_accounts) is the fallback, not the source:
// a Google customer's asset row carries no currency at all, so a Google portfolio priced from its
// account row printed bare money beside a headline that said "$24.13 MXN" (deep test 2026-10-31).
//
// `accountCurrency` must be the PORTFOLIO's account's code, never the selected account's: a
// portfolio on another account is in that account's currency.

import type { PortfolioListItem } from '@continuum/contracts';
import { normalizeCurrency } from './format';

export function portfolioCurrency(
  portfolio: Pick<PortfolioListItem, 'currency'>,
  accountCurrency: string | null | undefined,
): string | null {
  return normalizeCurrency(portfolio.currency) ?? normalizeCurrency(accountCurrency);
}
