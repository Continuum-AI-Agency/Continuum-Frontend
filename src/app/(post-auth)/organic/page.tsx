"use client";

import { Card, Container, Flex, Heading, Text, Callout } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";

export default function OrganicPage() {
  return (
    <Container size="4">
      <Flex direction="column" gap="4">
        <Heading size="6">Organic Module</Heading>
        <Text color="gray">Plan, publish, and analyze organic social content across platforms.</Text>
        <Card>
          <Flex direction="column" gap="3" p="4">
            <Heading size="4">Coming soon</Heading>
            <Text color="gray">We’re building scheduling, content calendars, and cross-platform posting.</Text>
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


