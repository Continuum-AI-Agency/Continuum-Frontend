"use client";

import { useMemo, useRef, useTransition, useState } from "react";
import { Badge, Box, Button, Card, Flex, Grid, Heading, Text } from "@radix-ui/themes";
import { ExclamationTriangleIcon, Link2Icon } from "@radix-ui/react-icons";
import { useStartGoogleSync, useStartMetaSync } from "@/lib/api/integrations";
import { useToast } from "@/components/ui/ToastProvider";
import type { UserIntegrationSummary } from "@/lib/integrations/userIntegrations";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CurrentUserAvatar } from "@/components/current-user-avatar";
import { useCurrentUserAvatar } from "@/hooks/useCurrentUserAvatar";
import { openCenteredPopup, waitForPopupClosed, waitForPopupMessage } from "@/lib/popup";

type UserProfile = {
  email: string;
  name?: string | null;
  lastSignIn?: string | null;
};

type Props = {
  user: UserProfile;
  integrations: UserIntegrationSummary;
};

export function UserSettingsPanel({ user, integrations }: Props) {
  const { show } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const metaSync = useStartMetaSync();
  const googleSync = useStartGoogleSync();
  const supabase = createSupabaseBrowserClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { user: supabaseUser, avatarUrl, initials, refresh } = useCurrentUserAvatar();

  const personalIntegrations = useMemo(() => integrations, [integrations]);

  type ProviderGroup = "google" | "facebook";

  const getSiteOrigin = () => {
    if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
    const fallback = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    try {
      return new URL(fallback).origin;
    } catch {
      return "http://localhost:3000";
    }
  };

  const buildIntegrationCallbackUrl = (provider: ProviderGroup, context: string) => {
    const origin = getSiteOrigin();
    const url = new URL("/integrations/callback", origin);
    url.searchParams.set("provider", provider);
    url.searchParams.set("context", context);
    return url.toString();
  };

  const handleConnectProvider = (provider: ProviderGroup) => {
    startTransition(async () => {
      let cleanup: (() => void) | undefined;
      try {
        const callbackUrl = buildIntegrationCallbackUrl(provider, "settings");
        const syncResponse =
          provider === "google"
            ? await googleSync.mutateAsync(callbackUrl)
            : await metaSync.mutateAsync(callbackUrl);
        const expectedState = "state" in syncResponse ? syncResponse.state : null;

        const popup = openCenteredPopup(
          syncResponse.url,
          `Connect ${provider === "google" ? "Google" : "Meta"}`
        );
        if (!popup) {
          show({ title: "Popup blocked", description: "Allow popups to continue.", variant: "error" });
          return;
        }

        const abortCtrl = new AbortController();
        const timeoutId = window.setTimeout(() => {
          try {
            popup?.close();
          } catch {
            // ignore
          }
          abortCtrl.abort();
        }, 120000);
        cleanup = () => {
          try {
            abortCtrl.abort();
          } catch {
            // ignore
          }
          window.clearTimeout(timeoutId);
        };

        type IntegrationSuccess = {
          type: string;
          provider: string | null;
          accountId?: string | null;
          context?: string;
          state?: string | null;
        };
        type IntegrationError = {
          type: string;
          provider?: string | null;
          context?: string;
          message?: string;
          state?: string | null;
        };

        const predicate = (message: IntegrationSuccess | IntegrationError) =>
          message.provider === provider &&
          message.context === "settings" &&
          (!expectedState || message.state === expectedState);

        const successPromise = waitForPopupMessage<IntegrationSuccess>("oauth:success", {
          predicate,
          signal: abortCtrl.signal,
        });

        const errorPromise = waitForPopupMessage<IntegrationError>("oauth:error", {
          predicate,
          signal: abortCtrl.signal,
        }).then(payload => {
          throw new Error(payload.message ?? "Connection cancelled.");
        });

        const closedPromise = waitForPopupClosed(popup, { signal: abortCtrl.signal }).then(() => {
          throw new Error("Connection cancelled.");
        });

        const result = await Promise.race([successPromise, errorPromise, closedPromise]);
        if (!result.provider || result.provider !== provider) {
          show({ title: "Connection incomplete", description: "We could not verify the provider.", variant: "error" });
          cleanup();
          return;
        }

        try {
          popup.close();
        } catch {
          // popup may already be closed
        }
        cleanup();
        router.refresh();
        show({ title: "Connected", description: `${provider === "google" ? "Google" : "Meta"} accounts synced.`, variant: "success" });
      } catch (error) {
        show({
          title: "Connection failed",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "error",
        });
      } finally {
        try {
          cleanup?.();
        } catch {
          // ignore cleanup errors
        }
      }
    });
  };

  const handleRefresh = () => {
    router.refresh();
    show({ title: "Refreshing", description: "Updating your integrations…", variant: "warning" });
  };

  const handleUploadAvatar = async (file?: File | null) => {
    if (!file || !supabaseUser) return;
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `avatars/${supabaseUser.id}-${Date.now()}.${ext}`;
    setIsUploading(true);
    try {
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      await supabase.auth.updateUser({ data: { avatar_url: path } });
      await refresh();
      show({ title: "Avatar updated", description: "Your profile image has been refreshed.", variant: "success" });
    } catch (error) {
      show({
        title: "Avatar upload failed",
        description: error instanceof Error ? error.message : "Could not upload avatar.",
        variant: "error",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Flex direction="column" gap="6">
      <Box className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <Heading size="5">Your profile</Heading>
        <Text color="gray">These details are tied to your login and personal integrations.</Text>
        <Flex align="center" gap="4" wrap="wrap">
          <CurrentUserAvatar size={64} />
          <Flex direction="column" gap="2">
            <Button
              variant="surface"
              disabled={isUploading || !supabaseUser}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? "Uploading…" : avatarUrl ? "Change avatar" : "Upload avatar"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleUploadAvatar(e.target.files?.[0])}
            />
            <Text size="1" color="gray">
              PNG, JPG, or GIF. Max 5MB.
            </Text>
          </Flex>
        </Flex>
        <Grid columns={{ initial: "1", sm: "2" }} gap="3" className="mt-4">
          <Detail label="Email" value={user.email} />
          <Detail label="Name" value={user.name ?? initials ?? "—"} />
          <Detail label="Last sign in" value={user.lastSignIn ? new Date(user.lastSignIn).toLocaleString() : "—"} />
        </Grid>
      </Box>

      <Box className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <Flex align="center" justify="between" wrap="wrap" gap="3">
          <div className="space-y-1">
            <Heading size="5">Your integrations</Heading>
            <Text color="gray">Accounts you personally connected. You can share them to brands later.</Text>
          </div>
          <Flex gap="2" wrap="wrap">
            <Button variant="surface" onClick={() => handleConnectProvider("facebook")} disabled={isPending}>
              Connect Meta
            </Button>
            <Button variant="surface" onClick={() => handleConnectProvider("google")} disabled={isPending}>
              Connect Google
            </Button>
            <Button variant="ghost" onClick={handleRefresh} disabled={isPending}>
              Refresh
            </Button>
          </Flex>
        </Flex>

        <Grid columns={{ initial: "1", sm: "2", md: "3" }} gap="3">
          {Object.entries(personalIntegrations).map(([platformKey, group]) => (
            <Card key={platformKey} className="bg-slate-950/60 border border-white/10">
              <Flex direction="column" gap="2" p="3">
                <Flex align="center" justify="between">
                  <Flex align="center" gap="2">
                    <Link2Icon />
                    <Text weight="medium" className="capitalize">
                      {platformKey.replace("-", " ")}
                    </Text>
                  </Flex>
                  <Badge color={group.accounts.length > 0 ? "green" : "gray"}>
                    {group.accounts.length > 0 ? `Connected • ${group.accounts.length}` : "Not connected"}
                  </Badge>
                </Flex>
                {group.accounts.length === 0 ? (
                  <Text color="gray" size="2">
                    No accounts connected yet.
                  </Text>
                ) : (
                  <Flex direction="column" gap="1">
                    {group.accounts.map(account => (
                      <Flex key={account.id} justify="between" align="center">
                        <Text color="gray" size="2" className="truncate">
                          {account.name}
                        </Text>
                        {account.status ? (
                          <Badge size="1" variant="soft">
                            {account.status}
                          </Badge>
                        ) : null}
                      </Flex>
                    ))}
                  </Flex>
                )}
              </Flex>
            </Card>
          ))}
        </Grid>

        <Flex gap="2" align="center">
          <ExclamationTriangleIcon />
          <Text color="gray" size="2">
            Disconnect and granular sharing flows are coming soon; contact support to revoke provider access.
          </Text>
        </Flex>
      </Box>
    </Flex>
  );
}

type DetailProps = {
  label: string;
  value: string;
};

function Detail({ label, value }: DetailProps) {
  return (
    <Box>
      <Text size="1" color="gray">
        {label}
      </Text>
      <Text>{value}</Text>
    </Box>
  );
}
