"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Loader2, Plug, Search, TriangleAlert, X } from "lucide-react";
import {
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { type PlatformKey } from "@/components/onboarding/platforms";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import {
  useUserIntegrationAssets,
  type UserIntegrationAssetRow,
} from "@/lib/api/integrations";
import { applyBrandIntegrationAssignmentsAction } from "@/app/(post-auth)/settings/integrations/actions";
import type { BrandMember } from "@/lib/onboarding/state";
import { getMemberDisplayName } from "@/lib/brands/memberDisplay";
import type { SelectableAsset } from "@/lib/schemas/integrations";
import {
  getMetaSelectableAdAccountBundles,
  getSelectableAssetsFlatList,
  mergeSelectableAssetsWithBrandSummary,
} from "@/lib/integrations/selectableAssets";
import { buildAssignmentSections } from "@/lib/integrations/assignmentGroups";
import { AssignmentAccountList } from "@/components/integrations/internal/AssignmentAccountList";
import { useToast } from "@/components/ui/ToastProvider";
import { useMetaAutoResync } from "@/hooks/useMetaAutoResync";

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
  const [query, setQuery] = useState("");

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

  const metaBundles = useMemo(
    () => (selectableAssetsData ? getMetaSelectableAdAccountBundles(selectableAssetsData) : null),
    [selectableAssetsData]
  );

  const sections = useMemo(
    () => buildAssignmentSections(selectableAssetsData, metaBundles),
    [selectableAssetsData, metaBundles]
  );

  const totalSelectable = useMemo(() => {
    const ids = new Set<string>();
    sections.forEach((section) => {
      section.rows.forEach((row) => ids.add(row.selectionId));
      section.extraSelectionIds.forEach((id) => ids.add(id));
    });
    return ids.size;
  }, [sections]);

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
    setQuery("");
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

  const handleToggleMany = (ids: string[], checked: boolean) => {
    setSelectedById((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        if (!isLockedForCaller(id)) next[id] = checked;
      });
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await applyBrandIntegrationAssignmentsAction(brandProfileId, desiredAssetIds);
      onOpenChange(false);
      router.refresh();
      await onSaved?.();
      show({
        title: "Assignments updated",
        description: `Linked ${result.linked} account(s).`,
        variant: "success",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update assignments.";
      show({ title: "Update failed", description: message, variant: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = userAssetsQuery.isLoading;
  const stale = selectableAssetsData?.stale;
  const syncedAt = selectableAssetsData?.synced_at;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Transparent overlay: keeps the workspace visible behind the drawer
            (no dimming) while still closing on outside click / Escape. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l bg-background shadow-2xl transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-md"
        >
          <SheetHeader className="gap-2 border-b border-border/60 px-5 py-4">
            <SheetTitle>Assign accounts</SheetTitle>
            <SheetDescription>Choose which connected accounts this brand can use.</SheetDescription>

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">{desiredAssetIds.length}</span>
                {" of "}
                <span className="tabular-nums">{totalSelectable}</span>
                {" selected"}
              </span>
              {syncedAt ? (
                <span className="text-2xs text-muted-foreground">Synced {formatDate(syncedAt)}</span>
              ) : null}
            </div>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter accounts"
                aria-label="Filter accounts"
                className="pl-8"
              />
            </div>

            {stale ? (
              <Alert className="py-2">
                <TriangleAlert />
                <AlertDescription>
                  Integrations are stale. Refresh sync in Settings to see recent accounts.
                </AlertDescription>
              </Alert>
            ) : null}

            {isResyncing ? (
              <Alert className="py-2">
                <Loader2 className="animate-spin" />
                <AlertDescription>Refreshing your Meta accounts…</AlertDescription>
              </Alert>
            ) : resyncError ? (
              <Alert variant="destructive" className="py-2">
                <TriangleAlert />
                <AlertDescription>
                  Couldn&apos;t refresh Meta accounts. {resyncError}{" "}
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    onClick={triggerResync}
                  >
                    Retry
                  </button>
                </AlertDescription>
              </Alert>
            ) : metaConnectedButNoAdAccounts ? (
              <Alert className="py-2">
                <TriangleAlert />
                <AlertDescription>
                  Meta is connected but no ad accounts were found.{" "}
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    onClick={triggerResync}
                  >
                    Refresh Meta accounts
                  </button>
                </AlertDescription>
              </Alert>
            ) : null}
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-4 py-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1].map((group) => (
                    <div key={group} className="overflow-hidden rounded-lg border border-border/60">
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-4 w-36" />
                      </div>
                      <div className="space-y-2 border-t border-border/60 p-2">
                        {[0, 1].map((row) => (
                          <div key={row} className="flex items-center gap-3">
                            <Skeleton className="h-4 w-4 rounded" />
                            <Skeleton className="h-7 w-7 rounded-md" />
                            <Skeleton className="h-4 w-40" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : sections.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-5 py-10 text-center">
                  <Plug className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
                  <p className="text-sm font-medium text-foreground">No connected accounts</p>
                  <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                    Connect providers from your personal integrations first, then assign them here.
                  </p>
                </div>
              ) : (
                <AssignmentAccountList
                  sections={sections}
                  query={query}
                  selectedById={selectedById}
                  isSaving={isSaving}
                  isLocked={isLockedForCaller}
                  ownerCaption={ownerCaption}
                  onToggle={handleToggle}
                  onToggleMany={handleToggleMany}
                />
              )}
            </div>
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t border-border/60 px-5 py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving
                </>
              ) : (
                "Save"
              )}
            </Button>
          </SheetFooter>

          <DialogPrimitive.Close className="ring-offset-background focus:ring-ring absolute right-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
