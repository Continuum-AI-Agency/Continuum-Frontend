'use client';

import {
  AlertTriangle,
  CircleCheck,
  Loader2,
  LogOut,
  Moon,
  Plug,
  PlusCircle,
  Search,
  Settings,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import React from 'react';
import { createBrandProfileAction } from '@/app/(post-auth)/settings/actions';
import { BrandAvatar } from '@/components/brand/BrandAvatar';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useInfiniteUserBrands } from '@/hooks/useInfiniteUserBrands';
import { useSwitchBrand } from '@/hooks/useSwitchBrand';
import {
  getActiveBrandLabel,
  getBrandMenuItemLabel,
  isAdminUser,
} from '@/lib/brands/brand-switcher-utils';
import { cn } from '@/lib/utils';

type BrandSwitcherMenuProps = {
  triggerId?: string;
};

export function BrandSwitcherMenu({ triggerId }: BrandSwitcherMenuProps) {
  const router = useRouter();
  const { logout, isPending } = useAuth();
  const { activeBrandId, brandSummaries, isSwitching, switchingToBrandId, user } =
    useActiveBrandContext();
  const switchBrand = useSwitchBrand();
  const { appearance, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isCreating, startCreate] = React.useTransition();
  const [searchQuery, setSearchQuery] = React.useState('');

  // Ticket #162: active-integration badge data. brandSummaries is the
  // server-provided list (no integration status); this bulk-fetches it
  // client-side via the same hook the settings brand list uses, so the
  // status map is available here without a second bespoke query.
  const { brands: brandsWithIntegrationStatus } = useInfiniteUserBrands({
    userId: user?.id,
    userEmail: user?.email,
  });
  const hasActiveIntegrationByBrandId = React.useMemo(
    () =>
      new Map(
        brandsWithIntegrationStatus.map((brand) => [brand.id, brand.hasActiveIntegration ?? false]),
      ),
    [brandsWithIntegrationStatus],
  );

  const isAdmin = isAdminUser(user);

  React.useEffect(() => {
    if (!menuOpen) {
      setSearchQuery('');
    }
  }, [menuOpen]);

  const filteredBrands = brandSummaries.filter((brand) =>
    getBrandMenuItemLabel(brand).toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const activeBrand = brandSummaries.find((b) => b.id === activeBrandId);
  const activeBrandLabel = getActiveBrandLabel(brandSummaries, activeBrandId);
  const activeBrandLogo = activeBrand?.logoUrl ?? null;

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          id={triggerId}
          variant="outline"
          disabled={isSwitching}
          className="rounded-full border-[var(--border)] text-[var(--sidebar-foreground)] shadow-sm hover:bg-[color-mix(in_srgb,var(--ring)_10%,transparent)]"
        >
          {isSwitching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin stroke-[1.8]" aria-hidden />
          ) : (
            <BrandAvatar
              name={activeBrandLabel}
              logoUrl={activeBrandLogo}
              size="sm"
              className="mr-2"
            />
          )}
          {activeBrandLabel}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="min-w-[260px] border"
        style={{
          backgroundColor: 'var(--popover)',
          color: 'var(--popover-foreground)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="p-2 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[1.8] text-[color-mix(in_srgb,var(--popover-foreground)_60%,transparent)]" />
            <Input
              placeholder="Search brands..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              inputSize="md"
              className="pl-8 text-[var(--popover-foreground)]"
            />
          </div>
        </div>

        <ScrollArea className="max-h-[200px]">
          {filteredBrands.length === 0 ? (
            <div className="p-2">
              <span className="pl-2 text-sm text-[color-mix(in_srgb,var(--popover-foreground)_64%,transparent)]">
                No brands found
              </span>
            </div>
          ) : (
            filteredBrands.map((brand) => {
              const isActiveRow = brand.id === activeBrandId;
              const isRowSwitching = switchingToBrandId === brand.id;
              const label = getBrandMenuItemLabel(brand);
              // undefined = status not loaded yet; only warn once we KNOW
              // there is no active integration (avoids a flash of false
              // positives before the bulk status fetch resolves).
              const hasActiveIntegration = hasActiveIntegrationByBrandId.get(brand.id);
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
                  {isRowSwitching ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin stroke-[1.8] text-[var(--popover-foreground)]"
                      aria-hidden
                    />
                  ) : isActiveRow ? (
                    <BadgeIndicator />
                  ) : !brand.completed ? (
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0 text-warning"
                      aria-label="Onboarding incomplete"
                    />
                  ) : hasActiveIntegration === false ? (
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0 text-warning"
                      aria-label="No active integration connected"
                    />
                  ) : null}
                </DropdownMenuItem>
              );
            })
          )}
        </ScrollArea>

        <DropdownMenuItem
          disabled={isCreating}
          onSelect={(event) => {
            event.preventDefault();
            startCreate(async () => {
              await createBrandProfileAction();
            });
          }}
          className="mt-1 flex items-center gap-2 text-[var(--popover-foreground)] data-[highlighted]:bg-[color-mix(in_srgb,var(--ring)_12%,transparent)] data-[highlighted]:text-[var(--popover-foreground)]"
        >
          <PlusCircle className="h-4 w-4 stroke-[1.8] text-[color-mix(in_srgb,var(--popover-foreground)_68%,transparent)]" />
          New brand profile
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="flex w-full items-center justify-between text-[var(--popover-foreground)] data-[highlighted]:bg-[color-mix(in_srgb,var(--ring)_12%,transparent)] data-[highlighted]:text-[var(--popover-foreground)]"
          onSelect={(event) => event.preventDefault()}
        >
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 stroke-[1.8] text-[color-mix(in_srgb,var(--popover-foreground)_68%,transparent)]" />
            <span>Dark mode</span>
          </div>
          <Switch
            checked={appearance === 'dark'}
            onCheckedChange={toggle}
            aria-label="Toggle dark mode"
          />
        </DropdownMenuItem>

        <DropdownMenuItem
          className="flex items-center gap-2 text-[var(--popover-foreground)] data-[highlighted]:bg-[color-mix(in_srgb,var(--ring)_12%,transparent)] data-[highlighted]:text-[var(--popover-foreground)]"
          onSelect={() => {
            setMenuOpen(false);
            router.push('/settings');
          }}
        >
          <Settings className="h-4 w-4 stroke-[1.8] text-[color-mix(in_srgb,var(--popover-foreground)_68%,transparent)]" />
          Settings
        </DropdownMenuItem>

        <DropdownMenuItem
          className="flex items-center gap-2 text-[var(--popover-foreground)] data-[highlighted]:bg-[color-mix(in_srgb,var(--ring)_12%,transparent)] data-[highlighted]:text-[var(--popover-foreground)]"
          onSelect={() => {
            setMenuOpen(false);
            router.push('/settings?section=integrations');
          }}
        >
          <Plug className="h-4 w-4 stroke-[1.8] text-[color-mix(in_srgb,var(--popover-foreground)_68%,transparent)]" />
          Integrations
        </DropdownMenuItem>

        {isAdmin ? (
          <DropdownMenuItem
            className="flex items-center gap-2 text-[var(--popover-foreground)] data-[highlighted]:bg-[color-mix(in_srgb,var(--ring)_12%,transparent)] data-[highlighted]:text-[var(--popover-foreground)]"
            onSelect={() => {
              setMenuOpen(false);
              router.push('/admin');
            }}
          >
            <CircleCheck className="h-4 w-4 stroke-[1.8] text-[color-mix(in_srgb,var(--popover-foreground)_68%,transparent)]" />
            Admin
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            logout();
          }}
          disabled={isPending}
          className="flex items-center gap-2 text-[var(--destructive)] data-[highlighted]:bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)] data-[highlighted]:text-[var(--destructive)]"
        >
          <LogOut className="h-4 w-4 stroke-[1.8]" />
          {isPending ? 'Signing out...' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BadgeIndicator() {
  return <span className="inline-flex h-2 w-2 rounded-full bg-primary" aria-hidden="true" />;
}
