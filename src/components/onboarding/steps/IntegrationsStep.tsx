"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { useStartMetaSync, useStartGoogleSync, fetchSelectableAssets } from "@/lib/api/integrations";
import { associateIntegrationAccountsAction } from "@/app/onboarding/actions";
import { openCenteredPopup, waitForPopupClosed } from "@/lib/popup";
import { PLATFORMS, type PlatformKey } from "@/components/onboarding/platforms";
import { 
  FACEBOOK_OAUTH_KEYS, 
  GOOGLE_OAUTH_KEYS, 
  COMING_SOON_KEYS,
} from "@/components/onboarding/integrations/constants";
import { PlatformIcon } from "@/components/onboarding/PlatformIcons";
import type { OnboardingPatch, OnboardingConnectionAccount } from "@/lib/onboarding/state";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/ToastProvider";
import { ArrowRight, RefreshCw, ChevronDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Flex, Text, Box, Heading, Switch } from "@radix-ui/themes";

export function IntegrationsStep() {
  const { state, updateState, brandId } = useOnboarding();
  const { show } = useToast();
  
  const startMetaSync = useStartMetaSync();
  const startGoogleSync = useStartGoogleSync();
  const [isSyncing, setIsSyncing] = useState(false);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());

  const refreshAccounts = async () => {
    setIsSyncing(true);
    try {
      const data = await fetchSelectableAssets() as any; 
      const connectionsPatch: Partial<OnboardingPatch["connections"]> = {};
      
      const metaIntegrations = (data.providers?.meta?.hierarchy as any)?.meta?.integrations || (data.providers?.meta?.hierarchy as any)?.integrations || [];
      const metaAccounts: OnboardingConnectionAccount[] = [];
      
      metaIntegrations.forEach((int: any) => {
        if (int.businesses) {
          int.businesses.forEach((biz: any) => {
            const bizId = biz.business_id;
            const bizName = biz.business_name;

            biz.ad_accounts?.forEach((adGrp: any) => {
              const adAccountId = adGrp.ad_account_id;
              if (adGrp.ad_account) {
                  metaAccounts.push({
                    id: adGrp.ad_account.integration_account_id || adGrp.ad_account.asset_pk,
                    name: adGrp.ad_account.name,
                    status: "active",
                    selected: false,
                    metadata: { 
                      type: "meta_ad_account", 
                      businessId: bizId, 
                      businessName: bizName || "Direct Assets",
                      externalId: adGrp.ad_account.external_id
                    }
                  });
              }
              adGrp.pages?.forEach((p: any) => {
                metaAccounts.push({
                  id: p.integration_account_id || p.asset_pk,
                  name: p.name,
                  status: "active",
                  selected: false,
                  metadata: { 
                    type: "meta_page", 
                    parentId: adAccountId, 
                    businessId: bizId 
                  }
                });
              });
              adGrp.instagram_accounts?.forEach((i: any) => {
                metaAccounts.push({
                  id: i.integration_account_id || i.asset_pk,
                  name: i.name,
                  status: "active",
                  selected: false,
                  metadata: { 
                    type: "meta_instagram_account", 
                    parentId: adAccountId, 
                    businessId: bizId 
                  }
                });
              });
            });
            biz.pages_without_ad_account?.forEach((p: any) => {
              metaAccounts.push({
                id: p.integration_account_id || p.asset_pk,
                name: p.name,
                status: "active",
                selected: false,
                metadata: { type: "meta_page", businessId: bizId }
              });
            });
            biz.instagram_accounts_without_ad_account?.forEach((i: any) => {
              metaAccounts.push({
                id: i.integration_account_id || i.asset_pk,
                name: i.name,
                status: "active",
                selected: false,
                metadata: { type: "meta_instagram_account", businessId: bizId }
              });
            });
          });
        }
      });

      if (metaAccounts.length > 0) {
        connectionsPatch["facebook"] = {
          connected: true,
          accountId: null,
          accounts: metaAccounts,
          lastSyncedAt: new Date().toISOString(),
        };
      }

      const googleIntegrations = (data.providers?.google?.hierarchy as any)?.google?.integrations || (data.providers?.google?.hierarchy as any)?.integrations || [];
      const googleAdsAccounts: OnboardingConnectionAccount[] = [];
      const youtubeAccounts: OnboardingConnectionAccount[] = [];

      googleIntegrations.forEach((int: any) => {
        if (int.ad_accounts) {
          int.ad_accounts.forEach((ad: any) => {
            googleAdsAccounts.push({
              id: ad.integration_account_id || ad.asset_pk,
              name: ad.name,
              status: "active",
              selected: false,
              metadata: { 
                type: "google_ads_customer",
                integrationId: int.integration_id
              }
            });
          });
        }
        if (int.youtube_channels) {
          int.youtube_channels.forEach((yt: any) => {
            youtubeAccounts.push({
              id: yt.integration_account_id || yt.asset_pk,
              name: yt.name,
              status: "active",
              selected: false,
              metadata: { 
                type: "youtube_channel",
                parentId: int.integration_id
              }
            });
          });
        }
      });

      if (googleAdsAccounts.length > 0) {
        connectionsPatch["googleAds"] = {
          connected: true,
          accountId: null,
          accounts: googleAdsAccounts,
          lastSyncedAt: new Date().toISOString(),
        };
      }

      if (youtubeAccounts.length > 0) {
        connectionsPatch["youtube"] = {
          connected: true,
          accountId: null,
          accounts: youtubeAccounts,
          lastSyncedAt: new Date().toISOString(),
        };
      }

      if (Object.keys(connectionsPatch).length > 0) {
        await updateState({ connections: connectionsPatch });
        show({ title: "Hub Synchronized", description: "Asset hierarchy updated.", variant: "success" });
        
        const newExpanded = new Set<string>();
        if (metaAccounts.length > 0) newExpanded.add("meta");
        if (googleAdsAccounts.length > 0 || youtubeAccounts.length > 0) newExpanded.add("google");
        setExpandedPlatforms(newExpanded);
      }
    } catch (e) {
      console.error("Refresh failed", e);
      show({ title: "Sync Failed", description: "Could not retrieve hierarchy.", variant: "error" });
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    refreshAccounts();
  }, []);

  const handleConnect = async (group: "google" | "facebook") => {
    setIsSyncing(true);
    try {
      const context = brandId; 
      const callbackUrl = buildCallbackUrl(group, context);
      
      let popupUrl: string | null = null;
      if (group === "facebook") {
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
          await refreshAccounts(); 
        }
      }
    } catch (error) {
      console.error(error);
      show({ title: "Connection failed", description: "Could not start OAuth flow.", variant: "error" });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = async (group: "google" | "facebook") => {
    const keys = group === "facebook" ? FACEBOOK_OAUTH_KEYS : GOOGLE_OAUTH_KEYS;
    const patch: any = {};
    keys.forEach(key => {
      patch[key] = { connected: false, accounts: [], accountId: null };
    });
    await updateState({ connections: patch });
  };

  const toggleAccount = async (key: PlatformKey, accountId: string, checked: boolean) => {
    const connection = state.connections[key];
    if (!connection) return;
    
    const targetAccount = connection.accounts.find(a => a.id === accountId);
    const affectedIds = new Set([accountId]);

    if (targetAccount?.metadata?.type === "meta_ad_account" || targetAccount?.metadata?.type === "google_ads_customer" || key === "googleAds") {
      connection.accounts.forEach(acc => {
        const isChildOfTarget = acc.metadata?.parentId === accountId || 
                               acc.metadata?.parentId === targetAccount?.id || 
                               (targetAccount?.metadata?.externalId && acc.metadata?.parentId === targetAccount.metadata.externalId);
        
        const isGoogleChild = key === "googleAds" && (targetAccount?.metadata?.type === "google_ads_customer" || !targetAccount?.metadata?.type);
        
        if (isChildOfTarget || (isGoogleChild && acc.id !== accountId)) {
          affectedIds.add(acc.id);
        }
      });
    }
    
    const accounts = connection.accounts.map(acc => 
      affectedIds.has(acc.id) ? { ...acc, selected: checked } : acc
    );
    
    updateState({
      connections: {
        [key]: {
          ...connection,
          accounts,
        }
      }
    });
  };

  const onContinue = async () => {
    await updateState({ step: 2 });
  };

  const togglePlatform = (id: string) => {
    const next = new Set(expandedPlatforms);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedPlatforms(next);
  };

  const platformGroups = useMemo(() => {
    const googleKeys = GOOGLE_OAUTH_KEYS;
    const metaKeys = FACEBOOK_OAUTH_KEYS;

    const getStats = (keys: PlatformKey[]) => {
      let total = 0;
      let selected = 0;
      let connected = false;
      keys.forEach(k => {
        const conn = state.connections[k];
        if (conn?.connected) connected = true;
        total += conn?.accounts.length || 0;
        selected += conn?.accounts.filter(a => a.selected).length || 0;
      });
      return { total, selected, connected };
    };

    return [
      { id: "google", name: "Google & YouTube", icon: "google", ...getStats(googleKeys) },
      { id: "meta", name: "Meta Portfolio", icon: "meta", ...getStats(metaKeys) },
    ];
  }, [state.connections]);

  return (
    <Box className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      <Flex align="center" justify="between" mb="4">
        <Box>
          <Heading size="6" weight="bold">Integrations Hub</Heading>
          <Text color="gray" size="2">Connect and manage your marketing infrastructure.</Text>
        </Box>
        <Button 
          variant="outline" 
          onClick={refreshAccounts} 
          disabled={isSyncing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
          Refresh Assets
        </Button>
      </Flex>

      <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Connection</TableHead>
              <TableHead className="text-right">Assets</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {platformGroups.map((group) => {
              const isExpanded = expandedPlatforms.has(group.id);
              return (
                <React.Fragment key={group.id}>
                  <TableRow 
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => togglePlatform(group.id)}
                  >
                    <TableCell>
                      <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </TableCell>
                    <TableCell>
                      <Flex align="center" gap="3">
                        <PlatformIcon platform={group.id as any} size={20} />
                        <Text weight="bold">{group.name}</Text>
                      </Flex>
                    </TableCell>
                    <TableCell>
                      <Badge variant={group.connected ? "default" : "secondary"} className="font-bold text-[10px]">
                        {group.connected ? "ACTIVE" : "DISCONNECTED"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Flex justify="end" gap="2" align="center">
                        <Text size="1" weight="medium" color="gray">{group.total} found</Text>
                        {group.selected > 0 && (
                          <Badge variant="outline" className="bg-indigo-500/5 text-indigo-500 border-indigo-500/20">
                            {group.selected} active
                          </Badge>
                        )}
                      </Flex>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
                      <Button 
                        size="sm" 
                        variant={group.connected ? "outline" : "default"}
                        onClick={() => handleConnect(group.id as any)}
                        disabled={isSyncing}
                        className="h-7 text-[10px] font-bold uppercase tracking-wider px-3"
                      >
                        {group.connected ? "RE-SYNC" : "SYNC ACCOUNT"}
                      </Button>
                    </TableCell>
                  </TableRow>
                  
                  {isExpanded && (
                    <TableRow className="bg-muted/5 hover:bg-muted/5 border-b-0">
                      <TableCell colSpan={5} className="p-0 border-b">
                        <Box p="4" className="bg-muted/10">
                          {group.id === "google" ? (
                            <div className="space-y-6 pl-4">
                              {GOOGLE_OAUTH_KEYS.map(key => {
                                const accounts = state.connections[key]?.accounts || [];
                                if (accounts.length === 0) return null;
                                return (
                                  <div key={key} className="space-y-2">
                                    <Flex align="center" gap="2" mb="1">
                                      <PlatformIcon platform={key} size={14} />
                                      <Text size="1" weight="bold" className="uppercase tracking-wider opacity-60">
                                        {PLATFORMS.find(p => p.key === key)?.label}
                                      </Text>
                                    </Flex>
                                    <div className="rounded-md border bg-background overflow-hidden">
                                      <Table>
                                        <TableBody>
                                          {accounts.map(acc => (
                                            <TableRow 
                                              key={acc.id} 
                                              className="h-10 hover:bg-muted/20 cursor-pointer select-none"
                                              onClick={() => toggleAccount(key, acc.id, !acc.selected)}
                                            >
                                              <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                                                <Checkbox 
                                                  checked={acc.selected} 
                                                  onCheckedChange={(c) => toggleAccount(key, acc.id, c === true)} 
                                                />
                                              </TableCell>
                                              <TableCell className="text-sm font-medium">{acc.name}</TableCell>
                                              <TableCell className="text-right">
                                                <Badge variant="outline" className="text-[9px] uppercase font-bold opacity-50">
                                                  {key === "youtube" ? "YouTube Channel" : "Ad Account"}
                                                </Badge>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="space-y-6 pl-4">
                              {(() => {
                                const accounts = state.connections["facebook"]?.accounts || [];
                                const businesses: Record<string, { name: string, assets: any[] }> = {};
                                accounts.forEach(acc => {
                                  const bizId = acc.metadata?.businessId || "no-business";
                                  const bizName = acc.metadata?.businessName || "Direct Assets";
                                  if (!businesses[bizId]) businesses[bizId] = { name: bizName, assets: [] };
                                  businesses[bizId].assets.push(acc);
                                });

                                return Object.entries(businesses).map(([bizId, biz]) => (
                                  <div key={bizId} className="space-y-2">
                                    <Flex justify="between" align="center" mb="1">
                                      <Text size="1" weight="bold" className="uppercase tracking-wider opacity-60">
                                        {biz.name}
                                      </Text>
                                      {bizId !== "no-business" && (
                                        <Text size="1" color="gray" className="font-mono opacity-40">
                                          BID: {bizId}
                                        </Text>
                                      )}
                                    </Flex>
                                    <div className="rounded-md border bg-background overflow-hidden">
                                      <Table>
                                        <TableBody>
                                          {biz.assets.sort((a, b) => (a.metadata?.type === "meta_ad_account" ? -1 : 1)).map(acc => {
                                            const isChild = !!acc.metadata?.parentId;
                                            const type = acc.metadata?.type || "";
                                            const label = type === "meta_ad_account" ? "Ad Account" : 
                                                         type === "meta_page" ? "Page" : 
                                                         type === "meta_instagram_account" ? "Instagram Account" : "Asset";
                                            
                                            const iconKey = type === "meta_instagram_account" ? "instagram" : 
                                                           type === "meta_page" ? "facebook" : "facebook";

                                            return (
                                              <TableRow 
                                                key={acc.id} 
                                                className="h-10 hover:bg-muted/20 cursor-pointer select-none"
                                                onClick={() => toggleAccount("facebook", acc.id, !acc.selected)}
                                              >
                                                <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                                                  <Flex align="center">
                                                    {isChild && <div className="w-3 h-3 mr-2 border-l border-b rounded-bl-sm opacity-30" />}
                                                    <Checkbox 
                                                      checked={acc.selected} 
                                                      onCheckedChange={(c) => toggleAccount("facebook", acc.id, c === true)} 
                                                    />
                                                  </Flex>
                                                </TableCell>
                                                <TableCell>
                                                  <Flex align="center" gap="2">
                                                    <PlatformIcon platform={iconKey as any} size={14} className={isChild ? "opacity-50" : ""} />
                                                    <Box>
                                                      <Text size="2" weight={isChild ? "medium" : "bold"} className={isChild ? "text-muted-foreground" : ""}>
                                                        {acc.name}
                                                      </Text>
                                                      {!isChild && type === "meta_ad_account" && (
                                                        <Text size="1" color="gray" className="font-mono opacity-40 block -mt-1" style={{ fontSize: '9px' }}>
                                                          ACC: {acc.id}
                                                        </Text>
                                                      )}
                                                    </Box>
                                                  </Flex>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                  <Badge variant="outline" className="text-[8px] uppercase font-bold opacity-40">
                                                    {label}
                                                  </Badge>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                ));
                              })()}
                            </div>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-12 opacity-50">
        <Flex align="center" gap="3" mb="4">
          <Text size="1" weight="bold" className="uppercase tracking-[0.2em] text-muted-foreground">Expansion Queue</Text>
          <div className="h-px flex-1 bg-border" />
        </Flex>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {COMING_SOON_KEYS.map(key => (
            <div key={key} className="border border-dashed p-3 rounded-lg flex items-center gap-3 grayscale">
              <PlatformIcon platform={key} />
              <Text size="2" weight="medium">{PLATFORMS.find(p => p.key === key)?.label}</Text>
            </div>
          ))}
        </div>
      </div>

      <Flex justify="between" pt="6" className="border-t">
        <Button variant="ghost" onClick={() => updateState({ step: 0 })} className="font-medium">
          Back to Brand Profile
        </Button>
        <Button onClick={onContinue} size="lg" className="min-w-[200px] font-bold shadow-lg shadow-indigo-500/10">
          Finish Setup <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </Flex>
    </Box>
  );
}

function buildCallbackUrl(group: "google" | "facebook", context: string): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  const url = new URL("/integrations/callback", origin);
  const provider = group === "facebook" ? "meta" : "google";
  url.searchParams.set("provider", provider);
  url.searchParams.set("context", context);
  return url.toString();
}
