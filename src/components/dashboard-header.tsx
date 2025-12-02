"use client";

import { Avatar, Button, DropdownMenu, Flex, Text, IconButton, Switch, Callout } from "@radix-ui/themes";
import {
  ExitIcon,
  GearIcon,
  HamburgerMenuIcon,
  LayersIcon,
  PlusCircledIcon,
  MixerHorizontalIcon,
  MoonIcon,
  InfoCircledIcon,
  CheckCircledIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import React from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSession } from "@/hooks/useSession";
import { useActiveBrandContext } from "./providers/ActiveBrandProvider";
import { createBrandProfileAction } from "@/app/(post-auth)/settings/actions";
import { useTheme } from "./theme-provider";

const DISMISS_MS = 10_000;
const TICK_MS = 120;

type CountdownRingProps = {
  progress: number; // 0..1
};

function CountdownRing({ progress }: CountdownRingProps) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  return (
    <div
      aria-hidden="true"
      style={{
        width: 28,
        height: 28,
        borderRadius: "9999px",
        background: `conic-gradient(var(--ring) ${clamped * 360}deg, rgba(148, 163, 184, 0.4) ${clamped * 360}deg)`,
        display: "grid",
        placeItems: "center",
        boxShadow: "0 0 0 1px rgba(148, 163, 184, 0.35)",
      }}
    >
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "9999px",
          background: "var(--color-background)",
        }}
      />
    </div>
  );
}

export function DashboardHeader({
  onOpenMobile,
}: {
  onOpenMobile?: () => void;
}) {
  const { logout, isPending } = useAuth();
  const { user } = useSession();
  const { activeBrandId, brandSummaries, isSwitching, selectBrand } = useActiveBrandContext();
  const { appearance, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isCreating, startCreate] = React.useTransition();
  const [welcomeVisible, setWelcomeVisible] = React.useState(true);
  const [progress, setProgress] = React.useState(0);

  const isAdmin =
    Boolean(user?.app_metadata?.is_admin) ||
    (Array.isArray((user?.app_metadata as Record<string, any> | undefined)?.roles) &&
      (user?.app_metadata as Record<string, any>).roles.includes("admin"));

  React.useEffect(() => {
    if (!welcomeVisible) return;
    const started = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - started;
      const pct = Math.min(elapsed / DISMISS_MS, 1);
      setProgress(pct);
      if (pct >= 1) {
        setWelcomeVisible(false);
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [welcomeVisible]);

  return (
    <div className="px-4 sm:px-6 pt-3 sm:pt-4">
      <Flex direction="column" gap="3">
        {welcomeVisible && (
          <Callout.Root color="indigo" variant="surface" className="shadow-sm" icon={<InfoCircledIcon />}>
            <Flex align="center" gap="3" justify="between">
              <Callout.Text>
                Welcome back, {user?.user_metadata?.name || user?.email?.split("@")[0] || "User"}. Your dashboard shows
                live brand insights and quick actions. Switch brands or add a new one from the menu on the right.
              </Callout.Text>
              <CountdownRing progress={progress} />
            </Flex>
          </Callout.Root>
        )}

        <Flex align="center" justify="between" gap="3">
          <div className="sm:hidden">
            <IconButton variant="ghost" onClick={onOpenMobile} aria-label="Open navigation">
              <HamburgerMenuIcon />
            </IconButton>
          </div>

          <Flex align="center" gap="3 sm:gap-4" className="ml-auto">
            <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
              <DropdownMenu.Trigger asChild>
                <Button
                  variant="outline"
                  size="2"
                  onMouseEnter={() => setMenuOpen(true)}
                  className="rounded-full shadow-sm"
                >
                  <Avatar
                    size="2"
                    src="/placeholder-avatar.jpg"
                    fallback={<LayersIcon />}
                    radius="full"
                    className="mr-2"
                  />
                  {brandSummaries.find(b => b.id === activeBrandId)?.name || "Brands"}
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
                {brandSummaries.map(brand => (
                  <DropdownMenu.Item
                    key={brand.id}
                    disabled={isSwitching}
                    onSelect={event => {
                      event.preventDefault();
                      selectBrand(brand.id);
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <LayersIcon />
                      <Text weight={brand.id === activeBrandId ? "bold" : "regular"}>
                        {brand.name || "Untitled brand"}
                      </Text>
                    </div>
                    {brand.id === activeBrandId && <BadgeIndicator />}
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Item
                  disabled={isCreating}
                  onSelect={event => {
                    event.preventDefault();
                    startCreate(async () => {
                      await createBrandProfileAction();
                    });
                  }}
                  className="flex items-center gap-2"
                >
                  <PlusCircledIcon />
                  New brand profile
                </DropdownMenu.Item>

                <DropdownMenu.Separator />

                <DropdownMenu.Item asChild>
                  <div className="flex items-center justify-between w-full">
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

                <DropdownMenu.Item asChild>
                  <Link href="/settings" className="flex items-center gap-2">
                    <GearIcon />
                    Settings
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item asChild>
                  <Link href="/settings/integrations" className="flex items-center gap-2">
                    <MixerHorizontalIcon />
                    Integrations
                  </Link>
                </DropdownMenu.Item>
                {isAdmin && (
                  <DropdownMenu.Item asChild>
                    <Link href="/admin" className="flex items-center gap-2">
                      <CheckCircledIcon />
                      Admin
                    </Link>
                  </DropdownMenu.Item>
                )}

                <DropdownMenu.Separator />

                <DropdownMenu.Item
                  color="red"
                  onSelect={event => {
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
          </Flex>
        </Flex>
      </Flex>
    </div>
  );
}

function BadgeIndicator() {
  return (
    <span className="inline-flex h-2 w-2 rounded-full bg-violet-500" aria-hidden="true" />
  );
}
