'use client';

import { Plus, RefreshCw, TriangleAlert, Unplug, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/ToastProvider';
import {
  useDeauthorizeGoogle,
  useDeauthorizeLinkedIn,
  useDeauthorizeMeta,
  useDeauthorizeTikTok,
  useDeauthorizeX,
  useStartGoogleAccountChooserSync,
  useStartGoogleSync,
  useStartLinkedInSync,
  useStartMetaSync,
  useStartTikTokSync,
  useStartXSync,
} from '@/lib/api/integrations';
import { getProviderConnectionSummary } from '@/lib/integrations/providerConnections';
import type {
  ProviderReconnectPrompt,
  UserIntegrationSummary,
} from '@/lib/integrations/userIntegrations';
import { openCenteredPopup, waitForOAuthCompletion } from '@/lib/popup';
import { cn } from '@/lib/utils';
import {
  isProviderComingSoon,
  PROVIDER_GROUP_DESCRIPTIONS,
  PROVIDER_GROUP_ICONS,
  PROVIDER_GROUP_LABELS,
  PROVIDER_GROUPS,
  type ProviderGroup,
} from '../shell/platformIcons';

type ConnectProviderPopoverProps = {
  integrations: UserIntegrationSummary;
  reconnectPrompts?: ProviderReconnectPrompt[];
  children?: React.ReactNode;
};

export function ConnectProviderPopover({
  integrations,
  reconnectPrompts = [],
  children,
}: ConnectProviderPopoverProps) {
  const { show } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const metaSync = useStartMetaSync();
  const googleSync = useStartGoogleSync();
  // #151: same shape as googleSync (mutateAsync(callbackUrl): Promise<GoogleSyncResponse>),
  // just forces Google's account chooser server-side so a user can link Ads
  // under a different Google identity than the one already connected.
  const googleAccountChooserSync = useStartGoogleAccountChooserSync();
  const tiktokSync = useStartTikTokSync();
  const linkedinSync = useStartLinkedInSync();
  const xSync = useStartXSync();
  const metaDeauthorize = useDeauthorizeMeta();
  const googleDeauthorize = useDeauthorizeGoogle();
  const tiktokDeauthorize = useDeauthorizeTikTok();
  const linkedinDeauthorize = useDeauthorizeLinkedIn();
  const xDeauthorize = useDeauthorizeX();

  const buildCallbackUrl = (provider: ProviderGroup) => {
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000');
    const url = new URL('/integrations/callback', origin);
    url.searchParams.set('provider', provider);
    url.searchParams.set('context', 'settings');
    return url.toString();
  };

  const handleConnect = (
    provider: ProviderGroup,
    options?: { forceAccountChooser?: boolean; linkedinMode?: 'paid' | 'organic' },
  ) => {
    if (isProviderComingSoon(provider)) return;
    startTransition(async () => {
      let cleanup: (() => void) | undefined;
      try {
        const callbackUrl = buildCallbackUrl(provider);
        const sync =
          provider === 'google'
            ? options?.forceAccountChooser
              ? googleAccountChooserSync
              : googleSync
            : provider === 'tiktok'
              ? tiktokSync
              : provider === 'linkedin'
                ? linkedinSync
                : provider === 'x'
                  ? xSync
                  : metaSync;
        const syncResponse =
          provider === 'linkedin'
            ? await linkedinSync.mutateAsync({
                callbackUrl,
                mode: options?.linkedinMode ?? 'paid',
              })
            : await sync.mutateAsync(callbackUrl);
        const expectedState = 'state' in syncResponse ? syncResponse.state : null;

        const popup = openCenteredPopup(
          syncResponse.url,
          provider === 'linkedin' && options?.linkedinMode === 'organic'
            ? 'Connect LinkedIn Organic'
            : provider === 'linkedin'
              ? 'Connect LinkedIn Ads'
              : `Connect ${PROVIDER_GROUP_LABELS[provider]}`,
        );
        if (!popup) {
          show({
            title: 'Popup blocked',
            description: 'Allow popups to continue.',
            variant: 'error',
          });
          return;
        }

        const abortCtrl = new AbortController();
        const timeoutId = window.setTimeout(() => {
          try {
            popup?.close();
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
        const predicate = (m: Msg) =>
          m.provider === provider &&
          m.context === 'settings' &&
          (!expectedState || m.state === expectedState);

        // Races postMessage + BroadcastChannel completion signals against the
        // popup closing, and only treats "closed" as a user cancellation when
        // neither signal ever arrived. This is required for Google: its own
        // Cross-Origin-Opener-Policy header severs window.opener, so the
        // postMessage the callback page sends silently no-ops and only the
        // BroadcastChannel signal gets through.
        const result = await waitForOAuthCompletion<Msg>({
          popup,
          predicate,
          signal: abortCtrl.signal,
        });
        if (!result.provider || result.provider !== provider) {
          show({
            title: 'Connection incomplete',
            description: 'Provider could not be verified.',
            variant: 'error',
          });
          cleanup();
          return;
        }

        try {
          popup.close();
        } catch {
          /* ignore */
        }
        cleanup();
        router.refresh();
        if (result.warning === 'no_ads_accounts' || result.warning === 'ads_enrichment_failed') {
          // Distinct from a hard failure: the token connected fine, but no
          // Google Ads accounts were found under this identity (see #151).
          show({
            title: 'Connected, with a note',
            description:
              'No Google Ads accounts were found for this account. Use "Connect a different Google account for Ads" if Ads lives under another identity.',
            variant: 'info',
          });
        } else if (result.warning === 'ga4_scope_missing') {
          // The token was stored, but Google didn't grant analytics.readonly —
          // usually a connection re-authorized without re-approving the consent
          // screen. No GA4 property can sync until it is granted.
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
              "Couldn't read your Google Analytics properties. Everything else connected — try reconnecting if GA4 data stays missing.",
            variant: 'info',
          });
        } else if (result.warning === 'meta_partial_sync') {
          // Meta connected, but one or more Graph edges came back degraded, so
          // some accounts may be missing (see #154). The asset picker retries a
          // background resync on open, so this is a heads-up, not a failure.
          show({
            title: 'Connected, with a note',
            description:
              "Some Meta accounts may not have loaded. We'll keep trying — reopen the account picker in a moment if any are missing.",
            variant: 'info',
          });
        } else {
          const linkedInLabel =
            provider === 'linkedin'
              ? options?.linkedinMode === 'organic'
                ? 'LinkedIn Organic'
                : 'LinkedIn Ads'
              : PROVIDER_GROUP_LABELS[provider];
          show({
            title: 'Connected',
            description: `${linkedInLabel} accounts synced.`,
            variant: 'success',
          });
        }
      } catch (error) {
        show({
          title: 'Connection failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'error',
        });
      } finally {
        try {
          cleanup?.();
        } catch {
          /* ignore */
        }
      }
    });
  };

  const handleDisconnect = (provider: ProviderGroup) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Disconnect ${PROVIDER_GROUP_LABELS[provider]}? This revokes access to your accounts.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        if (provider === 'google') {
          await googleDeauthorize.mutateAsync();
        } else if (provider === 'tiktok') {
          const account = integrations.tiktok?.accounts[0];
          if (!account?.externalAccountId) throw new Error('No TikTok account found.');
          await tiktokDeauthorize.mutateAsync(account.externalAccountId);
        } else if (provider === 'linkedin') {
          await linkedinDeauthorize.mutateAsync(undefined);
        } else if (provider === 'x') {
          const account = integrations.x?.accounts[0];
          if (!account?.externalAccountId) throw new Error('No X account found.');
          await xDeauthorize.mutateAsync(account.externalAccountId);
        } else {
          await metaDeauthorize.mutateAsync();
        }
        router.refresh();
        show({
          title: 'Disconnected',
          description: `${PROVIDER_GROUP_LABELS[provider]} access revoked.`,
          variant: 'success',
        });
      } catch (error) {
        show({
          title: 'Unable to disconnect',
          description: error instanceof Error ? error.message : 'Please retry shortly.',
          variant: 'error',
        });
      }
    });
  };

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
          <p className="text-sm font-semibold text-foreground">Connections</p>
          <p className="text-xs text-muted-foreground">OAuth providers tied to your account.</p>
        </div>
        <div className="mt-1 space-y-1">
          {PROVIDER_GROUPS.map((providerId) => {
            const comingSoon = isProviderComingSoon(providerId);
            const connectionSummary = comingSoon
              ? null
              : getProviderConnectionSummary(integrations, providerId);
            const connected = connectionSummary?.connected ?? false;
            const Icon = PROVIDER_GROUP_ICONS[providerId];
            const reconnectPrompt = connected
              ? reconnectPrompts.find((prompt) => prompt.provider === providerId)
              : undefined;
            return (
              <div key={providerId}>
                <div
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
                        {PROVIDER_GROUP_LABELS[providerId]}
                      </p>
                      {comingSoon ? (
                        <Badge variant="secondary" className="h-4 px-1.5 text-2xs">
                          Coming soon
                        </Badge>
                      ) : connected ? (
                        <Badge variant="secondary" className="h-4 px-1.5 text-2xs">
                          Connected
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {connected && connectionSummary && connectionSummary.accountNames.length > 0
                        ? connectionSummary.accountNames.join(', ')
                        : PROVIDER_GROUP_DESCRIPTIONS[providerId]}
                    </p>
                  </div>
                  {comingSoon ? (
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled>
                      Coming soon
                    </Button>
                  ) : connected ? (
                    <div className="flex items-center gap-1">
                      {providerId === 'google' ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Connect a different Google account for Ads"
                          onClick={() => handleConnect(providerId, { forceAccountChooser: true })}
                          disabled={isPending}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                      {providerId === 'linkedin' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          title="Connect LinkedIn Organic separately"
                          onClick={() => handleConnect(providerId, { linkedinMode: 'organic' })}
                          disabled={isPending}
                        >
                          Organic
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Reconnect to refresh accounts"
                        onClick={() =>
                          handleConnect(
                            providerId,
                            providerId === 'linkedin' ? { linkedinMode: 'paid' } : undefined,
                          )
                        }
                        disabled={isPending}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Disconnect"
                        onClick={() => handleDisconnect(providerId)}
                        disabled={isPending}
                      >
                        <Unplug className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : providerId === 'linkedin' ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => handleConnect(providerId, { linkedinMode: 'paid' })}
                        disabled={isPending}
                      >
                        <Plus className="h-3 w-3" />
                        Ads
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => handleConnect(providerId, { linkedinMode: 'organic' })}
                        disabled={isPending}
                      >
                        Organic
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => handleConnect(providerId)}
                      disabled={isPending}
                    >
                      <Plus className="h-3 w-3" />
                      Connect
                    </Button>
                  )}
                </div>
                {reconnectPrompt ? (
                  <div className="mx-2 mb-1 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-amber-700 dark:text-amber-300">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">{reconnectPrompt.title}</p>
                      <p className="text-2xs leading-snug opacity-90">
                        {reconnectPrompt.description}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
