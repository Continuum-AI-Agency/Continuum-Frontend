'use client';

import { ChevronDownIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { RefreshCw } from 'lucide-react';
import React, { type ComponentProps, type ReactNode, useMemo, useState } from 'react';
import { applyBrandIntegrationAssignmentsAction } from '@/app/(post-auth)/settings/integrations/actions';
import { Pill } from '@/components/kibo-ui/pill';
import { PLATFORMS, type PlatformKey } from '@/components/onboarding/platforms';
import { isProviderComingSoon } from '@/components/settings/shell/platformIcons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import {
  Table as ShadcnTable,
  TableBody as ShadcnTableBody,
  TableCell as ShadcnTableCell,
  TableHead as ShadcnTableHead,
  TableHeader as ShadcnTableHeader,
  TableRow as ShadcnTableRow,
} from '@/components/ui/table';
import { useBrandIntegrations } from '@/hooks/useBrandIntegrations';
import {
  fetchUserLinkedInAccountIds,
  fetchUserTikTokAccountIds,
  fetchUserXAccountIds,
  useStartGoogleSync,
  useStartLinkedInSync,
  useStartMetaSync,
  useStartTikTokSync,
  useStartXSync,
} from '@/lib/api/integrations';
import type { BrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import { openCenteredPopup, waitForPopupClosed } from '@/lib/popup';
import { AssignmentsDialog } from './AssignmentsDialog';
import { PlatformIcon } from './internal/PlatformIcon';
import { resolveStatusColor, type StatusColor } from './internal/statusColors';

const STATUS_PILL_VARIANT: Record<StatusColor, ComponentProps<typeof Pill>['variant']> = {
  green: 'success',
  amber: 'warning',
  red: 'destructive',
  gray: 'muted',
};

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
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  const url = new URL('/integrations/callback', origin);
  const provider = ['facebook', 'meta', 'instagram', 'threads'].includes(group)
    ? 'meta'
    : group === 'tiktok'
      ? 'tiktok'
      : group === 'linkedin'
        ? 'linkedin'
        : group === 'x'
          ? 'x'
          : 'google';
  url.searchParams.set('provider', provider);
  url.searchParams.set('context', context);
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
  const resolvedSummary = summary ?? fetched.integrations ?? ({} as BrandIntegrationSummary);
  const isLoading = isLoadingProp || (summary ? false : fetched.isLoading);
  const refresh = onRefresh ?? fetched.refresh;

  const [editOpen, setEditOpen] = useState(false);
  const [expandedViewPlatforms, setExpandedViewPlatforms] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);

  const startMetaSync = useStartMetaSync();
  const startGoogleSync = useStartGoogleSync();
  const startTikTokSync = useStartTikTokSync();
  const startLinkedInSync = useStartLinkedInSync();
  const startXSync = useStartXSync();

  const handleConnect = async (platformKey: string) => {
    if (isProviderComingSoon(platformKey)) return;
    setIsSyncing(true);
    try {
      const context = brandProfileId ?? 'settings';

      let group = 'google';
      if (['facebook', 'instagram', 'threads', 'meta'].includes(platformKey)) {
        group = 'meta';
      } else if (platformKey === 'tiktok') {
        group = 'tiktok';
      } else if (platformKey === 'linkedin') {
        group = 'linkedin';
      } else if (platformKey === 'x') {
        group = 'x';
      }

      const callbackUrl = buildCallbackUrl(group, context);

      let popupUrl: string | null = null;
      if (group === 'meta') {
        const res = await startMetaSync.mutateAsync(callbackUrl);
        popupUrl = res.url;
      } else if (group === 'tiktok') {
        const res = await startTikTokSync.mutateAsync(callbackUrl);
        popupUrl = res.url;
      } else if (group === 'linkedin') {
        const res = await startLinkedInSync.mutateAsync({
          callbackUrl,
          mode: platformKey === 'linkedin' ? 'organic' : 'paid',
        });
        popupUrl = res.url;
      } else if (group === 'x') {
        const res = await startXSync.mutateAsync(callbackUrl);
        popupUrl = res.url;
      } else {
        const res = await startGoogleSync.mutateAsync(callbackUrl);
        popupUrl = res.url;
      }

      if (popupUrl) {
        const popup = openCenteredPopup(popupUrl, `Connect ${group}`, 600, 700);
        if (popup) {
          await waitForPopupClosed(popup);
          if (group === 'tiktok' && brandProfileId) {
            try {
              const tiktokIds = await fetchUserTikTokAccountIds();
              if (tiktokIds.length > 0) {
                // Merge with existing assignments; the action replaces the full
                // set, so passing only these ids would unassign other providers.
                await applyBrandIntegrationAssignmentsAction(
                  brandProfileId,
                  Array.from(new Set([...assignedIds, ...tiktokIds])),
                );
                show({
                  title: 'TikTok connected',
                  description: 'Account assigned to this brand.',
                  variant: 'success',
                });
              }
            } catch (err) {
              console.error('[BrandIntegrationsManager] TikTok auto-assign failed', err);
            }
          }
          if (group === 'x' && brandProfileId) {
            try {
              const xIds = await fetchUserXAccountIds();
              if (xIds.length > 0) {
                // Merge with existing assignments; the action replaces the full
                // set, so passing only these ids would unassign other providers.
                await applyBrandIntegrationAssignmentsAction(
                  brandProfileId,
                  Array.from(new Set([...assignedIds, ...xIds])),
                );
                show({
                  title: 'X connected',
                  description: 'Account assigned to this brand.',
                  variant: 'success',
                });
              }
            } catch (err) {
              console.error('[BrandIntegrationsManager] X auto-assign failed', err);
            }
          }
          if (group === 'linkedin' && brandProfileId) {
            try {
              const linkedinIds = await fetchUserLinkedInAccountIds({
                type: platformKey === 'linkedin' ? 'linkedin_organization' : 'linkedin_ad_account',
              });
              if (linkedinIds.length > 0) {
                // Merge with existing assignments; the action replaces the full
                // set, so passing only these ids would unassign other providers.
                await applyBrandIntegrationAssignmentsAction(
                  brandProfileId,
                  Array.from(new Set([...assignedIds, ...linkedinIds])),
                );
                show({
                  title: 'LinkedIn connected',
                  description: 'Accounts assigned to this brand.',
                  variant: 'success',
                });
              }
            } catch (err) {
              console.error('[BrandIntegrationsManager] LinkedIn auto-assign failed', err);
            }
          }
          if (refresh) await refresh();
        }
      }
    } catch (error) {
      console.error(error);
      show({
        title: 'Connection failed',
        description: 'Could not start OAuth flow.',
        variant: 'error',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const assignedIds = useMemo(
    () => extractAssignedIntegrationAccountIds(resolvedSummary),
    [resolvedSummary],
  );

  const providerStats = useMemo<ProviderGroup[]>(() => {
    const metaKeys: PlatformKey[] = ['facebook', 'instagram', 'threads'];
    const googleKeys: PlatformKey[] = ['googleAds', 'youtube', 'dv360', 'googleAnalytics'];
    const tiktokKeys: PlatformKey[] = ['tiktok'];
    const linkedinKeys: PlatformKey[] = ['linkedin'];
    const xKeys: PlatformKey[] = ['x'];
    const otherKeys = PLATFORMS.filter(
      (p) =>
        !metaKeys.includes(p.key) &&
        !googleKeys.includes(p.key) &&
        !tiktokKeys.includes(p.key) &&
        !linkedinKeys.includes(p.key) &&
        !xKeys.includes(p.key),
    ).map((p) => p.key);

    const getGroupStats = (keys: PlatformKey[], label: string, groupKey: string): ProviderGroup => {
      let totalConnected = 0;
      let totalAccounts = 0;
      const allAccounts: ProviderGroup['accounts'] = [];

      keys.forEach((key) => {
        const accounts = resolvedSummary[key]?.accounts ?? [];
        if (accounts.length > 0) totalConnected++;
        totalAccounts += accounts.length;
        allAccounts.push(
          ...accounts.map(
            (a) => ({ ...a, _platformKey: key }) as ProviderGroup['accounts'][number],
          ),
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
      getGroupStats(metaKeys, 'Meta Portfolio', 'meta'),
      getGroupStats(googleKeys, 'Google & YouTube', 'google'),
      getGroupStats(tiktokKeys, 'TikTok', 'tiktok'),
      getGroupStats(linkedinKeys, 'LinkedIn', 'linkedin'),
      getGroupStats(xKeys, 'X', 'x'),
      ...(otherKeys.length > 0 ? [getGroupStats(otherKeys, 'Other Integrations', 'other')] : []),
    ];
  }, [resolvedSummary]);

  const toggleViewPlatform = (key: string) => {
    const next = new Set(expandedViewPlatforms);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedViewPlatforms(next);
  };

  return (
    <div className="flex flex-col gap-6">
      {showHeader && (
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Integrations</h2>
            <p className="text-sm text-muted-foreground">
              Manage accounts linked to this brand profile.
            </p>
          </div>
          <div className="flex gap-2">
            {brandProfileId && (
              <Button variant="ghost" onClick={() => setEditOpen(true)} disabled={isLoading}>
                Edit assignments
              </Button>
            )}
            {refresh && (
              <Button variant="ghost" size="icon" onClick={() => refresh()} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>
      )}

      {!showHeader && brandProfileId && (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditOpen(true)} disabled={isLoading}>
            Edit assignments
          </Button>
          {refresh && (
            <Button variant="ghost" size="icon" onClick={() => refresh()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
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
              <ShadcnTableHead className="font-bold text-foreground">Provider</ShadcnTableHead>
              <ShadcnTableHead className="font-bold text-foreground">Status</ShadcnTableHead>
              <ShadcnTableHead className="text-right font-bold text-foreground">
                Assigned Assets
              </ShadcnTableHead>
              <ShadcnTableHead className="w-[140px]"></ShadcnTableHead>
            </ShadcnTableRow>
          </ShadcnTableHeader>
          <ShadcnTableBody>
            {providerStats.map((group) => {
              const isExpanded = expandedViewPlatforms.has(group.key);
              const comingSoon = isProviderComingSoon(group.key);
              const statusColor: StatusColor = comingSoon
                ? 'gray'
                : group.connected
                  ? 'green'
                  : 'gray';

              return (
                <React.Fragment key={group.key}>
                  <ShadcnTableRow
                    className={`cursor-pointer border-white/5 transition-colors ${
                      group.count > 0 && !comingSoon ? 'hover:bg-white/5' : 'opacity-60'
                    }`}
                    onClick={() => group.count > 0 && toggleViewPlatform(group.key)}
                  >
                    <ShadcnTableCell className="py-4">
                      {group.count > 0 && (
                        <ChevronDownIcon
                          className={`h-4 w-4 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                          aria-hidden="true"
                        />
                      )}
                    </ShadcnTableCell>
                    <ShadcnTableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-foreground">{group.label}</span>
                      </div>
                    </ShadcnTableCell>
                    <ShadcnTableCell className="py-4">
                      <Pill
                        variant={STATUS_PILL_VARIANT[statusColor]}
                        className="text-2xs font-bold"
                      >
                        {comingSoon ? 'COMING SOON' : group.connected ? 'ACTIVE' : 'NONE'}
                      </Pill>
                    </ShadcnTableCell>
                    <ShadcnTableCell className="py-4 text-right">
                      {group.count > 0 ? (
                        <Pill variant="violet" className="font-bold tabular-nums">
                          {group.count} accounts
                        </Pill>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </ShadcnTableCell>
                    <ShadcnTableCell
                      className="py-4 text-right pr-6"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        variant={group.connected ? 'ghost' : 'outline'}
                        onClick={() => handleConnect(group.key)}
                        disabled={isSyncing || isLoading || comingSoon}
                        className="h-6 text-2xs font-bold uppercase tracking-wider px-2"
                      >
                        {comingSoon
                          ? 'Coming soon'
                          : isSyncing
                            ? 'Syncing...'
                            : group.connected
                              ? 'Re-sync'
                              : 'Sync'}
                      </Button>
                    </ShadcnTableCell>
                  </ShadcnTableRow>

                  {isExpanded && group.accounts.length > 0 && (
                    <ShadcnTableRow className="bg-muted/30 border-none hover:bg-muted/30">
                      <ShadcnTableCell colSpan={5} className="p-0 border-b border-white/5">
                        <div className="bg-muted/20 p-4">
                          <div className="space-y-2 pl-8">
                            {group.accounts.map((account) => {
                              const sColor = resolveStatusColor(account.status);
                              const platformName = PLATFORMS.find(
                                (p) => p.key === account._platformKey,
                              )?.label;
                              return (
                                <div
                                  key={account.integrationAccountId}
                                  className="flex items-center justify-between py-1"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="min-w-0">
                                      <span className="block truncate text-sm font-semibold text-foreground">
                                        {account.name}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        {PlatformIcon({ platform: account._platformKey }) || (
                                          <Pill
                                            variant="muted"
                                            className="h-4 px-1 py-0 text-3xs uppercase opacity-50"
                                          >
                                            {platformName}
                                          </Pill>
                                        )}
                                        <span
                                          className="block font-mono text-muted-foreground opacity-60"
                                          style={{ fontSize: '10px' }}
                                        >
                                          ID:{' '}
                                          {account.externalAccountId ||
                                            account.integrationAccountId}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <Pill
                                    variant={STATUS_PILL_VARIANT[sColor]}
                                    className="text-3xs uppercase tracking-wider opacity-80"
                                  >
                                    {account.status || 'Active'}
                                  </Pill>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </ShadcnTableCell>
                    </ShadcnTableRow>
                  )}
                </React.Fragment>
              );
            })}
          </ShadcnTableBody>
        </ShadcnTable>
      </div>

      <Alert className="border-warning/30 bg-warning/5">
        <ExclamationTriangleIcon className="text-warning" aria-hidden="true" />
        <AlertDescription className="text-xs">
          {emptyHint ??
            'Connect providers in your personal settings, then use “Edit assignments” to share them here.'}
        </AlertDescription>
      </Alert>
    </div>
  );
}
