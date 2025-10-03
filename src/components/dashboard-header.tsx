"use client";

import { Avatar, Button, DropdownMenu, Flex, Text } from "@radix-ui/themes";
import { ExitIcon, PersonIcon, GearIcon } from "@radix-ui/react-icons";
import ThemeToggle from "./theme-toggle";

export function DashboardHeader() {
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <Flex align="center" justify="between">
        <div>
          <Text size="4" weight="bold">
            Welcome back, User
          </Text>
          <Text size="2" color="gray">
            Ready to orchestrate your marketing campaigns
          </Text>
        </div>

        <Flex align="center" gap="4">
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
              <DropdownMenu.Item color="red">
                <ExitIcon className="mr-2" />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </Flex>
      </Flex>
    </header>
  );
}
