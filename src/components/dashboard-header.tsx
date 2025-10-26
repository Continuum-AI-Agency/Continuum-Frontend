"use client";

import { Avatar, Button, DropdownMenu, Flex, Text, IconButton } from "@radix-ui/themes";
import { ExitIcon, PersonIcon, GearIcon, HamburgerMenuIcon } from "@radix-ui/react-icons";
import React from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSession } from "@/hooks/useSession";
import ThemeToggle from "./theme-toggle";

export function DashboardHeader({ onOpenMobile }: { onOpenMobile?: () => void }) {
  const { logout, isPending } = useAuth();
  const { user } = useSession();
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
      <Flex align="center" justify="between" gap="3">
        <div className="flex items-center gap-3">
          <div className="sm:hidden">
            <IconButton variant="ghost" onClick={onOpenMobile} aria-label="Open navigation">
              <HamburgerMenuIcon />
            </IconButton>
          </div>
          <div className="flex flex-col">
            <Text size="4" weight="bold">
              Welcome back, {user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'}
            </Text>
            <Text size="2" color="gray" className="hidden sm:block">
              Ready to orchestrate your marketing campaigns
            </Text>
          </div>
        </div>

        <Flex align="center" gap="3 sm:gap-4">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <Button variant="outline" size="2" disabled={isSwitching}>
                <LayersIcon className="mr-2" />
                {brandName}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              {brandSummaries.map(brand => (
                <DropdownMenu.Item
                  key={brand.id}
                  onSelect={event => {
                    event.preventDefault();
                    handleSwitch(brand.id);
                  }}
                  disabled={brand.id === activeBrandId || isSwitching}
                >
                  {brand.name || "Untitled brand"}
                  {!brand.completed && (
                    <Text size="1" color="gray" className="ml-2">
                      Incomplete
                    </Text>
                  )}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator />
              <DropdownMenu.Item asChild>
                <Link href="/settings">Manage brand profiles</Link>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>

          <ThemeToggle />

          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <Button variant="ghost" size="2">
                <Avatar
                  size="2"
                  src="/placeholder-avatar.jpg"
                  fallback={<PersonIcon />}
                  radius="full"
                />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              <DropdownMenu.Item>
                <PersonIcon className="mr-2" />
                Profile
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                <GearIcon className="mr-2" />
                Settings
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item 
                color="red" 
                onClick={() => logout()}
                disabled={isPending}
              >
                <ExitIcon className="mr-2" />
                {isPending ? "Signing out..." : "Sign out"}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </Flex>
      </Flex>
    </header>
  );
}
