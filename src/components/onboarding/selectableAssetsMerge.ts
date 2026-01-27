import type { OnboardingConnectionAccount, OnboardingState } from "@/lib/onboarding/state";
import type { SelectableAsset, SelectableAssetsResponse } from "@/lib/schemas/integrations";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";

import { PLATFORM_KEYS, type PlatformKey } from "./platforms";
import { resolveSelectableAssetLabel } from "./integrations/selectableAssetUtils";

const GOOGLE_OAUTH_KEYS: PlatformKey[] = ["youtube", "googleAds", "dv360"];
const FACEBOOK_OAUTH_KEYS: PlatformKey[] = ["instagram", "facebook", "threads"];

type MergeSelectableAssetsParams = {
  prevConnections: OnboardingState["connections"];
  selectableAssets: SelectableAsset[];
  selectableAssetsData: SelectableAssetsResponse;
  selectedAccountIdsByKey: Record<PlatformKey, Set<string>>;
  isHydrated: boolean;
};

function getPlatformKeysForProvider(providerKey: string): PlatformKey[] {
  const normalized = providerKey.toLowerCase();
  if (normalized === "meta" || normalized === "facebook") return FACEBOOK_OAUTH_KEYS;
  if (normalized === "google") return GOOGLE_OAUTH_KEYS;
  return PLATFORM_KEYS.filter(key => {
    switch (key) {
      case "youtube":
        return normalized === "youtube";
      case "googleAds":
        return normalized === "google-ads" || normalized === "googleads";
      case "dv360":
        return normalized === "dv360" || normalized === "displayvideo360" || normalized === "display_video_360";
      case "linkedin":
        return normalized === "linkedin";
      case "tiktok":
        return normalized === "tiktok";
      case "amazonAds":
        return normalized === "amazon" || normalized === "amazon-ads" || normalized === "amazonads";
      default:
        return false;
    }
  });
}

function createEmptyConnectionState(): OnboardingState["connections"][PlatformKey] {
  return {
    connected: false,
    accountId: null,
    accounts: [],
    integrationIds: [],
    lastSyncedAt: null,
  };
}

function buildAccountsByPlatform(selectableAssets: SelectableAsset[]): Map<PlatformKey, OnboardingConnectionAccount[]> {
  const accountsByPlatform = new Map<PlatformKey, OnboardingConnectionAccount[]>();

  selectableAssets.forEach(asset => {
    const platformKey = mapIntegrationTypeToPlatformKey(asset.type);
    if (!platformKey) return;
    if (!asset.integration_account_id) return;
    const current = accountsByPlatform.get(platformKey) ?? [];
    current.push({
      id: asset.integration_account_id,
      name: resolveSelectableAssetLabel(asset),
      status: "active",
      selected: undefined,
    });
    accountsByPlatform.set(platformKey, current);
  });

  return accountsByPlatform;
}

export function mergeSelectableAssetsConnections({
  prevConnections,
  selectableAssets,
  selectableAssetsData,
  selectedAccountIdsByKey,
  isHydrated,
}: MergeSelectableAssetsParams): OnboardingState["connections"] | null {
  if (selectableAssets.length === 0) {
    if (!isHydrated) return null;

    const providerKeys = Object.keys(selectableAssetsData.providers ?? {});
    const keysToClear = providerKeys.length > 0
      ? new Set(providerKeys.flatMap(getPlatformKeysForProvider))
      : new Set<PlatformKey>(PLATFORM_KEYS);

    const nextConnections: OnboardingState["connections"] = { ...prevConnections } as OnboardingState["connections"];

    keysToClear.forEach(key => {
      const existing = prevConnections[key] ?? createEmptyConnectionState();
      nextConnections[key] = {
        ...existing,
        connected: false,
        accountId: null,
        accounts: [],
        integrationIds: [],
        lastSyncedAt: selectableAssetsData.synced_at ?? existing.lastSyncedAt,
      } as OnboardingState["connections"][PlatformKey];
    });

    return nextConnections;
  }

  const providersWithAssets = new Set<PlatformKey>();
  selectableAssets.forEach(asset => {
    const platformKey = mapIntegrationTypeToPlatformKey(asset.type);
    if (!platformKey) return;
    providersWithAssets.add(platformKey);
  });

  const accountsByPlatform = buildAccountsByPlatform(selectableAssets);
  const metaIntegrationIds =
    selectableAssetsData.providers?.meta?.hierarchy?.meta?.integrations
      ?.map((integration: { integration_id: string }) => integration.integration_id)
      .filter(Boolean) ?? [];
  const integrationIdsByPlatform = new Map<PlatformKey, string[]>();
  if (metaIntegrationIds.length > 0) {
    integrationIdsByPlatform.set("facebook", metaIntegrationIds);
    integrationIdsByPlatform.set("instagram", metaIntegrationIds);
    integrationIdsByPlatform.set("threads", metaIntegrationIds);
  }

  const keysToUpdate = new Set<PlatformKey>([
    ...Array.from(accountsByPlatform.keys()),
    ...Array.from(integrationIdsByPlatform.keys()),
    ...Array.from(providersWithAssets.keys()),
  ]);

  if (keysToUpdate.size === 0) return null;

  const nextConnections: OnboardingState["connections"] = { ...prevConnections } as OnboardingState["connections"];

  keysToUpdate.forEach(key => {
    const accounts = accountsByPlatform.get(key) ?? [];
    const existing = prevConnections[key] ?? createEmptyConnectionState();
    const mergedAccounts = accounts.map(account => {
      const selectedSet = selectedAccountIdsByKey[key] ?? new Set<string>();
      const existingAccount = existing.accounts?.find(a => a.id === account.id);
      const selectedFromState = selectedSet.has(account.id);
      return existingAccount
        ? { ...existingAccount, ...account, selected: existingAccount.selected ?? (selectedFromState ? true : undefined) }
        : { ...account, selected: selectedFromState ? true : account.selected };
    });

    const existingRemainder = (existing.accounts ?? []).filter(
      account => !mergedAccounts.some(a => a.id === account.id)
    );
    const combinedAccounts = [...mergedAccounts, ...existingRemainder];

    const integrationIds = integrationIdsByPlatform.get(key) ?? existing.integrationIds ?? [];
    nextConnections[key] = {
      connected: combinedAccounts.length > 0 || integrationIds.length > 0 || existing.connected || providersWithAssets.has(key),
      accountId: existing.accountId,
      accounts: combinedAccounts,
      integrationIds,
      lastSyncedAt: selectableAssetsData.synced_at ?? existing.lastSyncedAt,
    } as OnboardingState["connections"][PlatformKey];
  });

  return nextConnections;
}
