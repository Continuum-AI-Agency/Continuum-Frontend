"use client";

import React from "react";
import { DropdownMenu, Text, ScrollArea, Box } from "@radix-ui/themes";
import { AlertTriangle, ChevronsUpDown, Loader2 } from "lucide-react";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";
import { useSwitchBrand } from "@/hooks/useSwitchBrand";
import { BrandAvatar } from "@/components/brand/BrandAvatar";
import { getBrandMenuItemLabel } from "@/lib/brands/brand-switcher-utils";

export function OnboardingBrandSwitcher() {
  const { activeBrandId, brandSummaries, isSwitching, switchingToBrandId } =
    useActiveBrandContext();
  const switchBrand = useSwitchBrand();
  const [menuOpen, setMenuOpen] = React.useState(false);

  if (brandSummaries.length <= 1) return null;

  const activeBrand = brandSummaries.find((b) => b.id === activeBrandId);
  const activeBrandLabel = activeBrand
    ? getBrandMenuItemLabel(activeBrand)
    : "Switch brand";

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenu.Trigger>
        <button
          type="button"
          disabled={isSwitching}
          className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--sidebar-foreground)] shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--ring)_8%,transparent)] disabled:opacity-60 dark:bg-card"
        >
          {isSwitching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : activeBrand ? (
            <BrandAvatar
              name={activeBrandLabel}
              logoUrl={activeBrand.logoUrl ?? null}
              size="sm"
              className="size-4"
            />
          ) : null}
          <span className="max-w-[120px] truncate">{activeBrandLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-[color-mix(in_srgb,var(--sidebar-foreground)_60%,transparent)]" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content
        align="end"
        className="min-w-[220px] border"
        style={{
          backgroundColor: "var(--popover)",
          color: "var(--popover-foreground)",
          borderColor: "var(--border)",
        }}
      >
        <Box px="2" pt="1" pb="0">
          <Text
            size="1"
            className="text-[color-mix(in_srgb,var(--popover-foreground)_52%,transparent)] uppercase tracking-wider font-semibold"
          >
            Switch brand
          </Text>
        </Box>

        <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: "200px" }}>
          {brandSummaries.map((brand) => {
            const isActiveRow = brand.id === activeBrandId;
            const isRowSwitching = switchingToBrandId === brand.id;
            const label = getBrandMenuItemLabel(brand);

            return (
              <DropdownMenu.Item
                key={brand.id}
                disabled={isSwitching}
                onSelect={(event) => {
                  if (isActiveRow) {
                    event.preventDefault();
                    return;
                  }
                  setMenuOpen(false);
                  void switchBrand(brand.id);
                }}
                className="flex items-center justify-between gap-2 text-[var(--popover-foreground)] data-[highlighted]:bg-[color-mix(in_srgb,var(--ring)_12%,transparent)] data-[highlighted]:text-[var(--popover-foreground)]"
              >
                <div className="flex items-center gap-2">
                  <BrandAvatar name={label} logoUrl={brand.logoUrl ?? null} size="sm" />
                  <Text weight={isActiveRow ? "bold" : "regular"} size="2">
                    {label}
                  </Text>
                </div>
                <div className="flex items-center gap-1.5">
                  {!brand.completed && (
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0 text-amber-500"
                      aria-label="Onboarding incomplete"
                    />
                  )}
                  {isRowSwitching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : isActiveRow ? (
                    <span className="inline-flex h-2 w-2 rounded-full bg-violet-500" aria-hidden />
                  ) : null}
                </div>
              </DropdownMenu.Item>
            );
          })}
        </ScrollArea>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
