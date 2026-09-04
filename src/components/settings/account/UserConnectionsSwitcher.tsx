'use client';

import { Plug, Plus } from 'lucide-react';
import { useMemo } from 'react';
import type { PlatformKey } from '@/components/onboarding/platforms';
import {
  IntegrationSwitcher,
  type IntegrationSwitcherData,
  type IntegrationSwitcherItem,
  type IntegrationSwitcherItemStatus,
  type IntegrationSwitcherTab,
} from '@/components/shadcn-studio/card/integration-switcher';
import { Button } from '@/components/ui/button';
import { formatGoogleCustomerId } from '@/lib/integrations/assetLabel';
import type {
  ProviderReconnectPrompt,
  UserIntegrationSummary,
} from '@/lib/integrations/userIntegrations';
import { PLATFORM_ICONS, PLATFORM_LABELS } from '../shell/platformIcons';
import { ConnectProviderPopover } from './ConnectProviderPopover';

type UserConnectionsSwitcherProps = {
  integrations: UserIntegrationSummary;
  reconnectPrompts?: ProviderReconnectPrompt[];
};

function statusFor(status: string | null): IntegrationSwitcherItemStatus {
  return status && status.toLowerCase() === 'active' ? 'checked' : 'copy';
}

export function UserConnectionsSwitcher({
  integrations,
  reconnectPrompts,
}: UserConnectionsSwitcherProps) {
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

      data[platformKey] = accounts.map<IntegrationSwitcherItem>((account) => {
        const externalId = account.externalAccountId;
        // The row already prints the external id in its own column, so a name
        // that fell back to that id would render twice. Google Ads customers
        // arrive unnamed whenever Google refuses the descriptive_name lookup.
        const isFallbackName =
          !account.name ||
          (!!externalId &&
            (account.name === externalId || account.name === formatGoogleCustomerId(externalId)));
        return {
          id: account.id,
          code: externalId
            ? platformKey === 'googleAds'
              ? formatGoogleCustomerId(externalId)
              : externalId
            : account.id.slice(0, 6),
          title: isFallbackName ? 'Unnamed account' : account.name,
          icon: PLATFORM_ICONS[platformKey] ?? Plug,
          status: statusFor(account.status),
        };
      });
    });

    return { tabs, data, hasAny: tabs.length > 0 };
  }, [integrations]);

  if (!hasAny) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-5 py-10 text-center">
        <Plug className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">No connections yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          Connect Meta, Google, TikTok, or X to surface accounts you can later assign to brands.
        </p>
        <div className="mt-4 inline-block">
          <ConnectProviderPopover integrations={integrations} reconnectPrompts={reconnectPrompts}>
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
      tabBarTrailing={
        <ConnectProviderPopover integrations={integrations} reconnectPrompts={reconnectPrompts} />
      }
    />
  );
}
