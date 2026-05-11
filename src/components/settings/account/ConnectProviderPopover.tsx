"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Unplug } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useDeauthorizeGoogle,
  useDeauthorizeMeta,
  useDeauthorizeTikTok,
  useStartGoogleSync,
  useStartMetaSync,
  useStartTikTokSync,
} from "@/lib/api/integrations";
import { hasProviderConnections } from "@/lib/integrations/providerConnections";
import {
  openCenteredPopup,
  waitForPopupClosed,
  waitForPopupMessage,
} from "@/lib/popup";
import { useToast } from "@/components/ui/ToastProvider";
import {
  PROVIDER_GROUP_DESCRIPTIONS,
  PROVIDER_GROUP_ICONS,
  PROVIDER_GROUP_LABELS,
  type ProviderGroup,
} from "../shell/platformIcons";
import type { UserIntegrationSummary } from "@/lib/integrations/userIntegrations";

const PROVIDERS: ProviderGroup[] = ["facebook", "google", "tiktok"];

type ConnectProviderPopoverProps = {
  integrations: UserIntegrationSummary;
  children?: React.ReactNode;
};

export function ConnectProviderPopover({ integrations, children }: ConnectProviderPopoverProps) {
  const { show } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const metaSync = useStartMetaSync();
  const googleSync = useStartGoogleSync();
  const tiktokSync = useStartTikTokSync();
  const metaDeauthorize = useDeauthorizeMeta();
  const googleDeauthorize = useDeauthorizeGoogle();
  const tiktokDeauthorize = useDeauthorizeTikTok();

  const buildCallbackUrl = (provider: ProviderGroup) => {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const url = new URL("/integrations/callback", origin);
    url.searchParams.set("provider", provider);
    url.searchParams.set("context", "settings");
    return url.toString();
  };

  const handleConnect = (provider: ProviderGroup) => {
    startTransition(async () => {
      let cleanup: (() => void) | undefined;
      try {
        const callbackUrl = buildCallbackUrl(provider);
        const sync =
          provider === "google" ? googleSync : provider === "tiktok" ? tiktokSync : metaSync;
        const syncResponse = await sync.mutateAsync(callbackUrl);
        const expectedState = "state" in syncResponse ? syncResponse.state : null;

        const popup = openCenteredPopup(
          syncResponse.url,
          `Connect ${PROVIDER_GROUP_LABELS[provider]}`
        );
        if (!popup) {
          show({ title: "Popup blocked", description: "Allow popups to continue.", variant: "error" });
          return;
        }

        const abortCtrl = new AbortController();
        const timeoutId = window.setTimeout(() => {
          try { popup?.close(); } catch { /* ignore */ }
          abortCtrl.abort();
        }, 120000);
        cleanup = () => {
          try { abortCtrl.abort(); } catch { /* ignore */ }
          window.clearTimeout(timeoutId);
        };

        type Msg = {
          type: string;
          provider: string | null;
          context?: string;
          message?: string;
          state?: string | null;
        };
        const predicate = (m: Msg) =>
          m.provider === provider &&
          m.context === "settings" &&
          (!expectedState || m.state === expectedState);

        const successPromise = waitForPopupMessage<Msg>("oauth:success", {
          predicate,
          signal: abortCtrl.signal,
        });
        const errorPromise = waitForPopupMessage<Msg>("oauth:error", {
          predicate,
          signal: abortCtrl.signal,
        }).then((p) => { throw new Error(p.message ?? "Connection cancelled."); });
        const closedPromise = waitForPopupClosed(popup, { signal: abortCtrl.signal })
          .then(() => { throw new Error("Connection cancelled."); });

        const result = await Promise.race([successPromise, errorPromise, closedPromise]);
        if (!result.provider || result.provider !== provider) {
          show({ title: "Connection incomplete", description: "Provider could not be verified.", variant: "error" });
          cleanup();
          return;
        }

        try { popup.close(); } catch { /* ignore */ }
        cleanup();
        router.refresh();
        show({ title: "Connected", description: `${PROVIDER_GROUP_LABELS[provider]} accounts synced.`, variant: "success" });
      } catch (error) {
        show({
          title: "Connection failed",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "error",
        });
      } finally {
        try { cleanup?.(); } catch { /* ignore */ }
      }
    });
  };

  const handleDisconnect = (provider: ProviderGroup) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Disconnect ${PROVIDER_GROUP_LABELS[provider]}? This revokes access to your accounts.`)
    ) {
      return;
    }
    startTransition(async () => {
      try {
        if (provider === "google") {
          await googleDeauthorize.mutateAsync();
        } else if (provider === "tiktok") {
          const account = integrations.tiktok?.accounts[0];
          if (!account?.externalAccountId) throw new Error("No TikTok account found.");
          await tiktokDeauthorize.mutateAsync(account.externalAccountId);
        } else {
          await metaDeauthorize.mutateAsync();
        }
        router.refresh();
        show({
          title: "Disconnected",
          description: `${PROVIDER_GROUP_LABELS[provider]} access revoked.`,
          variant: "success",
        });
      } catch (error) {
        show({
          title: "Unable to disconnect",
          description: error instanceof Error ? error.message : "Please retry shortly.",
          variant: "error",
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
          <p className="text-xs text-muted-foreground">
            OAuth providers tied to your account.
          </p>
        </div>
        <div className="mt-1 space-y-1">
          {PROVIDERS.map((providerId) => {
            const connected = hasProviderConnections(integrations, providerId);
            const Icon = PROVIDER_GROUP_ICONS[providerId];
            return (
              <div
                key={providerId}
                className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {PROVIDER_GROUP_LABELS[providerId]}
                    </p>
                    {connected ? (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                        Connected
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {PROVIDER_GROUP_DESCRIPTIONS[providerId]}
                  </p>
                </div>
                {connected ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Reconnect to refresh accounts"
                      onClick={() => handleConnect(providerId)}
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
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

