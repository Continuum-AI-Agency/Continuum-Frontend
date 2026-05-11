"use client";

import { useMemo } from "react";
import { Plug, Plus } from "lucide-react";
import {
  IntegrationSwitcher,
  type IntegrationSwitcherData,
  type IntegrationSwitcherItem,
  type IntegrationSwitcherItemStatus,
  type IntegrationSwitcherTab,
} from "@/components/shadcn-studio/card/integration-switcher";
import { Button } from "@/components/ui/button";
import { ConnectProviderPopover } from "./ConnectProviderPopover";
import { PLATFORM_ICONS, PLATFORM_LABELS } from "../shell/platformIcons";
import type { UserIntegrationSummary } from "@/lib/integrations/userIntegrations";
import type { PlatformKey } from "@/components/onboarding/platforms";

type UserConnectionsSwitcherProps = {
  integrations: UserIntegrationSummary;
};

function statusFor(status: string | null): IntegrationSwitcherItemStatus {
  return status && status.toLowerCase() === "active" ? "checked" : "copy";
}

export function UserConnectionsSwitcher({ integrations }: UserConnectionsSwitcherProps) {
  const { tabs, data, hasAny } = useMemo(() => {
    const tabs: IntegrationSwitcherTab[] = [];
    const data: IntegrationSwitcherData = {};

    (Object.keys(integrations) as PlatformKey[]).forEach((platformKey) => {
      const accounts = integrations[platformKey]?.accounts ?? [];
      if (accounts.length === 0) return;

      tabs.push({
        id: platformKey,
        name: PLATFORM_LABELS[platformKey] ?? platformKey,
        icon: PLATFORM_ICONS[platformKey] ?? Plug,
      });

      data[platformKey] = accounts.map<IntegrationSwitcherItem>((account) => ({
        id: account.externalAccountId ?? account.id.slice(0, 6),
        title: account.name || "Unnamed account",
        icon: PLATFORM_ICONS[platformKey] ?? Plug,
        status: statusFor(account.status),
      }));
    });

    return { tabs, data, hasAny: tabs.length > 0 };
  }, [integrations]);

  if (!hasAny) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-5 py-10 text-center">
        <Plug className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">No connections yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          Connect Meta, Google, or TikTok to surface accounts you can later assign to brands.
        </p>
        <div className="mt-4 inline-block">
          <ConnectProviderPopover integrations={integrations}>
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="h-3.5 w-3.5" />
              Connect a provider
            </Button>
          </ConnectProviderPopover>
        </div>
      </div>
    );
  }

  return (
    <IntegrationSwitcher
      integrations={tabs}
      data={data}
      className="max-w-none"
      tabBarTrailing={<ConnectProviderPopover integrations={integrations} />}
    />
  );
}
