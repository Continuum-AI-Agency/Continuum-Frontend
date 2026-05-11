"use client";

import React, { useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Box,
  Button,
  Callout,
  Flex,
  Heading,
  IconButton,
  Text,
} from "@radix-ui/themes";
import { ChevronDownIcon, ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { RefreshCw } from "lucide-react";
import { PLATFORMS, type PlatformKey } from "@/components/onboarding/platforms";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import {
  applyBrandAssignmentsDirect,
  fetchUserTikTokAccountIds,
  useStartGoogleSync,
  useStartMetaSync,
  useStartTikTokSync,
} from "@/lib/api/integrations";
import { useToast } from "@/components/ui/ToastProvider";
import { openCenteredPopup, waitForPopupClosed } from "@/lib/popup";
import { useBrandIntegrations } from "@/hooks/useBrandIntegrations";
import {
  Table as ShadcnTable,
  TableBody as ShadcnTableBody,
  TableCell as ShadcnTableCell,
  TableHead as ShadcnTableHead,
  TableHeader as ShadcnTableHeader,
  TableRow as ShadcnTableRow,
} from "@/components/ui/table";
import { AssignmentsDialog } from "./AssignmentsDialog";
import { PlatformIcon } from "./internal/PlatformIcon";
import { resolveStatusColor } from "./internal/statusColors";

export type BrandIntegrationsManagerProps = {
  brandProfileId?: string;
  summary?: BrandIntegrationSummary;
  isLoading?: boolean;
  onRefresh?: () => Promise<void> | void;
  showHeader?: boolean;
  emptyHint?: ReactNode;
};

type ProviderGroup = {
  key: string;
  label: string;
  connected: boolean;
  count: number;
  accounts: Array<
    BrandIntegrationSummary[PlatformKey] extends { accounts: infer A }
      ? A extends Array<infer Acc>
        ? Acc & { _platformKey: PlatformKey }
        : never
      : never
  >;
  platforms: PlatformKey[];
};

function buildCallbackUrl(group: string, context: string): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  const url = new URL("/integrations/callback", origin);
  const provider = ["facebook", "meta", "instagram", "threads"].includes(group)
    ? "meta"
    : group === "tiktok"
      ? "tiktok"
      : "google";
  url.searchParams.set("provider", provider);
  url.searchParams.set("context", context);
  return url.toString();
}

function extractAssignedIntegrationAccountIds(summary: BrandIntegrationSummary): string[] {
  const set = new Set<string>();
  PLATFORMS.forEach(({ key }) => {
    summary[key]?.accounts.forEach((account) => set.add(account.integrationAccountId));
  });
  return Array.from(set);
}

export function BrandIntegrationsManager({
  brandProfileId,
  summary,
  isLoading: isLoadingProp = false,
  onRefresh,
  showHeader = true,
  emptyHint,
}: BrandIntegrationsManagerProps) {
  const { show } = useToast();

  const fetched = useBrandIntegrations(summary ? undefined : brandProfileId, summary);
  const resolvedSummary = (summary ?? fetched.integrations ?? ({} as BrandIntegrationSummary));
  const isLoading = isLoadingProp || (summary ? false : fetched.isLoading);
  const refresh = onRefresh ?? fetched.refresh;

  const [editOpen, setEditOpen] = useState(false);
  const [expandedViewPlatforms, setExpandedViewPlatforms] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);

  const startMetaSync = useStartMetaSync();
  const startGoogleSync = useStartGoogleSync();
  const startTikTokSync = useStartTikTokSync();

  const handleConnect = async (platformKey: string) => {
    setIsSyncing(true);
    try {
      const context = brandProfileId ?? "settings";

      let group = "google";
      if (["facebook", "instagram", "threads", "meta"].includes(platformKey)) {
        group = "meta";
      } else if (platformKey === "tiktok") {
        group = "tiktok";
      }

      const callbackUrl = buildCallbackUrl(group, context);

      let popupUrl: string | null = null;
      if (group === "meta") {
        const res = await startMetaSync.mutateAsync(callbackUrl);
        popupUrl = res.url;
      } else if (group === "tiktok") {
        const res = await startTikTokSync.mutateAsync(callbackUrl);
        popupUrl = res.url;
      } else {
        const res = await startGoogleSync.mutateAsync(callbackUrl);
        popupUrl = res.url;
      }

      if (popupUrl) {
        const popup = openCenteredPopup(popupUrl, `Connect ${group}`, 600, 700);
        if (popup) {
          await waitForPopupClosed(popup);
          if (group === "tiktok" && brandProfileId) {
            try {
              const tiktokIds = await fetchUserTikTokAccountIds();
              if (tiktokIds.length > 0) {
                await applyBrandAssignmentsDirect(brandProfileId, tiktokIds);
                show({
                  title: "TikTok connected",
                  description: "Account assigned to this brand.",
                  variant: "success",
                });
              }
            } catch (err) {
              console.error("[BrandIntegrationsManager] TikTok auto-assign failed", err);
            }
          }
          if (refresh) await refresh();
        }
      }
    } catch (error) {
      console.error(error);
      show({
        title: "Connection failed",
        description: "Could not start OAuth flow.",
        variant: "error",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const assignedIds = useMemo(
    () => extractAssignedIntegrationAccountIds(resolvedSummary),
    [resolvedSummary]
  );

  const providerStats = useMemo<ProviderGroup[]>(() => {
    const metaKeys: PlatformKey[] = ["facebook", "instagram", "threads"];
    const googleKeys: PlatformKey[] = ["googleAds", "youtube", "dv360"];
    const tiktokKeys: PlatformKey[] = ["tiktok"];
    const otherKeys = PLATFORMS.filter(
      (p) => !metaKeys.includes(p.key) && !googleKeys.includes(p.key) && !tiktokKeys.includes(p.key)
    ).map((p) => p.key);

    const getGroupStats = (
      keys: PlatformKey[],
      label: string,
      groupKey: string
    ): ProviderGroup => {
      let totalConnected = 0;
      let totalAccounts = 0;
      const allAccounts: ProviderGroup["accounts"] = [];

      keys.forEach((key) => {
        const accounts = resolvedSummary[key]?.accounts ?? [];
        if (accounts.length > 0) totalConnected++;
        totalAccounts += accounts.length;
        allAccounts.push(
          ...accounts.map((a) => ({ ...a, _platformKey: key }) as ProviderGroup["accounts"][number])
        );
      });

      return {
        key: groupKey,
        label,
        connected: totalConnected > 0,
        count: totalAccounts,
        accounts: allAccounts,
        platforms: keys,
      };
    };

    return [
      getGroupStats(metaKeys, "Meta Portfolio", "meta"),
      getGroupStats(googleKeys, "Google & YouTube", "google"),
      getGroupStats(tiktokKeys, "TikTok", "tiktok"),
      ...(otherKeys.length > 0 ? [getGroupStats(otherKeys, "Other Integrations", "other")] : []),
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
              <Button variant="ghost" onClick={() => setEditOpen(true)} disabled={isLoading}>
                Edit assignments
              </Button>
            )}
            {refresh && (
              <IconButton variant="ghost" onClick={() => refresh()} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </IconButton>
            )}
          </Flex>
        </Flex>
      )}

      {!showHeader && brandProfileId && (
        <Flex justify="end" gap="2">
          <Button variant="soft" onClick={() => setEditOpen(true)} disabled={isLoading}>
            Edit assignments
          </Button>
          {refresh && (
            <IconButton variant="ghost" onClick={() => refresh()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </IconButton>
          )}
        </Flex>
      )}

      {brandProfileId && (
        <AssignmentsDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          brandProfileId={brandProfileId}
          summary={resolvedSummary}
          assignedIds={assignedIds}
          onSaved={refresh}
        />
      )}

      <div className="rounded-lg border bg-card border-white/10 overflow-hidden shadow-lg backdrop-blur-md">
        <ShadcnTable>
          <ShadcnTableHeader>
            <ShadcnTableRow className="bg-white/5 hover:bg-white/5 border-white/10">
              <ShadcnTableHead className="w-[40px]"></ShadcnTableHead>
              <ShadcnTableHead className="text-black font-bold">Provider</ShadcnTableHead>
              <ShadcnTableHead className="text-black font-bold">Status</ShadcnTableHead>
              <ShadcnTableHead className="text-right text-black font-bold">
                Assigned Assets
              </ShadcnTableHead>
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
                    className={`cursor-pointer border-white/5 transition-colors ${
                      group.count > 0 ? "hover:bg-white/5" : "opacity-60"
                    }`}
                    onClick={() => group.count > 0 && toggleViewPlatform(group.key)}
                  >
                    <ShadcnTableCell className="py-4">
                      {group.count > 0 && (
                        <ChevronDownIcon
                          className={`h-4 w-4 transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      )}
                    </ShadcnTableCell>
                    <ShadcnTableCell className="py-4">
                      <Flex align="center" gap="3">
                        <Text weight="bold" className="text-black">
                          {group.label}
                        </Text>
                      </Flex>
                    </ShadcnTableCell>
                    <ShadcnTableCell className="py-4">
                      <Badge
                        color={statusColor}
                        variant="soft"
                        className="font-bold text-[10px]"
                      >
                        {group.connected ? "ACTIVE" : "NONE"}
                      </Badge>
                    </ShadcnTableCell>
                    <ShadcnTableCell className="py-4 text-right">
                      {group.count > 0 ? (
                        <Badge
                          variant="outline"
                          className="bg-indigo-500/5 text-indigo-400 border-indigo-500/20 font-bold tabular-nums"
                        >
                          {group.count} accounts
                        </Badge>
                      ) : (
                        <Text size="1" color="gray">
                          None
                        </Text>
                      )}
                    </ShadcnTableCell>
                    <ShadcnTableCell
                      className="py-4 text-right pr-6"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                            {group.accounts.map((account) => {
                              const sColor = resolveStatusColor(account.status);
                              const platformName = PLATFORMS.find(
                                (p) => p.key === account._platformKey
                              )?.label;
                              return (
                                <Flex
                                  key={account.integrationAccountId}
                                  justify="between"
                                  align="center"
                                  className="py-1"
                                >
                                  <Flex align="center" gap="3">
                                    <Box className="min-w-0">
                                      <Text
                                        size="2"
                                        className="text-black block truncate font-bold"
                                      >
                                        {account.name}
                                      </Text>
                                      <Flex gap="2" align="center">
                                        {PlatformIcon({ platform: account._platformKey }) || (
                                          <Badge
                                            variant="outline"
                                            className="text-[9px] uppercase opacity-50 px-1 py-0 h-4"
                                          >
                                            {platformName}
                                          </Badge>
                                        )}
                                        <Text
                                          size="1"
                                          color="gray"
                                          className="block font-mono opacity-60"
                                          style={{ fontSize: "10px" }}
                                        >
                                          ID: {account.externalAccountId || account.integrationAccountId}
                                        </Text>
                                      </Flex>
                                    </Box>
                                  </Flex>
                                  <Badge
                                    color={sColor}
                                    variant="soft"
                                    size="1"
                                    className="text-[9px] uppercase tracking-wider opacity-80"
                                  >
                                    {account.status || "Active"}
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
          {emptyHint ??
            "Connect providers in your personal settings, then use “Edit assignments” to share them here."}
        </Callout.Text>
      </Callout.Root>
    </Flex>
  );
}
