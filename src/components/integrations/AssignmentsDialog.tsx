import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Box,
  Button,
  Callout,
  Checkbox,
  Dialog,
  Flex,
  Heading,
  IconButton,
  Text,
} from "@radix-ui/themes";
import { ChevronDownIcon, ExclamationTriangleIcon } from "@radix-ui/react-icons";
import * as Accordion from "@radix-ui/react-accordion";
import { PLATFORMS, type PlatformKey } from "@/components/onboarding/platforms";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import {
  useUserIntegrationAssets,
  type UserIntegrationAssetRow,
} from "@/lib/api/integrations";
import { applyBrandIntegrationAssignmentsAction } from "@/app/(post-auth)/settings/integrations/actions";
import type { BrandMember } from "@/lib/onboarding/state";
import { getMemberDisplayName } from "@/lib/brands/memberDisplay";
import type { SelectableAsset } from "@/lib/schemas/integrations";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";
import {
  getMetaSelectableAdAccountBundles,
  getSelectableAssetsFlatList,
  getSelectableAssetLabel,
  mergeSelectableAssetsWithBrandSummary,
} from "@/lib/integrations/selectableAssets";
import { useToast } from "@/components/ui/ToastProvider";
import { useMetaAutoResync } from "@/hooks/useMetaAutoResync";
import { isReadOnlyMetaRole } from "@/lib/integrations/metaRole";
import {
  Table as ShadcnTable,
  TableBody as ShadcnTableBody,
  TableCell as ShadcnTableCell,
  TableRow as ShadcnTableRow,
} from "@/components/ui/table";
import { PlatformIcon } from "./internal/PlatformIcon";

export type AssignmentsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandProfileId: string;
  summary: BrandIntegrationSummary;
  assignedIds: string[];
  // Optional: when not provided (e.g. onboarding flow), every row is treated as
  // owned by the caller and the "tagged by" UX is a no-op.
  members?: BrandMember[];
  currentUserId?: string;
  onSaved?: () => Promise<void> | void;
};

function getAssetSelectionId(asset: SelectableAsset): string | null {
  return asset.integration_account_id || asset.asset_pk || null;
}

function countSelectedAssets(
  assets: SelectableAsset[],
  selectedById: Record<string, boolean>
): number {
  return assets.reduce((count: number, asset: SelectableAsset) => {
    const id = getAssetSelectionId(asset);
    return id && selectedById[id] ? count + 1 : count;
  }, 0);
}

export function AssignmentsDialog({
  open,
  onOpenChange,
  brandProfileId,
  summary,
  assignedIds,
  members = [],
  currentUserId = "",
  onSaved,
}: AssignmentsDialogProps) {
  const { show } = useToast();
  const router = useRouter();
  const userAssetsQuery = useUserIntegrationAssets();
  const [isSaving, setIsSaving] = useState(false);

  const selectableAssetsData = useMemo(() => {
    if (!userAssetsQuery.data) return null;
    const userAssets: SelectableAsset[] = userAssetsQuery.data.map(
      (row: UserIntegrationAssetRow) => ({
        asset_pk: row.id,
        integration_account_id: row.id,
        external_id: row.external_account_id ?? row.id,
        type: row.type ?? "unknown",
        name: row.name,
        business_id: null,
        ad_account_id: row.ad_account_id ?? null,
        role: row.role,
        also_accessible_via: null,
      })
    );

    const response = {
      synced_at: new Date().toISOString(),
      stale: false,
      assets: userAssets,
      providers: {},
    };
    return mergeSelectableAssetsWithBrandSummary(response, summary);
  }, [userAssetsQuery.data, summary]);

  const selectableAssets = useMemo(
    () => (selectableAssetsData ? getSelectableAssetsFlatList(selectableAssetsData) : []),
    [selectableAssetsData]
  );

  // Map<integrationAccountId, ownerUserId> derived from the brand summary.
  // Accounts whose owner is someone other than the caller are "locked" — the
  // caller may see them but not toggle them.
  const ownerByAccountId = useMemo(() => {
    const map = new Map<string, string | null>();
    (Object.keys(summary) as PlatformKey[]).forEach((platformKey) => {
      summary[platformKey]?.accounts.forEach((account) => {
        map.set(account.integrationAccountId, account.ownerUserId);
      });
    });
    return map;
  }, [summary]);

  const isLockedForCaller = (id: string): boolean => {
    const owner = ownerByAccountId.get(id);
    return owner !== undefined && owner !== null && owner !== currentUserId;
  };

  const ownerCaption = (id: string): string | null => {
    if (!isLockedForCaller(id)) return null;
    return `Tagged by ${getMemberDisplayName(members, ownerByAccountId.get(id) ?? null)}`;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: isLockedForCaller is a stable closure over ownerByAccountId + currentUserId, which are the listed deps; adding the function itself would re-run every render.
  const teammateAssignedIds = useMemo(
    () => assignedIds.filter((id) => isLockedForCaller(id)),
    [assignedIds, ownerByAccountId, currentUserId]
  );

  const metaBundles = useMemo(
    () => (selectableAssetsData ? getMetaSelectableAdAccountBundles(selectableAssetsData) : null),
    [selectableAssetsData]
  );

  // #154 fingerprint: Meta connected (some Meta asset synced) but no ad account.
  const metaConnectedButNoAdAccounts = useMemo(() => {
    const rows = userAssetsQuery.data ?? [];
    let hasMetaAsset = false;
    let hasMetaAdAccount = false;
    for (const row of rows) {
      if ((row.type ?? "").startsWith("meta_")) {
        hasMetaAsset = true;
        if ((row.type ?? "").includes("ad_account")) hasMetaAdAccount = true;
      }
    }
    return hasMetaAsset && !hasMetaAdAccount;
  }, [userAssetsQuery.data]);

  const { isResyncing, resyncError, triggerResync } = useMetaAutoResync({
    enabled: open && !userAssetsQuery.isLoading,
    isMetaEmpty: metaConnectedButNoAdAccounts,
    onResynced: async () => {
      await userAssetsQuery.refetch();
    },
  });

  const [selectedById, setSelectedById] = useState<Record<string, boolean>>({});

  // biome-ignore lint/correctness/useExhaustiveDependencies: isLockedForCaller is stable per dialog open via its memo deps; re-seeding defaults only when open/assignedIds/selectableAssets change is intended.
  useEffect(() => {
    if (!open) return;
    const assignedSet = new Set(assignedIds);
    const defaults: Record<string, boolean> = {};
    selectableAssets.forEach((asset: SelectableAsset) => {
      const id = getAssetSelectionId(asset);
      // Teammate-owned rows are kept out of selectedById entirely; they're
      // preserved unchanged through teammateAssignedIds at save time.
      if (id && !isLockedForCaller(id)) {
        defaults[id] = assignedSet.has(id);
      }
    });
    setSelectedById(defaults);
  }, [open, assignedIds, selectableAssets]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const formatDate = (dateString: string) => {
    if (!mounted) return "—";
    return new Date(dateString).toLocaleString();
  };

  const desiredAssetIds = useMemo(() => {
    const ownedSelected = Object.entries(selectedById)
      .filter(([, selected]) => selected)
      .map(([id]) => id);
    return Array.from(new Set([...ownedSelected, ...teammateAssignedIds]));
  }, [selectedById, teammateAssignedIds]);

  const hasChanges = useMemo(() => {
    const assignedSet = new Set(assignedIds);
    if (desiredAssetIds.length !== assignedSet.size) return true;
    return desiredAssetIds.some((id) => !assignedSet.has(id));
  }, [assignedIds, desiredAssetIds]);

  const handleToggle = (id: string, checked: boolean) => {
    if (isLockedForCaller(id)) return;
    setSelectedById((prev) => ({ ...prev, [id]: checked }));
  };

  const handleToggleSelectableAssets = (assets: SelectableAsset[], checked: boolean) => {
    setSelectedById((prev) => {
      const next = { ...prev };
      assets.forEach((asset: SelectableAsset) => {
        const id = getAssetSelectionId(asset);
        if (id && !isLockedForCaller(id)) {
          next[id] = checked;
        }
      });
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await applyBrandIntegrationAssignmentsAction(
        brandProfileId,
        desiredAssetIds,
      );
      onOpenChange(false);
      router.refresh();
      await onSaved?.();
      show({
        title: "Assignments updated",
        description: `Linked ${result.linked} account(s).`,
        variant: "success",
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to update assignments.";
      show({
        title: "Update failed",
        description: message,
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = userAssetsQuery.isLoading;
  const stale = selectableAssetsData?.stale;
  const syncedAt = selectableAssetsData?.synced_at;

  const groupedAssets = useMemo(() => {
    const grouped = PLATFORMS.reduce((acc, { key }) => {
      acc[key] = [];
      return acc;
    }, {} as Record<PlatformKey, SelectableAsset[]>);

    selectableAssets.forEach((asset: SelectableAsset) => {
      const platformKey = mapIntegrationTypeToPlatformKey(asset.type);
      if (!platformKey) return;

      if (
        metaBundles &&
        (platformKey === "facebook" || platformKey === "instagram" || platformKey === "threads")
      ) {
        if (asset.ad_account_id) return;
      }

      grouped[platformKey].push(asset);
    });

    return grouped;
  }, [selectableAssets, metaBundles]);

  const orderedPlatforms = PLATFORMS.filter(
    ({ key }) => (groupedAssets[key]?.length ?? 0) > 0
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="640px">
        <Dialog.Title>Edit brand assignments</Dialog.Title>
        <Dialog.Description>
          Choose which connected provider accounts are shared with this brand profile.
        </Dialog.Description>

        {stale ? (
          <Callout.Root color="amber" className="mt-3">
            <Callout.Icon>
              <ExclamationTriangleIcon />
            </Callout.Icon>
            <Callout.Text>
              Integrations are stale. Refresh sync in Settings → You to see recent accounts.
            </Callout.Text>
          </Callout.Root>
        ) : null}

        {syncedAt ? (
          <Text size="1" color="gray" className="mt-2 block">
            Last synced {formatDate(syncedAt)}
          </Text>
        ) : null}

        {isResyncing ? (
          <Callout.Root color="gray" className="mt-3">
            <Callout.Text>Refreshing your Meta accounts…</Callout.Text>
          </Callout.Root>
        ) : resyncError ? (
          <Callout.Root color="red" className="mt-3">
            <Callout.Icon>
              <ExclamationTriangleIcon />
            </Callout.Icon>
            <Callout.Text>
              Couldn&apos;t refresh Meta accounts. {resyncError}{" "}
              <button type="button" className="underline" onClick={triggerResync}>
                Retry
              </button>
            </Callout.Text>
          </Callout.Root>
        ) : metaConnectedButNoAdAccounts ? (
          <Callout.Root color="amber" className="mt-3">
            <Callout.Icon>
              <ExclamationTriangleIcon />
            </Callout.Icon>
            <Callout.Text>
              Meta is connected but no ad accounts were found.{" "}
              <button type="button" className="underline" onClick={triggerResync}>
                Refresh Meta accounts
              </button>
            </Callout.Text>
          </Callout.Root>
        ) : null}

        <div className="mt-4 flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
          {isLoading ? (
            <Flex align="center" justify="center" p="8">
              <Text color="gray" size="2">
                Loading your accounts...
              </Text>
            </Flex>
          ) : orderedPlatforms.length === 0 && !metaBundles ? (
            <Flex align="center" justify="center" p="8">
              <Text color="gray" size="2" align="center">
                No connected accounts available. Connect providers from your personal integrations
                first.
              </Text>
            </Flex>
          ) : (
            <div className="space-y-4">
              {metaBundles &&
                (metaBundles.ad_accounts.length > 0 ||
                  metaBundles.assets_without_ad_account.length > 0) && (
                  <Accordion.Root type="single" collapsible className="space-y-2">
                    <Accordion.Item
                      value="meta-portfolio"
                      className="border rounded-lg overflow-hidden border-white/10 bg-slate-950/20"
                    >
                      <Accordion.Header>
                        <Accordion.Trigger className="w-full">
                          <Flex align="center" justify="between" p="3" className="w-full">
                            <Flex align="center" gap="2">
                              <Box className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                              <Heading size="3">Meta Portfolio</Heading>
                            </Flex>
                            <ChevronDownIcon
                              className="h-4 w-4 transition-transform duration-200"
                              aria-hidden
                            />
                          </Flex>
                        </Accordion.Trigger>
                      </Accordion.Header>
                      <Accordion.Content>
                        <div className="px-3 pb-3 space-y-2 pt-3">
                          <Accordion.Root type="multiple" className="space-y-2">
                            {metaBundles.ad_accounts.map((bundle) => {
                              const adAccountLabel = bundle.ad_account
                                ? getSelectableAssetLabel(bundle.ad_account)
                                : bundle.ad_account_id;
                              const adAccountId = bundle.ad_account_id;
                              const selectionAssets = (
                                bundle.ad_account
                                  ? [bundle.ad_account, ...bundle.assets]
                                  : bundle.assets
                              ).filter((asset: SelectableAsset) =>
                                Boolean(asset.integration_account_id)
                              );

                              const selectedCount = countSelectedAssets(
                                selectionAssets,
                                selectedById
                              );
                              const totalSelectable = selectionAssets.length;
                              const allSelected =
                                totalSelectable > 0 && selectedCount === totalSelectable;
                              const partiallySelected =
                                selectedCount > 0 && selectedCount < totalSelectable;

                              return (
                                <Accordion.Item
                                  key={adAccountId}
                                  value={adAccountId}
                                  className="border rounded-lg overflow-hidden border-white/10 bg-muted/20"
                                >
                                  <Accordion.Header>
                                    <Flex justify="between" align="center" p="3">
                                      <Flex align="center" gap="3" className="min-w-0">
                                        <Checkbox
                                          checked={partiallySelected ? "indeterminate" : allSelected}
                                          disabled={isSaving || totalSelectable === 0}
                                          onCheckedChange={(value) => {
                                            handleToggleSelectableAssets(
                                              selectionAssets,
                                              value === true
                                            );
                                          }}
                                        />
                                        <Box className="min-w-0">
                                          <Flex align="center" gap="2">
                                            <Text
                                              size="2"
                                              weight="bold"
                                              className="text-black truncate block"
                                            >
                                              {adAccountLabel}
                                            </Text>
                                            {isReadOnlyMetaRole(bundle.ad_account?.role) ? (
                                              <Badge color="amber" variant="soft" size="1">
                                                Read-only
                                              </Badge>
                                            ) : null}
                                          </Flex>
                                          <Text
                                            size="1"
                                            color="gray"
                                            className="truncate block opacity-60"
                                          >
                                            ID: {adAccountId}
                                          </Text>
                                        </Box>
                                      </Flex>
                                      <Flex align="center" gap="3">
                                        <Badge
                                          color={selectedCount > 0 ? "indigo" : "gray"}
                                          variant="soft"
                                        >
                                          {selectedCount}/{totalSelectable}
                                        </Badge>
                                        <Accordion.Trigger asChild>
                                          <IconButton
                                            variant="ghost"
                                            color="gray"
                                            size="1"
                                            className="group"
                                          >
                                            <ChevronDownIcon className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                                          </IconButton>
                                        </Accordion.Trigger>
                                      </Flex>
                                    </Flex>
                                  </Accordion.Header>
                                  <Accordion.Content>
                                    <div className="px-3 pb-3 pt-1 border-t border-white/5">
                                      <ShadcnTable>
                                        <ShadcnTableBody>
                                          {bundle.assets.map((asset: SelectableAsset) => {
                                            const id = getAssetSelectionId(asset);
                                            const icon = PlatformIcon({ platform: asset.type });
                                            const isSubItem = Boolean(asset.ad_account_id);

                                            return (
                                              <ShadcnTableRow
                                                key={asset.asset_pk}
                                                className="border-none hover:bg-muted/50"
                                              >
                                                <ShadcnTableCell className="py-2 pl-4">
                                                  <Flex align="center" gap="2">
                                                    <div className="flex items-center justify-center w-6 h-6 text-slate-400/30 shrink-0">
                                                      {isSubItem && (
                                                        <svg
                                                          width="16"
                                                          height="16"
                                                          viewBox="0 0 16 16"
                                                          fill="none"
                                                          xmlns="http://www.w3.org/2000/svg"
                                                          aria-hidden="true"
                                                        >
                                                          <path
                                                            d="M4 0V8C4 10.2091 5.79086 12 8 12H16"
                                                            stroke="currentColor"
                                                            strokeWidth="1.5"
                                                          />
                                                        </svg>
                                                      )}
                                                    </div>
                                                    <Checkbox
                                                      checked={
                                                        !!id &&
                                                        (selectedById[id] === true ||
                                                          isLockedForCaller(id))
                                                      }
                                                      disabled={
                                                        isSaving ||
                                                        !id ||
                                                        (id ? isLockedForCaller(id) : false)
                                                      }
                                                      onCheckedChange={(v) =>
                                                        id && handleToggle(id, v === true)
                                                      }
                                                    />
                                                    <Box className="min-w-0">
                                                      <Text
                                                        size="2"
                                                        className="text-black font-bold"
                                                      >
                                                        {getSelectableAssetLabel(asset)}
                                                      </Text>
                                                      {id && ownerCaption(id) ? (
                                                        <Text
                                                          size="1"
                                                          className="block text-amber-500"
                                                        >
                                                          {ownerCaption(id)}
                                                        </Text>
                                                      ) : null}
                                                      <Text
                                                        size="1"
                                                        color="gray"
                                                        className="block opacity-50 font-mono"
                                                        style={{ fontSize: "10px" }}
                                                      >
                                                        ID: {asset.external_id || asset.asset_pk}
                                                      </Text>
                                                    </Box>
                                                  </Flex>
                                                </ShadcnTableCell>
                                                <ShadcnTableCell className="py-2 text-right">
                                                  {icon || (
                                                    <Badge
                                                      color="gray"
                                                      variant="outline"
                                                      size="1"
                                                      className="text-2xs uppercase opacity-70 text-slate-300 border-slate-700"
                                                    >
                                                      {asset.type.replace("meta_", "")}
                                                    </Badge>
                                                  )}
                                                </ShadcnTableCell>
                                              </ShadcnTableRow>
                                            );
                                          })}
                                        </ShadcnTableBody>
                                      </ShadcnTable>
                                    </div>
                                  </Accordion.Content>
                                </Accordion.Item>
                              );
                            })}
                            {metaBundles.assets_without_ad_account.length > 0 ? (
                              <Accordion.Item
                                value="meta-standalone-assets"
                                className="border rounded-lg overflow-hidden border-white/10 bg-muted/20"
                              >
                                <Accordion.Header>
                                  <Flex justify="between" align="center" p="3">
                                    <Flex align="center" gap="3" className="min-w-0">
                                      <Checkbox
                                        checked={
                                          countSelectedAssets(
                                            metaBundles.assets_without_ad_account,
                                            selectedById
                                          ) === metaBundles.assets_without_ad_account.length
                                        }
                                        disabled={isSaving}
                                        onCheckedChange={(value) => {
                                          handleToggleSelectableAssets(
                                            metaBundles.assets_without_ad_account,
                                            value === true
                                          );
                                        }}
                                      />
                                      <Box className="min-w-0">
                                        <Text
                                          size="2"
                                          weight="bold"
                                          className="text-black truncate block"
                                        >
                                          Standalone Meta accounts
                                        </Text>
                                        <Text
                                          size="1"
                                          color="gray"
                                          className="truncate block opacity-60"
                                        >
                                          Accounts not attached to a Meta ad account
                                        </Text>
                                      </Box>
                                    </Flex>
                                    <Flex align="center" gap="3">
                                      <Badge
                                        color={
                                          countSelectedAssets(
                                            metaBundles.assets_without_ad_account,
                                            selectedById
                                          ) > 0
                                            ? "indigo"
                                            : "gray"
                                        }
                                        variant="soft"
                                      >
                                        {countSelectedAssets(
                                          metaBundles.assets_without_ad_account,
                                          selectedById
                                        )}
                                        /{metaBundles.assets_without_ad_account.length}
                                      </Badge>
                                      <Accordion.Trigger asChild>
                                        <IconButton
                                          variant="ghost"
                                          color="gray"
                                          size="1"
                                          className="group"
                                        >
                                          <ChevronDownIcon className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                                        </IconButton>
                                      </Accordion.Trigger>
                                    </Flex>
                                  </Flex>
                                </Accordion.Header>
                                <Accordion.Content>
                                  <div className="px-3 pb-3 pt-1 border-t border-white/5">
                                    <ShadcnTable>
                                      <ShadcnTableBody>
                                        {metaBundles.assets_without_ad_account.map(
                                          (asset: SelectableAsset) => {
                                            const id = getAssetSelectionId(asset);
                                            const icon = PlatformIcon({ platform: asset.type });

                                            return (
                                              <ShadcnTableRow
                                                key={asset.asset_pk}
                                                className="border-none hover:bg-muted/50"
                                              >
                                                <ShadcnTableCell className="py-2 pl-8">
                                                  <Flex align="center" gap="3">
                                                    <Checkbox
                                                      checked={
                                                        !!id &&
                                                        (selectedById[id] === true ||
                                                          isLockedForCaller(id))
                                                      }
                                                      disabled={
                                                        isSaving ||
                                                        !id ||
                                                        (id ? isLockedForCaller(id) : false)
                                                      }
                                                      onCheckedChange={(v) =>
                                                        id && handleToggle(id, v === true)
                                                      }
                                                    />
                                                    <Box className="min-w-0">
                                                      <Text
                                                        size="2"
                                                        className="text-black font-bold"
                                                      >
                                                        {getSelectableAssetLabel(asset)}
                                                      </Text>
                                                      {id && ownerCaption(id) ? (
                                                        <Text
                                                          size="1"
                                                          className="block text-amber-500"
                                                        >
                                                          {ownerCaption(id)}
                                                        </Text>
                                                      ) : null}
                                                      <Text
                                                        size="1"
                                                        color="gray"
                                                        className="block opacity-50 font-mono"
                                                        style={{ fontSize: "10px" }}
                                                      >
                                                        ID: {asset.external_id || asset.asset_pk}
                                                      </Text>
                                                    </Box>
                                                  </Flex>
                                                </ShadcnTableCell>
                                                <ShadcnTableCell className="py-2 text-right">
                                                  {icon || (
                                                    <Badge
                                                      color="gray"
                                                      variant="outline"
                                                      size="1"
                                                      className="text-2xs uppercase opacity-70 text-slate-300 border-slate-700"
                                                    >
                                                      {asset.type.replace("meta_", "")}
                                                    </Badge>
                                                  )}
                                                </ShadcnTableCell>
                                              </ShadcnTableRow>
                                            );
                                          }
                                        )}
                                      </ShadcnTableBody>
                                    </ShadcnTable>
                                  </div>
                                </Accordion.Content>
                              </Accordion.Item>
                            ) : null}
                          </Accordion.Root>
                        </div>
                      </Accordion.Content>
                    </Accordion.Item>
                  </Accordion.Root>
                )}

              {orderedPlatforms.some((p) =>
                ["googleAds", "youtube", "dv360"].includes(p.key)
              ) && (
                <Accordion.Root type="single" collapsible className="space-y-2">
                  <Accordion.Item
                    value="google-youtube"
                    className="border rounded-lg overflow-hidden border-white/10 bg-slate-950/20"
                  >
                    <Accordion.Header>
                      <Accordion.Trigger className="w-full">
                        <Flex align="center" justify="between" p="3" className="w-full">
                          <Flex align="center" gap="2">
                            <Box className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            <Heading size="3">Google &amp; YouTube</Heading>
                          </Flex>
                          <ChevronDownIcon
                            className="h-4 w-4 transition-transform duration-200"
                            aria-hidden
                          />
                        </Flex>
                      </Accordion.Trigger>
                    </Accordion.Header>
                    <Accordion.Content>
                      <div className="px-3 pb-3 space-y-2 pt-3">
                        <Accordion.Root type="multiple" className="space-y-2">
                          {orderedPlatforms
                            .filter(({ key }) => ["googleAds", "youtube", "dv360"].includes(key))
                            .map(({ key, label }) => {
                              const assets = groupedAssets[key] ?? [];
                              const selectedCount = countSelectedAssets(assets, selectedById);
                              const totalSelectable = assets.length;
                              const allSelected =
                                totalSelectable > 0 && selectedCount === totalSelectable;
                              const partiallySelected =
                                selectedCount > 0 && selectedCount < totalSelectable;

                              return (
                                <Accordion.Item
                                  key={key}
                                  value={key}
                                  className="border rounded-lg overflow-hidden border-white/10 bg-muted/20"
                                >
                                  <Accordion.Header>
                                    <Flex justify="between" align="center" p="3">
                                      <Flex align="center" gap="3" className="min-w-0">
                                        <Checkbox
                                          checked={partiallySelected ? "indeterminate" : allSelected}
                                          disabled={isSaving || totalSelectable === 0}
                                          onCheckedChange={(value) => {
                                            handleToggleSelectableAssets(assets, value === true);
                                          }}
                                        />
                                        <Box className="min-w-0">
                                          <Text
                                            size="2"
                                            weight="bold"
                                            className="text-black truncate block"
                                          >
                                            {label}
                                          </Text>
                                        </Box>
                                      </Flex>
                                      <Flex align="center" gap="3">
                                        <Badge
                                          color={selectedCount > 0 ? "indigo" : "gray"}
                                          variant="soft"
                                        >
                                          {selectedCount}/{totalSelectable}
                                        </Badge>
                                        <Accordion.Trigger asChild>
                                          <IconButton
                                            variant="ghost"
                                            color="gray"
                                            size="1"
                                            className="group"
                                          >
                                            <ChevronDownIcon className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                                          </IconButton>
                                        </Accordion.Trigger>
                                      </Flex>
                                    </Flex>
                                  </Accordion.Header>
                                  <Accordion.Content>
                                    <div className="px-3 pb-3 pt-1 border-t border-white/5">
                                      <ShadcnTable>
                                        <ShadcnTableBody>
                                          {assets.map((asset: SelectableAsset) => {
                                            const id = getAssetSelectionId(asset);
                                            return (
                                              <ShadcnTableRow
                                                key={asset.asset_pk}
                                                className="border-none hover:bg-muted/50"
                                              >
                                                <ShadcnTableCell className="py-2 pl-8">
                                                  <Flex align="center" gap="3">
                                                    <Checkbox
                                                      checked={
                                                        !!id &&
                                                        (selectedById[id] === true ||
                                                          isLockedForCaller(id))
                                                      }
                                                      disabled={
                                                        isSaving ||
                                                        !id ||
                                                        (id ? isLockedForCaller(id) : false)
                                                      }
                                                      onCheckedChange={(v) =>
                                                        id && handleToggle(id, v === true)
                                                      }
                                                    />
                                                    <Box className="min-w-0">
                                                      <Text
                                                        size="2"
                                                        className="text-black font-bold"
                                                      >
                                                        {getSelectableAssetLabel(asset)}
                                                      </Text>
                                                      {id && ownerCaption(id) ? (
                                                        <Text
                                                          size="1"
                                                          className="block text-amber-500"
                                                        >
                                                          {ownerCaption(id)}
                                                        </Text>
                                                      ) : null}
                                                      <Flex direction="column" gap="0">
                                                        {asset.business_id && (
                                                          <Text
                                                            size="1"
                                                            color="gray"
                                                            className="block opacity-60"
                                                          >
                                                            Business: {asset.business_id}
                                                          </Text>
                                                        )}
                                                        <Text
                                                          size="1"
                                                          color="gray"
                                                          className="block opacity-50 font-mono"
                                                          style={{ fontSize: "10px" }}
                                                        >
                                                          ID: {asset.external_id || asset.asset_pk}
                                                        </Text>
                                                      </Flex>
                                                    </Box>
                                                  </Flex>
                                                </ShadcnTableCell>
                                                <ShadcnTableCell className="py-2 text-right">
                                                  <Badge
                                                    color="gray"
                                                    variant="outline"
                                                    size="1"
                                                    className="text-2xs uppercase opacity-70 text-slate-300 border-slate-700"
                                                  >
                                                    {asset.type
                                                      .replace(`${key}_`, "")
                                                      .replace("ad_account", "Account")}
                                                  </Badge>
                                                </ShadcnTableCell>
                                              </ShadcnTableRow>
                                            );
                                          })}
                                        </ShadcnTableBody>
                                      </ShadcnTable>
                                    </div>
                                  </Accordion.Content>
                                </Accordion.Item>
                              );
                            })}
                        </Accordion.Root>
                      </div>
                    </Accordion.Content>
                  </Accordion.Item>
                </Accordion.Root>
              )}

              {orderedPlatforms.some(
                (p) =>
                  !["googleAds", "youtube", "dv360", "facebook", "instagram", "threads"].includes(
                    p.key
                  )
              ) && (
                <Accordion.Root type="single" collapsible className="space-y-2">
                  <Accordion.Item
                    value="other-integrations"
                    className="border rounded-lg overflow-hidden border-white/10 bg-slate-950/20"
                  >
                    <Accordion.Header>
                      <Accordion.Trigger className="w-full">
                        <Flex align="center" justify="between" p="3" className="w-full">
                          <Flex align="center" gap="2">
                            <Box className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            <Heading size="3">Other Integrations</Heading>
                          </Flex>
                          <ChevronDownIcon
                            className="h-4 w-4 transition-transform duration-200"
                            aria-hidden
                          />
                        </Flex>
                      </Accordion.Trigger>
                    </Accordion.Header>
                    <Accordion.Content>
                      <div className="px-3 pb-3 space-y-2 pt-3">
                        <Accordion.Root type="multiple" className="space-y-2">
                          {orderedPlatforms
                            .filter(
                              ({ key }) =>
                                ![
                                  "googleAds",
                                  "youtube",
                                  "dv360",
                                  "facebook",
                                  "instagram",
                                  "threads",
                                ].includes(key)
                            )
                            .map(({ key, label }) => {
                              const assets = groupedAssets[key] ?? [];
                              const selectedCount = countSelectedAssets(assets, selectedById);
                              const totalSelectable = assets.length;
                              const allSelected =
                                totalSelectable > 0 && selectedCount === totalSelectable;
                              const partiallySelected =
                                selectedCount > 0 && selectedCount < totalSelectable;

                              return (
                                <Accordion.Item
                                  key={key}
                                  value={key}
                                  className="border rounded-lg overflow-hidden border-white/10 bg-muted/20"
                                >
                                  <Accordion.Header>
                                    <Flex justify="between" align="center" p="3">
                                      <Flex align="center" gap="3" className="min-w-0">
                                        <Checkbox
                                          checked={partiallySelected ? "indeterminate" : allSelected}
                                          disabled={isSaving || totalSelectable === 0}
                                          onCheckedChange={(value) => {
                                            handleToggleSelectableAssets(assets, value === true);
                                          }}
                                        />
                                        <Box className="min-w-0">
                                          <Text
                                            size="2"
                                            weight="bold"
                                            className="text-black truncate block"
                                          >
                                            {label}
                                          </Text>
                                        </Box>
                                      </Flex>
                                      <Flex align="center" gap="3">
                                        <Badge
                                          color={selectedCount > 0 ? "indigo" : "gray"}
                                          variant="soft"
                                        >
                                          {selectedCount}/{totalSelectable}
                                        </Badge>
                                        <Accordion.Trigger asChild>
                                          <IconButton
                                            variant="ghost"
                                            color="gray"
                                            size="1"
                                            className="group"
                                          >
                                            <ChevronDownIcon className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                                          </IconButton>
                                        </Accordion.Trigger>
                                      </Flex>
                                    </Flex>
                                  </Accordion.Header>
                                  <Accordion.Content>
                                    <div className="px-3 pb-3 pt-1 border-t border-white/5">
                                      <ShadcnTable>
                                        <ShadcnTableBody>
                                          {assets.map((asset: SelectableAsset) => {
                                            const id = getAssetSelectionId(asset);
                                            return (
                                              <ShadcnTableRow
                                                key={asset.asset_pk}
                                                className="border-none hover:bg-muted/50"
                                              >
                                                <ShadcnTableCell className="py-2 pl-8">
                                                  <Flex align="center" gap="3">
                                                    <Checkbox
                                                      checked={
                                                        !!id &&
                                                        (selectedById[id] === true ||
                                                          isLockedForCaller(id))
                                                      }
                                                      disabled={
                                                        isSaving ||
                                                        !id ||
                                                        (id ? isLockedForCaller(id) : false)
                                                      }
                                                      onCheckedChange={(v) =>
                                                        id && handleToggle(id, v === true)
                                                      }
                                                    />
                                                    <Box className="min-w-0">
                                                      <Text
                                                        size="2"
                                                        className="text-black font-bold"
                                                      >
                                                        {getSelectableAssetLabel(asset)}
                                                      </Text>
                                                      {id && ownerCaption(id) ? (
                                                        <Text
                                                          size="1"
                                                          className="block text-amber-500"
                                                        >
                                                          {ownerCaption(id)}
                                                        </Text>
                                                      ) : null}
                                                      <Flex direction="column" gap="0">
                                                        {asset.business_id && (
                                                          <Text
                                                            size="1"
                                                            color="gray"
                                                            className="block opacity-60"
                                                          >
                                                            Business: {asset.business_id}
                                                          </Text>
                                                        )}
                                                        <Text
                                                          size="1"
                                                          color="gray"
                                                          className="block opacity-50 font-mono"
                                                          style={{ fontSize: "10px" }}
                                                        >
                                                          ID: {asset.external_id || asset.asset_pk}
                                                        </Text>
                                                      </Flex>
                                                    </Box>
                                                  </Flex>
                                                </ShadcnTableCell>
                                                <ShadcnTableCell className="py-2 text-right">
                                                  <Badge
                                                    color="gray"
                                                    variant="outline"
                                                    size="1"
                                                    className="text-2xs uppercase opacity-70 text-slate-300 border-slate-700"
                                                  >
                                                    {asset.type
                                                      .replace(`${key}_`, "")
                                                      .replace("ad_account", "Account")}
                                                  </Badge>
                                                </ShadcnTableCell>
                                              </ShadcnTableRow>
                                            );
                                          })}
                                        </ShadcnTableBody>
                                      </ShadcnTable>
                                    </div>
                                  </Accordion.Content>
                                </Accordion.Item>
                              );
                            })}
                        </Accordion.Root>
                      </div>
                    </Accordion.Content>
                  </Accordion.Item>
                </Accordion.Root>
              )}
            </div>
          )}
        </div>

        <Flex justify="end" gap="3" className="mt-6 pt-4 border-t border-white/10">
          <Button variant="soft" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
            {isSaving ? "Saving..." : "Save Assignments"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
