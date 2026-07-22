import type { InstagramAccountOption } from '@/components/dashboard/InstagramOrganicReportingWidget';
import { useAccountSelectionStore } from '@/lib/integrations/accountSelectionStore';

export type ResolvedOrganicAccount = {
  account: InstagramAccountOption;
  platform: 'instagram' | 'youtube';
};

function remembered(brandId: string, platform: 'instagram' | 'youtube'): string | null {
  return useAccountSelectionStore.getState().getSelection(brandId, platform);
}

// Prefer the account the user last viewed (shared selection store — the same one
// the organic reporting widget writes to), falling back to the first connected
// account. Keeps the whole organic view (stat cards, creatives, widget) on one
// account instead of splitting across the default and the remembered one.
export function resolveOrganicAccount(
  brandId: string,
  accounts: InstagramAccountOption[],
  youtubeAccounts: InstagramAccountOption[],
): ResolvedOrganicAccount | null {
  const igRemembered = remembered(brandId, 'instagram');
  const igAccount = igRemembered
    ? accounts.find((account) => account.integrationAccountId === igRemembered)
    : undefined;
  if (igAccount) return { account: igAccount, platform: 'instagram' };
  if (accounts.length > 0) return { account: accounts[0], platform: 'instagram' };

  const ytRemembered = remembered(brandId, 'youtube');
  const ytAccount = ytRemembered
    ? youtubeAccounts.find((account) => account.integrationAccountId === ytRemembered)
    : undefined;
  if (ytAccount) return { account: ytAccount, platform: 'youtube' };
  if (youtubeAccounts.length > 0) return { account: youtubeAccounts[0], platform: 'youtube' };

  return null;
}
