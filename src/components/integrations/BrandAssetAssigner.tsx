'use client';

// Shared "tag accounts to this brand" surface. Connects providers via OAuth and
// assigns the resulting accounts to a brand profile. Used by the onboarding
// integrations step and the dedicated /integrations quick-assign route. Keep this
// component onboarding-agnostic: callers supply the brand id, optional header
// chrome, an optional footer, and an optional telemetry sink.

import { Loader2, Plug, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { type ReactNode, useCallback, useMemo, useState, useTransition } from 'react';
import { applyBrandIntegrationAssignmentsAction } from '@/app/(post-auth)/settings/integrations/actions';
import type { PlatformKey } from '@/components/onboarding/platforms';
import {
  isProviderComingSoon,
  PLATFORM_ICONS,
  PLATFORM_LABELS,
  PROVIDER_GROUP_DESCRIPTIONS,
  PROVIDER_GROUP_ICONS,
  PROVIDER_GROUP_LABELS,
  PROVIDER_GROUPS,
  type ProviderGroup,
} from '@/components/settings/shell/platformIcons';
import {
  IntegrationSwitcher,
  type IntegrationSwitcherData,
  type IntegrationSwitcherItem,
  type IntegrationSwitcherTab,
} from '@/components/shadcn-studio/card/integration-switcher';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/ToastProvider';
import { useBrandAssignedAccountIds } from '@/hooks/useBrandAssignedAccountIds';
import { useMetaAutoResync } from '@/hooks/useMetaAutoResync';
import {
  assignBrandIntegrationAccount,
  type LinkedInSyncMode,
  startGoogleSync,
  startLinkedInSync,
  startMetaSync,
  startTikTokSync,
  startXSync,
  type UserIntegrationAssetRow,
  unassignBrandIntegrationAccount,
  useUserIntegrationAssets,
} from '@/lib/api/integrations';
import { isHigherPrivilegeRole, isReadOnlyMetaRole } from '@/lib/integrations/metaRole';
import { mapIntegrationTypeToPlatformKey } from '@/lib/integrations/platform';
import { openCenteredPopup, waitForOAuthCompletion } from '@/lib/popup';
import { cn } from '@/lib/utils';

export type AssignerTrackEvent =
  | 'asset_assigned'
  | 'asset_unassigned'
  | 'assets_cleared'
  | 'oauth_started'
  | 'oauth_completed'
  | 'oauth_failed';

export type AssignerHeaderState = {
  assignedCount: number;
  clearAll: () => void;
  clearing: boolean;
};

// Resolves both tab ids (a PlatformKey, or META_TAB_ID for the collapsed Meta
// tab) and provider-group ids to the OAuth provider that owns them.
const PROVIDER_GROUP_BY_ID: Record<string, ProviderGroup> = {
  meta: 'facebook',
  facebook: 'facebook',
  instagram: 'facebook',
  threads: 'facebook',
  googleAds: 'google',
  youtube: 'google',
  dv360: 'google',
  googleAnalytics: 'google',
  google: 'google',
  tiktok: 'tiktok',
  linkedin: 'linkedin',
  x: 'x',
};

const META_PLATFORMS: ReadonlySet<PlatformKey> = new Set(['facebook', 'instagram', 'threads']);
const META_TAB_ID = 'meta';

type SyncOptions = { linkedinMode?: LinkedInSyncMode };

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const } },
};

function countAssetsForGroup(assets: UserIntegrationAssetRow[], group: ProviderGroup): number {
  let count = 0;
  for (const asset of assets) {
    const platform = mapIntegrationTypeToPlatformKey(asset.type);
    if (!platform) continue;
    if (PROVIDER_GROUP_BY_ID[platform] === group) count += 1;
  }
  return count;
}

function buildOAuthCallbackUrl(group: ProviderGroup, brandId: string): string {
  if (typeof window === 'undefined') return '';
  const url = new URL('/integrations/callback', window.location.origin);
  url.searchParams.set('provider', group);
  url.searchParams.set('context', brandId);
  return url.toString();
}

function buildAssetItem(
  asset: UserIntegrationAssetRow,
  platform: PlatformKey,
  assignedSet: Set<string>,
): IntegrationSwitcherItem {
  return {
    id: asset.id,
    code: asset.external_account_id ?? asset.id.slice(0, 8),
    title: asset.name?.trim() || asset.external_account_id || 'Unnamed account',
    icon: PLATFORM_ICONS[platform] ?? Plug,
    status: assignedSet.has(asset.id) ? 'checked' : 'copy',
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

function adAccountKeyFor(asset: UserIntegrationAssetRow): string {
  return asset.ad_account_id ?? asset.external_account_id?.replace(/^act_/, '') ?? asset.id;
}

function buildMetaItems(
  metaAssets: UserIntegrationAssetRow[],
  assignedSet: Set<string>,
): { items: IntegrationSwitcherItem[]; childrenByParent: Map<string, string[]> } {
  // #155: the same ad account reachable via two logins arrives as two rows
  // sharing an ad_account_id. Collapse by real ad-account id, keeping the
  // highest-privilege login's row so the account stays fully actionable.
  const adAccountByKey = new Map<string, UserIntegrationAssetRow>();
  const childrenByAdAccountKey = new Map<string, UserIntegrationAssetRow[]>();
  const orphans: UserIntegrationAssetRow[] = [];

  for (const asset of metaAssets) {
    const isAdAccount =
      mapIntegrationTypeToPlatformKey(asset.type) === 'facebook' &&
      (asset.type ?? '').toLowerCase().includes('ad_account');
    if (isAdAccount) {
      const key = adAccountKeyFor(asset);
      const existing = adAccountByKey.get(key);
      if (!existing || isHigherPrivilegeRole(asset.role ?? 'unknown', existing.role ?? 'unknown')) {
        adAccountByKey.set(key, asset);
      }
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

  const adAccounts = Array.from(adAccountByKey.values()).sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? ''),
  );
  orphans.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  const items: IntegrationSwitcherItem[] = [];
  const childrenByParent = new Map<string, string[]>();

  for (const adAccount of adAccounts) {
    const childKey = adAccountKeyFor(adAccount);
    const childRows = (childrenByAdAccountKey.get(childKey) ?? []).slice();
    childRows.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    const childItems = childRows.map((child) =>
      buildAssetItem(child, mapIntegrationTypeToPlatformKey(child.type) ?? 'facebook', assignedSet),
    );
    items.push({
      ...buildAssetItem(adAccount, 'facebook', assignedSet),
      subtitle: isReadOnlyMetaRole(adAccount.role) ? 'Read-only' : undefined,
      children: childItems.length > 0 ? childItems : undefined,
    });
    if (childItems.length > 0) {
      childrenByParent.set(
        adAccount.id,
        childRows.map((c) => c.id),
      );
    }
    childrenByAdAccountKey.delete(childKey);
  }

  // Children whose parent ad-account isn't in the user's synced list — surface them flat at the bottom.
  for (const [, childRows] of childrenByAdAccountKey) {
    for (const child of childRows) orphans.push(child);
  }
  orphans.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  for (const orphan of orphans) {
    const platform = mapIntegrationTypeToPlatformKey(orphan.type) ?? 'facebook';
    items.push(buildAssetItem(orphan, platform, assignedSet));
  }

  return { items, childrenByParent };
}

// The provider chips are derived from assets the user has already synced, so
// they can never offer a provider that isn't connected yet. This is the one
// control that can, and it has to hang off the populated tab row as well as the
// empty state — otherwise a user with a single Meta connection is stuck with
// Meta forever.
function ProviderConnectMenu({
  onConnect,
  syncingGroups,
  children,
}: {
  onConnect: (group: ProviderGroup, options?: SyncOptions) => void;
  syncingGroups: Set<string>;
  children?: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {children ?? (
          <button
            type="button"
            aria-label="Connect a provider"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="px-2 py-1.5">
          <p className="text-sm font-semibold text-foreground">Connect a provider</p>
          <p className="text-xs text-muted-foreground">
            Sign in to pull its accounts into the list above.
          </p>
        </div>
        <div className="mt-1 space-y-1">
          {PROVIDER_GROUPS.map((group) => {
            const comingSoon = isProviderComingSoon(group);
            const syncing = syncingGroups.has(group);
            const Icon = PROVIDER_GROUP_ICONS[group];
            return (
              <div
                key={group}
                className={cn(
                  'flex items-center gap-3 rounded-md px-2 py-2',
                  comingSoon ? 'opacity-60' : 'hover:bg-muted/40',
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {PROVIDER_GROUP_LABELS[group]}
                    </p>
                    {comingSoon ? (
                      <Badge variant="secondary" className="h-4 px-1.5 text-2xs">
                        Coming soon
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {PROVIDER_GROUP_DESCRIPTIONS[group]}
                  </p>
                </div>
                {comingSoon ? (
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled>
                    Coming soon
                  </Button>
                ) : group === 'linkedin' ? (
                  // LinkedIn Ads and LinkedIn Organic are separate OAuth apps
                  // with separate scopes, so neither can stand in for the other.
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => onConnect(group, { linkedinMode: 'paid' })}
                      disabled={syncing}
                    >
                      <Plus className="h-3 w-3" />
                      Ads
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => onConnect(group, { linkedinMode: 'organic' })}
                      disabled={syncing}
                    >
                      Organic
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => onConnect(group)}
                    disabled={syncing}
                  >
                    {syncing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    {syncing ? 'Connecting…' : 'Connect'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type BrandAssetAssignerProps = {
  brandId: string;
  onTrack?: (
    event: AssignerTrackEvent,
    payload?: Record<string, string | number | boolean | null | undefined>,
  ) => void;
  renderHeader?: (state: AssignerHeaderState) => ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function BrandAssetAssigner({
  brandId,
  onTrack,
  renderHeader,
  footer,
  className,
}: BrandAssetAssignerProps) {
  const { show } = useToast();

  const {
    data: userAssets = [],
    isLoading: assetsLoading,
    refetch: refetchUserAssets,
  } = useUserIntegrationAssets();
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
        name: 'Meta',
        icon: PROVIDER_GROUP_ICONS.facebook,
      });
      data[META_TAB_ID] = meta.items;
      childrenByParent = meta.childrenByParent;
    }

    const otherKeys = Array.from(otherByPlatform.keys()).sort((a, b) =>
      (PLATFORM_LABELS[a] ?? a).localeCompare(PLATFORM_LABELS[b] ?? b),
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

  // #154 fingerprint: Meta is connected (pages/IG synced) but no ad account came
  // through. Precise so a never-connected user never triggers a no-op resync.
  const metaConnectedButNoAdAccounts = useMemo(() => {
    let hasMetaAsset = false;
    let hasMetaAdAccount = false;
    for (const asset of userAssets) {
      const platform = mapIntegrationTypeToPlatformKey(asset.type);
      if (platform && META_PLATFORMS.has(platform)) {
        hasMetaAsset = true;
        if ((asset.type ?? '').toLowerCase().includes('ad_account')) hasMetaAdAccount = true;
      }
    }
    return hasMetaAsset && !hasMetaAdAccount;
  }, [userAssets]);

  const { isResyncing, resyncError, triggerResync } = useMetaAutoResync({
    enabled: !assetsLoading,
    isMetaEmpty: metaConnectedButNoAdAccounts,
    onResynced: async () => {
      await refetchUserAssets();
    },
  });

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
          onTrack?.('asset_assigned', { provider: tabId, cascaded: cascadeChildren.length });
        } else {
          await unassignBrandIntegrationAccount(brandId, assetId);
          onTrack?.('asset_unassigned', { provider: tabId });
        }
        await refreshAssigned();
      } catch (error) {
        show({
          title: next ? "Couldn't link account" : "Couldn't unlink account",
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'error',
        });
      } finally {
        markPending(allIds, false);
      }
    },
    [brandId, assignedIds, childrenByParent, refreshAssigned, show, markPending, onTrack],
  );

  const markSyncing = useCallback((ids: string[], syncing: boolean) => {
    setSyncingTabIds((prev) => {
      const draft = new Set(prev);
      for (const id of ids) {
        if (syncing) draft.add(id);
        else draft.delete(id);
      }
      return draft;
    });
  }, []);

  const handleSync = useCallback(
    async (tabId: string, options?: SyncOptions) => {
      const group = PROVIDER_GROUP_BY_ID[tabId];
      if (!group) {
        show({
          title: 'Sync not supported',
          description: "This provider can't be connected from here yet.",
          variant: 'error',
        });
        return;
      }

      const providerLabel = PROVIDER_GROUP_LABELS[group];

      if (isProviderComingSoon(group)) {
        show({
          title: `${providerLabel} is coming soon`,
          description: "This integration isn't available yet.",
          variant: 'info',
        });
        return;
      }

      const beforeCount = countAssetsForGroup(userAssets, group);
      const linkedinMode = options?.linkedinMode ?? 'paid';

      // Both ids are marked so the tab's own "Sync more from …" button and the
      // connect menu's row show the same in-flight state.
      markSyncing([tabId, group], true);
      let cleanup: (() => void) | undefined;
      try {
        const callbackUrl = buildOAuthCallbackUrl(group, brandId);
        const syncResponse =
          group === 'facebook'
            ? await startMetaSync(callbackUrl)
            : group === 'tiktok'
              ? await startTikTokSync(callbackUrl)
              : group === 'linkedin'
                ? await startLinkedInSync(callbackUrl, { mode: linkedinMode })
                : group === 'x'
                  ? await startXSync(callbackUrl)
                  : await startGoogleSync(callbackUrl);
        const expectedState = 'state' in syncResponse ? syncResponse.state : null;

        onTrack?.('oauth_started', { provider: group });

        const popupTitle =
          group === 'linkedin'
            ? `Connect LinkedIn ${linkedinMode === 'organic' ? 'Organic' : 'Ads'}`
            : `Connect ${providerLabel}`;
        const popup = openCenteredPopup(syncResponse.url, popupTitle, 600, 700);
        if (!popup) {
          show({
            title: "Couldn't open OAuth popup",
            description: 'Please allow popups for this site and try again.',
            variant: 'error',
          });
          return;
        }

        const abortCtrl = new AbortController();
        const timeoutId = window.setTimeout(() => {
          try {
            popup.close();
          } catch {
            /* ignore */
          }
          abortCtrl.abort();
        }, 120000);
        cleanup = () => {
          try {
            abortCtrl.abort();
          } catch {
            /* ignore */
          }
          window.clearTimeout(timeoutId);
        };

        type Msg = {
          type: string;
          provider: string | null;
          context?: string;
          message?: string;
          state?: string | null;
          warning?: string | null;
        };
        // Races postMessage against the callback page's BroadcastChannel post,
        // which is the only signal that survives Google's own
        // Cross-Origin-Opener-Policy severing window.opener on the popup.
        const result = await waitForOAuthCompletion<Msg>({
          popup,
          predicate: (m) =>
            m.provider === group &&
            m.context === brandId &&
            (!expectedState || m.state === expectedState),
          signal: abortCtrl.signal,
        });
        try {
          popup.close();
        } catch {
          /* ignore */
        }
        cleanup();

        const refreshed = await refetchUserAssets();
        await refreshAssigned();
        const afterCount = countAssetsForGroup(refreshed.data ?? userAssets, group);
        const added = Math.max(0, afterCount - beforeCount);

        if (result.warning === 'no_ads_accounts' || result.warning === 'ads_enrichment_failed') {
          show({
            title: 'Connected, with a note',
            description:
              'No Google Ads accounts were found for this account. They may live under a different Google identity.',
            variant: 'info',
          });
        } else if (result.warning === 'ga4_scope_missing') {
          show({
            title: 'Connected, without Analytics',
            description:
              'Google Analytics access was not granted, so no GA4 properties were synced. Reconnect and approve Analytics to enable them.',
            variant: 'info',
          });
        } else if (result.warning === 'ga4_enrichment_failed') {
          show({
            title: 'Connected, with a note',
            description:
              "Couldn't read your Google Analytics properties. Everything else connected fine.",
            variant: 'info',
          });
        } else if (result.warning === 'meta_partial_sync') {
          show({
            title: 'Connected, with a note',
            description:
              "Some Meta accounts may not have loaded. We'll keep trying — reopen this step in a moment if any are missing.",
            variant: 'info',
          });
        } else if (added > 0) {
          show({
            title: `Connected ${providerLabel}`,
            description: `${added} account${added === 1 ? '' : 's'} found.`,
            variant: 'success',
          });
        } else {
          show({
            title: `${providerLabel} sync complete`,
            description:
              "No new accounts found. Check your permissions in the provider's settings.",
            variant: 'info',
          });
        }
        onTrack?.('oauth_completed', { provider: group });
      } catch (error) {
        onTrack?.('oauth_failed', {
          provider: group,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        show({
          title: `Couldn't connect ${providerLabel}`,
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'error',
        });
      } finally {
        try {
          cleanup?.();
        } catch {
          /* ignore */
        }
        markSyncing([tabId, group], false);
      }
    },
    [brandId, markSyncing, refetchUserAssets, refreshAssigned, show, userAssets, onTrack],
  );

  const handleClearAll = useCallback(() => {
    startClearing(async () => {
      try {
        await applyBrandIntegrationAssignmentsAction(brandId, []);
        await refreshAssigned();
        onTrack?.('assets_cleared');
      } catch (error) {
        show({
          title: "Couldn't clear accounts",
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'error',
        });
      }
    });
  }, [brandId, refreshAssigned, show, onTrack]);

  const syncLabel = useCallback((tabId: string, hasItems: boolean) => {
    const group = PROVIDER_GROUP_BY_ID[tabId];
    const providerLabel = group
      ? PROVIDER_GROUP_LABELS[group]
      : (PLATFORM_LABELS[tabId as PlatformKey] ?? tabId);
    return hasItems ? `Sync more from ${providerLabel}` : `Connect ${providerLabel}`;
  }, []);

  const isEmpty = !assetsLoading && tabs.length === 0;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className={className ?? 'flex flex-1 flex-col gap-6'}
    >
      {renderHeader ? (
        <motion.div variants={item}>
          {renderHeader({ assignedCount: assignedIds.length, clearAll: handleClearAll, clearing })}
        </motion.div>
      ) : null}

      <motion.div variants={item} className="mx-auto w-full max-w-[880px]">
        {isResyncing ? (
          <div
            role="status"
            className="mb-3 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
          >
            <span
              className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden
            />
            Refreshing your Meta accounts…
          </div>
        ) : resyncError ? (
          <div
            role="alert"
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <span>Couldn&apos;t refresh Meta accounts. {resyncError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={triggerResync}
            >
              Retry
            </Button>
          </div>
        ) : metaConnectedButNoAdAccounts ? (
          <div
            role="status"
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
          >
            <span>Meta is connected but no ad accounts were found.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={triggerResync}
            >
              Refresh Meta accounts
            </Button>
          </div>
        ) : null}
        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 px-5 py-10 text-center">
            <Plug className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">No connected accounts yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Connect a provider to start tagging its accounts to this brand.
            </p>
            <div className="mt-4 flex items-center justify-center">
              <ProviderConnectMenu onConnect={handleSync} syncingGroups={syncingTabIds}>
                <Button type="button" variant="outline" size="sm" className="gap-2">
                  <Plus className="h-3.5 w-3.5" />
                  Connect a provider
                </Button>
              </ProviderConnectMenu>
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
            tabBarTrailing={
              <ProviderConnectMenu onConnect={handleSync} syncingGroups={syncingTabIds} />
            }
            className="max-w-none"
            maxItemHeight="50vh"
            emptyState={
              <p className="text-xs text-muted-foreground">No accounts on this provider yet.</p>
            }
          />
        )}
      </motion.div>

      {footer ? <motion.div variants={item}>{footer}</motion.div> : null}
    </motion.div>
  );
}
