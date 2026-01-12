"use client";

import React from "react";
import { Avatar, Button, DropdownMenu, Switch, Text, TextField, Box, ScrollArea } from "@radix-ui/themes";
import {
  CheckCircledIcon,
  ExitIcon,
  GearIcon,
  LayersIcon,
  MixerHorizontalIcon,
  MoonIcon,
  PlusCircledIcon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useSession } from "@/hooks/useSession";
import { useTheme } from "@/components/theme-provider";
import { createBrandProfileAction } from "@/app/(post-auth)/settings/actions";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";
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
  const { user } = useSession();
  const { activeBrandId, brandSummaries, isSwitching, selectBrand } = useActiveBrandContext();
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
          className="rounded-full shadow-sm"
        >
          <Avatar
            size="2"
            fallback={<LayersIcon />}
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
          >
            <TextField.Slot>
              <MagnifyingGlassIcon />
            </TextField.Slot>
          </TextField.Root>
        </Box>

        <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: "200px" }}>
          {filteredBrands.length === 0 ? (
            <Box p="2">
              <Text size="2" color="gray" className="pl-2">
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

                  await selectBrand(brand.id);
                  router.refresh();
                }}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <LayersIcon />
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
          className="flex items-center gap-2 mt-1"
        >
          <PlusCircledIcon />
          New brand profile
        </DropdownMenu.Item>

        <DropdownMenu.Separator />

        <DropdownMenu.Item
          className="flex items-center justify-between w-full"
          onSelect={(event) => event.preventDefault()}
        >
          <div className="flex items-center gap-2">
            <MoonIcon />
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
          className="flex items-center gap-2"
          onSelect={(event) => {
            event.preventDefault();
            router.push("/settings");
          }}
        >
          <GearIcon />
          Settings
        </DropdownMenu.Item>

        <DropdownMenu.Item
          className="flex items-center gap-2"
          onSelect={(event) => {
            event.preventDefault();
            router.push("/settings/integrations");
          }}
        >
          <MixerHorizontalIcon />
          Integrations
        </DropdownMenu.Item>

        {isAdmin ? (
          <DropdownMenu.Item
            className="flex items-center gap-2"
            onSelect={(event) => {
              event.preventDefault();
              router.push("/admin");
            }}
          >
            <CheckCircledIcon />
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
          className="flex items-center gap-2"
        >
          <ExitIcon />
          {isPending ? "Signing out..." : "Sign out"}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

function BadgeIndicator() {
  return <span className="inline-flex h-2 w-2 rounded-full bg-violet-500" aria-hidden="true" />;
}
