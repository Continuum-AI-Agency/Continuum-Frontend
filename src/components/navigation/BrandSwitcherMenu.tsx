"use client";

import React from "react";
import { Avatar, Button, DropdownMenu, Switch, Text, TextField, Box, ScrollArea } from "@radix-ui/themes";
import {
  CircleCheck,
  LogOut,
  Settings,
  Layers,
  Plug,
  Moon,
  PlusCircle,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/theme-provider";
import { createBrandProfileAction } from "@/app/(post-auth)/settings/actions";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";
import { useSwitchBrand } from "@/hooks/useSwitchBrand";
import {
  getActiveBrandLabel,
  getBrandMenuItemLabel,
  isAdminUser,
} from "@/lib/brands/brand-switcher-utils";

type BrandSwitcherMenuProps = {
  triggerId?: string;
};

export function BrandSwitcherMenu({ triggerId }: BrandSwitcherMenuProps) {
  const router = useRouter();
  const { logout, isPending } = useAuth();
  const { activeBrandId, brandSummaries, isSwitching, user } = useActiveBrandContext();
  const switchBrand = useSwitchBrand();
  const { appearance, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isCreating, startCreate] = React.useTransition();
  const [searchQuery, setSearchQuery] = React.useState("");

  const isAdmin = isAdminUser(user);

  // Reset search query when menu closes
  React.useEffect(() => {
    if (!menuOpen) {
      setSearchQuery("");
    }
  }, [menuOpen]);

  const filteredBrands = brandSummaries.filter((brand) =>
    getBrandMenuItemLabel(brand).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
      <DropdownMenu.Trigger>
        <Button
          id={triggerId}
          variant="outline"
          size="2"
          onMouseEnter={() => setMenuOpen(true)}
          className="rounded-full border-[var(--border)] text-[var(--sidebar-foreground)] shadow-sm hover:bg-[color-mix(in_srgb,var(--ring)_10%,transparent)]"
        >
          <Avatar
            size="2"
            src={brandSummaries.find(b => b.id === activeBrandId)?.logoUrl ?? undefined}
            fallback={<Layers className="h-4 w-4 stroke-[1.8]" />}
            radius="full"
            className="mr-2"
          />
          {getActiveBrandLabel(brandSummaries, activeBrandId)}
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content
        align="end"
        className="min-w-[260px] border"
        style={{
          backgroundColor: "var(--popover)",
          color: "var(--popover-foreground)",
          borderColor: "var(--border)",
        }}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <Box p="2" pb="2">
          <TextField.Root
            placeholder="Search brands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            size="2"
            className="text-[var(--popover-foreground)]"
          >
            <TextField.Slot>
              <Search className="h-4 w-4 stroke-[1.8] text-[color-mix(in_srgb,var(--popover-foreground)_60%,transparent)]" />
            </TextField.Slot>
          </TextField.Root>
        </Box>

        <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: "200px" }}>
          {filteredBrands.length === 0 ? (
            <Box p="2">
              <Text size="2" className="pl-2 text-[color-mix(in_srgb,var(--popover-foreground)_64%,transparent)]">
                No brands found
              </Text>
            </Box>
          ) : (
            filteredBrands.map((brand) => (
              <DropdownMenu.Item
                key={brand.id}
                disabled={isSwitching}
                onSelect={async (event) => {
                  event.preventDefault();
                  if (brand.id === activeBrandId) {
                    return;
                  }
                  await switchBrand(brand.id);
                }}
                className="flex items-center justify-between gap-2 text-[var(--popover-foreground)] data-[highlighted]:bg-[color-mix(in_srgb,var(--ring)_12%,transparent)] data-[highlighted]:text-[var(--popover-foreground)]"
              >
                <div className="flex items-center gap-2">
                  <Avatar
                    size="1"
                    src={brand.logoUrl ?? undefined}
                    fallback={<Layers className="h-3.5 w-3.5 stroke-[1.8]" />}
                    radius="full"
                  />
                  <Text weight={brand.id === activeBrandId ? "bold" : "regular"}>
                    {getBrandMenuItemLabel(brand)}
                  </Text>
                </div>
                {brand.id === activeBrandId ? <BadgeIndicator /> : null}
              </DropdownMenu.Item>
            ))
          )}
        </ScrollArea>

        <DropdownMenu.Item
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
        </DropdownMenu.Item>

        <DropdownMenu.Separator />

        <DropdownMenu.Item
          className="flex w-full items-center justify-between text-[var(--popover-foreground)] data-[highlighted]:bg-[color-mix(in_srgb,var(--ring)_12%,transparent)] data-[highlighted]:text-[var(--popover-foreground)]"
          onSelect={(event) => event.preventDefault()}
        >
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 stroke-[1.8] text-[color-mix(in_srgb,var(--popover-foreground)_68%,transparent)]" />
            <Text>Dark mode</Text>
          </div>
          <Switch
            checked={appearance === "dark"}
            onCheckedChange={toggle}
            size="1"
            aria-label="Toggle dark mode"
          />
        </DropdownMenu.Item>

        <DropdownMenu.Item
          className="flex items-center gap-2 text-[var(--popover-foreground)] data-[highlighted]:bg-[color-mix(in_srgb,var(--ring)_12%,transparent)] data-[highlighted]:text-[var(--popover-foreground)]"
          onSelect={(event) => {
            event.preventDefault();
            router.push("/settings");
          }}
        >
          <Settings className="h-4 w-4 stroke-[1.8] text-[color-mix(in_srgb,var(--popover-foreground)_68%,transparent)]" />
          Settings
        </DropdownMenu.Item>

        <DropdownMenu.Item
          className="flex items-center gap-2 text-[var(--popover-foreground)] data-[highlighted]:bg-[color-mix(in_srgb,var(--ring)_12%,transparent)] data-[highlighted]:text-[var(--popover-foreground)]"
          onSelect={(event) => {
            event.preventDefault();
            router.push("/settings/integrations");
          }}
        >
          <Plug className="h-4 w-4 stroke-[1.8] text-[color-mix(in_srgb,var(--popover-foreground)_68%,transparent)]" />
          Integrations
        </DropdownMenu.Item>

        {isAdmin ? (
          <DropdownMenu.Item
            className="flex items-center gap-2 text-[var(--popover-foreground)] data-[highlighted]:bg-[color-mix(in_srgb,var(--ring)_12%,transparent)] data-[highlighted]:text-[var(--popover-foreground)]"
            onSelect={(event) => {
              event.preventDefault();
              router.push("/admin");
            }}
          >
            <CircleCheck className="h-4 w-4 stroke-[1.8] text-[color-mix(in_srgb,var(--popover-foreground)_68%,transparent)]" />
            Admin
          </DropdownMenu.Item>
        ) : null}

        <DropdownMenu.Separator />

        <DropdownMenu.Item
          color="red"
          onSelect={(event) => {
            event.preventDefault();
            logout();
          }}
          disabled={isPending}
          className="flex items-center gap-2 text-[var(--destructive)] data-[highlighted]:bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)] data-[highlighted]:text-[var(--destructive)]"
        >
          <LogOut className="h-4 w-4 stroke-[1.8]" />
          {isPending ? "Signing out..." : "Sign out"}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

function BadgeIndicator() {
  return <span className="inline-flex h-2 w-2 rounded-full bg-violet-500" aria-hidden="true" />;
}
