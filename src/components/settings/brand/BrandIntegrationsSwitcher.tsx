"use client";

import { useMemo, useState } from "react";
import { Plug, Plus } from "lucide-react";
import {
  IntegrationSwitcher,
  type IntegrationSwitcherData,
  type IntegrationSwitcherItem,
  type IntegrationSwitcherItemStatus,
  type IntegrationSwitcherTab,
} from "@/components/shadcn-studio/card/integration-switcher";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ManageBrandIntegrationsPopover } from "./ManageBrandIntegrationsPopover";
import { BrandIntegrationsSection } from "../BrandIntegrationsSection";
import { PLATFORM_ICONS, PLATFORM_LABELS } from "../shell/platformIcons";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import type { PlatformKey } from "@/components/onboarding/platforms";

type BrandIntegrationsSwitcherProps = {
  initialSummary?: BrandIntegrationSummary;
};

function statusFor(status: string | null): IntegrationSwitcherItemStatus {
  return status && status.toLowerCase() === "active" ? "checked" : "copy";
}

export function BrandIntegrationsSwitcher({ initialSummary }: BrandIntegrationsSwitcherProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const { tabs, data, hasAny } = useMemo(() => {
    const summary = initialSummary ?? null;
    if (!summary) return { tabs: [] as IntegrationSwitcherTab[], data: {} as IntegrationSwitcherData, hasAny: false };

    const tabs: IntegrationSwitcherTab[] = [];
    const data: IntegrationSwitcherData = {};

    (Object.keys(summary) as PlatformKey[]).forEach((platformKey) => {
      const accounts = summary[platformKey]?.accounts ?? [];
      if (accounts.length === 0) return;

      tabs.push({
        id: platformKey,
        name: PLATFORM_LABELS[platformKey] ?? platformKey,
        icon: PLATFORM_ICONS[platformKey] ?? Plug,
      });

      data[platformKey] = accounts.map<IntegrationSwitcherItem>((account) => ({
        id: account.externalAccountId ?? account.alias ?? account.integrationAccountId.slice(0, 6),
        title: account.name || account.alias || "Unnamed account",
        icon: PLATFORM_ICONS[platformKey] ?? Plug,
        status: statusFor(account.status),
      }));
    });

    return { tabs, data, hasAny: tabs.length > 0 };
  }, [initialSummary]);

  const openManage = () => setSheetOpen(true);

  return (
    <>
      {hasAny ? (
        <IntegrationSwitcher
          integrations={tabs}
          data={data}
          className="max-w-none"
          tabBarTrailing={
            <ManageBrandIntegrationsPopover
              summary={initialSummary}
              onManage={openManage}
            />
          }
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-5 py-10 text-center">
          <Plug className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">No integrations assigned</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Assign provider accounts to this brand to surface them across the app.
          </p>
          <div className="mt-4 inline-block">
            <ManageBrandIntegrationsPopover
              summary={initialSummary}
              onManage={openManage}
            >
              <Button variant="outline" size="sm" className="gap-2">
                <Plus className="h-3.5 w-3.5" />
                Assign accounts
              </Button>
            </ManageBrandIntegrationsPopover>
          </div>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl">
          <SheetHeader className="border-b border-border/60 px-6 py-4">
            <SheetTitle>Manage brand integrations</SheetTitle>
            <SheetDescription>
              Re-sync providers and assign individual accounts to this brand.
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 py-5">
            <BrandIntegrationsSection initialSummary={initialSummary} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
