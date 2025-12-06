"use client";

import React from "react";
import { Avatar, Button, DropdownMenu, Switch, Text } from "@radix-ui/themes";
import {
  CheckCircledIcon,
  ExitIcon,
  GearIcon,
  LayersIcon,
  MixerHorizontalIcon,
  MoonIcon,
  PlusCircledIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useSession } from "@/hooks/useSession";
import { useActiveBrandContext } from "../providers/ActiveBrandProvider";
import { createBrandProfileAction } from "@/app/(post-auth)/settings/actions";
import { useTheme } from "../theme-provider";

export function BrandSwitcherPill() {
  const { logout, isPending } = useAuth();
  const { user } = useSession();
  const { activeBrandId, brandSummaries, isSwitching, selectBrand } = useActiveBrandContext();
  const { appearance, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isCreating, startCreate] = React.useTransition();

  const roles = (user?.app_metadata as { roles?: string[] } | undefined)?.roles ?? [];
  const isAdmin = Boolean(user?.app_metadata?.is_admin) || roles.includes("admin");

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="surface"
          size="2"
          radius="full"
          className="gap-2 shadow-sm"
          onMouseEnter={() => setMenuOpen(true)}
        >
          <Avatar
            size="2"
            src="/placeholder-avatar.jpg"
            fallback={<LayersIcon />}
            radius="full"
            className="border border-gray-200/40"
          />
          <span className="font-medium">
            {brandSummaries.find((b) => b.id === activeBrandId)?.name || "Brands"}
          </span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        className="min-w-[260px] rounded-2xl border border-white/10 bg-slate-900/95 p-2 text-white shadow-2xl"
        style={{ zIndex: 80 }}
        onMouseLeave={() => setMenuOpen(false)}
      >
        {brandSummaries.map((brand) => (
          <DropdownMenu.Item
            key={brand.id}
            disabled={isSwitching}
            onSelect={(event) => {
              event.preventDefault();
              selectBrand(brand.id);
            }}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1"
          >
            <div className="flex items-center gap-2">
              <LayersIcon />
              <Text weight={brand.id === activeBrandId ? "bold" : "regular"}>
                {brand.name || "Untitled brand"}
              </Text>
            </div>
            {brand.id === activeBrandId ? <span className="h-2 w-2 rounded-full bg-violet-400" /> : null}
          </DropdownMenu.Item>
        ))}

        <DropdownMenu.Item
          disabled={isCreating}
          onSelect={(event) => {
            event.preventDefault();
            startCreate(async () => {
              await createBrandProfileAction();
            });
          }}
          className="flex items-center gap-2 rounded-lg px-2 py-1"
        >
          <PlusCircledIcon />
          New brand profile
        </DropdownMenu.Item>

        <DropdownMenu.Separator className="my-1 h-px bg-white/10" />

        <DropdownMenu.Item asChild>
          <div className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1">
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
          </div>
        </DropdownMenu.Item>

        <DropdownMenu.Item asChild className="rounded-lg px-2 py-1">
          <Link href="/settings" className="flex items-center gap-2">
            <GearIcon />
            Settings
          </Link>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild className="rounded-lg px-2 py-1">
          <Link href="/settings/integrations" className="flex items-center gap-2">
            <MixerHorizontalIcon />
            Integrations
          </Link>
        </DropdownMenu.Item>
        {isAdmin && (
          <DropdownMenu.Item asChild className="rounded-lg px-2 py-1">
            <Link href="/admin" className="flex items-center gap-2">
              <CheckCircledIcon />
              Admin
            </Link>
          </DropdownMenu.Item>
        )}

        <DropdownMenu.Separator className="my-1 h-px bg-white/10" />

        <DropdownMenu.Item
          color="red"
          onSelect={(event) => {
            event.preventDefault();
            logout();
          }}
          disabled={isPending}
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-red-300"
        >
          <ExitIcon />
          {isPending ? "Signing out..." : "Sign out"}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
