'use client';

import { Plus, RefreshCw, TriangleAlert, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { FigmaIcon } from '@/components/shared/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/ToastProvider';
import { LocalizedUiError, useUiErrorMessage } from '@/i18n/errors';
import {
  type MetaSyncMode,
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
import { beginFigmaConnection } from '@/lib/library/figma';
import { openCenteredPopup, waitForOAuthCompletion } from '@/lib/popup';
import { cn } from '@/lib/utils';
import {
  isProviderComingSoon,
  PROVIDER_GROUP_ICONS,
  PROVIDER_GROUP_LABELS,
  PROVIDER_GROUPS,
  type ProviderGroup,
  providerDescriptionKeys,
} from '../shell/platformIcons';
import { OpenAiAdsConnectDialog } from './OpenAiAdsConnectDialog';

type ConnectTarget = ProviderGroup | 'figma';

type ConnectProviderPopoverProps = {
  integrations: UserIntegrationSummary;
  reconnectPrompts?: ProviderReconnectPrompt[];
  /** Connected Figma accounts. Figma is a design source with no ad assets, so the summary never shows it. */
  figmaAccounts?: string[];
  /** Single element: it becomes the popover trigger via Base UI `render`. */
  children?: React.ReactElement;
};

export function ConnectProviderPopover({
  integrations,
  reconnectPrompts = [],
  figmaAccounts = [],
  children,
}: ConnectProviderPopoverProps) {
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');

  const { show } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { activeBrandId } = useActiveBrandContext();
  const [openAiDialogOpen, setOpenAiDialogOpen] = useState(false);
  const metaSync = useStartMetaSync();
  const googleSync = useStartGoogleSync();
  // #151: same shape as googleSync (mutateAsync(callbackUrl): Promise<GoogleSyncResponse>),
  // just forces Google's account chooser server-side so a user can link Ads
  // under a different Google identity than the one already connected.
  const googleAccountChooserSync = useStartGoogleAccountChooserSync();
  const tiktokSync = useStartTikTokSync();
  const linkedinSync = useStartLinkedInSync();
  const xSync = useStartXSync();

  const labelFor = (provider: ConnectTarget) =>
    provider === 'figma' ? 'Figma' : PROVIDER_GROUP_LABELS[provider];

  const buildCallbackUrl = (provider: ConnectTarget) => {
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
    provider: ConnectTarget,
    options?: {
      forceAccountChooser?: boolean;
      linkedinMode?: 'paid' | 'organic';
      metaMode?: MetaSyncMode;
    },
  ) => {
    if (isProviderComingSoon(provider)) return;
    // OpenAI Ads is the one provider with no consent screen: the credential is a partner
    // API key the user pastes. Everything below this line is OAuth popup machinery it has
    // no use for.
    if (provider === 'openai') {
      setOpenAiDialogOpen(true);
      return;
    }
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
        if (provider === 'figma' && !activeBrandId) {
          throw new LocalizedUiError(tUi('m_1d8e4bafad'));
        }
        const syncResponse =
          provider === 'figma'
            ? {
                url: await beginFigmaConnection({
                  brandId: activeBrandId,
                  callbackUrl,
                }),
              }
            : provider === 'linkedin'
              ? await linkedinSync.mutateAsync({
                  callbackUrl,
                  mode: options?.linkedinMode ?? 'paid',
                })
              : provider === 'facebook'
                ? await metaSync.mutateAsync({
                    callbackUrl,
                    mode: options?.metaMode,
                  })
                : await sync.mutateAsync(callbackUrl);
        const expectedState = 'state' in syncResponse ? syncResponse.state : null;

        const popup = openCenteredPopup(
          syncResponse.url,
          provider === 'linkedin' && options?.linkedinMode === 'organic'
            ? tUi('m_d542b694e1')
            : provider === 'linkedin'
              ? tUi('m_809978fc08')
              : provider === 'facebook' && options?.metaMode === 'instagram'
                ? tUi('m_772ddb392f')
                : `Connect ${labelFor(provider)}`,
        );
        if (!popup) {
          show({
            title: tUi('m_ee9be85313'),
            description: tUi('m_4ead0a2ab7'),
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
            title: tUi('m_f129f05e48'),
            description: tUi('m_18228feb69'),
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
            title: tUi('m_2ab1a45715'),
            description: tUi('m_e48e1d2eb1'),
            variant: 'info',
          });
        } else if (result.warning === 'ga4_scope_missing') {
          // The token was stored, but Google didn't grant analytics.readonly —
          // usually a connection re-authorized without re-approving the consent
          // screen. No GA4 property can sync until it is granted.
          show({
            title: tUi('m_fc197c7498'),
            description: tUi('m_02ac837c29'),
            variant: 'info',
          });
        } else if (result.warning === 'ga4_enrichment_failed') {
          show({
            title: tUi('m_2ab1a45715'),
            description: tUi('m_2feb7998d1'),
            variant: 'info',
          });
        } else if (result.warning === 'meta_partial_sync') {
          // Meta connected, but one or more Graph edges came back degraded, so
          // some accounts may be missing (see #154). The asset picker retries a
          // background resync on open, so this is a heads-up, not a failure.
          show({
            title: tUi('m_2ab1a45715'),
            description: tUi('m_a7b6ecb63a'),
            variant: 'info',
          });
        } else {
          const linkedInLabel =
            provider === 'linkedin'
              ? options?.linkedinMode === 'organic'
                ? tUi('m_0005cd29e9')
                : tUi('m_078eea08d1')
              : labelFor(provider);
          show({
            title: tUi('m_c2f9b7b489'),
            description: tUi('m_0e0eb4efb0', { v0: String(linkedInLabel) }),
            variant: 'success',
          });
        }
      } catch (error) {
        show({
          title: tUi('m_202caaa870'),
          description: error instanceof Error ? uiErrorMessage(error) : tUi('m_83a6fd7b78'),
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

  return (
    <>
      <Popover>
        <PopoverTrigger
          render={
            children ?? (
              <button
                type="button"
                aria-label={tUi('m_6967f288ad')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-4 w-4" />
              </button>
            )
          }
        />
        <PopoverContent align="end" className="w-80 p-2">
          <div className="px-2 py-1.5">
            <p className="text-sm font-semibold text-foreground">{tUi('m_8f3509b64e')}</p>
            <p className="text-xs text-muted-foreground">{tUi('m_bd18789cd9')}</p>
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
                            {tUi('m_e4115be258')}
                          </Badge>
                        ) : connected ? (
                          <Badge variant="secondary" className="h-4 px-1.5 text-2xs">
                            {tUi('m_c2f9b7b489')}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {connected && connectionSummary && connectionSummary.accountNames.length > 0
                          ? connectionSummary.accountNames.join(', ')
                          : tUi(providerDescriptionKeys[providerId])}
                      </p>
                    </div>
                    {comingSoon ? (
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled>
                        {tUi('m_e4115be258')}
                      </Button>
                    ) : connected ? (
                      <div className="flex items-center gap-1">
                        {providerId === 'google' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={tUi('m_ee23096935')}
                            onClick={() =>
                              handleConnect(providerId, {
                                forceAccountChooser: true,
                              })
                            }
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
                            title={tUi('m_78b1e9b6f2')}
                            onClick={() =>
                              handleConnect(providerId, {
                                linkedinMode: 'organic',
                              })
                            }
                            disabled={isPending}
                          >
                            {tUi('m_82f86eb9b4')}
                          </Button>
                        ) : null}
                        {providerId === 'facebook' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            title={tUi('m_6188fb0fe4')}
                            onClick={() =>
                              handleConnect(providerId, {
                                metaMode: 'instagram',
                              })
                            }
                            disabled={isPending}
                          >
                            {tUi('m_c45285b1f3')}
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={tUi('m_3ef08a456b')}
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
                      </div>
                    ) : providerId === 'facebook' ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => handleConnect(providerId)}
                          disabled={isPending}
                        >
                          <Plus className="h-3 w-3" />
                          Facebook
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          title={tUi('m_6188fb0fe4')}
                          onClick={() => handleConnect(providerId, { metaMode: 'instagram' })}
                          disabled={isPending}
                        >
                          {tUi('m_c45285b1f3')}
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
                          {tUi('m_13bad3d96f')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() =>
                            handleConnect(providerId, {
                              linkedinMode: 'organic',
                            })
                          }
                          disabled={isPending}
                        >
                          {tUi('m_82f86eb9b4')}
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
                        {tUi('m_b65463cb6a')}
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
            <div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <FigmaIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">Figma</p>
                  {figmaAccounts.length ? (
                    <Badge variant="secondary" className="h-4 px-1.5 text-2xs">
                      {tUi('m_c2f9b7b489')}
                    </Badge>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {figmaAccounts.length ? figmaAccounts.join(', ') : tUi('m_3c07b06510')}
                </p>
              </div>
              {figmaAccounts.length ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title={tUi('m_36bf799fab')}
                  onClick={() => handleConnect('figma')}
                  disabled={isPending}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => handleConnect('figma')}
                  disabled={isPending}
                >
                  <Plus className="h-3 w-3" />
                  {tUi('m_b65463cb6a')}
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <OpenAiAdsConnectDialog
        open={openAiDialogOpen}
        onOpenChange={setOpenAiDialogOpen}
        brandId={activeBrandId}
        onConnected={() => router.refresh()}
      />
    </>
  );
}
