"use client";

import Link from "next/link";
import { Flex, Box, Container, Text, Button } from "@radix-ui/themes";
import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import ThemeToggle from "../theme-toggle";

export function SiteHeader() {
  return (
    <Box asChild className="sticky top-0 z-40 backdrop-blur-md bg-white/55 dark:bg-black/30 border-b border-white/40 dark:border-white/10">
      <header>
        <Container size="3">
          <Flex align="center" justify="between" py="3">
            <Flex align="center" gap="3">
              <Link href="/" className="font-semibold tracking-tight">
                Continuum AI
              </Link>
              <Text color="gray" size="2" className="hidden sm:inline">
                Build, orchestrate, and ship marketing experiences fast
              </Text>
            </Flex>

            <Flex align="center" gap="4">
              <NavigationMenu.Root className="hidden md:flex" aria-label="Primary navigation">
                <NavigationMenu.List className="flex items-center gap-3 text-sm">
                  <NavigationMenu.Item>
                    <NavigationMenu.Link asChild>
                      <Link href="#product">Product</Link>
                    </NavigationMenu.Link>
                  </NavigationMenu.Item>
                  <NavigationMenu.Item>
                    <NavigationMenu.Link asChild>
                      <Link href="#subscribe">Pricing</Link>
                    </NavigationMenu.Link>
                  </NavigationMenu.Item>
                  <NavigationMenu.Item>
                    <NavigationMenu.Link asChild>
                      <Link href="#solutions">Solutions</Link>
                    </NavigationMenu.Link>
                  </NavigationMenu.Item>
                  <NavigationMenu.Item>
                    <NavigationMenu.Link asChild>
                      <Link href="#resources">Resources</Link>
                    </NavigationMenu.Link>
                  </NavigationMenu.Item>
                  <NavigationMenu.Item>
                    <NavigationMenu.Link asChild>
                      <Link href="/oauth/mock">Sign in</Link>
                    </NavigationMenu.Link>
                  </NavigationMenu.Item>
                </NavigationMenu.List>
              </NavigationMenu.Root>

              <Flex align="center" gap="3">
                <Button size="2" asChild>
                  <Link href="/onboarding">Start now</Link>
                </Button>
                <Button size="2" variant="outline" asChild>
                  <Link href="mailto:hello@continuum.ai">Contact sales</Link>
                </Button>
              </Flex>

              <ThemeToggle />
            </Flex>
          </Flex>
        </Container>
      </header>
    </Box>
  );
}

export default SiteHeader;
