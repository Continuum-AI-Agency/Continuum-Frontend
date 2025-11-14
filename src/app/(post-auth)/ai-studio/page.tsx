"use client";

import { Card, Container, Flex, Heading, Text, Callout } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";

export default function AIStudioPage() {
  return (
    <Container size="4">
      <Flex direction="column" gap="4">
        <Heading size="6" className="text-white">Creative Studio</Heading>
        <Text color="gray">Generate on-brand assets and copy powered by Continuum AI.</Text>
        <Card className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
          <Flex direction="column" gap="3" p="4">
            <Heading size="4" className="text-white">Coming soon</Heading>
            <Text color="gray">We’re building templates, brand voices, and multi-format exports.</Text>
            <Callout.Root color="amber">
              <Callout.Icon>
                <ExclamationTriangleIcon />
              </Callout.Icon>
              <Callout.Text>
                Placeholder UI. Functionality will be added as features land.
              </Callout.Text>
            </Callout.Root>
          </Flex>
        </Card>
      </Flex>
    </Container>
  );
}


