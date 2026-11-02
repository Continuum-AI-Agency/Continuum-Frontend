// A Google Ads manager (MCC) is how an agency reaches its clients' accounts; it runs no campaigns
// and holds none, so it is never one of a brand's ad accounts. The brand's asset row says so in
// its status ("manager"), which both list_brand_ad_accounts and the integration summary carry —
// the same rule the Home's reading applies when it counts a brand's accounts.

export function isAdsManagerAccount(account: { status?: string | null }): boolean {
  return account.status?.trim().toLowerCase() === 'manager';
}
