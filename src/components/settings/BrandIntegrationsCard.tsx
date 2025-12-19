"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Card,
  Dialog,
  Flex,
  Grid,
  Heading,
  Text,
} from "@radix-ui/themes";
import { ExclamationTriangleIcon, Link2Icon } from "@radix-ui/react-icons";
import { PLATFORMS, type PlatformKey } from "@/components/onboarding/platforms";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import { useApplyBrandProfileIntegrationAccounts, useSelectableAssets } from "@/lib/api/integrations";
import type { SelectableAsset } from "@/lib/schemas/integrations";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";
import { useToast } from "@/components/ui/ToastProvider";

type Props = {
  brandProfileId?: string;
  summary?: BrandIntegrationSummary;
  showHeader?: boolean;
  isLoading?: boolean;
  onRefresh?: () => Promise<void> | void;
};

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

function groupSelectableAssets(
  assets: SelectableAsset[]
): Record<PlatformKey, SelectableAsset[]> {
  const grouped = PLATFORMS.reduce((acc, { key }) => {
    acc[key] = [];
    return acc;
  }, {} as Record<PlatformKey, SelectableAsset[]>);

  assets.forEach(asset => {
    const platformKey = mapIntegrationTypeToPlatformKey(asset.type);
    if (!platformKey) return;
    grouped[platformKey].push(asset);
  });

  return grouped;
}

function resolveSelectableAssetLabel(asset: Pick<SelectableAsset, "name" | "external_id">): string {
  return asset.name?.trim() || asset.external_id;
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

  const selectableAssets = selectableAssetsQuery.data?.assets ?? [];
  const groupedAssets = useMemo(
    () => groupSelectableAssets(selectableAssets),
    [selectableAssets]
  );

  const [selectedById, setSelectedById] = useState<Record<string, boolean>>(
    {}
  );

  useEffect(() => {
    if (!open) return;
    const assignedSet = new Set(assignedIds);
    const defaults: Record<string, boolean> = {};
    selectableAssets.forEach(asset => {
      if (!asset.integration_account_id) return;
      defaults[asset.integration_account_id] = assignedSet.has(
        asset.integration_account_id
      );
    });
    setSelectedById(prev => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(defaults);
      if (prevKeys.length !== nextKeys.length) return defaults;
      for (const key of nextKeys) {
        if (prev[key] !== defaults[key]) return defaults;
      }
      return prev;
    });
  }, [
    open,
    useMemo(() => [...assignedIds].sort().join("|"), [assignedIds]),
    useMemo(
      () =>
        selectableAssets
          .map(asset => asset.integration_account_id)
          .filter((value): value is string => Boolean(value))
          .sort()
          .join("|"),
      [selectableAssets]
    ),
  ]);

  const desiredIntegrationAccountIds = useMemo(
    () =>
      Object.entries(selectedById)
        .filter(([, selected]) => selected)
        .map(([integrationAccountId]) => integrationAccountId),
    [selectedById]
  );

  const hasChanges = useMemo(() => {
    const assignedSet = new Set(assignedIds);
    if (desiredIntegrationAccountIds.length !== assignedSet.size) return true;
    return desiredIntegrationAccountIds.some(
      integrationAccountId => !assignedSet.has(integrationAccountId)
    );
  }, [assignedIds, desiredIntegrationAccountIds]);

  const handleToggle = (integrationAccountId: string, checked: boolean) => {
    setSelectedById(prev => ({ ...prev, [integrationAccountId]: checked }));
  };

  const handleSave = async () => {
    try {
      const result = await applyAssignments.mutateAsync({
        brandId: brandProfileId,
        integrationAccountIds: desiredIntegrationAccountIds,
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
  const unassignableCount = useMemo(
    () =>
      selectableAssets.filter(asset => !asset.integration_account_id).length,
    [selectableAssets]
  );

  const orderedPlatforms = PLATFORMS.filter(
    ({ key }) => groupedAssets[key]?.length
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="520px">
        <Dialog.Title>Edit brand assignments</Dialog.Title>
        <Dialog.Description>
          Choose which of your connected provider accounts are shared with this
          brand profile.
        </Dialog.Description>

        {stale ? (
          <Callout.Root color="amber" className="mt-3">
            <Callout.Text>
              Your integrations are marked stale. Refresh your provider sync in
              Settings → Your integrations if you don’t see recent accounts.
            </Callout.Text>
          </Callout.Root>
        ) : null}

        {unassignableCount > 0 ? (
          <Callout.Root color="amber" className="mt-3">
            <Callout.Text>
              {unassignableCount} connected account(s) cannot be assigned yet.
              Sync again if they should be available.
            </Callout.Text>
          </Callout.Root>
        ) : null}

        {syncedAt ? (
          <Text size="1" color="gray" className="mt-2">
            Last synced {new Date(syncedAt).toLocaleString()}
          </Text>
        ) : null}

        <div className="mt-4 flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
          {isLoading ? (
            <Text color="gray" size="2">
              Loading your accounts...
            </Text>
          ) : orderedPlatforms.length === 0 ? (
            <Text color="gray" size="2">
              No connected accounts available yet. Connect providers from your
              personal integrations first.
            </Text>
          ) : (
            orderedPlatforms.map(({ key, label }) => {
              const assets = groupedAssets[key] ?? [];
              if (!assets.length) return null;
              return (
                <div key={key} className="flex flex-col gap-2">
                  <Heading size="3">{label}</Heading>
                  <div className="flex flex-col gap-2">
                    {assets.map(asset => {
                      const integrationAccountId =
                        asset.integration_account_id;
                      const checked = integrationAccountId
                        ? selectedById[integrationAccountId] ?? false
                        : false;
                      const disabled = isSaving || !integrationAccountId;
                      return (
                        <label
                          key={asset.asset_pk}
                          className="flex items-center justify-between gap-3 rounded border border-white/10 bg-slate-950/40 px-3 py-2"
                        >
                          <div className="flex flex-col">
                            <Text size="2" weight="medium" className="truncate">
                              {resolveSelectableAssetLabel(asset)}
                            </Text>
                            {asset.business_id ? (
                              <Text size="1" color="gray">
                                Business {asset.business_id}
                              </Text>
                            ) : !integrationAccountId ? (
                              <Text size="1" color="gray">
                                Not ready for assignment
                              </Text>
                            ) : null}
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={event =>
                              integrationAccountId
                                ? handleToggle(
                                    integrationAccountId,
                                    event.target.checked
                                  )
                                : undefined
                            }
                            disabled={disabled}
                            className="h-4 w-4 accent-sky-500"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <Flex justify="end" gap="3" className="mt-5">
          <Button
            variant="soft"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? "Saving..." : "Save"}
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

  const assignedIds = useMemo(
    () => extractAssignedIntegrationAccountIds(resolvedSummary),
    [resolvedSummary]
  );

  return (
    <Flex direction="column" gap="5">
      {showHeader ? (
        <>
          <Heading size="6" className="text-white">
            Integrations
          </Heading>
          <Flex align="center" justify="between" wrap="wrap" gap="3">
            <Text color="gray">
              Review which social and ads accounts are linked to this brand
              profile. Assignments reflect the accounts currently shared with
              this brand.
            </Text>
            <Flex gap="2" wrap="wrap">
              {brandProfileId ? (
                <Button
                  variant="ghost"
                  onClick={() => setEditOpen(true)}
                  disabled={isLoading}
                >
                  Edit assignments
                </Button>
              ) : null}
              {onRefresh ? (
                <Button
                  variant="ghost"
                  onClick={() => onRefresh()}
                  disabled={isLoading}
                >
                  Refresh
                </Button>
              ) : null}
            </Flex>
          </Flex>
        </>
      ) : null}

      {brandProfileId ? (
        <AssignmentsDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          brandProfileId={brandProfileId}
          assignedIds={assignedIds}
          onSaved={onRefresh}
        />
      ) : null}

      <Grid columns={{ initial: "1", sm: "2", md: "3" }} gap="3">
        {PLATFORMS.map(({ key, label }) => {
          const accounts = resolvedSummary[key]?.accounts ?? [];
          const badge = formatConnectionBadge(accounts.length);

          return (
            <Card
              key={key}
              className="bg-slate-950/60 backdrop-blur-xl border border-white/10"
            >
              <Flex direction="column" gap="3" p="4">
                <Flex align="center" justify="between">
                  <Flex align="center" gap="2">
                    <Link2Icon />
                    <Text weight="medium">{label}</Text>
                  </Flex>
                  <Badge color={badge.color}>{badge.label}</Badge>
                </Flex>
                {isLoading ? (
                  <Text color="gray" size="2">
                    Loading connections...
                  </Text>
                ) : accounts.length > 0 ? (
                  <Flex direction="column" gap="1">
                    {accounts.map(account => {
                      const statusColor = resolveStatusColor(account.status);
                      return (
                        <Flex
                          key={account.integrationAccountId}
                          justify="between"
                          align="center"
                        >
                          <Text color="gray" size="2" className="truncate">
                            {account.name}
                          </Text>
                          {account.status ? (
                            <Badge
                              color={statusColor}
                              size="1"
                              variant="soft"
                            >
                              {account.status}
                            </Badge>
                          ) : null}
                        </Flex>
                      );
                    })}
                  </Flex>
                ) : (
                  <Text color="gray" size="2">
                    No accounts assigned yet.
                  </Text>
                )}
              </Flex>
            </Card>
          );
        })}
      </Grid>

      <Callout.Root color="amber">
        <Callout.Icon>
          <ExclamationTriangleIcon />
        </Callout.Icon>
        <Callout.Text>
          Connect providers from your personal integrations, then use “Edit
          assignments” to share accounts with this brand.
        </Callout.Text>
      </Callout.Root>
    </Flex>
  );
}
