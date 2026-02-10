"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Checkbox,
  Dialog,
  Flex,
  Grid,
  Heading,
  IconButton,
  Text,
} from "@radix-ui/themes";
import { ChevronDownIcon, ExclamationTriangleIcon, Link2Icon } from "@radix-ui/react-icons";
import { Sparkles, RefreshCw } from "lucide-react";
import * as Accordion from "@radix-ui/react-accordion";
import { PLATFORMS, type PlatformKey } from "@/components/onboarding/platforms";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import { useApplyBrandProfileIntegrationAccounts, useSelectableAssets, useStartMetaSync, useStartGoogleSync } from "@/lib/api/integrations";
import type { SelectableAsset } from "@/lib/schemas/integrations";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";
import {
  getMetaSelectableAdAccountBundles,
  getSelectableAssetsFlatList,
  getSelectableAssetLabel,
} from "@/lib/integrations/selectableAssets";
import { useToast } from "@/components/ui/ToastProvider";
import { openCenteredPopup, waitForPopupClosed } from "@/lib/popup";
import { 
  Table as ShadcnTable, 
  TableBody as ShadcnTableBody, 
  TableCell as ShadcnTableCell, 
  TableHead as ShadcnTableHead, 
  TableHeader as ShadcnTableHeader, 
  TableRow as ShadcnTableRow 
} from "@/components/ui/table";
import React from "react";
import Image from "next/image";

type Props = {
  brandProfileId?: string;
  summary?: BrandIntegrationSummary;
  showHeader?: boolean;
  isLoading?: boolean;
  onRefresh?: () => Promise<void> | void;
};

function PlatformIcon({ platform, className = "w-4 h-4" }: { platform: string; className?: string }) {
  const p = platform.toLowerCase();
  
  if (p === "facebook" || p === "meta_page" || p === "page") {
    return <Image src="/logos/facebook-icon.svg" alt="Facebook" width={16} height={16} className={className} />;
  }
  
  if (p === "instagram" || p === "meta_instagram_user" || p === "instagram_user") {
    return <Image src="/logos/instagram-icon.svg" alt="Instagram" width={16} height={16} className={className} />;
  }

  return null;
}

function formatConnectionBadge(connectedCount: number): {
  label: string;
  color: "green" | "gray";
} {
  if (connectedCount > 0) {
    const suffix = connectedCount > 1 ? ` • ${connectedCount}` : "";
    return { label: `Connected${suffix}`, color: "green" };
  }
  return { label: "Not connected", color: "gray" };
}

function resolveStatusColor(
  status: string | null
): "green" | "amber" | "red" | "gray" {
  if (!status) return "gray";
  const normalized = status.toLowerCase();
  if (normalized === "active" || normalized === "selected") return "green";
  if (normalized === "pending") return "amber";
  if (
    normalized === "error" ||
    normalized === "revoked" ||
    normalized === "disconnected"
  )
    return "red";
  return "gray";
}

function extractAssignedIntegrationAccountIds(
  summary: BrandIntegrationSummary
): string[] {
  const set = new Set<string>();
  PLATFORMS.forEach(({ key }) => {
    summary[key]?.accounts.forEach(account =>
      set.add(account.integrationAccountId)
    );
  });
  return Array.from(set);
}

const ScrollIndicator = ({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const check = () => {
      const isScrollable = el.scrollHeight > el.clientHeight;
      const isAtBottom = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 15;
      setShow(isScrollable && !isAtBottom);
    };

    check();
    el.addEventListener("scroll", check);
    const observer = new ResizeObserver(check);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", check);
      observer.disconnect();
    };
  }, [containerRef]);

  if (!show) return null;

  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none animate-bounce flex flex-col items-center">
      <ChevronDownIcon className="w-4 h-4 text-slate-500/40" />
    </div>
  );
};

function buildCallbackUrl(group: string, context: string): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  const url = new URL("/integrations/callback", origin);
  const provider = (["facebook", "meta", "instagram", "threads"].includes(group)) ? "meta" : "google";
  url.searchParams.set("provider", provider);
  url.searchParams.set("context", context);
  return url.toString();
}

type AssignmentsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandProfileId: string;
  assignedIds: string[];
  onSaved?: () => Promise<void> | void;
};

function AssignmentsDialog({
  open,
  onOpenChange,
  brandProfileId,
  assignedIds,
  onSaved,
}: AssignmentsDialogProps) {
  const { show } = useToast();
  const selectableAssetsQuery = useSelectableAssets();
  const applyAssignments = useApplyBrandProfileIntegrationAccounts();

  const selectableAssets = useMemo(
    () => (selectableAssetsQuery.data ? getSelectableAssetsFlatList(selectableAssetsQuery.data) : []),
    [selectableAssetsQuery.data]
  );
  
  const metaBundles = useMemo(
    () => (selectableAssetsQuery.data ? getMetaSelectableAdAccountBundles(selectableAssetsQuery.data) : null),
    [selectableAssetsQuery.data]
  );

  const [selectedById, setSelectedById] = useState<Record<string, boolean>>(
    {}
  );

  useEffect(() => {
    if (!open) return;
    const assignedSet = new Set(assignedIds);
    const defaults: Record<string, boolean> = {};
    selectableAssets.forEach((asset: SelectableAsset) => {
      const id = asset.integration_account_id || asset.asset_pk;
      defaults[id] = assignedSet.has(id);
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

  const desiredAssetIds = useMemo(
    () =>
      Object.entries(selectedById)
        .filter(([, selected]) => selected)
        .map(([id]) => id),
    [selectedById]
  );

  const hasChanges = useMemo(() => {
    const assignedSet = new Set(assignedIds);
    if (desiredAssetIds.length !== assignedSet.size) return true;
    return desiredAssetIds.some(id => !assignedSet.has(id));
  }, [assignedIds, desiredAssetIds]);

  const handleToggle = (id: string, checked: boolean) => {
    setSelectedById(prev => ({ ...prev, [id]: checked }));
  };

  const handleToggleSelectableAssets = (assets: SelectableAsset[], checked: boolean) => {
    setSelectedById(prev => {
      const next = { ...prev };
      assets.forEach((asset: SelectableAsset) => {
        const id = asset.integration_account_id || asset.asset_pk;
        next[id] = checked;
      });
      return next;
    });
  };

  const handleSave = async () => {
    try {
      const result = await applyAssignments.mutateAsync({
        brandId: brandProfileId,
        assetPks: desiredAssetIds,
      });
      onOpenChange(false);
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
    }
  };

  const isLoading = selectableAssetsQuery.isLoading;
  const isSaving = applyAssignments.isPending;
  const stale = selectableAssetsQuery.data?.stale;
  const syncedAt = selectableAssetsQuery.data?.synced_at;

  const groupedAssets = useMemo(() => {
    const grouped = PLATFORMS.reduce((acc, { key }) => {
      acc[key] = [];
      return acc;
    }, {} as Record<PlatformKey, SelectableAsset[]>);

    selectableAssets.forEach((asset: SelectableAsset) => {
      const platformKey = mapIntegrationTypeToPlatformKey(asset.type);
      if (!platformKey) return;
      
      if (metaBundles && (platformKey === "facebook" || platformKey === "instagram" || platformKey === "threads")) {
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
            <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
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

        <div className="mt-4 flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
          {isLoading ? (
            <Flex align="center" justify="center" p="8">
              <Text color="gray" size="2">Loading your accounts...</Text>
            </Flex>
          ) : (orderedPlatforms.length === 0 && !metaBundles) ? (
            <Flex align="center" justify="center" p="8">
              <Text color="gray" size="2" align="center">
                No connected accounts available. Connect providers from your personal integrations first.
              </Text>
            </Flex>
          ) : (
            <div className="space-y-4">
            {/* Meta Portfolio Group */}
            {metaBundles && (metaBundles.ad_accounts.length > 0 || metaBundles.assets_without_ad_account.length > 0) && (
              <Accordion.Root type="single" collapsible className="space-y-2">
                <Accordion.Item value="meta-portfolio" className="border rounded-lg overflow-hidden border-white/10 bg-slate-950/20">
                  <Accordion.Header>
                    <Accordion.Trigger className="w-full">
                      <Flex align="center" justify="between" p="3" className="w-full">
                        <Flex align="center" gap="2">
                          <Box className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                          <Heading size="3">Meta Portfolio</Heading>
                        </Flex>
                        <ChevronDownIcon className="h-4 w-4 transition-transform duration-200" aria-hidden />
                      </Flex>
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content>
                    <div className="px-3 pb-3 space-y-2 pt-3">
                      <Accordion.Root type="multiple" className="space-y-2">
                        {metaBundles.ad_accounts.map((bundle: any) => {
                          const adAccountLabel = bundle.ad_account
                            ? getSelectableAssetLabel(bundle.ad_account)
                            : bundle.ad_account_id;
                          const adAccountId = bundle.ad_account_id;
                          const selectionAssets = (bundle.ad_account ? [bundle.ad_account, ...bundle.assets] : bundle.assets)
                            .filter((asset: SelectableAsset) => Boolean(asset.integration_account_id));
                          
                          const selectedCount = selectionAssets.reduce(
                            (count: number, asset: SelectableAsset) => (asset.integration_account_id && selectedById[asset.integration_account_id] ? count + 1 : count),
                            0
                          );
                          const totalSelectable = selectionAssets.length;
                          const allSelected = totalSelectable > 0 && selectedCount === totalSelectable;
                          const partiallySelected = selectedCount > 0 && selectedCount < totalSelectable;

                          return (
                            <Accordion.Item key={adAccountId} value={adAccountId} className="border rounded-lg overflow-hidden border-white/10 bg-muted/20">
                              <Accordion.Header>
                                <Flex justify="between" align="center" p="3">
                                  <Flex align="center" gap="3" className="min-w-0">
                                    <Checkbox
                                      checked={partiallySelected ? "indeterminate" : allSelected}
                                      disabled={isSaving || totalSelectable === 0}
                                      onCheckedChange={(value) => {
                                        handleToggleSelectableAssets(selectionAssets, value === true);
                                      }}
                                    />
                                    <Box className="min-w-0">
                                      <Text size="2" weight="bold" className="text-black truncate block">{adAccountLabel}</Text>
                                      <Text size="1" color="gray" className="truncate block opacity-60">ID: {adAccountId}</Text>
                                    </Box>
                                  </Flex>
                                  <Flex align="center" gap="3">
                                    <Badge color={selectedCount > 0 ? "indigo" : "gray"} variant="soft">
                                      {selectedCount}/{totalSelectable}
                                    </Badge>
                                    <Accordion.Trigger asChild>
                                      <IconButton variant="ghost" color="gray" size="1" className="group">
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
                                        const id = asset.integration_account_id || asset.asset_pk;
                                        const icon = PlatformIcon({ platform: asset.type });
                                        const isSubItem = Boolean(asset.ad_account_id);

                                        return (
                                          <ShadcnTableRow key={asset.asset_pk} className="border-none hover:bg-muted/50">
                                            <ShadcnTableCell className="py-2 pl-4">
                                              <Flex align="center" gap="2">
                                                <div className="flex items-center justify-center w-6 h-6 text-slate-400/30 shrink-0">
                                                  {isSubItem && (
                                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                      <path d="M4 0V8C4 10.2091 5.79086 12 8 12H16" stroke="currentColor" strokeWidth="1.5" />
                                                    </svg>
                                                  )}
                                                </div>
                                                <Checkbox
                                                  checked={!!id && selectedById[id]}
                                                  disabled={isSaving || !id}
                                                  onCheckedChange={(v) => id && handleToggle(id, v === true)}
                                                />
                                                <Box className="min-w-0">
                                                  <Text size="2" className="text-black font-bold">{getSelectableAssetLabel(asset)}</Text>
                                                  <Text size="1" color="gray" className="block opacity-50 font-mono" style={{ fontSize: '10px' }}>
                                                    ID: {asset.external_id || asset.asset_pk}
                                                  </Text>
                                                </Box>
                                              </Flex>
                                            </ShadcnTableCell>
                                            <ShadcnTableCell className="py-2 text-right">
                                              {icon || (
                                                <Badge color="gray" variant="outline" size="1" className="text-[10px] uppercase opacity-70 text-slate-300 border-slate-700">
                                                  {asset.type.replace('meta_', '')}
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
                      </Accordion.Root>
                    </div>
                  </Accordion.Content>
                </Accordion.Item>
              </Accordion.Root>
            )}

            {/* Google & YouTube Group */}
            {orderedPlatforms.some(p => ["googleAds", "youtube", "dv360"].includes(p.key)) && (
              <Accordion.Root type="single" collapsible className="space-y-2">
                <Accordion.Item value="google-youtube" className="border rounded-lg overflow-hidden border-white/10 bg-slate-950/20">
                  <Accordion.Header>
                    <Accordion.Trigger className="w-full">
                      <Flex align="center" justify="between" p="3" className="w-full">
                        <Flex align="center" gap="2">
                          <Box className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                          <Heading size="3">Google & YouTube</Heading>
                        </Flex>
                        <ChevronDownIcon className="h-4 w-4 transition-transform duration-200" aria-hidden />
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
                            const selectedCount = assets.reduce(
                              (count: number, asset: SelectableAsset) => {
                                const id = asset.integration_account_id || asset.asset_pk;
                                return (id && selectedById[id] ? count + 1 : count);
                              },
                              0
                            );
                            const totalSelectable = assets.length;
                            const allSelected = totalSelectable > 0 && selectedCount === totalSelectable;
                            const partiallySelected = selectedCount > 0 && selectedCount < totalSelectable;

                            return (
                              <Accordion.Item key={key} value={key} className="border rounded-lg overflow-hidden border-white/10 bg-muted/20">
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
                                        <Text size="2" weight="bold" className="text-black truncate block">{label}</Text>
                                      </Box>
                                    </Flex>
                                    <Flex align="center" gap="3">
                                      <Badge color={selectedCount > 0 ? "indigo" : "gray"} variant="soft">
                                        {selectedCount}/{totalSelectable}
                                      </Badge>
                                      <Accordion.Trigger asChild>
                                        <IconButton variant="ghost" color="gray" size="1" className="group">
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
                                          const id = asset.integration_account_id || asset.asset_pk;
                                          return (
                                            <ShadcnTableRow key={asset.asset_pk} className="border-none hover:bg-muted/50">
                                              <ShadcnTableCell className="py-2 pl-8">
                                                <Flex align="center" gap="3">
                                                  <Checkbox
                                                    checked={!!id && selectedById[id]}
                                                    disabled={isSaving || !id}
                                                    onCheckedChange={(v) => id && handleToggle(id, v === true)}
                                                  />
                                                  <Box className="min-w-0">
                                                    <Text size="2" className="text-black font-bold">{getSelectableAssetLabel(asset)}</Text>
                                                    <Flex direction="column" gap="0">
                                                      {asset.business_id && (
                                                        <Text size="1" color="gray" className="block opacity-60">Business: {asset.business_id}</Text>
                                                      )}
                                                      <Text size="1" color="gray" className="block opacity-50 font-mono" style={{ fontSize: '10px' }}>
                                                        ID: {asset.external_id || asset.asset_pk}
                                                      </Text>
                                                    </Flex>
                                                  </Box>
                                                </Flex>
                                              </ShadcnTableCell>
                                              <ShadcnTableCell className="py-2 text-right">
                                                <Badge color="gray" variant="outline" size="1" className="text-[10px] uppercase opacity-70 text-slate-300 border-slate-700">
                                                  {asset.type.replace(`${key}_`, '').replace('ad_account', 'Account')}
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

            {/* Other Platforms (if any) */}
            {orderedPlatforms.some(p => !["googleAds", "youtube", "dv360", "facebook", "instagram", "threads"].includes(p.key)) && (
              <Accordion.Root type="single" collapsible className="space-y-2">
                <Accordion.Item value="other-integrations" className="border rounded-lg overflow-hidden border-white/10 bg-slate-950/20">
                  <Accordion.Header>
                    <Accordion.Trigger className="w-full">
                      <Flex align="center" justify="between" p="3" className="w-full">
                        <Flex align="center" gap="2">
                          <Box className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                          <Heading size="3">Other Integrations</Heading>
                        </Flex>
                        <ChevronDownIcon className="h-4 w-4 transition-transform duration-200" aria-hidden />
                      </Flex>
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content>
                    <div className="px-3 pb-3 space-y-2 pt-3">
                      <Accordion.Root type="multiple" className="space-y-2">
                        {orderedPlatforms
                          .filter(({ key }) => !["googleAds", "youtube", "dv360", "facebook", "instagram", "threads"].includes(key))
                          .map(({ key, label }) => {
                            const assets = groupedAssets[key] ?? [];
                            const selectedCount = assets.reduce(
                              (count: number, asset: SelectableAsset) => {
                                const id = asset.integration_account_id || asset.asset_pk;
                                return (id && selectedById[id] ? count + 1 : count);
                              },
                              0
                            );
                            const totalSelectable = assets.length;
                            const allSelected = totalSelectable > 0 && selectedCount === totalSelectable;
                            const partiallySelected = selectedCount > 0 && selectedCount < totalSelectable;

                            return (
                              <Accordion.Item key={key} value={key} className="border rounded-lg overflow-hidden border-white/10 bg-muted/20">
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
                                        <Text size="2" weight="bold" className="text-black truncate block">{label}</Text>
                                      </Box>
                                    </Flex>
                                    <Flex align="center" gap="3">
                                      <Badge color={selectedCount > 0 ? "indigo" : "gray"} variant="soft">
                                        {selectedCount}/{totalSelectable}
                                      </Badge>
                                      <Accordion.Trigger asChild>
                                        <IconButton variant="ghost" color="gray" size="1" className="group">
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
                                          const id = asset.integration_account_id || asset.asset_pk;
                                          return (
                                            <ShadcnTableRow key={asset.asset_pk} className="border-none hover:bg-muted/50">
                                              <ShadcnTableCell className="py-2 pl-8">
                                                <Flex align="center" gap="3">
                                                  <Checkbox
                                                    checked={!!id && selectedById[id]}
                                                    disabled={isSaving || !id}
                                                    onCheckedChange={(v) => id && handleToggle(id, v === true)}
                                                  />
                                                  <Box className="min-w-0">
                                                    <Text size="2" className="text-black font-bold">{getSelectableAssetLabel(asset)}</Text>
                                                    <Flex direction="column" gap="0">
                                                      {asset.business_id && (
                                                        <Text size="1" color="gray" className="block opacity-60">Business: {asset.business_id}</Text>
                                                      )}
                                                      <Text size="1" color="gray" className="block opacity-50 font-mono" style={{ fontSize: '10px' }}>
                                                        ID: {asset.external_id || asset.asset_pk}
                                                      </Text>
                                                    </Flex>
                                                  </Box>
                                                </Flex>
                                              </ShadcnTableCell>
                                              <ShadcnTableCell className="py-2 text-right">
                                                <Badge color="gray" variant="outline" size="1" className="text-[10px] uppercase opacity-70 text-slate-300 border-slate-700">
                                                  {asset.type.replace(`${key}_`, '').replace('ad_account', 'Account')}
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
          <Button variant="soft" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
            {isSaving ? "Saving..." : "Save Assignments"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export function BrandIntegrationsCard({
  brandProfileId,
  summary,
  showHeader = true,
  isLoading = false,
  onRefresh,
}: Props) {
  const resolvedSummary = summary ?? ({} as BrandIntegrationSummary);
  const [editOpen, setEditOpen] = useState(false);
  const [expandedViewPlatforms, setExpandedViewPlatforms] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const { show } = useToast();
  const startMetaSync = useStartMetaSync();
  const startGoogleSync = useStartGoogleSync();

  const handleConnect = async (platformKey: string) => {
    setIsSyncing(true);
    try {
      const context = brandProfileId ?? "settings"; 
      
      // Map platform keys to sync groups
      let group = "google";
      if (["facebook", "instagram", "threads", "meta"].includes(platformKey)) {
        group = "meta";
      }
      
      const callbackUrl = buildCallbackUrl(group, context);
      
      let popupUrl: string | null = null;
      if (group === "meta") {
        const res = await startMetaSync.mutateAsync(callbackUrl);
        popupUrl = res.url;
      } else {
        const res = await startGoogleSync.mutateAsync(callbackUrl);
        popupUrl = res.url;
      }

      if (popupUrl) {
        const popup = openCenteredPopup(popupUrl, `Connect ${group}`, 600, 700);
        if (popup) {
          await waitForPopupClosed(popup);
          if (onRefresh) await onRefresh();
        }
      }
    } catch (error) {
      console.error(error);
      show({ title: "Connection failed", description: "Could not start OAuth flow.", variant: "error" });
    } finally {
      setIsSyncing(false);
    }
  };

  const assignedIds = useMemo(
    () => extractAssignedIntegrationAccountIds(resolvedSummary),
    [resolvedSummary]
  );

  const providerStats = useMemo(() => {
    const metaKeys: PlatformKey[] = ["facebook", "instagram", "threads"];
    const googleKeys: PlatformKey[] = ["googleAds", "youtube", "dv360"];
    const otherKeys = PLATFORMS.filter(
      p => !metaKeys.includes(p.key) && !googleKeys.includes(p.key)
    ).map(p => p.key);

    const getGroupStats = (keys: PlatformKey[], label: string, groupKey: string) => {
      let totalConnected = 0;
      let totalAccounts = 0;
      const allAccounts: any[] = [];

      keys.forEach(key => {
        const accounts = resolvedSummary[key]?.accounts ?? [];
        if (accounts.length > 0) totalConnected++;
        totalAccounts += accounts.length;
        allAccounts.push(...accounts.map(a => ({ ...a, _platformKey: key })));
      });

      return {
        key: groupKey,
        label,
        connected: totalConnected > 0,
        count: totalAccounts,
        accounts: allAccounts,
        platforms: keys
      };
    };

    return [
      getGroupStats(metaKeys, "Meta Portfolio", "meta"),
      getGroupStats(googleKeys, "Google & YouTube", "google"),
      ...(otherKeys.length > 0 ? [getGroupStats(otherKeys, "Other Integrations", "other")] : [])
    ];
  }, [resolvedSummary]);

  const toggleViewPlatform = (key: string) => {
    const next = new Set(expandedViewPlatforms);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedViewPlatforms(next);
  };

  return (
    <Flex direction="column" gap="5">
      {showHeader && (
        <Flex justify="between" align="start">
          <Box>
            <Heading size="6" className="text-white">
              Integrations
            </Heading>
            <Text color="gray" size="2">
              Manage accounts linked to this brand profile.
            </Text>
          </Box>
          <Flex gap="2">
            {brandProfileId && (
              <Button
                variant="ghost"
                onClick={() => setEditOpen(true)}
                disabled={isLoading}
              >
                Edit assignments
              </Button>
            )}
            {onRefresh && (
              <IconButton
                variant="ghost"
                onClick={() => onRefresh()}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </IconButton>
            )}
          </Flex>
        </Flex>
      )}

      {brandProfileId && (
        <AssignmentsDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          brandProfileId={brandProfileId}
          assignedIds={assignedIds}
          onSaved={onRefresh}
        />
      )}

      <div className="rounded-lg border bg-card border-white/10 overflow-hidden shadow-lg backdrop-blur-md">
        <ShadcnTable>
          <ShadcnTableHeader>
            <ShadcnTableRow className="bg-white/5 hover:bg-white/5 border-white/10">
              <ShadcnTableHead className="w-[40px]"></ShadcnTableHead>
              <ShadcnTableHead className="text-black font-bold">Provider</ShadcnTableHead>
              <ShadcnTableHead className="text-black font-bold">Status</ShadcnTableHead>
              <ShadcnTableHead className="text-right text-black font-bold">Assigned Assets</ShadcnTableHead>
              <ShadcnTableHead className="w-[140px]"></ShadcnTableHead>
            </ShadcnTableRow>
          </ShadcnTableHeader>
          <ShadcnTableBody>
            {providerStats.map((group) => {
              const isExpanded = expandedViewPlatforms.has(group.key);
              const statusColor = group.connected ? "green" : "gray";
              
              return (
                <React.Fragment key={group.key}>
                  <ShadcnTableRow 
                    className={`cursor-pointer border-white/5 transition-colors ${group.count > 0 ? 'hover:bg-white/5' : 'opacity-60'}`}
                    onClick={() => group.count > 0 && toggleViewPlatform(group.key)}
                  >
                    <ShadcnTableCell className="py-4">
                      {group.count > 0 && (
                        <ChevronDownIcon className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      )}
                    </ShadcnTableCell>
                    <ShadcnTableCell className="py-4">
                      <Flex align="center" gap="3">
                        <Text weight="bold" className="text-black">{group.label}</Text>
                      </Flex>
                    </ShadcnTableCell>
                    <ShadcnTableCell className="py-4">
                      <Badge color={statusColor as any} variant="soft" className="font-bold text-[10px]">
                        {group.connected ? "ACTIVE" : "NONE"}
                      </Badge>
                    </ShadcnTableCell>
                    <ShadcnTableCell className="py-4 text-right">
                      {group.count > 0 ? (
                        <Badge variant="outline" className="bg-indigo-500/5 text-indigo-400 border-indigo-500/20 font-bold tabular-nums">
                          {group.count} accounts
                        </Badge>
                      ) : (
                        <Text size="1" color="gray">None</Text>
                      )}
                    </ShadcnTableCell>
                    <ShadcnTableCell className="py-4 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                      <Button 
                        size="1" 
                        variant={group.connected ? "ghost" : "surface"}
                        onClick={() => handleConnect(group.key)}
                        disabled={isSyncing || isLoading}
                        className="h-6 text-[10px] font-bold uppercase tracking-wider px-2"
                      >
                        {isSyncing ? "Syncing..." : group.connected ? "Re-sync" : "Sync"}
                      </Button>
                    </ShadcnTableCell>
                  </ShadcnTableRow>
                  
                  {isExpanded && group.accounts.length > 0 && (
                    <ShadcnTableRow className="bg-muted/30 border-none hover:bg-muted/30">
                      <ShadcnTableCell colSpan={5} className="p-0 border-b border-white/5">
                        <Box p="4" className="bg-muted/20">
                          <div className="space-y-2 pl-8">
                            {group.accounts.map((account: any) => {
                              const sColor = resolveStatusColor(account.status);
                              const platformName = PLATFORMS.find(p => p.key === account._platformKey)?.label;
                              return (
                                <Flex key={account.integrationAccountId} justify="between" align="center" className="py-1">
                                  <Flex align="center" gap="3">
                                      <Box className="min-w-0">
                                        <Text size="2" className="text-black block truncate font-bold">{account.name}</Text>
                                        <Flex gap="2" align="center">
                                          {PlatformIcon({ platform: account._platformKey }) || (
                                            <Badge variant="outline" className="text-[9px] uppercase opacity-50 px-1 py-0 h-4">
                                              {platformName}
                                            </Badge>
                                          )}
                                          <Text size="1" color="gray" className="block font-mono opacity-60" style={{ fontSize: '10px' }}>
                                            ID: {account.externalAccountId || account.integrationAccountId}
                                          </Text>
                                        </Flex>
                                      </Box>
                                  </Flex>
                                  <Badge color={sColor as any} variant="soft" size="1" className="text-[9px] uppercase tracking-wider opacity-80">
                                    {account.status || 'Active'}
                                  </Badge>
                                </Flex>
                              );
                            })}
                          </div>
                        </Box>
                      </ShadcnTableCell>
                    </ShadcnTableRow>
                  )}
                </React.Fragment>
              );
            })}
          </ShadcnTableBody>
        </ShadcnTable>
      </div>

      <Callout.Root color="amber" className="bg-amber-500/5 border-amber-500/20">
        <Callout.Icon>
          <ExclamationTriangleIcon />
        </Callout.Icon>
        <Callout.Text size="1">
          Connect providers in your personal settings, then use “Edit assignments” to share them here.
        </Callout.Text>
      </Callout.Root>
    </Flex>
  );
}
