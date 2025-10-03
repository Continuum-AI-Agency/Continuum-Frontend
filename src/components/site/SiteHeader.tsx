"use client";

import Link from "next/link";
import { Flex, Box, Container, Text, Button } from "@radix-ui/themes";
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
            <Flex align="center" gap="3">
              <Button variant="ghost" asChild>
                <Link href="/privacy">Privacy</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/terms">Terms</Link>
              </Button>
              <ThemeToggle />
            </Flex>
          </Flex>
        </Container>
      </header>
    </Box>
  );
}

export default SiteHeader;
