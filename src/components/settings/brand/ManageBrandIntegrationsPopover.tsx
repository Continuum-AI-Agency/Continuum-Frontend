"use client";

import { Plug, Plus, Settings2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PLATFORM_ICONS, PLATFORM_LABELS } from "../shell/platformIcons";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import type { PlatformKey } from "@/components/onboarding/platforms";

const POPOVER_PLATFORMS: PlatformKey[] = [
  "facebook",
  "instagram",
  "googleAds",
  "youtube",
  "tiktok",
  "linkedin",
];

type ManageBrandIntegrationsPopoverProps = {
  summary?: BrandIntegrationSummary;
  onManage: () => void;
  children?: React.ReactNode;
};

export function ManageBrandIntegrationsPopover({
  summary,
  onManage,
  children,
}: ManageBrandIntegrationsPopoverProps) {
  const rows = POPOVER_PLATFORMS.map((key) => ({
    key,
    label: PLATFORM_LABELS[key] ?? key,
    icon: PLATFORM_ICONS[key] ?? Plug,
    count: summary?.[key]?.accounts.length ?? 0,
  }));

  return (
    <Popover>
      <PopoverTrigger asChild>
        {children ?? (
          <button
            type="button"
            aria-label="Manage brand integrations"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="px-2 py-1.5">
          <p className="text-sm font-semibold text-foreground">Brand integrations</p>
          <p className="text-xs text-muted-foreground">
            Assign provider accounts to this brand.
          </p>
        </div>
        <ScrollArea className="mt-1 max-h-[280px]">
          <div className="space-y-1 pr-2">
            {rows.map((row) => {
              const Icon = row.icon;
              const isAssigned = row.count > 0;
              return (
              <div
                key={row.key}
                className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {row.label}
                    </p>
                    {isAssigned ? (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                        {row.count} account{row.count === 1 ? "" : "s"}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {isAssigned ? "Manage assigned accounts" : "No accounts assigned"}
                  </p>
                </div>
                {isAssigned ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Manage assignments"
                    onClick={onManage}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={onManage}
                  >
                    <Plus className="h-3 w-3" />
                    Assign
                  </Button>
                )}
              </div>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
