'use client';

import { AlertTriangle, ChevronsUpDown, Loader2 } from 'lucide-react';
import React from 'react';
import { BrandAvatar } from '@/components/brand/BrandAvatar';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSwitchBrand } from '@/hooks/useSwitchBrand';
import { getBrandMenuItemLabel } from '@/lib/brands/brand-switcher-utils';
import { cn } from '@/lib/utils';

export function OnboardingBrandSwitcher() {
  const { activeBrandId, brandSummaries, isSwitching, switchingToBrandId } =
    useActiveBrandContext();
  const switchBrand = useSwitchBrand();
  const [menuOpen, setMenuOpen] = React.useState(false);

  if (brandSummaries.length <= 1) return null;

  const activeBrand = brandSummaries.find((b) => b.id === activeBrandId);
  const activeBrandLabel = activeBrand ? getBrandMenuItemLabel(activeBrand) : 'Switch brand';

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isSwitching}
          className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--sidebar-foreground)] shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--ring)_8%,transparent)] disabled:opacity-60 dark:bg-card"
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
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="min-w-[220px] border"
        style={{
          backgroundColor: 'var(--popover)',
          color: 'var(--popover-foreground)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="px-2 pt-1 pb-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-[color-mix(in_srgb,var(--popover-foreground)_52%,transparent)]">
            Switch brand
          </span>
        </div>

        <ScrollArea className="max-h-[200px]">
          {brandSummaries.map((brand) => {
            const isActiveRow = brand.id === activeBrandId;
            const isRowSwitching = switchingToBrandId === brand.id;
            const label = getBrandMenuItemLabel(brand);

            return (
              <DropdownMenuItem
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
                  <span className={cn('text-sm', isActiveRow ? 'font-semibold' : 'font-normal')}>
                    {label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {!brand.completed && (
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0 text-warning"
                      aria-label="Onboarding incomplete"
                    />
                  )}
                  {isRowSwitching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : isActiveRow ? (
                    <span className="inline-flex h-2 w-2 rounded-full bg-primary" aria-hidden />
                  ) : null}
                </div>
              </DropdownMenuItem>
            );
          })}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
