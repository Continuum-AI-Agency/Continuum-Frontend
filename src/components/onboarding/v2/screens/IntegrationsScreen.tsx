import { useCallback, useMemo, useState, useTransition } from "react";
import { motion } from "motion/react";
import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import {
  IntegrationSwitcher,
  type IntegrationSwitcherData,
  type IntegrationSwitcherItem,
  type IntegrationSwitcherTab,
} from "@/components/shadcn-studio/card/integration-switcher";
import {
  assignBrandIntegrationAccount,
  startGoogleSync,
  startMetaSync,
  startTikTokSync,
  unassignBrandIntegrationAccount,
  useUserIntegrationAssets,
  type UserIntegrationAssetRow,
} from "@/lib/api/integrations";
import { applyBrandIntegrationAssignmentsAction } from "@/app/(post-auth)/settings/integrations/actions";
import { openCenteredPopup, waitForPopupClosed } from "@/lib/popup";
import { useBrandAssignedAccountIds } from "@/hooks/useBrandAssignedAccountIds";
import { useToast } from "@/components/ui/ToastProvider";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";
import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
  PROVIDER_GROUP_ICONS,
} from "@/components/settings/shell/platformIcons";
import { trackOnboardingEvent } from "@/lib/onboarding/telemetry";
import type { PlatformKey } from "@/components/onboarding/platforms";

type ProviderGroup = "meta" | "google" | "tiktok";

const META_GOOGLE_TIKTOK: Record<string, ProviderGroup> = {
  meta: "meta",
  facebook: "meta",
  instagram: "meta",
  threads: "meta",
  googleAds: "google",
  youtube: "google",
  dv360: "google",
  google: "google",
  tiktok: "tiktok",
};

const SYNC_LABEL_BY_GROUP: Record<ProviderGroup, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
};

function buildOAuthCallbackUrl(group: ProviderGroup, brandId: string): string {
  if (typeof window === "undefined") return "";
  const url = new URL("/integrations/callback", window.location.origin);
  url.searchParams.set("provider", group);
  url.searchParams.set("context", brandId);
  return url.toString();
}

type IntegrationsScreenProps = {
  onAdvance: () => void;
};

const META_PLATFORMS: ReadonlySet<PlatformKey> = new Set([
  "facebook",
  "instagram",
  "threads",
]);
const META_TAB_ID = "meta";

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const } },
};

function buildAssetItem(
  asset: UserIntegrationAssetRow,
  platform: PlatformKey,
  assignedSet: Set<string>
): IntegrationSwitcherItem {
  return {
    id: asset.id,
    code: asset.external_account_id ?? asset.id.slice(0, 8),
    title: asset.name?.trim() || asset.external_account_id || "Unnamed account",
    icon: PLATFORM_ICONS[platform] ?? Plug,
    status: assignedSet.has(asset.id) ? "checked" : "copy",
  };
}

type ClassifiedAssets = {
  metaAssets: UserIntegrationAssetRow[];
  otherByPlatform: Map<PlatformKey, UserIntegrationAssetRow[]>;
};

function classifyAssets(userAssets: UserIntegrationAssetRow[]): ClassifiedAssets {
  const metaAssets: UserIntegrationAssetRow[] = [];
  const otherByPlatform = new Map<PlatformKey, UserIntegrationAssetRow[]>();
  for (const asset of userAssets) {
    const platform = mapIntegrationTypeToPlatformKey(asset.type);
    if (!platform) continue;
    if (META_PLATFORMS.has(platform)) {
      metaAssets.push(asset);
    } else {
      const existing = otherByPlatform.get(platform) ?? [];
      existing.push(asset);
      otherByPlatform.set(platform, existing);
    }
  }
  return { metaAssets, otherByPlatform };
}

function buildMetaItems(
  metaAssets: UserIntegrationAssetRow[],
  assignedSet: Set<string>
): { items: IntegrationSwitcherItem[]; childrenByParent: Map<string, string[]> } {
  const adAccounts: UserIntegrationAssetRow[] = [];
  const childrenByAdAccountKey = new Map<string, UserIntegrationAssetRow[]>();
  const orphans: UserIntegrationAssetRow[] = [];

  for (const asset of metaAssets) {
    const isAdAccount = mapIntegrationTypeToPlatformKey(asset.type) === "facebook" &&
      (asset.type ?? "").toLowerCase().includes("ad_account");
    if (isAdAccount) {
      adAccounts.push(asset);
      continue;
    }
    if (asset.ad_account_id) {
      const existing = childrenByAdAccountKey.get(asset.ad_account_id) ?? [];
      existing.push(asset);
      childrenByAdAccountKey.set(asset.ad_account_id, existing);
    } else {
      orphans.push(asset);
    }
  }

  adAccounts.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  orphans.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  const items: IntegrationSwitcherItem[] = [];
  const childrenByParent = new Map<string, string[]>();

  for (const adAccount of adAccounts) {
    const childKey = adAccount.ad_account_id ?? adAccount.external_account_id?.replace(/^act_/, "") ?? "";
    const childRows = (childrenByAdAccountKey.get(childKey) ?? []).slice();
    childRows.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    const childItems = childRows.map((child) =>
      buildAssetItem(child, mapIntegrationTypeToPlatformKey(child.type) ?? "facebook", assignedSet)
    );
    items.push({
      ...buildAssetItem(adAccount, "facebook", assignedSet),
      children: childItems.length > 0 ? childItems : undefined,
    });
    if (childItems.length > 0) {
      childrenByParent.set(adAccount.id, childRows.map((c) => c.id));
    }
    childrenByAdAccountKey.delete(childKey);
  }

  // Children whose parent ad-account isn't in the user's synced list — surface them flat at the bottom.
  for (const [, childRows] of childrenByAdAccountKey) {
    for (const child of childRows) orphans.push(child);
  }
  orphans.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  for (const orphan of orphans) {
    const platform = mapIntegrationTypeToPlatformKey(orphan.type) ?? "facebook";
    items.push(buildAssetItem(orphan, platform, assignedSet));
  }

  return { items, childrenByParent };
}

export function IntegrationsScreen({ onAdvance }: IntegrationsScreenProps) {
  const { brandId } = useOnboarding();
  const { show } = useToast();

  const { data: userAssets = [], isLoading: assetsLoading, refetch: refetchUserAssets } = useUserIntegrationAssets();
  const { assignedIds, refresh: refreshAssigned } = useBrandAssignedAccountIds(brandId);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [syncingTabIds, setSyncingTabIds] = useState<Set<string>>(new Set());
  const [clearing, startClearing] = useTransition();

  const { tabs, data, childrenByParent } = useMemo(() => {
    const assignedSet = new Set(assignedIds);
    const { metaAssets, otherByPlatform } = classifyAssets(userAssets);

    const tabs: IntegrationSwitcherTab[] = [];
    const data: IntegrationSwitcherData = {};
    let childrenByParent = new Map<string, string[]>();

    if (metaAssets.length > 0) {
      const meta = buildMetaItems(metaAssets, assignedSet);
      tabs.push({
        id: META_TAB_ID,
        name: "Meta",
        icon: PROVIDER_GROUP_ICONS.facebook,
      });
      data[META_TAB_ID] = meta.items;
      childrenByParent = meta.childrenByParent;
    }

    const otherKeys = Array.from(otherByPlatform.keys()).sort((a, b) =>
      (PLATFORM_LABELS[a] ?? a).localeCompare(PLATFORM_LABELS[b] ?? b)
    );
    for (const key of otherKeys) {
      tabs.push({
        id: key,
        name: PLATFORM_LABELS[key] ?? key,
        icon: PLATFORM_ICONS[key] ?? Plug,
      });
      const items = (otherByPlatform.get(key) ?? [])
        .map((asset) => buildAssetItem(asset, key, assignedSet))
        .sort((a, b) => a.title.localeCompare(b.title));
      data[key] = items;
    }

    return { tabs, data, childrenByParent };
  }, [userAssets, assignedIds]);

  const markPending = useCallback((ids: string[], pending: boolean) => {
    setPendingIds((prev) => {
      const draft = new Set(prev);
      for (const id of ids) {
        if (pending) draft.add(id);
        else draft.delete(id);
      }
      return draft;
    });
  }, []);

  const handleToggle = useCallback(
    async (tabId: string, assetId: string, next: boolean) => {
      const assignedSet = new Set(assignedIds);
      const cascadeChildren = next
        ? (childrenByParent.get(assetId) ?? []).filter((childId) => !assignedSet.has(childId))
        : [];
      const allIds = [assetId, ...cascadeChildren];

      markPending(allIds, true);
      try {
        if (next) {
          await Promise.all(allIds.map((id) => assignBrandIntegrationAccount(brandId, id)));
          trackOnboardingEvent("onboarding_asset_assigned", {
            provider: tabId,
            cascaded: cascadeChildren.length,
          });
        } else {
          await unassignBrandIntegrationAccount(brandId, assetId);
          trackOnboardingEvent("onboarding_asset_unassigned", { provider: tabId });
        }
        await refreshAssigned();
      } catch (error) {
        show({
          title: next ? "Couldn't link account" : "Couldn't unlink account",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "error",
        });
      } finally {
        markPending(allIds, false);
      }
    },
    [brandId, assignedIds, childrenByParent, refreshAssigned, show, markPending]
  );

  const markSyncing = useCallback((tabId: string, syncing: boolean) => {
    setSyncingTabIds((prev) => {
      const draft = new Set(prev);
      if (syncing) draft.add(tabId);
      else draft.delete(tabId);
      return draft;
    });
  }, []);

  const handleSync = useCallback(
    async (tabId: string) => {
      const group = META_GOOGLE_TIKTOK[tabId];
      if (!group) {
        show({
          title: "Sync not supported",
          description: "This provider can't be connected from here yet.",
          variant: "error",
        });
        return;
      }

      markSyncing(tabId, true);
      try {
        const callbackUrl = buildOAuthCallbackUrl(group, brandId);
        const startFn =
          group === "meta" ? startMetaSync : group === "tiktok" ? startTikTokSync : startGoogleSync;
        const { url } = await startFn(callbackUrl);

        trackOnboardingEvent("onboarding_oauth_started", { provider: group });

        const popup = openCenteredPopup(url, `Connect ${SYNC_LABEL_BY_GROUP[group]}`, 600, 700);
        if (!popup) {
          show({
            title: "Couldn't open OAuth popup",
            description: "Please allow popups for this site and try again.",
            variant: "error",
          });
          return;
        }
        await waitForPopupClosed(popup);
        await refetchUserAssets();
        await refreshAssigned();
        trackOnboardingEvent("onboarding_oauth_completed", { provider: group });
      } catch (error) {
        trackOnboardingEvent("onboarding_oauth_failed", {
          provider: group,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        show({
          title: "Couldn't start sync",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "error",
        });
      } finally {
        markSyncing(tabId, false);
      }
    },
    [brandId, markSyncing, refetchUserAssets, refreshAssigned, show]
  );

  const handleClearAll = useCallback(() => {
    startClearing(async () => {
      try {
        await applyBrandIntegrationAssignmentsAction(brandId, []);
        await refreshAssigned();
        trackOnboardingEvent("onboarding_assets_cleared", {});
      } catch (error) {
        show({
          title: "Couldn't clear accounts",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "error",
        });
      }
    });
  }, [brandId, refreshAssigned, show]);

  const syncLabel = useCallback((tabId: string, hasItems: boolean) => {
    const group = META_GOOGLE_TIKTOK[tabId];
    const providerLabel = group ? SYNC_LABEL_BY_GROUP[group] : (PLATFORM_LABELS[tabId as PlatformKey] ?? tabId);
    return hasItems ? `Sync more from ${providerLabel}` : `Connect ${providerLabel}`;
  }, []);

  const isEmpty = !assetsLoading && tabs.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-10 md:px-8">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="flex flex-1 flex-col gap-6"
      >
        <motion.header variants={item} className="text-center">
          <h2 className="text-balance text-[28px] font-bold tracking-tight text-[#0b1220] md:text-[32px]">
            Tag accounts to this brand
          </h2>
          <p className="mt-1.5 text-[13px] text-[#64748b]">
            Pick the specific accounts this brand should use. You can change this any time in
            Settings.
          </p>
          {assignedIds.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearing}
              className="mt-2 text-[12px] text-[#94a3b8] underline-offset-2 hover:text-[#64748b] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {clearing ? "Clearing…" : "Clear all"}
            </button>
          )}
        </motion.header>

        <motion.div variants={item} className="mx-auto w-full max-w-[880px]">
          {isEmpty ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 px-5 py-10 text-center">
              <Plug className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium text-foreground">No connected accounts yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Connect a provider to start tagging its accounts to this brand.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {(["meta", "google", "tiktok"] as ProviderGroup[]).map((group) => (
                  <Button
                    key={group}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSync(group)}
                    disabled={syncingTabIds.has(group)}
                  >
                    {syncingTabIds.has(group)
                      ? `Connecting ${SYNC_LABEL_BY_GROUP[group]}…`
                      : `Connect ${SYNC_LABEL_BY_GROUP[group]}`}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <IntegrationSwitcher
              integrations={tabs}
              data={data}
              onItemToggle={handleToggle}
              pendingItemIds={pendingIds}
              onSyncClick={handleSync}
              syncLabel={syncLabel}
              syncingTabIds={syncingTabIds}
              className="max-w-none"
              maxItemHeight="50vh"
              emptyState={
                <p className="text-xs text-muted-foreground">No accounts on this provider yet.</p>
              }
            />
          )}
        </motion.div>

        <motion.div variants={item} className="flex flex-col items-center gap-2 pt-1">
          <Button variant="link" size="sm" onClick={onAdvance} className="text-[#64748b]">
            Continue
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
