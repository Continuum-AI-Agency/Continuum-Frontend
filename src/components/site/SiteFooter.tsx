"use client";

import Link from "next/link";
import { Box, Container, Flex, Text, Separator } from "@radix-ui/themes";

export function SiteFooter() {
  return (
    <Box asChild className="mt-10 border-t border-white/40 dark:border-white/10 bg-white/40 dark:bg-black/20 backdrop-blur-md">
      <footer>
        <Container size="3">
          <Flex direction="column" gap="3" py="5">
            <Flex align="center" justify="between">
              <Text size="2" color="gray">© {new Date().getFullYear()} Continuum AI</Text>
              <Flex align="center" gap="3">
                <Link href="/privacy" className="text-sm">Privacy</Link>
                <Separator orientation="vertical" size="2" />
                <Link href="/terms" className="text-sm">Terms</Link>
              </Flex>
            </Flex>
          </Flex>
        </Container>
      </footer>
    </Box>
  );
}

export default SiteFooter;
