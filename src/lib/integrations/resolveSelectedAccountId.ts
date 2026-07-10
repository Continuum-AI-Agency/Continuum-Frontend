type AccountLike = { integrationAccountId: string };

// Pick which account a per-platform analytics view should show. Prefers the
// user's remembered selection for THAT platform, but only when it is still one
// of the platform's own accounts; otherwise falls back to the platform's first
// account (never another platform's), and null when the platform has none.
//
// Both the initial useState seed and the platform-change effect must call this
// with the platform-scoped account list. Seeding from a different platform's
// list is the YouTube-shows-a-Meta-account bug this prevents.
export function resolveSelectedAccountId(params: {
  brandId: string;
  platform: string;
  platformAccounts: ReadonlyArray<AccountLike>;
  getSelection: (brandId: string, platform: string) => string | null;
}): string | null {
  const { brandId, platform, platformAccounts, getSelection } = params;
  const stored = getSelection(brandId, platform);
  const isValid =
    stored !== null && platformAccounts.some((a) => a.integrationAccountId === stored);
  return isValid ? stored : (platformAccounts[0]?.integrationAccountId ?? null);
}
